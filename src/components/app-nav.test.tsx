import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppNav, navItems } from '@/components/app-nav';
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <AppNav />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('AppNav', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('offers every destination once, plus a Join tab, when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderAt('/map');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const item of navItems) {
      expect(
        await within(nav).findByRole('link', { name: new RegExp(`^${item.label}`) }),
      ).toHaveAttribute('href', item.to);
    }
    expect(within(nav).getByRole('link', { name: /^Join/ })).toHaveAttribute('href', '/onboarding');
    expect(within(nav).queryByRole('link', { name: /^Me/ })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(navItems.length + 1);
  });

  it('marks the destination for the current route as the current page', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderAt('/events');

    expect(await screen.findByRole('link', { name: /^Events/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /^Discover/ })).not.toHaveAttribute('aria-current');
  });

  it('swaps the Join tab for Me once the visitor is signed in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    renderAt('/profile');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: /^Me/ })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(within(nav).queryByRole('link', { name: /^Join/ })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(navItems.length + 1);
  });
});
