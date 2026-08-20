import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/lib/session';
import ProfilePage from '@/routes/profile/page';

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockDeleteEq = vi.fn();
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }));

const mockPhotosOrder = vi.fn().mockResolvedValue({ data: [], error: null });
const mockPhotosEq = vi.fn(() => ({ order: mockPhotosOrder }));
const mockPhotosSelect = vi.fn(() => ({ eq: mockPhotosEq }));

const mockFrom = vi.fn((table: string) => {
  if (table === 'member_photos') return { select: mockPhotosSelect };
  return { select: mockSelect, delete: mockDelete };
});
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: vi.fn(),
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
  bio: '',
  mentor_interest: false,
  completeness: null,
  injury_mechanism: null,
  independence: null,
  relationship_status: null,
  children: null,
  employment: null,
  languages: [],
  topics: [],
  life_now_visible: false,
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <SessionProvider>
        <ProfilePage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mockDelete.mockClear();
    mockDeleteEq.mockReset().mockResolvedValue({ error: null });
    mockPhotosOrder.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('shows a sign-in prompt when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    renderProfile();

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the real profile and a delete button when signed in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    renderProfile();

    expect(await screen.findByText('Jamie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete profile' })).toBeInTheDocument();
  });

  it('deletes the members row and clears the profile when confirmed', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderProfile();
    await screen.findByText('Jamie');

    await user.click(screen.getByRole('button', { name: 'Delete profile' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'user-1');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    });
  });

  it('does nothing when the confirm dialog is declined', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({ data: memberRow, error: null });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderProfile();
    await screen.findByText('Jamie');

    await user.click(screen.getByRole('button', { name: 'Delete profile' }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Jamie')).toBeInTheDocument();
  });

  it('shows bio, ask-me-about topics, and mentor interest when set', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({
      data: {
        ...memberRow,
        bio: 'Handcycle most weekends.',
        topics: ['Dating & intimacy', 'Wound care'],
        mentor_interest: true,
      },
      error: null,
    });
    renderProfile();

    expect(await screen.findByText('Handcycle most weekends.')).toBeInTheDocument();
    expect(screen.getByText('Dating & intimacy')).toBeInTheDocument();
    expect(screen.getByText('Wound care')).toBeInTheDocument();
    expect(screen.getByText('Interested in mentoring')).toBeInTheDocument();
  });

  it('hides Life now when life_now_visible is false, even with fields set', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({
      data: { ...memberRow, independence: 'Some help', life_now_visible: false },
      error: null,
    });
    renderProfile();

    await screen.findByText('Jamie');
    expect(screen.queryByText('Life now')).not.toBeInTheDocument();
    expect(screen.queryByText('Some help')).not.toBeInTheDocument();
  });

  it('shows Life now when life_now_visible is true', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockResolvedValue({
      data: {
        ...memberRow,
        independence: 'Some help',
        relationship_status: 'Partnered',
        languages: ['English', 'Spanish'],
        life_now_visible: true,
      },
      error: null,
    });
    renderProfile();

    expect(await screen.findByText('Life now')).toBeInTheDocument();
    expect(screen.getByText('Some help')).toBeInTheDocument();
    expect(screen.getByText('Partnered')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
  });
});
