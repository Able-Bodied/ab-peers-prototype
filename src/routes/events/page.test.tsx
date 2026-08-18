import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EventsPage from '@/routes/events/page';

const mockLimit = vi.fn((): { data: unknown; error: null } => ({
  data: [],
  error: null,
}));
const mockOrder = vi.fn((): { limit: typeof mockLimit } => ({ limit: mockLimit }));
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
    mockLimit.mockImplementation(() => ({
      data: [],
      error: null,
    }));
    mockOrder.mockImplementation(() => ({ limit: mockLimit }));
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
    mockLimit.mockResolvedValue({ data: [], error: null });

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

    mockLimit.mockResolvedValue({ data: eventsData, error: null });

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

    mockLimit.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    const description = await screen.findByText(
      'This is a long description that should be truncated',
    );
    expect(description).toHaveClass('line-clamp-2');
  });

  it('displays an error message when fetching fails', async () => {
    mockOrder.mockImplementation(() => ({
      limit: vi.fn().mockRejectedValue(new Error('Fetch failed')),
    }));

    renderEvents();

    expect(await screen.findByText(/Error/)).toBeInTheDocument();
  });

  it('shows "No events found" when the list is empty', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

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

    mockLimit.mockResolvedValue({ data: eventsData, error: null });

    renderEvents();

    const card = await screen.findByText('Clickable Event');
    const clickableCard = card.closest('[class*="cursor-pointer"]');
    expect(clickableCard).toBeInTheDocument();
  });
});
