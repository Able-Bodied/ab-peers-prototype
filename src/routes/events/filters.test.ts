import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  dateWindowAscending,
  dateWindowRange,
  defaultFilters,
  selectedCities,
  selectedFormats,
  selectedTags,
} from '@/routes/events/filters';

// A Wednesday, mid-month, mid-afternoon — far enough from either month boundary that the "month"
// window is unambiguous, and late enough in the day to catch a window that starts at "now".
const NOW = new Date(2026, 7, 12, 15, 30);

describe('dateWindowRange', () => {
  it('returns null for "any" so past events are not silently excluded', () => {
    expect(dateWindowRange('any', NOW)).toBeNull();
  });

  it('starts the window at midnight today, not at the current time', () => {
    const range = dateWindowRange('week', NOW);
    expect(new Date(range?.from ?? '')).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
  });

  it('covers seven days including today for "week"', () => {
    const range = dateWindowRange('week', NOW);
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 7, 18, 23, 59, 59, 999));
  });

  it('ends "month" on the last instant of the current month', () => {
    const range = dateWindowRange('month', NOW);
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('handles February in a leap year', () => {
    const range = dateWindowRange('month', new Date(2028, 1, 3, 9, 0));
    expect(new Date(range?.to ?? '')).toEqual(new Date(2028, 1, 29, 23, 59, 59, 999));
  });

  it('rolls "week" into the next month when the window crosses the boundary', () => {
    const range = dateWindowRange('week', new Date(2026, 7, 29, 10, 0));
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 8, 4, 23, 59, 59, 999));
  });

  it('gives "past" no lower bound and ends it the instant before today starts', () => {
    const range = dateWindowRange('past', NOW);
    expect(range?.from).toBeUndefined();
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 7, 11, 23, 59, 59, 999));
  });
});

describe('dateWindowAscending', () => {
  it('reads past events newest-first', () => {
    expect(dateWindowAscending('past')).toBe(false);
  });

  it('reads every other window soonest-first', () => {
    expect(dateWindowAscending('week')).toBe(true);
    expect(dateWindowAscending('month')).toBe(true);
    expect(dateWindowAscending('any')).toBe(true);
  });
});

describe('defaultFilters', () => {
  it('defaults the date window to this month', () => {
    expect(defaultFilters().when).toBe('month');
  });

  it('returns a fresh object each call so state updates cannot alias the default', () => {
    const a = defaultFilters();
    const b = defaultFilters();
    a.formats.online = false;
    expect(b.formats.online).toBe(true);
  });

  it('starts with no narrowing applied', () => {
    expect(selectedFormats(defaultFilters())).toBeNull();
    expect(selectedTags(defaultFilters())).toBeNull();
  });
});

describe('selectedFormats', () => {
  it('returns null when every format is on, because that narrows nothing', () => {
    expect(selectedFormats(defaultFilters())).toBeNull();
  });

  it('returns null when every format is off rather than matching nothing', () => {
    const filters = defaultFilters();
    filters.formats = { in_person: false, online: false, hybrid: false };
    expect(selectedFormats(filters)).toBeNull();
  });

  it('returns just the selected formats', () => {
    const filters = defaultFilters();
    filters.formats = { in_person: true, online: false, hybrid: true };
    expect(selectedFormats(filters)).toEqual(['in_person', 'hybrid']);
  });
});

describe('selectedTags', () => {
  it('returns null when nothing is picked', () => {
    expect(selectedTags(defaultFilters())).toBeNull();
  });

  it('ignores tags that were toggled back off', () => {
    const filters = defaultFilters();
    filters.tags = { kayaking: false, handcycling: true };
    expect(selectedTags(filters)).toEqual(['handcycling']);
  });

  it('sorts the slugs so the same choice produces the same query key', () => {
    const filters = defaultFilters();
    filters.tags = { kayaking: true, handcycling: true };
    expect(selectedTags(filters)).toEqual(['handcycling', 'kayaking']);
  });
});

describe('selectedCities', () => {
  it('returns null when nothing is picked', () => {
    expect(selectedCities(defaultFilters())).toBeNull();
  });

  it('ignores cities toggled back off and sorts the rest', () => {
    const filters = defaultFilters();
    filters.cities = { Oakland: true, Berkeley: false, Sacramento: true };
    expect(selectedCities(filters)).toEqual(['Oakland', 'Sacramento']);
  });
});

describe('activeFilterCount', () => {
  it('counts nothing for the defaults', () => {
    expect(activeFilterCount(defaultFilters())).toBe(0);
  });

  it('counts a format narrowing once and each tag separately', () => {
    const filters = defaultFilters();
    filters.formats = { in_person: true, online: false, hybrid: false };
    filters.tags = { kayaking: true, handcycling: true };
    expect(activeFilterCount(filters)).toBe(3);
  });

  it('counts an active city and a distance filter', () => {
    const filters = defaultFilters();
    filters.cities = { Oakland: true };
    filters.near = { latitude: 37.8, longitude: -122.27, radiusMiles: 25, label: 'Near me' };
    expect(activeFilterCount(filters)).toBe(2);
  });
});
