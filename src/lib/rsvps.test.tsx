import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RsvpProvider, useRsvps } from '@/lib/rsvps';
import { createEventRsvpsMock } from '@/test/rsvp-mock';

const eventRsvps = createEventRsvpsMock();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => eventRsvps.forTable(table) }),
}));

/**
 * `who` names the buttons so two harnesses on one screen stay individually addressable. Fetches
 * counts on mount, the way every real page does (src/routes/events/page.tsx,
 * src/routes/event/page.tsx) — the provider itself never fetches for an id nobody asked about.
 */
function Harness({ eventId = 'e1', who = 'a' }: { eventId?: string; who?: string }) {
  const { rsvpFor, setRsvp, respondedCount, countsFor, ensureCounts } = useRsvps();

  useEffect(() => {
    ensureCounts([eventId]);
  }, [eventId, ensureCounts]);

  const rsvp = rsvpFor(eventId);
  const counts = countsFor(eventId);

  return (
    <div>
      <p>
        {who} state: {rsvp ?? 'none'}
      </p>
      <p>
        {who} counts: {counts.going} going, {counts.interested} interested
      </p>
      <p>responded: {respondedCount}</p>
      <button
        type="button"
        onClick={() => {
          setRsvp(eventId, 'going');
        }}
      >
        go {who}
      </button>
      <button
        type="button"
        onClick={() => {
          setRsvp(eventId, 'interested');
        }}
      >
        maybe {who}
      </button>
      <button
        type="button"
        onClick={() => {
          setRsvp(eventId, null);
        }}
      >
        clear {who}
      </button>
    </div>
  );
}

describe('RsvpProvider', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    eventRsvps.reset();
  });

  it('starts with nothing marked', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(await screen.findByText('a state: none')).toBeInTheDocument();
    expect(screen.getByText('responded: 0')).toBeInTheDocument();
    expect(screen.getByText('a counts: 0 going, 0 interested')).toBeInTheDocument();
  });

  it('records a response, counts it, and saves it to the database', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('responded: 1')).toBeInTheDocument();
    expect(screen.getByText('a counts: 1 going, 0 interested')).toBeInTheDocument();
    expect(eventRsvps.rows).toEqual([expect.objectContaining({ event_id: 'e1', status: 'going' })]);
  });

  it('replaces rather than stacks when the viewer changes their mind', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    await userEvent.click(screen.getByRole('button', { name: 'maybe a' }));

    expect(screen.getByText('a state: interested')).toBeInTheDocument();
    expect(screen.getByText('responded: 1')).toBeInTheDocument();
    expect(screen.getByText('a counts: 0 going, 1 interested')).toBeInTheDocument();
    expect(eventRsvps.rows).toHaveLength(1);
  });

  it('drops the event entirely when the response is cleared', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    await userEvent.click(screen.getByRole('button', { name: 'clear a' }));

    expect(screen.getByText('a state: none')).toBeInTheDocument();
    expect(screen.getByText('responded: 0')).toBeInTheDocument();
    expect(screen.getByText('a counts: 0 going, 0 interested')).toBeInTheDocument();
    expect(eventRsvps.rows).toEqual([]);
  });

  it('shares one answer across everything showing that event', async () => {
    // The bug this store exists for: a card and the event's own page disagreeing.
    render(
      <RsvpProvider>
        <Harness who="a" />
        <Harness who="b" />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('b state: going')).toBeInTheDocument();
    expect(screen.getByText('a counts: 1 going, 0 interested')).toBeInTheDocument();
    expect(screen.getByText('b counts: 1 going, 0 interested')).toBeInTheDocument();
  });

  it('keeps separate answers for separate events', async () => {
    render(
      <RsvpProvider>
        <Harness eventId="e1" who="a" />
        <Harness eventId="e2" who="b" />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('b state: none')).toBeInTheDocument();
    expect(screen.getByText('a counts: 1 going, 0 interested')).toBeInTheDocument();
    expect(screen.getByText('b counts: 0 going, 0 interested')).toBeInTheDocument();
  });

  it('survives a reload, because the database — not localStorage — is the source of truth', async () => {
    const { unmount } = render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );
    await screen.findByText('a state: none');
    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    unmount();

    // Same browser (viewer id persisted to localStorage), same database — a fresh mount has to
    // fetch its own state back rather than assuming it's remembered anywhere client-side.
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(await screen.findByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('a counts: 1 going, 0 interested')).toBeInTheDocument();
  });
});
