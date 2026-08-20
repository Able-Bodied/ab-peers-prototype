import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FollowsProvider } from '@/lib/follows';
import { RsvpProvider } from '@/lib/rsvps';
import EventsPage from '@/routes/events/page';
import { createEventRsvpsMock } from '@/test/rsvp-mock';

class MockIntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];
  readonly scrollMargin: string = '';

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

globalThis.IntersectionObserver = MockIntersectionObserver;

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
  ai_extracted_start_time: string | null;
  ai_extracted_end_time: string | null;
  ai_extracted_location: string | null;
  city: string | null;
  url: string | null;
  registration_url: string | null;
  data_feeds: { name: string; organizations: OrganizationEmbed | null } | null;
}

/** Rows the fake PostgREST builder will return, settable per test. */
let rows: EventRow[] = [];
/** Records the filters the page applied, so tests can assert on the real date filter. */
let appliedFilters: { method: string; column: string; value: string }[] = [];
/** The city vocabulary `useCities()` reads back from `events.city` — settable per test. */
let cityRows: { city: string }[] = [];

const mockRange = vi.fn(() => Promise.resolve({ data: rows, error: null }));

/** The taxonomy the filter sheet reads from the `tags` table. */
const tagRows = [
  { id: 'c1', slug: 'sports-recreation', name: 'Sports & recreation', parent_id: null },
  { id: 'c2', slug: 'support-groups', name: 'Support & groups', parent_id: null },
  { id: 't1', slug: 'kayaking', name: 'Kayaking', parent_id: 'c1' },
  { id: 't2', slug: 'handcycling', name: 'Handcycling', parent_id: 'c1' },
  { id: 't3', slug: 'peer-support-group', name: 'Peer support group', parent_id: 'c2' },
];

/** The vocabulary the filter sheet reads from the `organizations` table. */
const orgRows = [
  { slug: 'norcal-sci', name: 'NorCal SCI', logo_url: 'https://example.com/norcal-sci-logo.png' },
  { slug: 'borp', name: 'BORP', logo_url: null },
];

/**
 * The result of a finished query. Callers either await it directly or call `.overrideTypes()`
 * first, so it has to behave as both — which is what supabase-js's builder does.
 */
function settled<T>(run: () => Promise<T>) {
  return {
    overrideTypes: () => run(),
    then: (onOk?: (v: T) => unknown, onErr?: (e: unknown) => unknown) => run().then(onOk, onErr),
    catch: (onErr?: (e: unknown) => unknown) => run().catch(onErr),
  };
}

/**
 * Minimal stand-in for the supabase query builder: every filter method records its call and
 * returns the same chainable object. This mirrors PostgREST's real shape, where filters, `order`
 * and `range` can be chained in any order.
 */
function makeBuilder(table: string) {
  const record = (method: string) => (column: string, value: string | string[]) => {
    appliedFilters.push({ method, column, value: Array.isArray(value) ? value.join(',') : value });
    return builder;
  };

  const builder = {
    // The tags query ends at `select`, so that call has to be awaitable on its own.
    select: vi.fn(() =>
      table === 'tags' ? settled(() => Promise.resolve({ data: tagRows, error: null })) : builder,
    ),
    // The organizations query ends at `order`, one step later than tags.
    order: vi.fn(() =>
      table === 'organizations'
        ? settled(() => Promise.resolve({ data: orgRows, error: null }))
        : builder,
    ),
    range: vi.fn((...args: Parameters<typeof mockRange>) => settled(() => mockRange(...args))),
    // useCities() ends its `events` query here: select('city').not(...).overrideTypes(...).
    not: vi.fn(() => settled(() => Promise.resolve({ data: cityRows, error: null }))),
    gte: vi.fn(record('gte')),
    lte: vi.fn(record('lte')),
    in: vi.fn(record('in')),
    eq: vi.fn(record('eq')),
  };
  return builder;
}

const eventRsvps = createEventRsvpsMock();

const mockFrom = vi.fn((table: string) => eventRsvps.forTable(table) ?? makeBuilder(table));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

function eventRow(overrides: Partial<EventRow> & { id: string; title: string }): EventRow {
  return {
    description: null,
    start_time: '2026-08-20T17:00:00Z',
    end_time: null,
    location: null,
    ai_extracted_start_time: null,
    ai_extracted_end_time: null,
    ai_extracted_location: null,
    city: null,
    url: null,
    registration_url: null,
    data_feeds: null,
    ...overrides,
  };
}

function renderEvents() {
  return render(
    <MemoryRouter initialEntries={['/events']}>
      <RsvpProvider>
        <FollowsProvider>
          <EventsPage />
        </FollowsProvider>
      </RsvpProvider>
    </MemoryRouter>,
  );
}

/** Mirrors arriving from a tag chip tapped on the event detail page (see routes/event/page.tsx). */
function renderEventsWithTag(tagSlug: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/events', state: { tagSlug } }]}>
      <RsvpProvider>
        <FollowsProvider>
          <EventsPage />
        </FollowsProvider>
      </RsvpProvider>
    </MemoryRouter>,
  );
}

describe('EventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    appliedFilters = [];
    cityRows = [];
    mockRange.mockImplementation(() => Promise.resolve({ data: rows, error: null }));
    mockFrom.mockImplementation(
      (table: string) => eventRsvps.forTable(table) ?? makeBuilder(table),
    );
    eventRsvps.reset();
    globalThis.localStorage.clear();
  });

  it('lists events returned by the feed', async () => {
    rows = [
      eventRow({ id: 'e1', title: 'Adaptive handcycle ride' }),
      eventRow({ id: 'e2', title: 'Wheelchair rugby open gym' }),
    ];

    renderEvents();

    expect(await screen.findByText('Adaptive handcycle ride')).toBeInTheDocument();
    expect(screen.getByText('Wheelchair rugby open gym')).toBeInTheDocument();
  });

  it('shows the publishing organization and the event time on the card', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        start_time: '2026-08-22T16:00:00Z',
        data_feeds: { name: 'BORP', organizations: null },
      }),
    ];

    renderEvents();

    await screen.findByText('Adaptive handcycle ride');
    expect(screen.getByText(/BORP/)).toBeInTheDocument();
  });

  it('prefers the real venue over the placeholder activity tag when the feed gave one', async () => {
    rows = [eventRow({ id: 'e1', title: 'SCI peer support group', location: 'Valley Medical' })];

    renderEvents();

    await screen.findByText('SCI peer support group');
    expect(screen.getByText(/Valley Medical/)).toBeInTheDocument();
  });

  it('shows the real geocoded city on the card, not an invented one', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        data_feeds: { name: 'BORP', organizations: null },
        city: 'Sausalito',
      }),
    ];

    renderEvents();

    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    expect(card).toHaveTextContent('BORP · Sausalito');
  });

  it('shows just the organization when the event has no geocoded city yet', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        data_feeds: { name: 'BORP', organizations: null },
        city: null,
      }),
    ];

    renderEvents();

    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    // No dangling separator, and no invented city standing in for the missing real one.
    expect(card).not.toHaveTextContent('BORP ·');
    expect(card).toHaveTextContent('BORP');
  });

  it('does not leave a dangling separator when the feed sends a blank location', async () => {
    rows = [eventRow({ id: 'e1', title: 'Caregiver MeetUp', location: '   ' })];

    renderEvents();

    const title = await screen.findByText('Caregiver MeetUp');
    const card = title.closest('article');
    expect(card?.textContent).not.toMatch(/·\s*$/m);
  });

  it('shows the organization logo as a badge in place of an event photo', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        data_feeds: {
          name: 'NorCal SCI',
          organizations: {
            slug: 'norcal-sci',
            name: 'NorCal SCI',
            logo_url: 'https://example.com/norcal-sci-logo.png',
          },
        },
      }),
    ];

    renderEvents();

    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    const badge = card?.querySelector('img');
    expect(badge).toHaveAttribute('src', 'https://example.com/norcal-sci-logo.png');
    expect(badge).toHaveAttribute('alt', 'NorCal SCI');
  });

  it('falls back to an initial when the organization has no logo', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        data_feeds: {
          name: 'BORP',
          organizations: { slug: 'borp', name: 'BORP', logo_url: null },
        },
      }),
    ];

    renderEvents();

    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    expect(card?.querySelector('img')).not.toBeInTheDocument();
    expect(card?.querySelector('[title="BORP"]')).toHaveTextContent('B');
  });

  it('renders no badge when the event has no known organization', async () => {
    rows = [eventRow({ id: 'e1', title: 'Adaptive handcycle ride' })];

    renderEvents();

    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    expect(card?.querySelector('img')).not.toBeInTheDocument();
  });

  it('narrows the feed to one organization from the filter sheet', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    appliedFilters = [];
    await userEvent.click(await screen.findByRole('button', { name: 'NorCal SCI' }));
    await userEvent.click(screen.getByRole('button', { name: /Show \d+ events/ }));

    expect(appliedFilters).toContainEqual({
      method: 'in',
      column: 'data_feeds.organizations.slug',
      value: 'norcal-sci',
    });
  });

  it('preselects a tag carried as router state from the event detail page', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEventsWithTag('kayaking');

    await screen.findByText('Event');
    expect(appliedFilters).toContainEqual({
      method: 'in',
      column: 'event_tags.tags.slug',
      value: 'kayaking',
    });
    expect(screen.getByRole('button', { name: 'Kayaking' })).toBeInTheDocument();
  });

  it('deselects "All" when a specific activity tag is picked, and vice versa', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const allChip = await screen.findByRole('button', { name: 'All' });
    const kayakingChip = await screen.findByRole('button', { name: 'Kayaking' });

    // No tags picked yet — "All" reads as active and every tag chip is blank.
    expect(allChip).toHaveAttribute('aria-pressed', 'true');
    expect(kayakingChip).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(kayakingChip);
    expect(allChip).toHaveAttribute('aria-pressed', 'false');
    expect(kayakingChip).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(allChip);
    expect(allChip).toHaveAttribute('aria-pressed', 'true');
    expect(kayakingChip).toHaveAttribute('aria-pressed', 'false');

    appliedFilters = [];
    await userEvent.click(screen.getByRole('button', { name: /Show \d+ events/ }));
    expect(appliedFilters).not.toContainEqual(
      expect.objectContaining({ column: 'event_tags.tags.slug' }),
    );
  });

  it('narrows the feed to one city from the filter sheet', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];
    cityRows = [{ city: 'Berkeley' }, { city: 'Oakland' }];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    appliedFilters = [];
    await userEvent.click(await screen.findByRole('button', { name: 'Berkeley' }));
    await userEvent.click(screen.getByRole('button', { name: /Show \d+ events/ }));

    expect(appliedFilters).toContainEqual({ method: 'in', column: 'city', value: 'Berkeley' });
  });

  it('shows an event using the time the AI verification pass found when the scraper had none', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'San Luis Obispo Support Group',
        start_time: null,
        ai_extracted_start_time: '2026-08-20T23:00:00Z',
      }),
    ];

    renderEvents();

    const title = await screen.findByText('San Luis Obispo Support Group');
    const card = title.closest('article');
    // 23:00 UTC on the fixed test date — asserting the card rendered a real time rather than
    // crashing or showing "Invalid Date" is the point; the exact wall-clock is timezone-dependent.
    expect(card?.textContent).not.toMatch(/Invalid Date/);
  });

  it('drops an event with neither a scraped nor an AI-extracted start time', async () => {
    rows = [
      eventRow({ id: 'e1', title: 'Undated event', start_time: null }),
      eventRow({ id: 'e2', title: 'Dated event' }),
    ];

    renderEvents();

    await screen.findByText('Dated event');
    expect(screen.queryByText('Undated event')).not.toBeInTheDocument();
  });

  it('falls back to the AI-extracted location when the scraper found no venue', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'San Luis Obispo Support Group',
        location: '',
        ai_extracted_location: "Gino's Pizza, 1761 Monterey St.",
      }),
    ];

    renderEvents();

    await screen.findByText('San Luis Obispo Support Group');
    expect(screen.getByText(/Gino's Pizza/)).toBeInTheDocument();
  });

  it('applies the default month window as a range on start_time', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();

    await screen.findByText('Event');
    expect(appliedFilters.map((f) => `${f.method}:${f.column}`)).toEqual([
      'gte:start_time',
      'lte:start_time',
    ]);
  });

  it('drops the date bounds entirely when the window is set to Anything', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    appliedFilters = [];
    await userEvent.click(screen.getByRole('button', { name: 'Anything' }));

    await waitFor(() => {
      expect(appliedFilters).toEqual([]);
    });
  });

  it('refetches with a narrower range when the window changes to This week', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    appliedFilters = [];
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));

    await waitFor(() => {
      expect(appliedFilters).toHaveLength(2);
    });

    const upperBound = appliedFilters.find((f) => f.method === 'lte');
    const sevenDaysOut = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(new Date(upperBound?.value ?? '').getTime()).toBeLessThanOrEqual(sevenDaysOut);
  });

  it('reflects the selected window in the filter chip bar', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');
    expect(screen.getByRole('button', { name: 'This month' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
    await userEvent.click(screen.getByRole('button', { name: 'Anything' }));
    await userEvent.click(screen.getByRole('button', { name: /Show \d+ events/ }));

    expect(screen.getByRole('button', { name: 'Anything' })).toBeInTheDocument();
  });

  it('moves an event into Mine once it is marked Going', async () => {
    rows = [eventRow({ id: 'e1', title: 'Adaptive handcycle ride' })];

    renderEvents();
    await screen.findByText('Adaptive handcycle ride');

    await userEvent.click(screen.getByRole('tab', { name: 'Mine' }));
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'All' }));
    await userEvent.click(screen.getByRole('button', { name: /^Going/ }));
    // Going hands off to the host, so it opens a dialog over the feed.
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Mine' }));

    expect(screen.getByText('Adaptive handcycle ride')).toBeInTheDocument();
  });

  it('shows only events from organizations the viewer follows in Following', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'NorCal ride',
        data_feeds: {
          name: 'NorCal SCI',
          organizations: { slug: 'norcal-sci', name: 'NorCal SCI', logo_url: null },
        },
      }),
      eventRow({
        id: 'e2',
        title: 'BORP swim',
        data_feeds: { name: 'BORP', organizations: { slug: 'borp', name: 'BORP', logo_url: null } },
      }),
    ];
    globalThis.localStorage.setItem('ab-peers:followed-orgs', JSON.stringify(['norcal-sci']));

    renderEvents();
    await screen.findByText('NorCal ride');

    await userEvent.click(screen.getByRole('tab', { name: 'Following' }));

    expect(screen.getByText('NorCal ride')).toBeInTheDocument();
    expect(screen.queryByText('BORP swim')).not.toBeInTheDocument();
  });

  it('shows the Following empty state when the viewer follows no organizations', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();
    await screen.findByText('Event');

    await userEvent.click(screen.getByRole('tab', { name: 'Following' }));

    expect(screen.getByText('Nothing from your organizations yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Browse events' }));
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('hands off to the host when an event is marked Going', async () => {
    rows = [
      eventRow({
        id: 'e1',
        title: 'Adaptive handcycle ride',
        url: 'https://norcalsci.org/events/ride',
        registration_url: 'https://us02web.zoom.us/meeting/register/abc',
      }),
    ];

    renderEvents();
    await screen.findByText('Adaptive handcycle ride');
    await userEvent.click(screen.getByRole('button', { name: /^Going/ }));

    const dialog = await screen.findByRole('dialog');

    // The point of the dialog: saying Going here does not reserve a place with the host.
    expect(within(dialog).getByText(/finish signing up with them/i)).toBeInTheDocument();

    const register = within(dialog).getByRole('link', { name: /Register with the host/i });
    expect(register).toHaveAttribute('href', 'https://us02web.zoom.us/meeting/register/abc');
    expect(register).toHaveAttribute('target', '_blank');
    expect(register).toHaveAttribute('rel', expect.stringContaining('noopener'));

    // Named so someone can tell where a tap goes before they take it.
    expect(within(dialog).getByText(/zoom\.us/)).toBeInTheDocument();

    const details = within(dialog).getByRole('link', { name: /See the full details/i });
    expect(details).toHaveAttribute('href', 'https://norcalsci.org/events/ride');
  });

  it('offers a calendar download named after the event', async () => {
    rows = [eventRow({ id: 'e1', title: 'Adaptive handcycle ride' })];

    renderEvents();
    await screen.findByText('Adaptive handcycle ride');
    await userEvent.click(screen.getByRole('button', { name: /^Going/ }));

    const dialog = await screen.findByRole('dialog');
    const calendar = within(dialog).getByRole('link', { name: /Add to your calendar/i });

    expect(calendar).toHaveAttribute('download', 'adaptive-handcycle-ride.ics');
  });

  it('does not repeat one link as both registration and details', async () => {
    const url = 'https://norcalsci.org/events/ride';
    rows = [eventRow({ id: 'e1', title: 'Ride', url, registration_url: url })];

    renderEvents();
    await screen.findByText('Ride');
    await userEvent.click(screen.getByRole('button', { name: /^Going/ }));

    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByRole('link', { name: /Register with the host/i }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /See the full details/i })).toBeNull();
  });

  it('still offers the calendar when a listing carries no links', async () => {
    rows = [eventRow({ id: 'e1', title: 'Ride' })];

    renderEvents();
    await screen.findByText('Ride');
    await userEvent.click(screen.getByRole('button', { name: /^Going/ }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).queryByRole('link', { name: /Register with the host/i })).toBeNull();
    expect(within(dialog).queryByRole('link', { name: /See the full details/i })).toBeNull();
    expect(within(dialog).getByRole('link', { name: /Add to your calendar/i })).toBeInTheDocument();
    // Without a registration link there is nothing to finish, so the copy shouldn't imply there is.
    expect(within(dialog).getByText(/host runs their own sign-ups/i)).toBeInTheDocument();
  });

  it('leaves Interested as a quiet save with no hand-off dialog', async () => {
    rows = [eventRow({ id: 'e1', title: 'Adaptive handcycle ride' })];

    renderEvents();
    await screen.findByText('Adaptive handcycle ride');
    await userEvent.click(screen.getByRole('button', { name: /^Interested/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('removes a dismissed event from the list', async () => {
    rows = [
      eventRow({ id: 'e1', title: 'Adaptive handcycle ride' }),
      eventRow({ id: 'e2', title: 'Wheelchair rugby open gym' }),
    ];

    renderEvents();
    await screen.findByText('Adaptive handcycle ride');

    await userEvent.click(
      screen.getByRole('button', { name: 'Not interested in Adaptive handcycle ride' }),
    );

    expect(screen.queryByText('Adaptive handcycle ride')).not.toBeInTheDocument();
    expect(screen.getByText('Wheelchair rugby open gym')).toBeInTheDocument();
  });

  it('increments the going count when the viewer RSVPs', async () => {
    rows = [eventRow({ id: 'e1', title: 'Adaptive handcycle ride' })];

    renderEvents();
    const title = await screen.findByText('Adaptive handcycle ride');
    const card = title.closest('article');
    if (!card) throw new Error('card not found');

    const before = Number(/(\d+) going/.exec(card.textContent)?.[1]);
    await userEvent.click(within(card).getByRole('button', { name: /^Going/ }));

    const after = Number(/(\d+) going/.exec(card.textContent)?.[1]);
    expect(after).toBe(before + 1);
  });

  it('shows an error when the initial fetch fails', async () => {
    mockRange.mockImplementation(() => Promise.reject(new Error('Fetch failed')));

    renderEvents();

    expect(await screen.findByText(/Fetch failed/)).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    rows = [];

    renderEvents();

    expect(await screen.findByText('Nothing matches')).toBeInTheDocument();
  });

  it('stops paging once a batch comes back smaller than the batch size', async () => {
    rows = Array.from({ length: 5 }, (_, i) => eventRow({ id: `e${i}`, title: `Event ${i}` }));

    renderEvents();

    await waitFor(() => {
      expect(screen.getByText('No more events to load.')).toBeInTheDocument();
    });
  });

  it('renders a sentinel for infinite scroll', async () => {
    rows = [eventRow({ id: 'e1', title: 'Event' })];

    renderEvents();

    expect(await screen.findByTestId('scroll-sentinel')).toBeInTheDocument();
  });
});
