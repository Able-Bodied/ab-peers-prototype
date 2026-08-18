import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider, useSession } from '@/lib/session';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetSession = vi.fn();
const mockSignOut = vi.fn();
const mockUnsubscribe = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: mockUnsubscribe } },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
    from: mockFrom,
  }),
}));

const memberRow = {
  id: 'user-1',
  type: 'peer',
  display_name: 'Jamie',
  phone: '+15555550100',
  age_band: '30-39',
  disability: 'SCI - para',
  level: 'T6',
  duration: '3 - 10 years',
  city: 'San Jose',
  state: 'California',
  interests: ['Reading', 'Travel', 'Cooking'],
  photo_url: null,
};

function Consumer() {
  const { member, loading, signOut } = useSession();
  if (loading) return <p>loading</p>;
  if (!member) return <p>no session</p>;
  return (
    <div>
      <p>{member.displayName}</p>
      <p>{member.ageBand}</p>
      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
      >
        Log out
      </button>
    </div>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mockSignOut.mockReset().mockResolvedValue({ error: null });
  });

  it('has no member when there is no Supabase session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );

    expect(await screen.findByText('no session')).toBeInTheDocument();
  });

  it('fetches and maps the members row when a session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );

    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(screen.getByText('30-39')).toBeInTheDocument();
    expect(mockFrom).toHaveBeenCalledWith('members');
  });

  it('clears the member and calls supabase signOut on log out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    const user = userEvent.setup();
    render(
      <SessionProvider>
        <Consumer />
      </SessionProvider>,
    );
    await screen.findByText('Jamie');

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(screen.getByText('no session')).toBeInTheDocument());
    expect(mockSignOut).toHaveBeenCalled();
  });
});
