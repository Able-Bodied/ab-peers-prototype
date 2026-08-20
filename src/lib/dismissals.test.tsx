import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DismissalsProvider, useDismissals } from '@/lib/dismissals';
import { createEventDismissalsMock } from '@/test/dismissals-mock';

const eventDismissals = createEventDismissalsMock();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => eventDismissals.forTable(table) }),
}));

/** `who` names the buttons so two harnesses on one screen stay individually addressable. */
function Harness({ eventId = 'e1', who = 'a' }: { eventId?: string; who?: string }) {
  const { isDismissed, dismiss, restore, loading } = useDismissals();

  return (
    <div>
      <p>
        {who} state: {loading ? 'loading' : isDismissed(eventId) ? 'dismissed' : 'shown'}
      </p>
      <button
        type="button"
        onClick={() => {
          dismiss(eventId);
        }}
      >
        dismiss {who}
      </button>
      <button
        type="button"
        onClick={() => {
          restore(eventId);
        }}
      >
        restore {who}
      </button>
    </div>
  );
}

describe('DismissalsProvider', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    eventDismissals.reset();
  });

  it('starts with nothing dismissed', async () => {
    render(
      <DismissalsProvider>
        <Harness />
      </DismissalsProvider>,
    );

    expect(await screen.findByText('a state: shown')).toBeInTheDocument();
  });

  it('marks an event dismissed and saves it to the database', async () => {
    render(
      <DismissalsProvider>
        <Harness />
      </DismissalsProvider>,
    );
    await screen.findByText('a state: shown');

    await userEvent.click(screen.getByRole('button', { name: 'dismiss a' }));

    expect(screen.getByText('a state: dismissed')).toBeInTheDocument();
    expect(eventDismissals.rows).toEqual([expect.objectContaining({ event_id: 'e1' })]);
  });

  it('undoes a dismissal and removes it from the database', async () => {
    render(
      <DismissalsProvider>
        <Harness />
      </DismissalsProvider>,
    );
    await screen.findByText('a state: shown');

    await userEvent.click(screen.getByRole('button', { name: 'dismiss a' }));
    await userEvent.click(screen.getByRole('button', { name: 'restore a' }));

    expect(screen.getByText('a state: shown')).toBeInTheDocument();
    expect(eventDismissals.rows).toEqual([]);
  });

  it('shares one answer across everything showing that event', async () => {
    render(
      <DismissalsProvider>
        <Harness who="a" />
        <Harness who="b" />
      </DismissalsProvider>,
    );
    await screen.findByText('a state: shown');

    await userEvent.click(screen.getByRole('button', { name: 'dismiss a' }));

    expect(screen.getByText('a state: dismissed')).toBeInTheDocument();
    expect(screen.getByText('b state: dismissed')).toBeInTheDocument();
  });

  it('keeps separate answers for separate events', async () => {
    render(
      <DismissalsProvider>
        <Harness eventId="e1" who="a" />
        <Harness eventId="e2" who="b" />
      </DismissalsProvider>,
    );
    await screen.findByText('a state: shown');

    await userEvent.click(screen.getByRole('button', { name: 'dismiss a' }));

    expect(screen.getByText('a state: dismissed')).toBeInTheDocument();
    expect(screen.getByText('b state: shown')).toBeInTheDocument();
  });

  it('survives a reload, because the database is the source of truth', async () => {
    const { unmount } = render(
      <DismissalsProvider>
        <Harness />
      </DismissalsProvider>,
    );
    await screen.findByText('a state: shown');
    await userEvent.click(screen.getByRole('button', { name: 'dismiss a' }));
    unmount();

    // Same browser (viewer id persisted to localStorage), same database — a fresh mount has to
    // fetch its own state back rather than assuming it's remembered anywhere client-side.
    render(
      <DismissalsProvider>
        <Harness />
      </DismissalsProvider>,
    );

    expect(await screen.findByText('a state: dismissed')).toBeInTheDocument();
  });
});
