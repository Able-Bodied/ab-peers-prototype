import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A capturing stand-in for the sentinel-driven infinite scroll (see page.tsx). jsdom has no
 * layout, so nothing ever really "intersects" — this records the callback each observer was made
 * with so a test can fire it itself, the way a real scroll into view would.
 */
class MockIntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: readonly number[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

let observers: MockIntersectionObserver[] = [];
globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

/** Fires the most recently created sentinel observer as if it had scrolled into view. */
function triggerLoadMore() {
  const observer = observers.at(-1);
  observer?.callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    observer as unknown as IntersectionObserver,
  );
}

import type { BrowseMemberRow } from '@/lib/browse-members';
import { WavesProvider } from '@/lib/waves';
import DiscoverPage from '@/routes/discover/page';
import {
  browseMemberRow,
  createBrowseMembersMock,
  permissionDeniedError,
} from '@/test/browse-members-mock';
import { createWavesMock } from '@/test/waves-mock';

/**
 * Discover, wired end to end against stand-ins for the three tables it reads: the
 * `browse_members` view, `organizations`, and `waves`. Nothing here touches the network.
 *
 * The load-bearing assertions are the product decisions that are easy to reverse by accident —
 * that a topic chip filters rather than sends (PRD §8.1), that a swipe does exactly what the
 * pills do and no more (§7.2), and that a signed-out viewer gets a door rather than an empty
 * deck (§5.1).
 */

const browseMembers = createBrowseMembersMock();
const waves = createWavesMock();

const orgRows = [
  { slug: 'craig-hospital', name: 'Craig Hospital', logo_url: null },
  { slug: 'norcal-sci', name: 'NorCal SCI', logo_url: null },
];

function organizationsBuilder() {
  const b = {
    select: vi.fn(() => b),
    order: vi.fn(() => b),
    overrideTypes: () => Promise.resolve({ data: orgRows, error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (table: string) => {
      if (table === 'organizations') return organizationsBuilder();
      return browseMembers.forTable(table) ?? waves.forTable(table);
    },
  }),
}));

/** Swapped per test — the viewer's account row, as `useSession` hands it to the page. */
const session: { member: { id: string; duration: string } | null; loading: boolean } = {
  member: { id: 'viewer', duration: '3 - 10 years' },
  loading: false,
};

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    member: session.member,
    loading: session.loading,
    refresh: vi.fn(),
    signOut: vi.fn(),
    deleteMember: vi.fn(),
  }),
}));

/** The viewer's own row, which the page picks out of the browsable set to rank against. */
const VIEWER_ROW = browseMemberRow({
  id: 'viewer',
  display_name: 'Viewer V.',
  state: 'Colorado',
  duration: '3 - 10 years',
  interests: ['Cooking'],
});

const PEER_ROW = browseMemberRow({
  id: 'peer-1',
  type: 'peer',
  display_name: 'Peer One',
  state: 'Colorado',
  city: 'Denver',
  disability: 'SCI - para',
  interests: ['Cooking', 'Kayaking'],
  topics: [],
});

const OTHER_STATE_PEER = browseMemberRow({
  id: 'peer-2',
  type: 'peer',
  display_name: 'Peer Two',
  state: 'California',
  city: 'Oakland',
  disability: 'TBI',
  level: null,
  interests: [],
  topics: [],
});

const MENTOR_ROW = browseMemberRow({
  id: 'mentor-1',
  type: 'mentor',
  display_name: 'Mentor One',
  state: 'Colorado',
  city: 'Denver',
  open_to_messages: true,
  capacity: 'open',
  verified_by: 'craig-hospital',
  topics: ['Transfers', 'Vehicle modifications'],
  interests: [],
});

const OTHER_MENTOR_ROW = browseMemberRow({
  id: 'mentor-2',
  type: 'mentor',
  display_name: 'Mentor Two',
  state: 'Colorado',
  city: 'Boulder',
  open_to_messages: true,
  capacity: 'open',
  topics: ['Pressure sores'],
  interests: [],
});

function renderPage(rows: BrowseMemberRow[]) {
  browseMembers.reset(rows);
  return render(
    <MemoryRouter>
      <WavesProvider>
        <DiscoverPage />
      </WavesProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  session.member = { id: 'viewer', duration: '3 - 10 years' };
  session.loading = false;
  browseMembers.reset([]);
  waves.reset([]);
  observers = [];
});

describe('signed out', () => {
  it('offers a way in rather than an empty deck when the view refuses an anonymous viewer', async () => {
    // PRD §5.1: every peer and mentor profile is behind sign-in. That has an honest cost, and the
    // page's job is to explain it, not to look broken.
    session.member = null;
    browseMembers.failWith(permissionDeniedError());

    renderPage([]);

    expect(await screen.findByRole('link', { name: /get started/i })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('the deck', () => {
  it('shows peers by default and mentors behind the other pill', async () => {
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, PEER_ROW, MENTOR_ROW]);

    expect(await screen.findByText('Peer One')).toBeInTheDocument();
    expect(screen.queryByText('Mentor One')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Mentors' }));

    expect(await screen.findByText('Mentor One')).toBeInTheDocument();
    expect(screen.queryByText('Peer One')).not.toBeInTheDocument();
  });

  it('lands a newly injured viewer on Mentors', async () => {
    // PRD §6.1: under a year in, what someone wants is answers and proof it gets better.
    session.member = { id: 'viewer', duration: 'Less than 6 months' };
    renderPage([PEER_ROW, MENTOR_ROW]);

    expect(await screen.findByText('Mentor One')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Mentors' })).toHaveAttribute('aria-selected', 'true');
  });

  it('never shows the viewer their own card', async () => {
    renderPage([VIEWER_ROW, PEER_ROW]);

    expect(await screen.findByText('Peer One')).toBeInTheDocument();
    expect(screen.queryByText('Viewer V.')).not.toBeInTheDocument();
  });

  it('puts someone in the viewer’s own state above someone further away', async () => {
    renderPage([VIEWER_ROW, OTHER_STATE_PEER, PEER_ROW]);

    await screen.findByText('Peer One');
    const names = screen
      .getAllByRole('article')
      .map((card) => within(card).getByRole('heading').textContent);
    expect(names).toEqual(['Peer One', 'Peer Two']);
  });
});

describe('filters', () => {
  it('narrows the deck from the sheet and says how to get back', async () => {
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, PEER_ROW, OTHER_STATE_PEER]);

    await screen.findByText('Peer One');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'California' }));
    await user.click(screen.getByRole('button', { name: 'Close filters' }));

    expect(await screen.findByText('Peer Two')).toBeInTheDocument();
    expect(screen.queryByText('Peer One')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove filter California' }));
    expect(await screen.findByText('Peer One')).toBeInTheDocument();
  });

  it('explains an empty deck instead of just showing nothing', async () => {
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, PEER_ROW]);

    await screen.findByText('Peer One');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'California' }));
    await user.click(screen.getByRole('button', { name: 'Close filters' }));

    expect(await screen.findByText(/no peers match these filters/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(await screen.findByText('Peer One')).toBeInTheDocument();
  });
});

describe('ask me about', () => {
  it('filters the deck to everyone who talks about that topic, and sends nothing', async () => {
    // PRD §8.1, reversing an earlier design: the chips are discovery, not contact. If this test
    // ever has to change to "a message was sent", that is a product decision, not a refactor.
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, MENTOR_ROW, OTHER_MENTOR_ROW]);

    await user.click(await screen.findByRole('tab', { name: 'Mentors' }));
    await screen.findByText('Mentor One');

    await user.click(screen.getByRole('button', { name: /transfers/i }));

    await waitFor(() => {
      expect(screen.queryByText('Mentor Two')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Mentor One')).toBeInTheDocument();
    expect(waves.rows).toHaveLength(0);
  });
});

describe('saying hi', () => {
  it('records a wave against the person it was sent to', async () => {
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, PEER_ROW]);

    await screen.findByText('Peer One');
    await user.click(screen.getByRole('button', { name: /^say hi to Peer One/i }));

    await waitFor(() => {
      expect(waves.rows).toHaveLength(1);
    });
    expect(waves.rows[0]).toMatchObject({ from_member_id: 'viewer', to_member_id: 'peer-1' });
    expect(
      await screen.findByRole('button', { name: /you said hi to Peer One/i }),
    ).toBeInTheDocument();
  });
});

describe('swiping', () => {
  /**
   * jsdom has no gestures, so this drives the same pointer events the page listens for. It is
   * worth testing because the swipe must do exactly what the pills do — never more — and because
   * both of its guards are invisible until they fail.
   */
  function drag(from: { x: number; y: number }, to: { x: number; y: number }, target: Element) {
    const deck = target.closest('[data-testid="deck"]') ?? target;
    deck.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: from.x, clientY: from.y }),
    );
    deck.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, clientX: to.x, clientY: to.y }),
    );
  }

  it('cycles segments, and stops at the end rather than wrapping', async () => {
    renderPage([VIEWER_ROW, PEER_ROW, MENTOR_ROW]);
    const deck = await screen.findByTestId('deck');

    drag({ x: 300, y: 200 }, { x: 100, y: 205 }, deck);
    expect(await screen.findByText('Mentor One')).toBeInTheDocument();

    // Already at the far end — this must be a no-op, not a wrap back to Peers.
    drag({ x: 300, y: 200 }, { x: 100, y: 205 }, deck);
    expect(await screen.findByText('Mentor One')).toBeInTheDocument();
  });

  it('ignores a drag that begins in the edge iOS reserves for its back gesture', async () => {
    renderPage([VIEWER_ROW, PEER_ROW, MENTOR_ROW]);
    const deck = await screen.findByTestId('deck');

    drag({ x: 8, y: 200 }, { x: 240, y: 205 }, deck);
    expect(screen.getByText('Peer One')).toBeInTheDocument();
  });

  it('leaves a mostly vertical drag to the deck', async () => {
    renderPage([VIEWER_ROW, PEER_ROW, MENTOR_ROW]);
    const deck = await screen.findByTestId('deck');

    drag({ x: 300, y: 100 }, { x: 220, y: 400 }, deck);
    expect(screen.getByText('Peer One')).toBeInTheDocument();
  });
});

describe('infinite scroll', () => {
  // Same state, duration and (empty) interests as the viewer, so every card ties on rank and the
  // deck keeps this exact insertion order (see ranking.ts) — which is what makes "first 12, then
  // the rest" assertable at all.
  const MANY_PEERS = Array.from({ length: 14 }, (_, i) =>
    browseMemberRow({
      id: `peer-page-${i}`,
      type: 'peer',
      display_name: `Page Peer ${i}`,
      state: 'Colorado',
      city: 'Denver',
      interests: [],
      topics: [],
    }),
  );

  it('renders only the first page of a large deck, with a sentinel below it', async () => {
    renderPage([VIEWER_ROW, ...MANY_PEERS]);

    await screen.findByText('Page Peer 0');
    expect(screen.getByText('Page Peer 11')).toBeInTheDocument();
    expect(screen.queryByText('Page Peer 12')).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-scroll-sentinel')).toBeInTheDocument();
    expect(screen.getByText('Loading more people…')).toBeInTheDocument();
  });

  it('reveals the next page once the sentinel scrolls into view, and says so once every page is in', async () => {
    renderPage([VIEWER_ROW, ...MANY_PEERS]);
    await screen.findByText('Page Peer 11');

    triggerLoadMore();

    expect(await screen.findByText('Page Peer 12')).toBeInTheDocument();
    expect(screen.getByText('Page Peer 13')).toBeInTheDocument();
    expect(screen.getByText("That's everyone.")).toBeInTheDocument();
  });

  it('resets back to the first page when the filters narrow the deck', async () => {
    const user = userEvent.setup();
    renderPage([VIEWER_ROW, ...MANY_PEERS]);
    await screen.findByText('Page Peer 11');

    triggerLoadMore();
    await screen.findByText('Page Peer 12');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'SCI - para' }));
    await user.click(screen.getByRole('button', { name: 'Close filters' }));

    await waitFor(() => {
      expect(screen.queryByText('Page Peer 12')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Loading more people…')).toBeInTheDocument();
  });
});
