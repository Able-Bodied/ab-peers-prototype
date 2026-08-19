import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/**
 * The organization vocabulary, read from the `organizations` table rather than hardcoded — see
 * supabase/migrations/20260819120000_organizations.sql. Every `data_feeds` row maps to exactly one
 * of these, so filtering by organization is filtering by `events.data_feeds.organization_id` under
 * the hood (src/routes/events/page.tsx).
 */

export interface Organization {
  slug: string;
  name: string;
  logoUrl: string | null;
}

interface OrganizationRow {
  slug: string;
  name: string;
  logo_url: string | null;
}

export function useOrganizations(): {
  organizations: Organization[];
  loading: boolean;
  error: string | null;
} {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('organizations')
          .select('slug, name, logo_url')
          .order('name', { ascending: true })
          .overrideTypes<OrganizationRow[], { merge: false }>();
        if (queryError) throw queryError;
        if (cancelled) return;
        setOrganizations(
          data.map((row) => ({ slug: row.slug, name: row.name, logoUrl: row.logo_url })),
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load organizations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { organizations, loading, error };
}
