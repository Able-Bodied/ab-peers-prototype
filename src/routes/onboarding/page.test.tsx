import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/lib/session';
import OnboardingPage from '@/routes/onboarding/page';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

const mockClient = {
  auth: {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getUser: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(),
  },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => mockClient,
}));

// vi.fn() mocks never use `this`, so the real client's method signatures don't apply here.
const mockAuth = mockClient.auth as unknown as {
  signInWithOtp: ReturnType<typeof vi.fn>;
  verifyOtp: ReturnType<typeof vi.fn>;
  getUser: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
};
const mockFrom = mockClient.from;
type UpsertMock = ReturnType<
  typeof vi.fn<(payload: Record<string, unknown>) => Promise<{ error: null }>>
>;
let mockUpsert: UpsertMock;

function renderOnboarding() {
  return render(
    <SessionProvider>
      <OnboardingPage />
    </SessionProvider>,
  );
}

async function selectOption(
  labelText: string,
  optionName: string,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByLabelText(labelText));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

async function verifyPhone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Get started' }));

  await user.type(screen.getByLabelText('Phone number'), '5105550143');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => {
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ phone: '+15105550143' });
  });

  for (let i = 0; i < 6; i++) {
    await user.type(screen.getByLabelText(`Digit ${i + 1}`), String(i + 1));
  }
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => {
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      phone: '+15105550143',
      token: '123456',
      type: 'sms',
    });
  });
}

async function driveToPhotoStep(user: ReturnType<typeof userEvent.setup>) {
  await verifyPhone(user);

  await user.type(await screen.findByLabelText('Display name'), 'Jamie');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-01-01' } });
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.click(screen.getByRole('button', { name: 'SCI - para' }));
  await selectOption('Level of injury', 'T6', user);
  await selectOption('How long have you been disabled?', '3 - 10 years', user);
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await selectOption('State', 'California', user);
  await user.type(screen.getByLabelText('City or town'), 'San Jose');
  await user.click(screen.getByRole('button', { name: 'Continue' }));

  await user.click(screen.getByRole('button', { name: 'Reading' }));
  await user.click(screen.getByRole('button', { name: 'Travel' }));
  await user.click(screen.getByRole('button', { name: 'Cooking' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    mockAuth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
    mockAuth.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mockAuth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockAuth.getSession
      .mockReset()
      .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
    mockUpsert = vi
      .fn<(payload: Record<string, unknown>) => Promise<{ error: null }>>()
      .mockResolvedValue({ error: null });
    mockFrom.mockReset().mockReturnValue({ upsert: mockUpsert, select: mockSelect });
    mockNavigate.mockReset();
  });

  it('walks a new member through the whole flow and saves the profile to Supabase', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await driveToPhotoStep(user);

    expect(screen.getByRole('heading', { level: 1, name: 'Add a photo?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true });
    });

    expect(mockFrom).toHaveBeenCalledWith('members');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        display_name: 'Jamie',
        phone: '+15105550143',
        birth_date: '1990-01-01',
        age_band: '30-39',
        disability: 'SCI - para',
        level: 'T6',
        duration: '3 - 10 years',
        city: 'San Jose',
        state: 'California',
        // expect.arrayContaining is typed as `any` by vitest itself.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        interests: expect.arrayContaining(['Reading', 'Travel', 'Cooking']),
        photo_url: null,
      }),
    );
  });

  it('sends a returning member straight to their profile, skipping profile creation', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'user-1', display_name: 'Jamie' },
      error: null,
    });
    const user = userEvent.setup();
    renderOnboarding();

    await verifyPhone(user);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true });
    });
    // Never reached the profile-creation steps.
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });

  it('lets a returning member skip the welcome screen via "Log in"', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Get started' })).not.toBeInTheDocument();
  });

  it('shows the phone step error and stays put when signInWithOtp fails', async () => {
    mockAuth.signInWithOtp.mockResolvedValue({ error: { message: 'Invalid phone number' } });
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole('button', { name: 'Get started' }));
    await user.type(screen.getByLabelText('Phone number'), '5105550143');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Invalid phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  it('blocks anyone who enters a birth date under 18', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await verifyPhone(user);
    await user.type(await screen.findByLabelText('Display name'), 'Jamie');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const under18Birthdate = new Date();
    under18Birthdate.setFullYear(under18Birthdate.getFullYear() - 16);
    fireEvent.change(screen.getByLabelText('Date of birth'), {
      target: { value: under18Birthdate.toISOString().slice(0, 10) },
    });

    // Entering the date alone doesn't reject them yet — only submitting does.
    expect(screen.queryByText('PeerConnect is for people 18 and over.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('PeerConnect is for people 18 and over.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('requires at least 3 interests before continuing', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await verifyPhone(user);
    await user.type(await screen.findByLabelText('Display name'), 'Jamie');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1990-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'SCI - para' }));
    await selectOption('Level of injury', 'T6', user);
    await selectOption('How long have you been disabled?', '3 - 10 years', user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await selectOption('State', 'California', user);
    await user.type(screen.getByLabelText('City or town'), 'San Jose');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const interestsContinue = screen.getByRole('button', { name: 'Continue' });
    expect(interestsContinue).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Reading' }));
    await user.click(screen.getByRole('button', { name: 'Travel' }));
    expect(interestsContinue).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Cooking' }));
    expect(interestsContinue).toBeEnabled();
  });
});
