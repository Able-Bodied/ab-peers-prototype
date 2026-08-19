/**
 * Filter state for the events feed.
 *
 * Only `when` actually narrows the list. It maps to a range on `events.start_time`, which is a real
 * column, and is applied in the Supabase query rather than after the fact so that infinite scroll
 * keeps paging through the filtered set instead of the whole table.
 *
 * Every other field here is presentational for now: the values render in the sheet and in the chip
 * bar, but the attributes they would filter on (city, activity, format) are invented per-render by
 * event-mocks.ts, so filtering on them would be filtering on noise.
 *
 * TODO(team): wire `place`, `formats` and `activities` to real columns once the events schema
 * carries them, and drop the `// not wired` comments below.
 */

import { ALL_ACTIVITIES } from '@/routes/events/event-mocks';

export const DATE_WINDOWS = ['week', 'month', 'any'] as const;
export type DateWindow = (typeof DATE_WINDOWS)[number];

export const DATE_WINDOW_LABELS: Record<DateWindow, string> = {
  week: 'This week',
  month: 'This month',
  any: 'Anything',
};

export const FORMATS = ['In person', 'Online', 'Recurring', 'Beginner-friendly'] as const;
export type Format = (typeof FORMATS)[number];

export type FeedMode = 'foryou' | 'everything';

export interface EventFilterState {
  feed: FeedMode; // not wired
  place: string; // not wired
  when: DateWindow;
  includeOnline: boolean; // not wired
  formats: Record<Format, boolean>; // not wired
  activities: Record<string, boolean>; // not wired
}

export function defaultFilters(): EventFilterState {
  return {
    feed: 'foryou',
    place: 'California',
    when: 'month',
    includeOnline: true,
    formats: {
      'In person': true,
      Online: true,
      Recurring: true,
      'Beginner-friendly': false,
    },
    activities: Object.fromEntries(ALL_ACTIVITIES.map((a) => [a, true])),
  };
}

export interface DateRange {
  /** Inclusive lower bound, as an ISO timestamp. */
  from: string;
  /** Inclusive upper bound, as an ISO timestamp. */
  to: string;
}

/**
 * The range `when` selects, or null for "Anything" — which deliberately leaves past events in
 * rather than silently adding a lower bound the user did not ask for.
 *
 * Both windows start at midnight local time today, so an event earlier this afternoon still counts
 * as being "this week"; ending the window at the last instant of the final day keeps an event at
 * 8pm on the boundary day inside it.
 */
export function dateWindowRange(when: DateWindow, now: Date = new Date()): DateRange | null {
  if (when === 'any') return null;

  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const to =
    when === 'week'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59, 999)
      : // Day 0 of next month is the last day of this one, so this handles month length and leap
        // years without a table.
        new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return { from: from.toISOString(), to: to.toISOString() };
}
