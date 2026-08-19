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
 * instead of calling `mockEventAttributes`. `accessNotes`/`accessWarning` match `EventItem.accessNotes`
 * (currently one free-text field there — split however the real data ends up shaped).
 * `orgVerified`/`orgEventsThisYear` stand in for a claimed-org record; nothing today links a
 * `data_feeds` row to an `Org`.
 *
 * Values are derived from the event id, so a given event looks the same on every render and across
 * reloads — a card that shuffled its city on each paint would be actively misleading to demo.
 *
 * RSVP tallies are not invented here anymore — they come from the real `event_rsvps` table via
 * `useRsvps().countsFor()` (see src/lib/rsvps.tsx), since a fabricated "6 going" on an event nobody
 * has actually RSVP'd to is worse than an honest zero.
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

/** Mirrors the "accline" field in docs/screens/event-org.html — access provisions, not a promise. */
const ACCESS_NOTES = [
  'Accessible parking, 6 spaces · Loaner equipment on request',
  'Step-free entrance · Accessible restroom on site',
  'Elevator access to all floors · Reserved accessible seating',
  'Ground-level venue · Service animals welcome',
] as const;

/** Mirrors the "accwarn" field — a caveat worth surfacing, not always present. */
const ACCESS_WARNINGS = [
  'Last 200 m of the trail is gravel',
  'Street parking only near the venue',
  'Second floor has stairs only',
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
  accessNotes: string;
  /** Null when there is nothing worth flagging. */
  accessWarning: string | null;
  /** Stands in for the host org's claimed/verified status — no `orgs` table behind `data_feeds` yet. */
  orgVerified: boolean;
  orgEventsThisYear: number;
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
    accessNotes: pick(ACCESS_NOTES, h, 5),
    accessWarning: pick(ACCESS_WARNINGS, h, 6),
    orgVerified: h % 3 !== 0,
    orgEventsThisYear: (h % 20) + 3,
  };
}
