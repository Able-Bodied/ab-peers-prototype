import { SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCities } from '@/lib/cities';
import { useFollows } from '@/lib/follows';
import { useOrganizations } from '@/lib/organizations';
import { useRsvps } from '@/lib/rsvps';
import { getSupabase } from '@/lib/supabase';
import { useTaxonomy } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import { EventListCard, type FeedEvent } from '@/routes/events/event-list-card';
import { mockEventAttributes } from '@/routes/events/event-mocks';
import { FilterSheet } from '@/routes/events/filter-sheet';
import {
  DATE_WINDOW_LABELS,
  dateWindowAscending,
  dateWindowRange,
  defaultFilters,
  EVENT_FORMAT_LABELS,
  type EventFilterState,
  type EventFormat,
  type EventListNavState,
  selectedCities,
  selectedFormats,
  selectedOrganizations,
  selectedTags,
} from '@/routes/events/filters';
import { GoingDialog } from '@/routes/events/going-dialog';

/**
 * Events discovery — the feed a peer lands on to find adaptive sports sessions, peer support
 * groups and clinics near them, laid out to match the events screen in docs/screens/events.png.
 *
 * Events are real: they come from the `events` table, ingested from partner org calendars by
 * jobs/event-ingest. So are the organization badge, the format badge, the tags and the RSVP
 * tallies (event_rsvps, via src/lib/rsvps.tsx). The card shows an organization badge rather than
 * an event photo — `events.organization_id` (see
 * supabase/migrations/20260819170000_events_organization_id.sql) is the *effective* org for that
 * specific event: the one ingest.js resolved from the scraper's own per-event org when it named
 * one (e.g. AdaptiveRecHub's "Program" — one feed can host many different orgs' events), or the
 * feed's own org otherwise (NorCal SCI's case — one org for every event in that feed). Either way
 * the row's `organizations` embed is already the right one to read, with no fallback logic needed
 * here. A scraped photo said less about an event than knowing which trusted org posted it.
 *
 * start_time/end_time/location prefer the scraped column and fall back to the AI-extracted one
 * (ai_extracted_start_time/end_time/location — see
 * supabase/migrations/20260819140000_events_ai_extracted_fields.sql) only when the scraped column
 * is empty; an event with neither is dropped from the feed rather than shown with no date. City,
 * on the card and in the filter/RPC alike, is `events.city` — geocoded, real, and null until that
 * event has a resolvable location; event-mocks.ts's invented city has no reader left in this file.
 *
 * TODO(team):
 *  - [x] Chronological list of upcoming events with infinite scroll
 *  - [x] Filter sheet matching docs/screens/filter-sheet.png
 *  - [x] Date filtering on `start_time`
 *  - [x] Format and tag filters, applied in the query against real columns
 *  - [x] Real RSVP counts from `event_rsvps`
 *  - [x] Organization badge and filter, from `organizations`
 *  - [x] City filter (`events.city`) and distance filter (`nearby_events` RPC)
 *  - [x] Following segment, filtered by the organizations the viewer follows (src/lib/follows.tsx)
 *  - [x] Per-event organization, for feeds that aggregate many orgs (AdaptiveRecHub)
 *  - [ ] Persist dismissals, and give the user a way to restore them (Hidden, in the sheet)
 *  - [ ] "For you" ranking from the peer's signup interests
 */

const BATCH_SIZE = 12;
const MILES_TO_KM = 1.60934;

interface OrganizationEmbed {
  slug: string;
  name: string;
  logo_url: string | null;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  /** Set only when start_time was missing and the AI verification pass found one in the copy. */
  ai_extracted_start_time: string | null;
  ai_extracted_end_time: string | null;
  ai_extracted_location: string | null;
  /** Geocoded from `location`/`ai_extracted_location` — never latitude/longitude, see filters.ts. */
  city: string | null;
  url: string | null;
  registration_url: string | null;
  registration_deadline: string | null;
  event_format: EventFormat | null;
  /** PostgREST returns an embedded row as an object, or an array on some relationship shapes. */
  organizations?: OrganizationEmbed | OrganizationEmbed[] | null;
  event_tags?: { tags: { slug: string; name: string } | null }[] | null;
}

const BASE_COLUMNS =
  'id, title, description, start_time, end_time, location, ai_extracted_start_time, ai_extracted_end_time, ai_extracted_location, city, url, registration_url, registration_deadline, event_format';

/**
 * Narrowing by tag or organization needs an inner join on that embed, which also restricts the
 * embedded rows to the match — so a filtered card lists only the tags it matched on rather than
 * its full set. Without a filter the plain embed returns everything. City needs no join — it's a
 * plain column — so it's just a `.in()` added in fetchPage, not part of this select shape.
 */
function selectFor(tags: string[] | null, organizations: string[] | null): string {
  const tagsPart = tags
    ? 'event_tags!inner(tags!inner(slug, name))'
    : 'event_tags(tags(slug, name))';
  const orgsPart = organizations
    ? 'organizations!inner(slug, name, logo_url)'
    : 'organizations(slug, name, logo_url)';
  return `${BASE_COLUMNS}, ${orgsPart}, ${tagsPart}`;
}

function tagsOf(row: EventRow): { slug: string; name: string }[] {
  return (row.event_tags ?? []).flatMap((link) => (link.tags ? [link.tags] : []));
}

function orgOf(row: EventRow): OrganizationEmbed | null {
  const org = row.organizations;
  if (!org) return null;
  return (Array.isArray(org) ? org[0] : org) ?? null;
}

function orgNameOf(row: EventRow): string | null {
  return orgOf(row)?.name ?? null;
}

/** The badge shown in place of an event photo — the event's own effective organization. */
function orgBadgeOf(row: EventRow): { name: string; logoUrl: string | null } | null {
  const org = orgOf(row);
  return org ? { name: org.name, logoUrl: org.logo_url } : null;
}

/** Used to test an event against the viewer's followed organizations (see useFollows). */
function orgSlugOf(row: EventRow): string | null {
  return orgOf(row)?.slug ?? null;
}

/**
 * The scraped column wins whenever it has one; the AI-extracted column fills in only when it's
 * empty (see the file header). A row with neither returns null rather than a card with no date —
 * this is genuinely rare (start_time coverage is ~95% at scrape time, per
 * jobs/event-ingest/scrapers/norcalsci-events.md, and most of that gap gets filled by the AI pass).
 */
function toFeedEvent(row: EventRow): FeedEvent | null {
  const startTime = row.start_time ?? row.ai_extracted_start_time;
  if (!startTime) return null;

  return {
    id: row.id,
    title: row.title,
    startTime,
    endTime: row.end_time ?? row.ai_extracted_end_time,
    description: row.description,
    // A blank-but-present location (the feed's own "no venue" sentinel, per event-list-card.tsx)
    // counts as absent too, so it still falls back to the AI-extracted one.
    location: row.location?.trim() ? row.location : row.ai_extracted_location,
    url: row.url,
    registrationUrl: row.registration_url,
    registrationDeadline: row.registration_deadline,
    format: row.event_format,
    tags: tagsOf(row),
    orgName: orgNameOf(row),
    orgBadge: orgBadgeOf(row),
    city: row.city,
    mock: mockEventAttributes(row.id),
  };
}

export default function EventsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [segment, setSegment] = useState<'all' | 'following' | 'mine'>('all');
  // A tag chip tapped on the event detail page arrives here as router state (see filters.ts and
  // routes/event/page.tsx), so this list opens with that tag already narrowing the feed.
  const [filters, setFilters] = useState<EventFilterState>(() => {
    const navState = location.state as EventListNavState | null;
    if (!navState?.tagSlug) return defaultFilters();
    return { ...defaultFilters(), tags: { [navState.tagSlug]: true } };
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const { categories } = useTaxonomy();
  const tagNames = useMemo(
    () => new Map(categories.flatMap((c) => c.children).map((t) => [t.slug, t.name])),
    [categories],
  );

  const { followedSlugs } = useFollows();
  const { organizations } = useOrganizations();
  const organizationNames = useMemo(
    () => new Map(organizations.map((org) => [org.slug, org.name])),
    [organizations],
  );

  const { cities } = useCities();

  // Resolved once per distance-filter change via the nearby_events RPC (never by selecting
  // latitude/longitude directly — see filters.ts). null means either "no distance filter" or "not
  // resolved yet"; nearReady tells those two apart so fetchPage doesn't run against a stale/empty
  // id list while the RPC is in flight.
  const [nearbyEventIds, setNearbyEventIds] = useState<string[] | null>(null);
  const near = filters.near;
  const nearReady = !near || nearbyEventIds !== null;

  useEffect(() => {
    if (!near) {
      setNearbyEventIds(null);
      return;
    }
    // Destructured to plain numbers so the closure below doesn't recapture the nullable `near`.
    const { latitude, longitude, radiusMiles } = near;
    let cancelled = false;
    setNearbyEventIds(null);

    async function loadNearbyIds() {
      const result = await getSupabase().rpc('nearby_events', {
        origin_lat: latitude,
        origin_lon: longitude,
        radius_km: radiusMiles * MILES_TO_KM,
      });
      if (cancelled) return;
      // No generated Database types to type this RPC's response, so the shape is asserted here
      // rather than inferred — same as any other hand-authored Postgres function this app calls.
      const rows = (result.data as { id: string }[] | null) ?? [];
      // Fails closed: an empty result reads as "nothing nearby", which is the right message for
      // a distance filter that couldn't be resolved — not "show everything" instead.
      setNearbyEventIds(result.error ? [] : rows.map((row) => row.id));
    }

    void loadNearbyIds();
    return () => {
      cancelled = true;
    };
  }, [near]);

  const [rows, setRows] = useState<EventRow[]>([]);
  // Shared across routes, so the going count on a card and on that event's own page agree.
  const { rsvps, setRsvp, countsFor, ensureCounts } = useRsvps();
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
  const orgSlugs = selectedOrganizations(filters);
  const citySlugs = selectedCities(filters);
  // Serialized so the fetch identity tracks the chosen values rather than the array identity, which
  // is new on every render and would refetch in a loop.
  const formatKey = formats?.join(',') ?? '';
  const tagKey = tagSlugs?.join(',') ?? '';
  const orgKey = orgSlugs?.join(',') ?? '';
  const cityKey = citySlugs?.join(',') ?? '';

  const fetchPage = useCallback(
    async (from: number): Promise<EventRow[]> => {
      // Not ready yet (the nearby_events RPC for the distance filter hasn't resolved) — the
      // loading effects below skip calling fetchPage in this state, but return "match nothing"
      // rather than "match everything" if they ever do.
      if (near && nearbyEventIds === null) return [];

      const supabase = getSupabase();
      const range = dateWindowRange(filters.when);
      const activeFormats = formatKey === '' ? null : (formatKey.split(',') as EventFormat[]);
      const activeTags = tagKey === '' ? null : tagKey.split(',');
      const activeOrgs = orgKey === '' ? null : orgKey.split(',');
      const activeCities = cityKey === '' ? null : cityKey.split(',');

      let query = supabase.from('events').select(selectFor(activeTags, activeOrgs));
      if (range) {
        if (range.from) query = query.gte('start_time', range.from);
        query = query.lte('start_time', range.to);
      }
      if (activeFormats) {
        query = query.in('event_format', activeFormats);
      }
      if (activeTags) {
        query = query.in('event_tags.tags.slug', activeTags);
      }
      if (activeOrgs) {
        query = query.in('organizations.slug', activeOrgs);
      }
      if (activeCities) {
        query = query.in('city', activeCities);
      }
      if (near) {
        query = query.in('id', nearbyEventIds ?? []);
      }

      const { data, error: queryError } = await query
        .order('start_time', { ascending: dateWindowAscending(filters.when) })
        .range(from, from + BATCH_SIZE - 1)
        .overrideTypes<EventRow[], { merge: false }>();

      if (queryError) throw queryError;
      return data;
    },
    [filters.when, formatKey, tagKey, orgKey, cityKey, near, nearbyEventIds],
  );

  // Reloads from scratch whenever the date window changes.
  useEffect(() => {
    let cancelled = false;

    async function loadFirstPage() {
      // Stay in "loading" rather than briefly showing an empty/unfiltered feed while the distance
      // filter's origin is still being resolved.
      if (!nearReady) {
        setLoading(true);
        return;
      }

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
  }, [fetchPage, nearReady]);

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

  useEffect(() => {
    ensureCounts(rows.map((row) => row.id));
  }, [rows, ensureCounts]);

  const visible = useMemo(() => {
    return rows
      .filter((row) => !dismissed.has(row.id))
      .filter((row) => {
        if (segment === 'mine') return Boolean(rsvps[row.id]);
        if (segment === 'following') {
          const orgSlug = orgSlugOf(row);
          return orgSlug !== null && followedSlugs.has(orgSlug);
        }
        return true;
      })
      .flatMap((row) => {
        const event = toFeedEvent(row);
        return event ? [event] : [];
      });
  }, [rows, dismissed, segment, rsvps, followedSlugs]);

  const chips = [
    filters.feed === 'foryou' ? 'For you' : 'Everything',
    filters.place,
    DATE_WINDOW_LABELS[filters.when],
    // Only shown once they narrow something, so the bar doesn't claim a filter that isn't on.
    ...(formats ?? []).map((format) => EVENT_FORMAT_LABELS[format]),
    ...(tagSlugs ?? []).map((slug) => tagNames.get(slug) ?? slug.replace(/-/g, ' ')),
    ...(orgSlugs ?? []).map((slug) => organizationNames.get(slug) ?? slug.replace(/-/g, ' ')),
    ...(citySlugs ?? []),
    ...(near ? [`Within ${near.radiusMiles} mi of ${near.label}`] : []),
  ];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-col">
      <div className="flex items-center gap-2.5 pb-2">
        {(['all', 'following', 'mine'] as const).map((seg) => (
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
            {seg === 'all' ? 'All' : seg === 'following' ? 'Following' : 'Mine'}
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
            {segment === 'mine'
              ? 'Nothing saved yet'
              : segment === 'following'
                ? 'Nothing from your organizations yet'
                : 'Nothing matches'}
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
            {segment === 'mine'
              ? 'Mark an event Interested or Going and it lands here.'
              : segment === 'following'
                ? "Follow an organization from one of their events and it'll show up here."
                : 'Try a wider date range in filters.'}
          </p>
          <button
            type="button"
            onClick={() => {
              if (segment === 'mine' || segment === 'following') setSegment('all');
              else setSheetOpen(true);
            }}
            className="bg-primary text-primary-foreground mt-4 min-h-11 rounded-xl px-6 font-bold"
          >
            {segment === 'mine' || segment === 'following' ? 'Browse events' : 'Open filters'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((event) => (
          <EventListCard
            key={event.id}
            event={event}
            rsvp={rsvps[event.id] ?? null}
            counts={countsFor(event.id)}
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
          organizations={organizations}
          cities={cities}
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
