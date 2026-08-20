/**
 * Filter state for the Discover deck.
 *
 * Pure, no React, no data access. The page owns a `MemberFilters` and hands it to
 * `filterMembers()` in `@/mocks/selectors` — the actual matching lives there and is deliberately
 * not duplicated here. What this module owns is everything *around* that: what the default is,
 * how many filters are narrowing (the badge on the Filters button), how to clear them, and which
 * option values are worth offering at all.
 *
 * State and Disability live in the Filters sheet along with everything else, keeping the top row
 * to the three buttons in docs/screens/events-screen.html's `.top` bar (Peers, Mentors, Filters).
 * PRD §8.2 is why `languagesIn`/`topicsIn` exist rather than a hardcoded vocabulary — a chip that
 * returns nobody is a broken promise, so the sheet offers only values someone in the loaded set
 * actually has.
 */

import {
  type BrowseMember,
  type Disability,
  EQUIPMENT,
  type Equipment,
  type MemberFilters,
  type Topic,
} from '@/types/domain';

/**
 * State and Disability are always present, so they carry an explicit 'All' rather than being
 * absent like the rest of the sheet's filters.
 *
 * Frozen because it is a module-level constant that route state will spread from — an accidental
 * mutation here would follow the app around for the rest of the session. Use `clearedFilters()`
 * whenever a fresh, writable object is wanted.
 */
export const defaultDiscoverFilters: MemberFilters = Object.freeze({
  state: 'All',
  disability: 'All',
});

/**
 * The filters that are absent rather than 'All' when unused — everything behind the Filters
 * button. `exactOptionalPropertyTypes` is on, so "unset" means the key is gone, not set to
 * `undefined`; `setFilter` is the one place that knows that.
 */
export const OPTIONAL_FILTER_KEYS = [
  'equipment',
  'orgId',
  'level',
  'duration',
  'language',
  'topic',
  'ageBand',
] as const;

export type OptionalFilterKey = (typeof OPTIONAL_FILTER_KEYS)[number];

/** Every field of `MemberFilters`, in the order the sheet presents them. */
export const DISCOVER_FILTER_KEYS = ['state', 'disability', ...OPTIONAL_FILTER_KEYS] as const;

export type DiscoverFilterKey = (typeof DISCOVER_FILTER_KEYS)[number];

/**
 * 'Prefer not to say' is a real answer someone can give in onboarding, but it is not a browse
 * intent — nobody looks for "people who declined to say what they use", and offering it hands
 * someone a chip whose result set is an artefact of the form rather than a group of peers.
 */
export const EQUIPMENT_FILTER_OPTIONS: Equipment[] = EQUIPMENT.filter(
  (item) => item !== 'Prefer not to say',
);

/**
 * Level is asked only of SCI and Combo (PRD §6.1), so it is only ever a meaningful filter once
 * the disability chip has narrowed to one of those. With disability on 'All' the level control
 * stays inert rather than silently excluding every non-SCI member.
 */
export const LEVEL_DISABILITIES: Disability[] = ['SCI - para', 'SCI - quad', 'Combo (SCI and TBI)'];

export function levelApplies(disability: Disability | 'All'): boolean {
  return disability !== 'All' && LEVEL_DISABILITIES.includes(disability);
}

/** A filter value only narrows if it is set and is not the "everything" sentinel. */
function isNarrowing(value: string | undefined): boolean {
  return value !== undefined && value !== 'All' && value.trim() !== '';
}

/**
 * How many filters are actually narrowing the deck — the number on the Filters button.
 * 'All' and `undefined` mean "don't narrow by that" and do not count.
 */
export function activeFilterCount(f: MemberFilters): number {
  return DISCOVER_FILTER_KEYS.filter((key) => isNarrowing(f[key])).length;
}

/** A fresh default object. Never returns the frozen constant, so callers can mutate their copy. */
export function clearedFilters(): MemberFilters {
  return { ...defaultDiscoverFilters };
}

/**
 * Set one of the sheet filters, or drop it when the value is `undefined`.
 *
 * Every control in the sheet goes through this rather than spreading `{ ...filters, topic }`
 * itself, because with `exactOptionalPropertyTypes` an unused filter has to be an absent key —
 * a key present and holding `undefined` is a different type and a different `Object.keys`.
 */
export function setFilter<K extends OptionalFilterKey>(
  f: MemberFilters,
  key: K,
  value: MemberFilters[K] | undefined,
): MemberFilters {
  if (value !== undefined) {
    const next: MemberFilters = { ...f };
    next[key] = value;
    return next;
  }
  // Written out per key rather than as a dynamic `delete`, which keeps the result typed as
  // `MemberFilters` all the way through instead of leaning on a cast.
  switch (key) {
    case 'equipment': {
      const { equipment: _dropped, ...rest } = f;
      return rest;
    }
    case 'orgId': {
      const { orgId: _dropped, ...rest } = f;
      return rest;
    }
    case 'level': {
      const { level: _dropped, ...rest } = f;
      return rest;
    }
    case 'duration': {
      const { duration: _dropped, ...rest } = f;
      return rest;
    }
    case 'language': {
      const { language: _dropped, ...rest } = f;
      return rest;
    }
    case 'topic': {
      const { topic: _dropped, ...rest } = f;
      return rest;
    }
    default: {
      const { ageBand: _dropped, ...rest } = f;
      return rest;
    }
  }
}

/**
 * Clear one filter without touching the rest — what the X on a chip does.
 * State and Disability return to 'All'; every other filter goes back to unset.
 */
export function clearFilter(f: MemberFilters, key: DiscoverFilterKey): MemberFilters {
  if (key === 'state') return { ...f, state: 'All' };
  if (key === 'disability') return setDisability(f, 'All');
  return setFilter(f, key, undefined);
}

/**
 * Change the disability filter, dropping a level that no longer applies.
 *
 * Without this, picking "C5" and then switching disability to Amputee leaves a hidden level
 * filter behind that matches nobody, with no visible control explaining why the deck is empty.
 */
export function setDisability(f: MemberFilters, disability: Disability | 'All'): MemberFilters {
  const next: MemberFilters = { ...f, disability };
  return levelApplies(disability) ? next : setFilter(next, 'level', undefined);
}

export interface FilterChip {
  key: DiscoverFilterKey;
  /** What to render on the chip. */
  label: string;
}

/**
 * The active filters as chip labels, for the row under the bar. Ordered as
 * `DISCOVER_FILTER_KEYS`, so the chips do not reshuffle as filters are added and removed.
 *
 * Values that are ambiguous on their own get a word of context — "Level C5", "Age 30-39" — and
 * an org slug is resolved through `orgName` so the chip says "Craig Hospital", not
 * "craig-hospital".
 */
export function activeFilterChips(
  f: MemberFilters,
  orgName?: (slug: string) => string | undefined,
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of DISCOVER_FILTER_KEYS) {
    const value = f[key];
    if (!isNarrowing(value) || value === undefined) continue;
    if (key === 'orgId') {
      chips.push({ key, label: orgName?.(value) ?? value });
    } else if (key === 'level') {
      chips.push({ key, label: `Level ${value}` });
    } else if (key === 'ageBand') {
      chips.push({ key, label: `Age ${value}` });
    } else {
      chips.push({ key, label: value });
    }
  }
  return chips;
}

/** Deduped, sorted vocabulary actually present in the loaded set — see the note at the top. */
export function languagesIn(members: Pick<BrowseMember, 'languages'>[]): string[] {
  return [...new Set(members.flatMap((m) => m.languages))].sort((a, b) => a.localeCompare(b));
}

/** Deduped, sorted vocabulary actually present in the loaded set — see the note at the top. */
export function topicsIn(members: Pick<BrowseMember, 'topics'>[]): Topic[] {
  return [...new Set(members.flatMap((m) => m.topics))].sort((a, b) => a.localeCompare(b));
}
