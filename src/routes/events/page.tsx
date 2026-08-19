import { SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRsvps } from '@/lib/rsvps';
import { getSupabase } from '@/lib/supabase';
import { useTaxonomy } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { EventListCard, type FeedEvent } from '@/routes/events/event-list-card';
import { mockEventAttributes } from '@/routes/events/event-mocks';
import { FilterSheet } from '@/routes/events/filter-sheet';
import {
  DATE_WINDOW_LABELS,
  dateWindowRange,
  defaultFilters,
  EVENT_FORMAT_LABELS,
  type EventFilterState,
  type EventFormat,
  selectedFormats,
  selectedTags,
} from '@/routes/events/filters';
import { GoingDialog } from '@/routes/events/going-dialog';

/**
 * Events discovery — the feed a peer lands on to find adaptive sports sessions, peer support
 * groups and clinics near them, laid out to match the events screen in docs/screens/events.png.
 *
 * Events are real: they come from the `events` table, ingested from partner org calendars by
 * jobs/event-ingest. So are the organization name, the format badge and the tags. The city and the
 * RSVP tallies on each card are still invented per event by event-mocks.ts, because no column
 * carries them.
 *
 * TODO(team):
 *  - [x] Chronological list of upcoming events with infinite scroll
 *  - [x] Filter sheet matching docs/screens/filter-sheet.png
 *  - [x] Date filtering on `start_time`
 *  - [x] Format and tag filters, applied in the query against real columns
 *  - [ ] Wire the place filter — no city column exists, only free-text `location`
 *  - [ ] Move RSVPs from localStorage to an `event_rsvps` table once auth lands (src/lib/rsvps.tsx)
 *  - [ ] Persist dismissals, and give the user a way to restore them (Hidden, in the sheet)
 *  - [ ] "For you" ranking from the peer's signup interests
 */

const BATCH_SIZE = 12;

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  url: string | null;
  registration_url: string | null;
  registration_deadline: string | null;
  event_format: EventFormat | null;
  /** PostgREST returns an embedded row as an object, or an array on some relationship shapes. */
  data_feeds?: { name: string } | { name: string }[] | null;
  event_photos?: { photo_url: string; is_primary: boolean }[] | null;
  event_tags?: { tags: { slug: string; name: string } | null }[] | null;
}

const BASE_COLUMNS =
  'id, title, description, start_time, end_time, location, url, registration_url, registration_deadline, event_format, data_feeds(name), event_photos(photo_url, is_primary)';

/**
 * Narrowing by tag needs an inner join, which also restricts the embedded rows to the matching
 * tags — so a filtered card lists the tags it matched on rather than all of its tags. Without a
 * tag filter the plain embed returns the full set.
 */
function selectFor(tags: string[] | null): string {
  return tags
    ? `${BASE_COLUMNS}, event_tags!inner(tags!inner(slug, name))`
    : `${BASE_COLUMNS}, event_tags(tags(slug, name))`;
}

function tagsOf(row: EventRow): { slug: string; name: string }[] {
  return (row.event_tags ?? []).flatMap((link) => (link.tags ? [link.tags] : []));
}

function orgNameOf(row: EventRow): string | null {
  const feed = row.data_feeds;
  if (!feed) return null;
  return (Array.isArray(feed) ? feed[0]?.name : feed.name) ?? null;
}

function primaryPhotoUrl(row: EventRow): string | null {
  const photos = row.event_photos ?? [];
  return photos.find((p) => p.is_primary)?.photo_url ?? photos[0]?.photo_url ?? null;
}

function toFeedEvent(row: EventRow): FeedEvent {
  return {
    id: row.id,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
    description: row.description,
    location: row.location,
    url: row.url,
    registrationUrl: row.registration_url,
    registrationDeadline: row.registration_deadline,
    format: row.event_format,
    tags: tagsOf(row),
    orgName: orgNameOf(row),
    photoUrl: primaryPhotoUrl(row),
    mock: mockEventAttributes(row.id),
  };
}

export default function EventsPage() {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [segment, setSegment] = useState<'all' | 'mine'>('all');
  const [filters, setFilters] = useState<EventFilterState>(defaultFilters);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { categories } = useTaxonomy();
  const tagNames = useMemo(
    () => new Map(categories.flatMap((c) => c.children).map((t) => [t.slug, t.name])),
    [categories],
  );

  const [rows, setRows] = useState<EventRow[]>([]);
  // Shared across routes, so the going count on a card and on that event's own page agree.
  const { rsvps, setRsvp } = useRsvps();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Marking Going opens the hand-off dialog: the host owns registration, so saying Going here is
  // not the same as having a place.
  const [goingEvent, setGoingEvent] = useState<FeedEvent | null>(null);

  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // The date window is the one filter with a real column behind it, so it is applied in the query.
  // Doing it here rather than on the loaded page keeps infinite scroll paging through the filtered
  // set — a client-side date filter would page through everything and drop most of each batch.
  const formats = selectedFormats(filters);
  const tagSlugs = selectedTags(filters);
  // Serialized so the fetch identity tracks the chosen values rather than the array identity, which
  // is new on every render and would refetch in a loop.
  const formatKey = formats?.join(',') ?? '';
  const tagKey = tagSlugs?.join(',') ?? '';

  const fetchPage = useCallback(
    async (from: number): Promise<EventRow[]> => {
      const supabase = getSupabase();
      const range = dateWindowRange(filters.when);
      const activeFormats = formatKey === '' ? null : (formatKey.split(',') as EventFormat[]);
      const activeTags = tagKey === '' ? null : tagKey.split(',');

      let query = supabase.from('events').select(selectFor(activeTags));
      if (range) {
        query = query.gte('start_time', range.from).lte('start_time', range.to);
      }
      if (activeFormats) {
        query = query.in('event_format', activeFormats);
      }
      if (activeTags) {
        query = query.in('event_tags.tags.slug', activeTags);
      }

      const { data, error: queryError } = await query
        .order('start_time', { ascending: true })
        .range(from, from + BATCH_SIZE - 1)
        .overrideTypes<EventRow[], { merge: false }>();

      if (queryError) throw queryError;
      return data;
    },
    [filters.when, formatKey, tagKey],
  );

  // Reloads from scratch whenever the date window changes.
  useEffect(() => {
    let cancelled = false;

    async function loadFirstPage() {
      try {
        setLoading(true);
        setError(null);
        const page = await fetchPage(0);
        if (cancelled) return;

        setRows(page);
        setOffset(BATCH_SIZE);
        setHasMore(page.length === BATCH_SIZE);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFirstPage();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!entry?.isIntersecting || isLoadingMore || !hasMore) return;

        void (async () => {
          try {
            setIsLoadingMore(true);
            const page = await fetchPage(offset);

            if (page.length === 0) {
              setHasMore(false);
              return;
            }

            setRows((prev) => [...prev, ...page]);
            setOffset((prev) => prev + BATCH_SIZE);
            setHasMore(page.length === BATCH_SIZE);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load more events');
          } finally {
            setIsLoadingMore(false);
          }
        })();
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [offset, hasMore, isLoadingMore, loading, fetchPage]);

  const visible = useMemo(() => {
    return rows
      .filter((row) => !dismissed.has(row.id))
      .filter((row) => segment === 'all' || Boolean(rsvps[row.id]))
      .map(toFeedEvent);
  }, [rows, dismissed, segment, rsvps]);

  const chips = [
    filters.feed === 'foryou' ? 'For you' : 'Everything',
    filters.place,
    DATE_WINDOW_LABELS[filters.when],
    // Only shown once they narrow something, so the bar doesn't claim a filter that isn't on.
    ...(formats ?? []).map((format) => EVENT_FORMAT_LABELS[format]),
    ...(tagSlugs ?? []).map((slug) => tagNames.get(slug) ?? slug.replace(/-/g, ' ')),
  ];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-col">
      <div className="flex items-center gap-2.5 pb-2">
        {(['all', 'mine'] as const).map((seg) => (
          <button
            key={seg}
            type="button"
            role="tab"
            aria-selected={segment === seg}
            onClick={() => {
              setSegment(seg);
            }}
            className={cn(
              'bg-card min-h-11 rounded-full border-2 px-5 text-base font-bold',
              segment === seg && 'bg-primary border-primary text-primary-foreground',
            )}
          >
            {seg === 'all' ? 'All' : 'Mine'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSheetOpen(true);
          }}
          aria-label="Filters"
          className="bg-card ml-auto grid size-11 shrink-0 place-items-center rounded-full border-2"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </button>
      </div>

      {segment === 'all' && (
        <div className="flex gap-2 overflow-x-auto pb-2.5">
          {chips.map((chip, index) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setSheetOpen(true);
              }}
              className={cn(
                'bg-card inline-flex min-h-9 shrink-0 items-center rounded-full border-2 px-3.5 text-[13px] font-bold',
                // The feed chip leads the bar and reads as the active mode, matching the mockup.
                index === 0 && 'border-primary bg-secondary text-primary',
              )}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-muted-foreground py-8 text-sm">Loading events…</p>}

      {error && rows.length === 0 && !loading && (
        <p className="text-destructive py-8 text-sm">Error: {error}</p>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-base font-bold">
            {segment === 'mine' ? 'Nothing saved yet' : 'Nothing matches'}
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
            {segment === 'mine'
              ? 'Mark an event Interested or Going and it lands here.'
              : 'Try a wider date range in filters.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (segment === 'mine') setSegment('all');
              else setSheetOpen(true);
            }}
            className="bg-primary text-primary-foreground mt-4 min-h-11 rounded-xl px-6 font-bold"
          >
            {segment === 'mine' ? 'Browse events' : 'Open filters'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <EventListCard
            key={event.id}
            event={event}
            rsvp={rsvps[event.id] ?? null}
            onOpen={() => {
              void navigate(`/event/${event.id}`);
            }}
            onRsvp={(next) => {
              setRsvp(event.id, next);
              if (next === 'going') setGoingEvent(event);
            }}
            onDismiss={() => {
              setDismissed((prev) => new Set(prev).add(event.id));
            }}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="flex justify-center py-6" data-testid="scroll-sentinel">
        {isLoadingMore && <p className="text-muted-foreground text-sm">Loading more events…</p>}
        {!hasMore && visible.length > 0 && (
          <p className="text-muted-foreground text-sm">No more events to load.</p>
        )}
      </div>

      {goingEvent && (
        <GoingDialog
          open
          event={{
            id: goingEvent.id,
            title: goingEvent.title,
            startTime: goingEvent.startTime,
            endTime: goingEvent.endTime,
            description: goingEvent.description,
            location: goingEvent.location,
            url: goingEvent.url,
            registrationUrl: goingEvent.registrationUrl,
          }}
          onClose={() => {
            setGoingEvent(null);
          }}
        />
      )}

      {sheetOpen && (
        <FilterSheet
          filters={filters}
          categories={categories}
          resultCount={visible.length}
          onChange={setFilters}
          onClose={() => {
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}
