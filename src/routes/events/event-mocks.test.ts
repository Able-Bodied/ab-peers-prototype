import { describe, expect, it } from 'vitest';

import {
  ACTIVITIES_BY_GENRE,
  ALL_ACTIVITIES,
  mockEventAttributes,
} from '@/routes/events/event-mocks';

const IDS = [
  '01614685-74e1-404d-83e0-fe4e0976614f',
  '03c47b31-13b0-479a-b928-3654578b8b87',
  '049d0649-f611-4fb1-8a9b-ae915c0c15d6',
  '0594ba1d-9033-44d6-bb1d-b092624aca40',
  '0775ae40-deeb-4a27-98e5-e96829abc401',
  '082a7fad-674a-4fbb-b2a7-3fde28114425',
];

describe('mockEventAttributes', () => {
  it('returns the same attributes for the same id', () => {
    expect(mockEventAttributes(IDS[0] ?? '')).toEqual(mockEventAttributes(IDS[0] ?? ''));
  });

  it('labels online events as Online/Virtual so they bypass a state filter', () => {
    for (const id of IDS) {
      const attrs = mockEventAttributes(id);
      if (attrs.mode === 'virtual') {
        expect(attrs.city).toBe('Online');
        expect(attrs.state).toBe('Virtual');
      } else {
        expect(attrs.state).toBe('California');
        expect(attrs.city).not.toBe('Online');
      }
    }
  });

  it('picks an activity that belongs to the genre it reports', () => {
    for (const id of IDS) {
      const { genre, activity } = mockEventAttributes(id);
      expect(ACTIVITIES_BY_GENRE[genre]).toContain(activity);
    }
  });

  it('produces plausible non-negative RSVP counts', () => {
    for (const id of IDS) {
      const { goingCount, interestedCount } = mockEventAttributes(id);
      expect(goingCount).toBeGreaterThan(0);
      expect(interestedCount).toBeGreaterThan(0);
    }
  });

  it('does not collapse every event onto one activity', () => {
    const activities = new Set(IDS.map((id) => mockEventAttributes(id).activity));
    expect(activities.size).toBeGreaterThan(1);
  });

  it('never invents an activity outside the taxonomy', () => {
    for (const id of IDS) {
      expect(ALL_ACTIVITIES).toContain(mockEventAttributes(id).activity);
    }
  });

  it('always produces non-empty access notes and a plausible org event count', () => {
    for (const id of IDS) {
      const attrs = mockEventAttributes(id);
      expect(attrs.accessNotes.length).toBeGreaterThan(0);
      expect(attrs.orgEventsThisYear).toBeGreaterThan(0);
    }
  });
});
