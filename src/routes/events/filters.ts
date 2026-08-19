/**
 * Filter state for the events feed.
 *
 * `when`, `formats` and `tags` all map to real columns and are applied in the Supabase query rather
 * than after the fact, so infinite scroll keeps paging through the filtered set instead of paging
 * the whole table and dropping most of each batch.
 *
 * `feed` and `place` are still presentational: there is no ranking signal and no city column, so
 * filtering on them would be filtering on noise.
 */

export const DATE_WINDOWS = ['week', 'month', 'any'] as const;
export type DateWindow = (typeof DATE_WINDOWS)[number];

export const DATE_WINDOW_LABELS: Record<DateWindow, string> = {
  week: 'This week',
  month: 'This month',
  any: 'Anything',
};

/** Matches the events_event_format_check constraint on `events.event_format`. */
export const EVENT_FORMATS = ['in_person', 'online', 'hybrid'] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

export const EVENT_FORMAT_LABELS: Record<EventFormat, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
};

export type FeedMode = 'foryou' | 'everything';

export interface EventFilterState {
  feed: FeedMode; // not wired
  place: string; // not wired
  when: DateWindow;
  formats: Record<EventFormat, boolean>;
  /** Tag slug -> selected. Absent or false means "not selected", not "excluded". */
  tags: Record<string, boolean>;
}

export function defaultFilters(): EventFilterState {
  return {
    feed: 'foryou',
    place: 'California',
    when: 'month',
    // All on is the same result as none on — both mean "don't narrow by format" — but starting
    // them on makes the sheet read as "everything is included", which is what the feed shows.
    formats: { in_person: true, online: true, hybrid: true },
    tags: {},
  };
}

/**
 * The formats to narrow to, or null for "don't narrow".
 *
 * All-selected and none-selected both mean no filter. Treating none-selected as "match nothing"
 * would hand someone an empty feed for the very natural act of clearing every chip, with no hint
 * that clearing one more would have brought everything back.
 */
export function selectedFormats(filters: EventFilterState): EventFormat[] | null {
  const on = EVENT_FORMATS.filter((format) => filters.formats[format]);
  return on.length === 0 || on.length === EVENT_FORMATS.length ? null : on;
}

/** The tag slugs to narrow to, or null for "don't narrow". Selected tags are OR-ed. */
export function selectedTags(filters: EventFilterState): string[] | null {
  const on = Object.entries(filters.tags)
    .filter(([, selected]) => selected)
    .map(([slug]) => slug);
  return on.length === 0 ? null : on.sort();
}

/** How many narrowing choices are active, for the chip bar. */
export function activeFilterCount(filters: EventFilterState): number {
  return (selectedFormats(filters) ? 1 : 0) + (selectedTags(filters)?.length ?? 0);
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
