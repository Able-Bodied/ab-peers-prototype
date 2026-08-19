import { describe, expect, it } from 'vitest';

import { groupTaxonomy } from '@/lib/taxonomy';

const ROWS = [
  { id: 'c1', slug: 'sports-recreation', name: 'Sports & recreation', parent_id: null },
  { id: 'c2', slug: 'advocacy', name: 'Advocacy', parent_id: null },
  { id: 't1', slug: 'kayaking', name: 'Kayaking', parent_id: 'c1' },
  { id: 't2', slug: 'handcycling', name: 'Handcycling', parent_id: 'c1' },
  { id: 't3', slug: 'fundraising', name: 'Fundraising', parent_id: 'c2' },
];

describe('groupTaxonomy', () => {
  it('nests each tag under its category', () => {
    const grouped = groupTaxonomy(ROWS);
    const sports = grouped.find((c) => c.slug === 'sports-recreation');

    expect(sports?.children.map((t) => t.slug)).toEqual(['handcycling', 'kayaking']);
  });

  it('orders categories and tags by name so the sheet is stable between loads', () => {
    const grouped = groupTaxonomy(ROWS);

    expect(grouped.map((c) => c.name)).toEqual(['Advocacy', 'Sports & recreation']);
    expect(grouped[1]?.children.map((t) => t.name)).toEqual(['Handcycling', 'Kayaking']);
  });

  it('drops a category with nothing under it rather than rendering an empty heading', () => {
    const grouped = groupTaxonomy([
      ...ROWS,
      { id: 'c3', slug: 'empty', name: 'Empty', parent_id: null },
    ]);

    expect(grouped.map((c) => c.slug)).not.toContain('empty');
  });

  it('returns nothing when the table is empty', () => {
    expect(groupTaxonomy([])).toEqual([]);
  });

  it('ignores a tag whose parent is missing rather than orphaning it into a category', () => {
    const grouped = groupTaxonomy([
      ...ROWS,
      { id: 't9', slug: 'orphan', name: 'Orphan', parent_id: 'nope' },
    ]);

    expect(grouped.flatMap((c) => c.children).map((t) => t.slug)).not.toContain('orphan');
  });

  it('treats a deeper level as belonging to its own parent, not the root', () => {
    // Nothing today nests three deep, but the schema allows it and the grouping must not silently
    // promote a grandchild into a top-level category.
    const grouped = groupTaxonomy([
      ...ROWS,
      { id: 't10', slug: 'sea-kayaking', name: 'Sea kayaking', parent_id: 't1' },
    ]);

    expect(grouped.map((c) => c.slug)).toEqual(['advocacy', 'sports-recreation']);
    expect(grouped.flatMap((c) => c.children).map((t) => t.slug)).not.toContain('sea-kayaking');
  });
});
