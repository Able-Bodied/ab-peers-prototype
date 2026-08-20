import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/**
 * The city vocabulary for the events feed's city filter, read from
 * `events.city` — geocoded per event by the ingest job and the AI
 * verification pass (supabase/migrations/20260819160000_events_geocoding.sql)
 * rather than the invented city event-mocks.ts still uses for display.
 *
 * No dedicated table backs this (a city is a fact about an event, not a
 * first-class entity the way an organization is), so this just selects the
 * column and dedupes client-side — the events table is prototype-scale, not
 * worth a database view for.
 */
export function useCities(): { cities: string[]; loading: boolean; error: string | null } {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('events')
          .select('city')
          .not('city', 'is', null)
          .overrideTypes<{ city: string }[], { merge: false }>();
        if (queryError) throw queryError;
        if (cancelled) return;
        const unique = Array.from(new Set(data.map((row) => row.city))).sort((a, b) =>
          a.localeCompare(b),
        );
        setCities(unique);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load cities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { cities, loading, error };
}
