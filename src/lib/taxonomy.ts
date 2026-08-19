import { useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/**
 * The tag taxonomy, read from the `tags` table rather than hardcoded.
 *
 * The vocabulary is data (supabase/migrations/20260818130000_events_ai_enrichment.sql), so adding a
 * tag or a whole category is an INSERT with no code change. A copy of the list in the client would
 * defeat that the first time someone added a row.
 */

interface TagRow {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

export interface TaxonomyTag {
  slug: string;
  name: string;
}

export interface TaxonomyCategory extends TaxonomyTag {
  children: TaxonomyTag[];
}

/** Groups the flat rows into category -> leaves, dropping categories with nothing under them. */
export function groupTaxonomy(rows: TagRow[]): TaxonomyCategory[] {
  const categories = rows.filter((row) => row.parent_id === null);

  return categories
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      children: rows
        .filter((row) => row.parent_id === category.id)
        .map((row) => ({ slug: row.slug, name: row.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((category) => category.children.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useTaxonomy(): {
  categories: TaxonomyCategory[];
  loading: boolean;
  error: string | null;
} {
  const [categories, setCategories] = useState<TaxonomyCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error: queryError } = await getSupabase()
          .from('tags')
          .select('id, slug, name, parent_id')
          .overrideTypes<TagRow[], { merge: false }>();
        if (queryError) throw queryError;
        if (cancelled) return;
        setCategories(groupTaxonomy(data));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load tags');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading, error };
}
