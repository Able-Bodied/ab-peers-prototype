import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { RsvpProvider, rsvpCounts, useRsvps } from '@/lib/rsvps';

/** `who` names the buttons so two harnesses on one screen stay individually addressable. */
function Harness({ eventId = 'e1', who = 'a' }: { eventId?: string; who?: string }) {
  const { rsvpFor, setRsvp, respondedCount } = useRsvps();
  const rsvp = rsvpFor(eventId);

  return (
    <div>
      <p>
        {who} state: {rsvp ?? 'none'}
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
  });

  it('starts with nothing marked', () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(screen.getByText('a state: none')).toBeInTheDocument();
    expect(screen.getByText('responded: 0')).toBeInTheDocument();
  });

  it('records a response and counts it', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('responded: 1')).toBeInTheDocument();
  });

  it('replaces rather than stacks when the viewer changes their mind', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    await userEvent.click(screen.getByRole('button', { name: 'maybe a' }));

    expect(screen.getByText('a state: interested')).toBeInTheDocument();
    expect(screen.getByText('responded: 1')).toBeInTheDocument();
  });

  it('drops the event entirely when the response is cleared', async () => {
    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    await userEvent.click(screen.getByRole('button', { name: 'clear a' }));

    expect(screen.getByText('a state: none')).toBeInTheDocument();
    expect(screen.getByText('responded: 0')).toBeInTheDocument();
  });

  it('shares one answer across everything showing that event', async () => {
    // The bug this store exists for: a card and the event's own page disagreeing.
    render(
      <RsvpProvider>
        <Harness who="a" />
        <Harness who="b" />
      </RsvpProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('b state: going')).toBeInTheDocument();
  });

  it('keeps separate answers for separate events', async () => {
    render(
      <RsvpProvider>
        <Harness eventId="e1" who="a" />
        <Harness eventId="e2" who="b" />
      </RsvpProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'go a' }));

    expect(screen.getByText('a state: going')).toBeInTheDocument();
    expect(screen.getByText('b state: none')).toBeInTheDocument();
  });

  it('survives a reload', async () => {
    const { unmount } = render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'go a' }));
    unmount();

    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(screen.getByText('a state: going')).toBeInTheDocument();
  });

  it('ignores a stored value that is not a real state', () => {
    globalThis.localStorage.setItem('ab-peers:rsvps', JSON.stringify({ e1: 'attending' }));

    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(screen.getByText('a state: none')).toBeInTheDocument();
  });

  it('starts clean rather than throwing when storage holds junk', () => {
    globalThis.localStorage.setItem('ab-peers:rsvps', 'not json at all');

    render(
      <RsvpProvider>
        <Harness />
      </RsvpProvider>,
    );

    expect(screen.getByText('a state: none')).toBeInTheDocument();
  });
});

describe('rsvpCounts', () => {
  const base = { goingCount: 10, interestedCount: 4 };

  it('leaves the tallies alone when the viewer has not responded', () => {
    expect(rsvpCounts(base, null)).toEqual({ going: 10, interested: 4 });
  });

  it('adds the viewer to going', () => {
    expect(rsvpCounts(base, 'going')).toEqual({ going: 11, interested: 4 });
  });

  it('adds the viewer to interested', () => {
    expect(rsvpCounts(base, 'interested')).toEqual({ going: 10, interested: 5 });
  });

  it('never adds the viewer to both at once', () => {
    const counts = rsvpCounts(base, 'going');
    expect(counts.going + counts.interested).toBe(base.goingCount + base.interestedCount + 1);
  });
});
