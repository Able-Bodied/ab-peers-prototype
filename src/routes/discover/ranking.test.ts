import { describe, expect, it } from 'vitest';

import { MEMBERS } from '@/mocks/seed';
import { rankMembers, relevanceScore, stageScore } from '@/routes/discover/ranking';
import type { BrowseMember, DurationBucket, Interest, Member, UsState } from '@/types/domain';

/** Fixtures come from the vetted synthetic seed, never invented people (docs/PII.md). */
function template(): Member {
  const [first] = MEMBERS;
  if (!first) throw new Error('src/mocks/seed.ts has no members to build fixtures from');
  return first;
}

function browsable(overrides: Partial<BrowseMember> = {}): BrowseMember {
  const { phone: _phone, birthDate: _birthDate, ...rest } = template();
  return { ...rest, ...overrides };
}

function person(
  id: string,
  state: UsState,
  duration: DurationBucket,
  interests: Interest[] = [],
): BrowseMember {
  return browsable({ id, state, duration, durationAnsweredOn: '2026-08-16', interests });
}

describe('stageScore', () => {
  it('points a newly injured viewer at someone years ahead, not at someone alongside them', () => {
    // PRD §6.1: under a year in, the best match is someone five to ten years ahead.
    const viewer = person('viewer', 'California', 'Less than 6 months');
    const alongside = person('alongside', 'California', 'Less than 6 months');
    const ahead = person('ahead', 'California', '3 - 10 years');

    expect(stageScore(viewer, ahead)).toBeGreaterThan(stageScore(viewer, alongside));
  });

  it('scores nobody behind the viewer as a stage match when they are newly injured', () => {
    const viewer = person('viewer', 'California', '6 - 12 months');
    expect(stageScore(viewer, person('newer', 'California', 'Less than 6 months'))).toBe(0);
  });

  it('points a settled viewer at a similar stage instead', () => {
    // Over a year in, what people want is someone to do things with.
    const viewer = person('viewer', 'California', '3 - 10 years');
    const similar = person('similar', 'California', '3 - 10 years');
    const distant = person('distant', 'California', 'Less than 6 months');

    expect(stageScore(viewer, similar)).toBeGreaterThan(stageScore(viewer, distant));
  });
});

describe('relevanceScore', () => {
  it('weighs the same state above every other signal', () => {
    const viewer = person('viewer', 'California', '3 - 10 years', ['Cooking', 'Travel']);
    const local = person('local', 'California', '10+ years');
    const distantTwin = person('twin', 'Texas', '3 - 10 years', ['Cooking', 'Travel']);

    expect(relevanceScore(viewer, local)).toBeGreaterThan(relevanceScore(viewer, distantTwin));
  });

  it('breaks a tie on shared interests', () => {
    const viewer = person('viewer', 'California', '3 - 10 years', ['Cooking', 'Travel']);
    const shares = person('shares', 'California', '3 - 10 years', ['Cooking']);
    const shaesNothing = person('none', 'California', '3 - 10 years', ['Archery']);

    expect(relevanceScore(viewer, shares)).toBeGreaterThan(relevanceScore(viewer, shaesNothing));
  });
});

describe('rankMembers', () => {
  it('puts the most relevant person on top of the deck', () => {
    const viewer = person('viewer', 'Colorado', '3 - 10 years', ['Cooking']);
    const ranked = rankMembers(
      [
        person('far', 'Texas', '10+ years'),
        person('near', 'Colorado', '3 - 10 years', ['Cooking']),
        person('nearish', 'Colorado', '10+ years'),
      ],
      viewer,
    );

    expect(ranked.map((m) => m.id)).toEqual(['near', 'nearish', 'far']);
  });

  it('keeps the incoming order when there is no viewer to rank against', () => {
    const deck = [person('a', 'Texas', '10+ years'), person('b', 'Colorado', '10+ years')];
    expect(rankMembers(deck, null).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const deck = [person('a', 'Texas', '10+ years'), person('b', 'Colorado', '10+ years')];
    rankMembers(deck, person('viewer', 'Colorado', '10+ years'));
    expect(deck.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('keeps ties in their incoming order, so the deck does not reshuffle under a scroll', () => {
    const viewer = person('viewer', 'Colorado', '3 - 10 years');
    const deck = [
      person('first', 'Colorado', '3 - 10 years'),
      person('second', 'Colorado', '3 - 10 years'),
      person('third', 'Colorado', '3 - 10 years'),
    ];
    expect(rankMembers(deck, viewer).map((m) => m.id)).toEqual(['first', 'second', 'third']);
  });
});
