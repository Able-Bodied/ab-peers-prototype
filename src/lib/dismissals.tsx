import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { getOrCreateViewerId } from '@/lib/viewer-id';

/**
 * Which events the viewer marked "Not interested" — the X on an events list card
 * (src/routes/events/event-list-card.tsx) — shared across routes the same way RSVPs are
 * (src/lib/rsvps.tsx), so the choice survives a reload instead of resetting to an in-memory Set
 * every time the feed remounts.
 *
 * Backed by the `event_dismissals` table
 * (supabase/migrations/20260819210000_event_dismissals.sql). Unlike RSVPs this is purely a
 * personal list with no aggregate/other-viewer count to reconcile — same reasoning as follows
 * (src/lib/follows.tsx) — but it lives in the database rather than localStorage anyway, so the
 * events list's default filter (hide dismissed events) can be resolved before the first paint
 * from the same source restoring them reads from, rather than a filter that's briefly wrong on
 * a fresh device.
 */

interface DismissalsContextValue {
  /** Every event id the viewer has dismissed. Empty until `loading` turns false. */
  dismissedIds: Set<string>;
  isDismissed: (eventId: string) => boolean;
  dismiss: (eventId: string) => void;
  /** Undoes a dismissal — the "Show again" action once Hidden events are visible in the sheet. */
  restore: (eventId: string) => void;
  /** True until the viewer's existing dismissals have loaded. */
  loading: boolean;
}

const DismissalsContext = createContext<DismissalsContextValue | null>(null);

async function persistDismissal(
  viewerId: string,
  eventId: string,
  dismissed: boolean,
): Promise<void> {
  const supabase = getSupabase();

  if (!dismissed) {
    const { error } = await supabase
      .from('event_dismissals')
      .delete()
      .eq('event_id', eventId)
      .eq('viewer_id', viewerId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('event_dismissals')
    .upsert({ event_id: eventId, viewer_id: viewerId }, { onConflict: 'event_id,viewer_id' });
  if (error) throw error;
}

export function DismissalsProvider({ children }: { children: ReactNode }) {
  const [viewerId] = useState(getOrCreateViewerId);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDismissals() {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('event_dismissals')
          .select('event_id')
          .eq('viewer_id', viewerId)
          .overrideTypes<{ event_id: string }[], { merge: false }>();
        if (error) throw error;
        if (cancelled) return;
        setDismissedIds(new Set(data.map((row) => row.event_id)));
      } catch (err) {
        console.error('Failed to load dismissals', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDismissals();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  const setDismissed = useCallback(
    (eventId: string, next: boolean) => {
      setDismissedIds((prev) => {
        if (prev.has(eventId) === next) return prev;
        const updated = new Set(prev);
        if (next) updated.add(eventId);
        else updated.delete(eventId);
        return updated;
      });

      void persistDismissal(viewerId, eventId, next).catch((err: unknown) => {
        console.error('Failed to save dismissal', err);
        // Roll back the optimistic update — the write didn't actually happen.
        setDismissedIds((prev) => {
          const updated = new Set(prev);
          if (next) updated.delete(eventId);
          else updated.add(eventId);
          return updated;
        });
      });
    },
    [viewerId],
  );

  const dismiss = useCallback(
    (eventId: string) => {
      setDismissed(eventId, true);
    },
    [setDismissed],
  );
  const restore = useCallback(
    (eventId: string) => {
      setDismissed(eventId, false);
    },
    [setDismissed],
  );
  const isDismissed = useCallback((eventId: string) => dismissedIds.has(eventId), [dismissedIds]);

  const value = useMemo(
    () => ({ dismissedIds, isDismissed, dismiss, restore, loading }),
    [dismissedIds, isDismissed, dismiss, restore, loading],
  );

  return <DismissalsContext.Provider value={value}>{children}</DismissalsContext.Provider>;
}

export function useDismissals(): DismissalsContextValue {
  const value = useContext(DismissalsContext);
  if (!value) throw new Error('useDismissals must be used within a DismissalsProvider');
  return value;
}
