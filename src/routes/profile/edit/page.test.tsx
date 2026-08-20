import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountMember } from '@/lib/session';
import ProfileEditPage from '@/routes/profile/edit/page';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseMember: AccountMember = {
  id: 'user-1',
  type: 'peer',
  displayName: 'Jamie',
  phone: '+15105550143',
  ageBand: '30-39',
  disability: 'SCI - para',
  level: 'T6',
  duration: '3 - 10 years',
  city: 'San Jose',
  state: 'California',
  interests: ['Reading', 'Travel', 'Cooking'],
  photoUrl: null,
  bio: '',
  mentorInterest: false,
  completeness: null,
  injuryMechanism: null,
  independence: null,
  relationshipStatus: null,
  children: null,
  employment: null,
  languages: [],
  topics: [],
  lifeNowVisible: false,
};

let currentMember: AccountMember | null = baseMember;
const mockRefresh = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    member: currentMember,
    loading: false,
    refresh: mockRefresh,
    signOut: vi.fn(),
    deleteMember: vi.fn(),
  }),
}));

const mockMembersEq = vi.fn().mockResolvedValue({ error: null });
const mockMembersUpdate = vi.fn(() => ({ eq: mockMembersEq }));

const mockPhotosOrder = vi.fn().mockResolvedValue({ data: [], error: null });
const mockPhotosEq = vi.fn(() => ({ order: mockPhotosOrder }));
const mockPhotosSelect = vi.fn(() => ({ eq: mockPhotosEq }));

const mockPhotoInsertSingle = vi.fn().mockResolvedValue({
  data: { id: 'photo-1', url: 'https://example.com/photo1.jpg', alt: null },
  error: null,
});
const mockPhotoInsertSelect = vi.fn(() => ({ single: mockPhotoInsertSingle }));
const mockPhotosInsert = vi.fn(() => ({ select: mockPhotoInsertSelect }));

const mockPhotosDeleteEq = vi.fn().mockResolvedValue({ error: null });
const mockPhotosDelete = vi.fn(() => ({ eq: mockPhotosDeleteEq }));

const mockUpload = vi.fn().mockResolvedValue({ error: null });
const mockGetPublicUrl = vi.fn(() => ({ data: { publicUrl: 'https://example.com/photo1.jpg' } }));
const mockStorageFrom = vi.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl }));

const mockFrom = vi.fn((table: string) => {
  if (table === 'members') return { update: mockMembersUpdate };
  return {
    select: mockPhotosSelect,
    insert: mockPhotosInsert,
    delete: mockPhotosDelete,
  };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: mockFrom, storage: { from: mockStorageFrom } }),
}));

function renderPage() {
  return render(<ProfileEditPage />);
}

describe('ProfileEditPage', () => {
  beforeEach(() => {
    currentMember = { ...baseMember };
    mockNavigate.mockReset();
    mockRefresh.mockReset().mockResolvedValue(undefined);
    mockMembersEq.mockReset().mockResolvedValue({ error: null });
    mockMembersUpdate.mockClear();
    mockPhotosOrder.mockReset().mockResolvedValue({ data: [], error: null });
    mockPhotosDeleteEq.mockClear().mockResolvedValue({ error: null });
    mockUpload.mockClear();
  });

  it('shows To do / Done badges reflecting the member’s current data', async () => {
    currentMember = { ...baseMember, bio: 'Hi there', mentorInterest: true };
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    const bioRow = screen.getByRole('button', { name: /In your own words/ });
    expect(bioRow).toHaveTextContent('Done');
    const mentorRow = screen.getByRole('button', { name: /Do you want to be a mentor/ });
    expect(mentorRow).toHaveTextContent('Done');
    const lifeNowRow = screen.getByRole('button', { name: /Life now/ });
    expect(lifeNowRow).toHaveTextContent('To do');
  });

  it('saves the bio and returns to the hub', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /In your own words/ }));
    const textarea = screen.getByPlaceholderText(/Bay Area native/);
    await user.type(textarea, 'New bio text');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockMembersUpdate).toHaveBeenCalledWith({ bio: 'New bio text' });
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
  });

  it('navigates back to /profile from the hub', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Your profile' });
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('lets a user add or change their profile photo', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Profile photo/ }));
    const file = new File(['bytes'], 'me.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Profile photo'), file);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockMembersUpdate).toHaveBeenCalledWith({
        photo_url: 'https://example.com/photo1.jpg',
      });
    });
  });

  it('lets a user go back to the hub without saving', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /In your own words/ }));
    expect(screen.getByRole('heading', { name: 'In your own words' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument();
    expect(mockMembersUpdate).not.toHaveBeenCalled();
  });

  it('records mentor interest without granting mentor status', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Do you want to be a mentor/ }));
    await user.click(screen.getByRole('button', { name: 'Yes, I will help' }));

    await waitFor(() => {
      expect(mockMembersUpdate).toHaveBeenCalledWith({ mentor_interest: true });
    });
  });

  it('saves Life now fields under the right column names, including visibility', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Life now/ }));
    await user.click(screen.getByRole('button', { name: 'Completely independent' }));
    await user.click(screen.getByRole('button', { name: 'Partnered' }));
    await user.click(screen.getByRole('button', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Show Life now on my profile' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockMembersUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          independence: 'Completely independent',
          relationship_status: 'Partnered',
          children: 'No',
          life_now_visible: true,
        }),
      );
    });
  });

  it('adds and removes a gallery photo', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Your photos/ }));
    const file = new File(['bytes'], 'activity.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Add a photo'), file);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalled();
    });
    const removeButton = await screen.findByRole('button', { name: 'Remove photo' });

    await user.click(removeButton);
    await waitFor(() => {
      expect(mockPhotosDeleteEq).toHaveBeenCalledWith('id', 'photo-1');
    });
  });

  it('extends the Ask me about topics to include the new self-care items', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Ask me about/ }));
    await user.click(screen.getByRole('button', { name: 'Wound care' }));
    await user.click(screen.getByRole('button', { name: 'Mental health' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockMembersUpdate).toHaveBeenCalledWith({
        // expect.arrayContaining is typed as `any` by vitest itself.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        topics: expect.arrayContaining(['Wound care', 'Mental health']),
      });
    });
  });
});
