import { describe, expect, it } from 'vitest';

import { MEMBERS } from '@/mocks/seed';
import {
  activeFilterChips,
  activeFilterCount,
  clearedFilters,
  clearFilter,
  defaultDiscoverFilters,
  EQUIPMENT_FILTER_OPTIONS,
  languagesIn,
  levelApplies,
  setDisability,
  topicsIn,
} from '@/routes/discover/filters';
import type { BrowseMember, MemberFilters } from '@/types/domain';

/** The seeded people, cut down to what any other member is allowed to see (docs/PII.md). */
const browsable: BrowseMember[] = MEMBERS.map(
  ({ phone: _phone, birthDate: _birthDate, ...rest }) => rest,
);

describe('defaultDiscoverFilters', () => {
  it('starts with both bar filters on All and nothing else set', () => {
    expect(defaultDiscoverFilters).toEqual({ state: 'All', disability: 'All' });
  });

  it('narrows nothing', () => {
    expect(activeFilterCount(defaultDiscoverFilters)).toBe(0);
  });
});

describe('clearedFilters', () => {
  it('matches the defaults', () => {
    expect(clearedFilters()).toEqual(defaultDiscoverFilters);
  });

  it('returns a fresh object each call so route state cannot alias the constant', () => {
    const a = clearedFilters();
    const b = clearedFilters();
    a.state = 'California';
    expect(b.state).toBe('All');
    expect(defaultDiscoverFilters.state).toBe('All');
  });
});

describe('activeFilterCount', () => {
  it('does not count All', () => {
    expect(
      activeFilterCount({
        state: 'All',
        disability: 'All',
        equipment: 'All',
        orgId: 'All',
        duration: 'All',
        language: 'All',
        topic: 'All',
        level: 'All',
        ageBand: 'All',
      }),
    ).toBe(0);
  });

  it('does not count fields left undefined', () => {
    expect(activeFilterCount({ state: 'All', disability: 'All' })).toBe(0);
  });

  it('counts a bar filter', () => {
    expect(activeFilterCount({ state: 'California', disability: 'All' })).toBe(1);
  });

  it('counts every narrowing field once', () => {
    const filters: MemberFilters = {
      state: 'California',
      disability: 'SCI - quad',
      equipment: 'Power chair',
      orgId: 'craig-hospital',
      duration: '1 - 3 years',
      language: 'Spanish',
      topic: 'Transfers',
      level: 'C5',
      ageBand: '30-39',
    };
    expect(activeFilterCount(filters)).toBe(9);
  });

  it('ignores an empty string, which narrows nothing either', () => {
    expect(activeFilterCount({ state: 'All', disability: 'All', language: '' })).toBe(0);
  });

  it('counts a mix of set and unset fields', () => {
    expect(
      activeFilterCount({
        state: 'All',
        disability: 'Amputee',
        equipment: 'All',
        ageBand: '40-49',
      }),
    ).toBe(2);
  });
});

describe('levelApplies', () => {
  it('is true for the SCI and Combo types, which are the ones asked for a level', () => {
    expect(levelApplies('SCI - para')).toBe(true);
    expect(levelApplies('SCI - quad')).toBe(true);
    expect(levelApplies('Combo (SCI and TBI)')).toBe(true);
  });

  it('is false for every other disability', () => {
    expect(levelApplies('TBI')).toBe(false);
    expect(levelApplies('Amputee')).toBe(false);
    expect(levelApplies('MS')).toBe(false);
  });

  it('is false while the disability filter is still All', () => {
    expect(levelApplies('All')).toBe(false);
  });
});

describe('setDisability', () => {
  it('keeps a level that still applies', () => {
    const next = setDisability(
      { state: 'All', disability: 'SCI - para', level: 'T6' },
      'SCI - quad',
    );
    expect(next.level).toBe('T6');
    expect(next.disability).toBe('SCI - quad');
  });

  it('drops a level that no longer applies rather than leaving it hidden', () => {
    const next = setDisability({ state: 'All', disability: 'SCI - para', level: 'T6' }, 'Amputee');
    expect(next.level).toBeUndefined();
    expect(activeFilterCount(next)).toBe(1);
  });

  it('drops the level when the disability goes back to All', () => {
    const next = setDisability({ state: 'All', disability: 'SCI - quad', level: 'C5' }, 'All');
    expect(next.level).toBeUndefined();
  });

  it('leaves the other filters alone', () => {
    const next = setDisability(
      { state: 'Colorado', disability: 'SCI - quad', level: 'C5', topic: 'Transfers' },
      'TBI',
    );
    expect(next.state).toBe('Colorado');
    expect(next.topic).toBe('Transfers');
  });
});

describe('clearFilter', () => {
  it('puts a bar filter back to All rather than removing it', () => {
    expect(clearFilter({ state: 'Texas', disability: 'All' }, 'state').state).toBe('All');
  });

  it('unsets a sheet filter', () => {
    const next = clearFilter(
      { state: 'All', disability: 'All', equipment: 'Manual chair' },
      'equipment',
    );
    expect(next.equipment).toBeUndefined();
  });

  it('takes the level with it when the disability is cleared', () => {
    const next = clearFilter({ state: 'All', disability: 'SCI - para', level: 'T6' }, 'disability');
    expect(next.disability).toBe('All');
    expect(next.level).toBeUndefined();
  });

  it('does not touch the filters it was not asked about', () => {
    const next = clearFilter(
      { state: 'Texas', disability: 'All', topic: 'Transfers', ageBand: '30-39' },
      'topic',
    );
    expect(next.state).toBe('Texas');
    expect(next.ageBand).toBe('30-39');
  });
});

describe('activeFilterChips', () => {
  it('returns nothing for the defaults', () => {
    expect(activeFilterChips(defaultDiscoverFilters)).toEqual([]);
  });

  it('resolves an org slug to its name so the chip is readable', () => {
    const chips = activeFilterChips(
      { state: 'All', disability: 'All', orgId: 'craig-hospital' },
      () => 'Craig Hospital',
    );
    expect(chips).toEqual([{ key: 'orgId', label: 'Craig Hospital' }]);
  });

  it('falls back to the slug when the org is unknown', () => {
    const chips = activeFilterChips(
      { state: 'All', disability: 'All', orgId: 'borp' },
      () => undefined,
    );
    expect(chips[0]?.label).toBe('borp');
  });

  it('qualifies the values that read as ambiguous alone', () => {
    const chips = activeFilterChips({
      state: 'All',
      disability: 'SCI - quad',
      level: 'C5',
      ageBand: '30-39',
    });
    expect(chips.map((c) => c.label)).toEqual(['SCI - quad', 'Level C5', 'Age 30-39']);
  });

  it('lists the chips in a stable order regardless of key order', () => {
    const chips = activeFilterChips({ ageBand: '50-59', disability: 'All', state: 'Oregon' });
    expect(chips.map((c) => c.key)).toEqual(['state', 'ageBand']);
  });
});

describe('EQUIPMENT_FILTER_OPTIONS', () => {
  it('offers the real equipment answers', () => {
    expect(EQUIPMENT_FILTER_OPTIONS).toContain('Manual chair');
    expect(EQUIPMENT_FILTER_OPTIONS).toContain('Power chair');
  });

  it('leaves out "Prefer not to say", which is not something anyone browses for', () => {
    expect(EQUIPMENT_FILTER_OPTIONS).not.toContain('Prefer not to say');
  });
});

describe('languagesIn', () => {
  it('dedupes and sorts', () => {
    const members = [
      { languages: ['Spanish', 'English'] },
      { languages: ['English', 'ASL'] },
      { languages: ['Spanish'] },
    ];
    expect(languagesIn(members)).toEqual(['ASL', 'English', 'Spanish']);
  });

  it('returns nothing for an empty set rather than a hardcoded vocabulary', () => {
    expect(languagesIn([])).toEqual([]);
  });

  it('offers only languages somebody in the loaded set actually has', () => {
    const spanishSpeakers = browsable.filter((m) => m.languages.includes('Spanish'));
    expect(languagesIn(spanishSpeakers)).toContain('Spanish');
    expect(
      languagesIn(browsable).every((lang) => browsable.some((m) => m.languages.includes(lang))),
    ).toBe(true);
  });
});

describe('topicsIn', () => {
  it('dedupes and sorts', () => {
    const members = [
      { topics: ['Transfers' as const, 'Bowel program' as const] },
      { topics: ['Transfers' as const] },
      { topics: ['Pressure sores' as const] },
    ];
    expect(topicsIn(members)).toEqual(['Bowel program', 'Pressure sores', 'Transfers']);
  });

  it('returns nothing when nobody has listed a topic', () => {
    expect(topicsIn([{ topics: [] }, { topics: [] }])).toEqual([]);
  });

  it('never offers a topic that would return nobody (PRD §8.2)', () => {
    const topics = topicsIn(browsable);
    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      expect(browsable.some((m) => m.topics.includes(topic))).toBe(true);
    }
  });
});
