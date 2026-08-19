import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Who the viewer said they were going to, shared across every route that shows an event.
 *
 * This lived as `useState` inside the events list and again inside the event detail page, which
 * meant the two disagreed: marking Going on a card and then opening that card showed the RSVP
 * cleared and the going count one lower, and coming back to the feed had lost it again. The counts
 * are the visible symptom, so the state they derive from has to outlive the route.
 *
 * Persisted to localStorage because a prototype gets demoed by reloading it. There is no `rsvps`
 * table and no writable key yet (see supabase/migrations/20260818070000_events_rls_and_seed_feed.sql),
 * so this is per-browser rather than per-account.
 *
 * TODO(team): move to an `event_rsvps` table keyed to the signed-in member once auth lands.
 */

export type RsvpState = 'interested' | 'going' | null;

const STORAGE_KEY = 'ab-peers:rsvps';

interface RsvpContextValue {
  /** Only events the viewer has actually responded to appear here. */
  rsvps: Record<string, RsvpState>;
  rsvpFor: (eventId: string) => RsvpState;
  setRsvp: (eventId: string, next: RsvpState) => void;
  /** How many events the viewer has marked, for the "Mine" segment. */
  respondedCount: number;
}

const RsvpContext = createContext<RsvpContextValue | null>(null);

/**
 * Storage is best-effort throughout: Safari in private mode throws on write, and a hand-edited or
 * half-written value should cost the viewer their saved RSVPs, not the whole events page.
 */
function storage(): Storage | null {
  // The DOM types promise localStorage always exists, but it does not: a jsdom document on an
  // opaque origin leaves it undefined, and privacy modes can too. Checking for a usable object
  // rather than trusting the type keeps this from throwing on load.
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return typeof candidate?.getItem === 'function' ? candidate : null;
}

function readStored(): Record<string, RsvpState> {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

    // Anything that isn't one of the two states is dropped rather than trusted into the UI.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, RsvpState] => entry[1] === 'interested' || entry[1] === 'going',
      ),
    );
  } catch {
    return {};
  }
}

function writeStored(rsvps: Record<string, RsvpState>): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(rsvps));
  } catch {
    // Nothing to do — the in-memory state is still correct for this session.
  }
}

export function RsvpProvider({ children }: { children: ReactNode }) {
  const [rsvps, setRsvps] = useState<Record<string, RsvpState>>(readStored);

  useEffect(() => {
    writeStored(rsvps);
  }, [rsvps]);

  const setRsvp = useCallback((eventId: string, next: RsvpState) => {
    setRsvps((prev) => {
      if (next === null) {
        // Dropped rather than stored as null, so `respondedCount` and the Mine segment can treat
        // presence in the map as the whole answer.
        const { [eventId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [eventId]: next };
    });
  }, []);

  const rsvpFor = useCallback((eventId: string) => rsvps[eventId] ?? null, [rsvps]);

  const value = useMemo(
    () => ({ rsvps, rsvpFor, setRsvp, respondedCount: Object.keys(rsvps).length }),
    [rsvps, rsvpFor, setRsvp],
  );

  return <RsvpContext.Provider value={value}>{children}</RsvpContext.Provider>;
}

export function useRsvps(): RsvpContextValue {
  const value = useContext(RsvpContext);
  if (!value) throw new Error('useRsvps must be used within an RsvpProvider');
  return value;
}

/**
 * The counts a card or detail page shows: the event's own tally plus the viewer's own response.
 *
 * Both surfaces derive this the same way so they can never disagree about the same event, which
 * was the other half of the split-state bug.
 */
export function rsvpCounts(
  base: { goingCount: number; interestedCount: number },
  rsvp: RsvpState,
): { going: number; interested: number } {
  return {
    going: base.goingCount + (rsvp === 'going' ? 1 : 0),
    interested: base.interestedCount + (rsvp === 'interested' ? 1 : 0),
  };
}
