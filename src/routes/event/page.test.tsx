import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RsvpProvider } from '@/lib/rsvps';
import EventPage from '@/routes/event/page';
import { createEventRsvpsMock } from '@/test/rsvp-mock';

interface EventDetailRow {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  url: string | null;
  registration_url: string | null;
  registration_deadline: string | null;
  description_clean: string | null;
  description_html_clean: string | null;
  event_format: 'in_person' | 'online' | 'hybrid' | null;
  category: string | null;
  feed_id: string;
  data_feeds: { name: string } | null;
  event_tags: { tags: { slug: string; name: string } | null }[];
}

let eventRow: EventDetailRow | null = null;
let eventError: Error | null = null;
let photoRows: { photo_url: string; is_primary: boolean }[] = [];
let relatedRows: { id: string; title: string; start_time: string; location: string | null }[] = [];

function makeBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
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
    // The real event_photos chain (.order().order()) has no terminal call and is awaited
    // directly, so the fake builder has to be a thenable to stand in for it.
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable, see above
    then: (resolve: (result: { data: unknown; error: null }) => void) => {
      resolve({ data: photoRows, error: null });
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
    url: null,
    registration_url: null,
    registration_deadline: null,
    description_clean: null,
    description_html_clean: null,
    event_format: null,
    category: null,
    feed_id: 'feed-1',
    data_feeds: { name: 'BORP' },
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
});
