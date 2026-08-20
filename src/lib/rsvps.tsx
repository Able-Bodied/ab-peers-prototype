import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import { getOrCreateViewerId } from '@/lib/viewer-id';

/**
 * Who the viewer said they were going to, and how many people in total, shared across every route
 * that shows an event.
 *
 * This lived as `useState` inside the events list and again inside the event detail page, which
 * meant the two disagreed: marking Going on a card and then opening that card showed the RSVP
 * cleared and the going count one lower, and coming back to the feed had lost it again. The counts
 * are the visible symptom, so the state they derive from has to outlive the route — hence one
 * context both pages read from.
 *
 * Backed by the `event_rsvps` table (supabase/migrations/20260819110000_event_rsvps.sql) rather
 * than the invented `goingCount`/`interestedCount` in event-mocks.ts, so a fresh event genuinely
 * starts at zero. There is no Supabase auth session yet, so "who" is a random id minted into
 * localStorage the first time this runs, not an account — see that migration's header comment.
 */

export type RsvpState = 'interested' | 'going' | null;

export interface RsvpCounts {
  going: number;
  interested: number;
}

const ZERO_COUNTS: RsvpCounts = { going: 0, interested: 0 };

interface RsvpContextValue {
  /** Only events the viewer has actually responded to appear here. */
  rsvps: Record<string, RsvpState>;
  rsvpFor: (eventId: string) => RsvpState;
  setRsvp: (eventId: string, next: RsvpState) => void;
  /** How many events the viewer has marked, for the "Mine" segment. */
  respondedCount: number;
  /** Everyone's tally for an event — zero until `ensureCounts` has loaded it. */
  countsFor: (eventId: string) => RsvpCounts;
  /** Fetches counts (and the viewer's own status) for any of these ids not already loaded. */
  ensureCounts: (eventIds: string[]) => void;
}

const RsvpContext = createContext<RsvpContextValue | null>(null);

function shiftCounts(base: RsvpCounts, from: RsvpState, to: RsvpState): RsvpCounts {
  let { going, interested } = base;
  if (from === 'going') going -= 1;
  if (from === 'interested') interested -= 1;
  if (to === 'going') going += 1;
  if (to === 'interested') interested += 1;
  return { going, interested };
}

async function persistRsvp(viewerId: string, eventId: string, status: RsvpState): Promise<void> {
  const supabase = getSupabase();

  if (status === null) {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('viewer_id', viewerId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('event_rsvps')
    .upsert(
      { event_id: eventId, viewer_id: viewerId, status, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,viewer_id' },
    );
  if (error) throw error;
}

export function RsvpProvider({ children }: { children: ReactNode }) {
  const [viewerId] = useState(getOrCreateViewerId);
  const [rsvps, setRsvps] = useState<Record<string, RsvpState>>({});
  const [counts, setCounts] = useState<Record<string, RsvpCounts>>({});
  // Tracks which event ids have already been fetched (or are in flight), so ensureCounts can be
  // called freely from a render effect without re-fetching on every re-render.
  const loadedRef = useRef<Set<string>>(new Set());

  const setRsvp = useCallback(
    (eventId: string, next: RsvpState) => {
      const previous = rsvps[eventId] ?? null;
      if (previous === next) return;

      setRsvps((prev) => {
        if (next === null) {
          // Dropped rather than stored as null, so `respondedCount` and the Mine segment can treat
          // presence in the map as the whole answer.
          const { [eventId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [eventId]: next };
      });
      setCounts((prev) => ({
        ...prev,
        [eventId]: shiftCounts(prev[eventId] ?? ZERO_COUNTS, previous, next),
      }));

      void persistRsvp(viewerId, eventId, next).catch((err: unknown) => {
        console.error('Failed to save RSVP', err);
        // Roll back the optimistic update — the write didn't actually happen.
        setRsvps((prev) => {
          if (previous === null) {
            const { [eventId]: _removed, ...rest } = prev;
            return rest;
          }
          return { ...prev, [eventId]: previous };
        });
        setCounts((prev) => ({
          ...prev,
          [eventId]: shiftCounts(prev[eventId] ?? ZERO_COUNTS, next, previous),
        }));
      });
    },
    [rsvps, viewerId],
  );

  const rsvpFor = useCallback((eventId: string) => rsvps[eventId] ?? null, [rsvps]);
  const countsFor = useCallback((eventId: string) => counts[eventId] ?? ZERO_COUNTS, [counts]);

  const ensureCounts = useCallback(
    (eventIds: string[]) => {
      const missing = eventIds.filter((id) => !loadedRef.current.has(id));
      if (missing.length === 0) return;
      for (const id of missing) loadedRef.current.add(id);

      void (async () => {
        try {
          const supabase = getSupabase();
          const { data, error } = await supabase
            .from('event_rsvps')
            .select('event_id, viewer_id, status')
            .in('event_id', missing)
            .overrideTypes<
              { event_id: string; viewer_id: string; status: 'interested' | 'going' }[],
              { merge: false }
            >();
          if (error) throw error;

          const fetchedCounts: Record<string, RsvpCounts> = {};
          for (const id of missing) fetchedCounts[id] = { going: 0, interested: 0 };
          const ownStatus: Record<string, RsvpState> = {};

          for (const row of data) {
            const bucket = fetchedCounts[row.event_id];
            if (bucket) {
              if (row.status === 'going') bucket.going += 1;
              else bucket.interested += 1;
            }
            if (row.viewer_id === viewerId) ownStatus[row.event_id] = row.status;
          }

          // Never overwrite a key the viewer already touched locally (an optimistic click that
          // landed while this fetch was in flight) with what is now stale server data.
          setCounts((prev) => {
            const merged = { ...prev };
            for (const [id, value] of Object.entries(fetchedCounts)) {
              if (!(id in merged)) merged[id] = value;
            }
            return merged;
          });
          setRsvps((prev) => {
            const merged = { ...prev };
            for (const [id, value] of Object.entries(ownStatus)) {
              if (!(id in merged)) merged[id] = value;
            }
            return merged;
          });
        } catch (err) {
          console.error('Failed to load RSVP counts', err);
          // Allow a retry on the next call rather than caching the failure forever.
          for (const id of missing) loadedRef.current.delete(id);
        }
      })();
    },
    [viewerId],
  );

  const value = useMemo(
    () => ({
      rsvps,
      rsvpFor,
      setRsvp,
      respondedCount: Object.keys(rsvps).length,
      countsFor,
      ensureCounts,
    }),
    [rsvps, rsvpFor, setRsvp, countsFor, ensureCounts],
  );

  return <RsvpContext.Provider value={value}>{children}</RsvpContext.Provider>;
}

export function useRsvps(): RsvpContextValue {
  const value = useContext(RsvpContext);
  if (!value) throw new Error('useRsvps must be used within an RsvpProvider');
  return value;
}
