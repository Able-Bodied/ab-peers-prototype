import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RsvpProvider } from '@/lib/rsvps';
import EventPage from '@/routes/event/page';
import { createEventRsvpsMock } from '@/test/rsvp-mock';

interface OrganizationEmbed {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

interface EventDetailRow {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  ai_extracted_start_time: string | null;
  ai_extracted_end_time: string | null;
  ai_extracted_location: string | null;
  url: string | null;
  registration_url: string | null;
  registration_deadline: string | null;
  description_clean: string | null;
  description_html_clean: string | null;
  event_format: 'in_person' | 'online' | 'hybrid' | null;
  category: string | null;
  feed_id: string;
  data_feeds: { name: string; organizations: OrganizationEmbed | null } | null;
  event_tags: { tags: { slug: string; name: string } | null }[];
}

let eventRow: EventDetailRow | null = null;
let eventError: Error | null = null;
let photoRows: { photo_url: string; is_primary: boolean }[] = [];
let relatedRows: { id: string; title: string; start_time: string; location: string | null }[] = [];
/** Count returned for the org's events-this-year query, keyed off the same `events` table. */
let orgEventCount: number | null = 0;

function makeBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    overrideTypes: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: relatedRows, error: null })),
    // `.single()` is followed by `.overrideTypes()` on the detail query, so its result has to be
    // awaitable and chainable both.
    single: vi.fn(() => {
      const run = () =>
        Promise.resolve(
          table === 'events' ? { data: eventRow, error: eventError } : { data: null, error: null },
        );
      return {
        overrideTypes: () => run(),
        then: (ok?: (v: unknown) => unknown, err?: (e: unknown) => unknown) => run().then(ok, err),
      };
    }),
    // Two real chains have no terminal call and are awaited directly, so the fake builder has to be
    // a thenable to stand in for either: the event_photos chain (.order().order()) and the org
    // events-this-year count chain (.select(..., {head:true}).eq().gte().lt()), both on `events`.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable, see above
    then: (resolve: (result: { data: unknown; count?: number | null; error: null }) => void) => {
      if (table === 'events') {
        resolve({ data: null, count: orgEventCount, error: null });
      } else {
        resolve({ data: photoRows, error: null });
      }
    },
  };
  return builder;
}

const eventRsvps = createEventRsvpsMock();

const mockFrom = vi.fn((table: string) => eventRsvps.forTable(table) ?? makeBuilder(table));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

function baseEvent(overrides: Partial<EventDetailRow> = {}): EventDetailRow {
  return {
    id: 'e1',
    title: 'Adaptive handcycle ride',
    description: 'Rolling 12 miles along the Bay Trail.',
    description_html: null,
    start_time: '2026-08-22T16:00:00Z',
    end_time: '2026-08-22T19:00:00Z',
    location: 'Berkeley Aquatic Park',
    ai_extracted_start_time: null,
    ai_extracted_end_time: null,
    ai_extracted_location: null,
    url: null,
    registration_url: null,
    registration_deadline: null,
    description_clean: null,
    description_html_clean: null,
    event_format: null,
    category: null,
    feed_id: 'feed-1',
    data_feeds: { name: 'BORP', organizations: null },
    event_tags: [],
    ...overrides,
  };
}

function renderEvent(id = 'e1') {
  return render(
    <MemoryRouter initialEntries={[`/event/${id}`]}>
      <RsvpProvider>
        <Routes>
          <Route path="/event/:id" element={<EventPage />} />
        </Routes>
      </RsvpProvider>
    </MemoryRouter>,
  );
}

describe('EventPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventRow = baseEvent();
    eventError = null;
    photoRows = [];
    relatedRows = [];
    orgEventCount = 0;
    eventRsvps.reset();
  });

  it('shows the title, organization and location for the loaded event', async () => {
    renderEvent();

    expect(await screen.findByText('Adaptive handcycle ride')).toBeInTheDocument();
    expect(screen.getByText(/BORP/)).toBeInTheDocument();
    expect(screen.getByText(/Berkeley Aquatic Park/)).toBeInTheDocument();
  });

  it('renders the primary photo when one exists', async () => {
    photoRows = [{ photo_url: '/photos/events/e1/primary.jpg', is_primary: true }];

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', '/photos/events/e1/primary.jpg');
  });

  it('renders no photo when the event has none', async () => {
    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it("shows the organization's logo as a badge in the hosting card", async () => {
    eventRow = baseEvent({
      data_feeds: {
        name: 'NorCal SCI',
        organizations: {
          id: 'org-1',
          slug: 'norcal-sci',
          name: 'NorCal SCI',
          logo_url: 'https://example.com/norcal-sci-logo.png',
        },
      },
    });

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    const badge = await screen.findByRole('img', { name: 'NorCal SCI' });
    expect(badge).toHaveAttribute('src', 'https://example.com/norcal-sci-logo.png');
  });

  it('falls back to an initial in the hosting card when the organization has no logo', async () => {
    eventRow = baseEvent({
      data_feeds: {
        name: 'BORP',
        organizations: { id: 'org-2', slug: 'borp', name: 'BORP', logo_url: null },
      },
    });

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTitle('BORP')).toHaveTextContent('B');
  });

  it("shows the organization's real events-this-year count once known", async () => {
    eventRow = baseEvent({
      data_feeds: {
        name: 'BORP',
        organizations: { id: 'org-2', slug: 'borp', name: 'BORP', logo_url: null },
      },
    });
    orgEventCount = 7;

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(await screen.findByText('Hosting · 7 events this year')).toBeInTheDocument();
  });

  it('shows just "Hosting" with no count when the org is not linked yet', async () => {
    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(await screen.findByText('Hosting')).toBeInTheDocument();
    expect(screen.queryByText(/events this year/)).not.toBeInTheDocument();
  });

  it('no longer shows a verified checkmark, access notes, or an access warning', async () => {
    eventRow = baseEvent({
      data_feeds: {
        name: 'BORP',
        organizations: { id: 'org-2', slug: 'borp', name: 'BORP', logo_url: null },
      },
    });

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Accessible parking|Step-free entrance|Elevator access|Ground-level venue/,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/gravel|Street parking only|Second floor has stairs/),
    ).not.toBeInTheDocument();
  });

  it('shows the real location, or "Online" for an online event with no location', async () => {
    eventRow = baseEvent({ location: null, event_format: 'online' });

    renderEvent();

    expect(await screen.findByText('Adaptive handcycle ride')).toBeInTheDocument();
    // Appears twice: once as the location meta line, once as the format chip.
    expect(screen.getAllByText('Online')).toHaveLength(2);
  });

  it('uses the AI-extracted time and location when the scraper found neither', async () => {
    eventRow = baseEvent({
      start_time: null,
      end_time: null,
      location: null,
      ai_extracted_start_time: '2026-08-22T16:00:00Z',
      ai_extracted_location: "Gino's Pizza, 1761 Monterey St.",
    });

    renderEvent();

    expect(await screen.findByText('Adaptive handcycle ride')).toBeInTheDocument();
    expect(screen.getByText(/Gino's Pizza/)).toBeInTheDocument();
    expect(screen.queryByText('Date to be announced')).not.toBeInTheDocument();
  });

  it('shows "Date to be announced" rather than crashing when no time is known at all', async () => {
    eventRow = baseEvent({ start_time: null, end_time: null });

    renderEvent();

    expect(await screen.findByText('Adaptive handcycle ride')).toBeInTheDocument();
    expect(screen.getByText('Date to be announced')).toBeInTheDocument();
  });

  it('starts a fresh event at zero and increments on RSVP', async () => {
    renderEvent();
    await screen.findByText('Adaptive handcycle ride');

    const goingButton = screen.getByRole('button', { name: /^Going/ });
    expect(screen.getByText('0 going', { exact: false })).toBeInTheDocument();

    await userEvent.click(goingButton);

    expect(goingButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 going', { exact: false })).toBeInTheDocument();
  });

  it('reflects RSVPs already saved by this viewer', async () => {
    eventRsvps.reset([{ event_id: 'e1', viewer_id: 'someone-else', status: 'going' }]);

    renderEvent();
    await screen.findByText('Adaptive handcycle ride');

    expect(await screen.findByText('1 going', { exact: false })).toBeInTheDocument();
    // A different viewer's RSVP counts toward the tally but isn't this viewer's own state.
    expect(screen.getByRole('button', { name: /^Going/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lists related events from the same organization', async () => {
    relatedRows = [
      {
        id: 'e2',
        title: 'Wheelchair rugby open gym',
        start_time: '2026-09-03T18:00:00Z',
        location: 'Berkeley',
      },
    ];

    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(await screen.findByText('Wheelchair rugby open gym')).toBeInTheDocument();
  });

  it('does not render a "more from" section when there are no related events', async () => {
    renderEvent();

    await screen.findByText('Adaptive handcycle ride');
    expect(screen.queryByText(/More from/)).not.toBeInTheDocument();
  });

  it('shows an error when the event fails to load', async () => {
    eventRow = null;
    eventError = new Error('Fetch failed');

    renderEvent();

    expect(await screen.findByText(/Fetch failed/)).toBeInTheDocument();
  });

  it('navigates back to the events list from the back button', async () => {
    render(
      <MemoryRouter initialEntries={['/event/e1']}>
        <RsvpProvider>
          <Routes>
            <Route path="/event/:id" element={<EventPage />} />
            <Route path="/events" element={<p>Events list</p>} />
          </Routes>
        </RsvpProvider>
      </MemoryRouter>,
    );

    await screen.findByText('Adaptive handcycle ride');
    await userEvent.click(screen.getByRole('button', { name: '← Events' }));

    expect(await screen.findByText('Events list')).toBeInTheDocument();
  });

  it('navigates to the events list with that tag preselected when a tag chip is tapped', async () => {
    eventRow = baseEvent({ event_tags: [{ tags: { slug: 'kayaking', name: 'Kayaking' } }] });

    function EventsListStub() {
      const location = useLocation();
      const state = location.state as { tagSlug?: string } | null;
      return <p>Events list — tag: {state?.tagSlug ?? 'none'}</p>;
    }

    render(
      <MemoryRouter initialEntries={['/event/e1']}>
        <RsvpProvider>
          <Routes>
            <Route path="/event/:id" element={<EventPage />} />
            <Route path="/events" element={<EventsListStub />} />
          </Routes>
        </RsvpProvider>
      </MemoryRouter>,
    );

    await screen.findByText('Adaptive handcycle ride');
    await userEvent.click(screen.getByRole('button', { name: 'Kayaking' }));

    expect(await screen.findByText('Events list — tag: kayaking')).toBeInTheDocument();
  });
});
