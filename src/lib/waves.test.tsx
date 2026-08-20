import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WAVE_LIMIT, useWaves, WavesProvider } from '@/lib/waves';
import { MockPostgrestError } from '@/test/browse-members-mock';
import { createWavesMock, type WaveRow } from '@/test/waves-mock';

const waves = createWavesMock();

/** Swapped per test — `member` is the signed-in viewer, `loading` the pre-session moment. */
const session: { member: { id: string } | null; loading: boolean } = {
  member: { id: 'me' },
  loading: false,
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => waves.forTable(table) }),
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    member: session.member,
    loading: session.loading,
    refresh: vi.fn(),
    signOut: vi.fn(),
    deleteMember: vi.fn(),
  }),
}));

function wave(overrides: Partial<WaveRow> = {}): WaveRow {
  return {
    from_member_id: 'me',
    to_member_id: 'them',
    topic: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return hoursAgo(days * 24);
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Stands in for a member card: one person, one button, and the three things the card renders
 * differently depending on this provider — whether hi has been said, whether it is in flight, and
 * how many are left today.
 */
function Harness({ memberId = 'them', topic }: { memberId?: string; topic?: 'Transfers' }) {
  const { hasWaved, sendWave, sendingTo, error, remainingToday, loading } = useWaves();

  if (loading) return <p>loading</p>;

  return (
    <div>
      <p>{hasWaved(memberId) ? 'Said hi' : 'Not yet'}</p>
      <p>remaining: {remainingToday}</p>
      <p>sending: {sendingTo ?? 'nobody'}</p>
      {error ? <p>error: {error}</p> : null}
      <button
        type="button"
        onClick={() => {
          void sendWave(memberId, topic ?? null);
        }}
      >
        Say hi
      </button>
    </div>
  );
}

function renderHarness(props: { memberId?: string; topic?: 'Transfers' } = {}) {
  return render(
    <WavesProvider>
      <Harness {...props} />
    </WavesProvider>,
  );
}

describe('WavesProvider', () => {
  beforeEach(() => {
    waves.reset();
    session.member = { id: 'me' };
    session.loading = false;
  });

  it('starts with nobody waved at and the full allowance', async () => {
    renderHarness();

    expect(await screen.findByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText(`remaining: ${DAILY_WAVE_LIMIT}`)).toBeInTheDocument();
    expect(screen.getByText('sending: nobody')).toBeInTheDocument();
  });

  it('remembers a wave sent before this page loaded', async () => {
    waves.reset([wave({ to_member_id: 'them' })]);

    renderHarness();

    expect(await screen.findByText('Said hi')).toBeInTheDocument();
  });

  it('does not count someone else waving at the same person', async () => {
    waves.reset([wave({ from_member_id: 'someone-else', to_member_id: 'them' })]);

    renderHarness();

    expect(await screen.findByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText(`remaining: ${DAILY_WAVE_LIMIT}`)).toBeInTheDocument();
  });

  it('says hi immediately and writes the wave', async () => {
    renderHarness();
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(await screen.findByText('Said hi')).toBeInTheDocument();
    await waitFor(() => {
      expect(waves.rows).toEqual([
        expect.objectContaining({ from_member_id: 'me', to_member_id: 'them', topic: null }),
      ]);
    });
    expect(screen.getByText(`remaining: ${DAILY_WAVE_LIMIT - 1}`)).toBeInTheDocument();
    expect(screen.getByText('sending: nobody')).toBeInTheDocument();
  });

  it('carries the topic the wave was sent from', async () => {
    renderHarness({ topic: 'Transfers' });
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    await waitFor(() => {
      expect(waves.rows).toEqual([expect.objectContaining({ topic: 'Transfers' })]);
    });
  });

  it('takes back the wave and shows why when the write fails', async () => {
    waves.failInsertWith(new MockPostgrestError('new row violates row-level security', '42501'));
    renderHarness();
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(
      await screen.findByText('error: new row violates row-level security'),
    ).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText(`remaining: ${DAILY_WAVE_LIMIT}`)).toBeInTheDocument();
    expect(waves.rows).toEqual([]);
  });

  it('repeats the database back to the viewer when it refuses the wave itself', async () => {
    // The daily limit lives in a trigger, and the two counts can disagree — another device, a
    // clock skew, a limit changed server-side. Whatever it says is what the viewer should read.
    waves.failInsertWith(new MockPostgrestError('daily wave limit reached', 'P0001'));
    renderHarness();
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(await screen.findByText('error: daily wave limit reached')).toBeInTheDocument();
  });

  it('refuses to spend a request once the allowance is used up', async () => {
    waves.reset(
      Array.from({ length: DAILY_WAVE_LIMIT }, (_, i) => wave({ to_member_id: `earlier-${i}` })),
    );
    renderHarness();
    await screen.findByText('remaining: 0');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(
      await screen.findByText(/error: You have reached the limit of 20 waves/),
    ).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(waves.rows).toHaveLength(DAILY_WAVE_LIMIT);
  });

  it('lets waves older than the 24-hour window age out of the count', async () => {
    waves.reset(
      Array.from({ length: DAILY_WAVE_LIMIT }, (_, i) =>
        wave({ to_member_id: `earlier-${i}`, created_at: daysAgo(2) }),
      ),
    );
    renderHarness();
    await screen.findByText(`remaining: ${DAILY_WAVE_LIMIT}`);

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(await screen.findByText('Said hi')).toBeInTheDocument();
    await waitFor(() => {
      expect(waves.rows).toHaveLength(DAILY_WAVE_LIMIT + 1);
    });
  });

  it('still counts a wave sent 23 hours ago, because the window rolls rather than resets', async () => {
    // The database counts `created_at > now() - interval '24 hours'`. A calendar-day count here
    // would hand out a fresh allowance at midnight and then watch the server refuse every one.
    waves.reset(
      Array.from({ length: DAILY_WAVE_LIMIT }, (_, i) =>
        wave({ to_member_id: `earlier-${i}`, created_at: hoursAgo(23) }),
      ),
    );

    renderHarness();

    expect(await screen.findByText('remaining: 0')).toBeInTheDocument();
  });

  it('ignores a second tap rather than writing a duplicate the database would reject', async () => {
    renderHarness();
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));
    await screen.findByText('Said hi');
    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    await waitFor(() => {
      expect(waves.rows).toHaveLength(1);
    });
    expect(screen.queryByText(/^error:/)).not.toBeInTheDocument();
    expect(screen.getByText(`remaining: ${DAILY_WAVE_LIMIT - 1}`)).toBeInTheDocument();
  });

  it('asks a signed-out viewer to sign in instead of throwing out of the handler', async () => {
    session.member = null;
    renderHarness();
    await screen.findByText('Not yet');

    await userEvent.click(screen.getByRole('button', { name: 'Say hi' }));

    expect(await screen.findByText('error: Sign in to say hi.')).toBeInTheDocument();
    expect(waves.rows).toEqual([]);
  });

  it('waits for the session rather than briefly treating a signed-in viewer as anonymous', async () => {
    session.loading = true;
    waves.reset([wave({ to_member_id: 'them' })]);

    const { rerender } = renderHarness();
    expect(screen.getByText('loading')).toBeInTheDocument();

    session.loading = false;
    rerender(
      <WavesProvider>
        <Harness />
      </WavesProvider>,
    );

    expect(await screen.findByText('Said hi')).toBeInTheDocument();
  });

  it('refuses to be used outside its provider rather than silently doing nothing', () => {
    // Rendering the harness bare would otherwise report "Not yet" for a member the viewer has
    // already waved at, which is the one thing this state exists to prevent.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Harness />)).toThrow('useWaves must be used within a WavesProvider');

    vi.mocked(console.error).mockRestore();
  });
});
