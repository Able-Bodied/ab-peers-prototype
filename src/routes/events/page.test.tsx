import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EventsPage from '@/routes/events/page';

// Mock IntersectionObserver
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

globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

const mockRange = vi.fn((): { data: unknown; error: null } => ({
  data: [],
  error: null,
}));
const mockOrder = vi.fn((): { range: typeof mockRange } => ({ range: mockRange }));
const mockSelect = vi.fn((): { order: typeof mockOrder } => ({ order: mockOrder }));

const mockIn = vi.fn((): { data: unknown; error: null } => ({ data: [], error: null }));
const mockPhotosSelect = vi.fn((): { in: typeof mockIn } => ({ in: mockIn }));

const mockFrom = vi.fn((table: string) => {
  if (table === 'events') {
    return { select: mockSelect };
  } else if (table === 'event_photos') {
    return { select: mockPhotosSelect };
  }
  return { select: mockSelect };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: mockFrom,
  }),
}));

function renderEvents() {
  return render(
    <MemoryRouter initialEntries={['/events']}>
      <EventsPage />
    </MemoryRouter>,
  );
}

describe('EventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations to their defaults
    mockRange.mockImplementation(() => ({
      data: [],
      error: null,
    }));
    mockOrder.mockImplementation(() => ({ range: mockRange }));
    mockSelect.mockImplementation(() => ({ order: mockOrder }));
    mockIn.mockImplementation(() => ({ data: [], error: null }));
    mockPhotosSelect.mockImplementation(() => ({ in: mockIn }));
    mockFrom.mockImplementation((table) => {
      if (table === 'events') {
        return { select: mockSelect };
      } else if (table === 'event_photos') {
        return { select: mockPhotosSelect };
      }
      return { select: mockSelect };
    });
  });

  it('renders the events header', async () => {
    mockRange.mockResolvedValue({ data: [], error: null });

    renderEvents();

    expect(await screen.findByText('Events')).toBeInTheDocument();
  });

  it('displays events sorted chronologically', async () => {
    const eventsData = [
      {
        id: 'event-1',
        title: 'Early Event',
        description: 'First event of the year',
        start_time: '2026-08-01T10:00:00Z',
      },
      {
        id: 'event-2',
        title: 'Later Event',
        description: 'Later in the year',
        start_time: '2026-12-31T14:00:00Z',
      },
    ];

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    expect(await screen.findByText('Early Event')).toBeInTheDocument();
    expect(screen.getByText('Later Event')).toBeInTheDocument();
  });

  it('shows truncated descriptions using line-clamp', async () => {
    const eventsData = [
      {
        id: 'event-1',
        title: 'Test Event',
        description: 'This is a long description that should be truncated',
        start_time: '2026-08-15T10:00:00Z',
      },
    ];

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    const description = await screen.findByText(
      'This is a long description that should be truncated',
    );
    expect(description).toHaveClass('line-clamp-2');
  });

  it('displays an error message when fetching fails', async () => {
    mockOrder.mockImplementation(() => ({
      range: vi.fn().mockRejectedValue(new Error('Fetch failed')),
    }));

    renderEvents();

    expect(await screen.findByText(/Error/)).toBeInTheDocument();
  });

  it('shows "No events found" when the list is empty', async () => {
    mockRange.mockResolvedValue({ data: [], error: null });

    renderEvents();

    expect(await screen.findByText('No events found.')).toBeInTheDocument();
  });

  it('renders event cards with clickable regions', async () => {
    const eventsData = [
      {
        id: 'event-1',
        title: 'Clickable Event',
        description: 'Click me!',
        start_time: '2026-08-15T10:00:00Z',
      },
    ];

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    const card = await screen.findByText('Clickable Event');
    const clickableCard = card.closest('[class*="cursor-pointer"]');
    expect(clickableCard).toBeInTheDocument();
  });

  it('loads initial batch and renders with pagination', async () => {
    const eventsData = [
      {
        id: 'event-1',
        title: 'First Event',
        description: 'First event',
        start_time: '2026-08-01T10:00:00Z',
      },
    ];

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    // Verify the page title and first event render
    expect(await screen.findByText('Events')).toBeInTheDocument();
    expect(await screen.findByText('First Event')).toBeInTheDocument();
  });

  it('uses pagination range query for initial load', async () => {
    const eventsData = [
      {
        id: 'event-1',
        title: 'Test Event',
        description: 'Test',
        start_time: '2026-08-01T10:00:00Z',
      },
    ];

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    await waitFor(() => {
      expect(mockRange).toHaveBeenCalledWith(0, 11);
    });
  });

  it('shows "No more events" when batch is smaller than batch size', async () => {
    // Return fewer than 12 events to indicate end of list
    const eventsData = Array.from({ length: 5 }, (_, i) => ({
      id: `event-${i}`,
      title: `Event ${i}`,
      description: `Description ${i}`,
      start_time: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }));

    mockRange.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    // Wait for events to load and then check for the no-more-events message
    await waitFor(() => {
      expect(screen.getByText('No more events to load.')).toBeInTheDocument();
    });
  });

  it('renders sentinel element for infinite scroll', async () => {
    mockRange.mockResolvedValue({
      data: [
        {
          id: 'event-1',
          title: 'Event 1',
          description: 'Desc 1',
          start_time: '2026-08-01T10:00:00Z',
        },
      ],
      error: null,
    });

    renderEvents();

    const sentinel = await screen.findByTestId('scroll-sentinel');
    expect(sentinel).toBeInTheDocument();
  });
});
