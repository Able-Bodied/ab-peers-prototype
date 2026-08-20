import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Topic } from '@/types/domain';

/**
 * Who the viewer has said hi to, shared by every surface that can send a wave.
 *
 * **Why a provider rather than local state on the card.** The same person appears on the deck and
 * again in the detail sheet, and after a filter change the deck redraws from scratch. State living
 * on a card would let "Say hi" come back un-pressed the moment either happened, and the second tap
 * would hit the `unique (from_member_id, to_member_id)` constraint and surface as an error for
 * something the viewer already did successfully. One list, loaded once per session, keeps every
 * copy of a person in agreement — the same reasoning as src/lib/rsvps.tsx.
 *
 * **Why the limit is enforced twice.** PRD §8 rate-limits waves, and the real enforcement is a
 * database trigger, because a client-side counter is advice and not a rule. But firing a request
 * we already know will be rejected spends a round trip to arrive at a worse version of an answer
 * we could have given instantly, and it teaches the viewer that the button sometimes just fails.
 * So the client refuses at `DAILY_WAVE_LIMIT` and says why, *and* still surfaces the server's own
 * message verbatim if a rejection comes back anyway — which it will whenever the two disagree
 * (another device, a clock skew, a limit changed on the server without a deploy here).
 *
 * **Why the write is optimistic.** A wave is a one-tap, low-stakes, irreversible-in-practice
 * action; waiting on a round trip before the button changes state makes the whole deck feel slow.
 * The local list updates first and rolls back on failure, exactly as RSVPs do.
 *
 * **What this layer deliberately does not decide.** PRD §8's asymmetry — a wave to an open mentor
 * opens the thread immediately, a wave to a peer waits for a wave back — is a question about the
 * *recipient*, answered by `canMessageDirectly` in src/mocks/selectors.ts. Sending is identical in
 * both cases; only the copy afterwards differs, so that call belongs to the card and the detail
 * sheet, not here.
 */

/**
 * PRD §8: "waves ... are rate limited". Per sender, over a rolling 24 hours — matching the
 * `enforce_wave_rate_limit` trigger in supabase/migrations/20260820130000_waves.sql exactly. A
 * calendar day would be the easier thing to explain but the two counts would then disagree every
 * evening, and the one that wins is the server's.
 */
export const DAILY_WAVE_LIMIT = 20;

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface SentWave {
  toMemberId: string;
  /** ISO 8601. Only used to decide which waves still count against the allowance. */
  createdAt: string;
}

export interface WavesContextValue {
  hasWaved: (memberId: string) => boolean;
  /** Never throws — a failure lands in `error`, because this is called straight from onClick. */
  sendWave: (memberId: string, topic?: Topic | null) => Promise<void>;
  /** The member id currently being written, for a per-card pending state. */
  sendingTo: string | null;
  error: string | null;
  remainingToday: number;
  loading: boolean;
}

interface WaveRow {
  to_member_id: string;
  created_at: string;
}

const WavesContext = createContext<WavesContextValue | null>(null);

const NO_SESSION_MESSAGE = 'Sign in to say hi.';
/** Deliberately the same sentence the database's trigger raises, so the two never contradict. */
const LIMIT_MESSAGE = `You have reached the limit of ${DAILY_WAVE_LIMIT} waves in 24 hours. Try again tomorrow.`;

/**
 * The same window the trigger counts over: `created_at > now() - interval '24 hours'`. Rolling
 * rather than calendar-based, which also sidesteps the timezone question entirely — there is no
 * "whose midnight" to get wrong.
 */
function sentInWindow(waves: SentWave[], now: Date): number {
  const cutoff = now.getTime() - RATE_LIMIT_WINDOW_MS;
  return waves.filter((wave) => new Date(wave.createdAt).getTime() > cutoff).length;
}

export function WavesProvider({ children }: { children: ReactNode }) {
  const { member, loading: sessionLoading } = useSession();
  const memberId = member?.id ?? null;

  const [sent, setSent] = useState<SentWave[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for the session before deciding there is nobody to load waves for, or a signed-in
    // viewer briefly looks like an anonymous one and every button says "Sign in to say hi".
    if (sessionLoading) return;

    if (!memberId) {
      setSent([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load(fromMemberId: string) {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('waves')
          .select('to_member_id, created_at')
          .eq('from_member_id', fromMemberId)
          .overrideTypes<WaveRow[], { merge: false }>();
        if (queryError) throw queryError;
        if (cancelled) return;
        setSent(data.map((row) => ({ toMemberId: row.to_member_id, createdAt: row.created_at })));
      } catch (err) {
        if (cancelled) return;
        // Not surfaced as `error`: that field is reserved for something the viewer just tried to
        // do. A failed load means buttons look un-pressed, which the unique constraint and the
        // server-side limit both still catch.
        console.error('Failed to load waves', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(memberId);
    return () => {
      cancelled = true;
    };
  }, [memberId, sessionLoading]);

  const wavedIds = useMemo(() => new Set(sent.map((wave) => wave.toMemberId)), [sent]);
  const hasWaved = useCallback((id: string) => wavedIds.has(id), [wavedIds]);

  /**
   * Computed on render rather than held in state: the window slides continuously, so a stored
   * number would go stale the moment the oldest wave aged out. Every surface that shows it
   * re-renders on any wave anyway, and the trigger is the actual authority.
   */
  const remainingToday = Math.max(0, DAILY_WAVE_LIMIT - sentInWindow(sent, new Date()));

  const sendWave = useCallback(
    async (toMemberId: string, topic: Topic | null = null) => {
      if (!memberId) {
        setError(NO_SESSION_MESSAGE);
        return;
      }
      // Already waved: the row exists and the unique constraint would reject a second insert, so
      // treat the tap as the no-op the viewer will read it as rather than an error.
      if (wavedIds.has(toMemberId)) return;
      if (sentInWindow(sent, new Date()) >= DAILY_WAVE_LIMIT) {
        setError(LIMIT_MESSAGE);
        return;
      }

      const optimistic: SentWave = { toMemberId, createdAt: new Date().toISOString() };
      setError(null);
      setSendingTo(toMemberId);
      setSent((prev) => [...prev, optimistic]);

      try {
        const { error: insertError } = await getSupabase().from('waves').insert({
          from_member_id: memberId,
          to_member_id: toMemberId,
          topic,
        });
        if (insertError) throw insertError;
      } catch (err) {
        // Roll back — the wave didn't actually happen, and a button stuck on "Said hi" is a
        // promise we can't keep.
        setSent((prev) => prev.filter((wave) => wave !== optimistic));
        // The server's own words, not ours: this is where the database's rate-limit trigger and
        // any RLS rejection get to explain themselves.
        setError(err instanceof Error ? err.message : 'Could not say hi. Try again.');
      } finally {
        setSendingTo(null);
      }
    },
    [memberId, sent, wavedIds],
  );

  const value = useMemo(
    () => ({ hasWaved, sendWave, sendingTo, error, remainingToday, loading }),
    [hasWaved, sendWave, sendingTo, error, remainingToday, loading],
  );

  return <WavesContext.Provider value={value}>{children}</WavesContext.Provider>;
}

export function useWaves(): WavesContextValue {
  const value = useContext(WavesContext);
  if (!value) throw new Error('useWaves must be used within a WavesProvider');
  return value;
}
