import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/lib/session';
import DevLoginPage from '@/routes/dev-login/page';

/**
 * The point of /dev-login is that it runs the exact same two Supabase calls the phone/verify
 * wizard does — so these tests assert on those calls and on the credential-failure path, not on
 * a shortcut that skips auth. See src/routes/onboarding/page.test.tsx for the UI-driven version
 * of the same two calls.
 */

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));

const mockClient = {
  auth: {
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(),
  },
  from: vi.fn(() => ({ select: mockSelect })),
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => mockClient,
}));

const mockAuth = mockClient.auth as unknown as {
  signInWithOtp: ReturnType<typeof vi.fn>;
  verifyOtp: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/dev-login" element={<DevLoginPage />} />
          <Route path="/discover" element={<p>Discover screen</p>} />
          <Route path="/map" element={<p>Map screen</p>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAuth.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  mockAuth.verifyOtp.mockReset().mockResolvedValue({ error: null });
  mockAuth.getSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockMaybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('DevLoginPage', () => {
  it('runs the same two auth calls the phone/verify wizard does', async () => {
    renderAt('/dev-login?phone=1111111111&code=111111');

    await waitFor(() => {
      expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ phone: '+11111111111' });
    });
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      phone: '+11111111111',
      token: '111111',
      type: 'sms',
    });
  });

  it('lands on the default next screen, Discover, once signed in', async () => {
    renderAt('/dev-login?phone=1111111111&code=111111');
    expect(await screen.findByText('Discover screen')).toBeInTheDocument();
  });

  it('honors an explicit next param', async () => {
    renderAt('/dev-login?phone=1111111111&code=111111&next=/map');
    expect(await screen.findByText('Map screen')).toBeInTheDocument();
  });

  it('accepts a phone already in E.164 form without doubling the +1', async () => {
    renderAt('/dev-login?phone=%2B11111111111&code=111111');

    await waitFor(() => {
      expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({ phone: '+11111111111' });
    });
  });

  it('fails the same way the wizard would on a wrong code, and does not sign in', async () => {
    mockAuth.verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    renderAt('/dev-login?phone=1111111111&code=000000');

    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired or is invalid');
    expect(screen.queryByText('Discover screen')).not.toBeInTheDocument();
  });

  it('asks for both params rather than silently doing nothing', async () => {
    renderAt('/dev-login?phone=1111111111');

    expect(await screen.findByRole('alert')).toHaveTextContent(/pass phone and code/i);
    expect(mockAuth.signInWithOtp).not.toHaveBeenCalled();
  });
});
