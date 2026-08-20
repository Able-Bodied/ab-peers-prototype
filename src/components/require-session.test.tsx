import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireSession } from '@/components/require-session';
import { SessionProvider } from '@/lib/session';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
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
  interests: ['Reading'],
  photo_url: null,
};

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/map']}>
      <SessionProvider>
        <RequireSession>
          <p>Protected content</p>
        </RequireSession>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('asks a signed-out visitor to sign in instead of rendering the page', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderGate();

    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/onboarding',
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the page once the member is signed in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    renderGate();

    expect(await screen.findByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
