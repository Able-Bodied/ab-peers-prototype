/**
 * Placeholder attributes for the parts of an event the database does not carry yet.
 *
 * The `events` table currently stores only title, description, start/end time, a free-text
 * `location`, a url and a category (see supabase/migrations/20260818060000_create_events_schema.sql).
 * The events feed in docs/index.html shows considerably more: a city, an activity tag, whether the
 * event is online or in person, whether it recurs, and RSVP counts. Rather than drop those from the
 * UI — they carry most of the visual rhythm of the card — we invent them here.
 *
 * TODO(team): delete this module once the columns land. Most fields below map to one that
 * `EventItem` in src/types/domain.ts already declares, so the swap is a matter of reading the row
 * instead of calling `mockEventAttributes`.
 *
 * Values are derived from the event id, so a given event looks the same on every render and across
 * reloads — a card that shuffled its city on each paint would be actively misleading to demo.
 *
 * RSVP tallies are not invented here anymore — they come from the real `event_rsvps` table via
 * `useRsvps().countsFor()` (see src/lib/rsvps.tsx), since a fabricated "6 going" on an event nobody
 * has actually RSVP'd to is worse than an honest zero. Likewise, access notes/warnings and the org
 * verified badge have been dropped rather than invented — see git history if that data lands later.
 */

import type { EventMode } from '@/types/domain';

/** Activity taxonomy from the prototype's filter sheet, genre -> activities. */
export const ACTIVITIES_BY_GENRE: Record<string, readonly string[]> = {
  'Sports & recreation': [
    'Handcycling',
    'Wheelchair rugby',
    'Monoskiing',
    'Adaptive climbing',
    'Kayaking',
    'Hiking & trails',
  ],
  'Support & groups': ['Peer support group', "Men's group", 'Caregiver group', 'Newly injured'],
  'Skills & services': ['Driving lessons', 'Equipment clinics', 'Benefits advice'],
  'Social & travel': ['Travel', 'Social meetup', 'Food & drink'],
  Advocacy: ['Policy & access', 'Fundraising'],
};

export const GENRES = Object.keys(ACTIVITIES_BY_GENRE);

export const ALL_ACTIVITIES = Object.values(ACTIVITIES_BY_GENRE).flat();

/** City-center places only, per docs/PII.md — no precise venues. */
const CITIES = [
  { city: 'Berkeley', state: 'California' },
  { city: 'San Jose', state: 'California' },
  { city: 'Sacramento', state: 'California' },
  { city: 'Oakland', state: 'California' },
  { city: 'Palo Alto', state: 'California' },
  { city: 'Santa Rosa', state: 'California' },
] as const;

/**
 * Invented, so it must never read as a claim about a real person. These mirror the aggregate,
 * non-identifying phrasing the prototype uses ("2 going have SCI - para").
 */
const MATCH_LINES = [
  '2 going have SCI - para',
  '3 going have SCI - quad',
  '5 going are in their first year',
  null,
  null,
] as const;

export interface MockEventAttributes {
  city: string;
  /** "Virtual" for online events — they deliberately bypass the state filter. */
  state: string;
  mode: EventMode;
  activity: string;
  genre: string;
  recurring: boolean;
  beginner: boolean;
  /** Aggregate phrasing only; null when there is nothing worth surfacing. */
  matchLine: string | null;
}

/**
 * FNV-1a. Any stable string hash would do — this one is short, dependency-free, and spreads
 * sequential UUIDs across buckets well enough that neighbouring cards don't look cloned.
 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Picks a stable element, offset by `salt` so different fields don't correlate. */
function pick<T>(items: readonly T[], hash: number, salt: number): T {
  const item = items[(hash + salt * 2654435761) % items.length];
  // items is never empty for any caller below, but noUncheckedIndexedAccess can't know that.
  if (item === undefined) throw new Error('pick() called with an empty list');
  return item;
}

export function mockEventAttributes(id: string): MockEventAttributes {
  const h = hashId(id);

  const genre = pick(GENRES, h, 1);
  const activities = ACTIVITIES_BY_GENRE[genre] ?? ALL_ACTIVITIES;
  const activity = pick(activities, h, 2);

  // Support groups skew online, sports skew in person — keeps the badge mix plausible.
  const onlineBias = genre === 'Support & groups' ? 2 : 4;
  const mode: EventMode = h % 5 < onlineBias ? 'in-person' : 'virtual';

  const place = pick(CITIES, h, 3);

  return {
    city: mode === 'virtual' ? 'Online' : place.city,
    state: mode === 'virtual' ? 'Virtual' : place.state,
    mode,
    activity,
    genre,
    recurring: h % 3 !== 0,
    beginner: h % 4 !== 0,
    matchLine: pick(MATCH_LINES, h, 4),
  };
}
