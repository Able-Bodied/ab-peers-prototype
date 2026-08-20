import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

// Proves the test harness (Vitest + Testing Library + jsdom) is wired up
// end to end, and doubles as a smoke test for the router shell. Test
// behavior (what the user sees/can do), not markup.
describe('App', () => {
  it('redirects to the onboarding flow by default when signed out', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A community of peers with disabilities.',
      }),
    ).toBeInTheDocument();
  });

  it('shows a sign-in prompt on the profile flow when signed out', async () => {
    // The nav's combined Join/Me tab shows Join while signed out, so profile
    // is only reachable directly here (a bookmark, a stale link, etc.).
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it.each([
    ['Discover', /^Discover/],
    ['Chats', /^Chats/],
    ['Activity', /^Activity/],
  ])('gates the %s flow behind a sign-in prompt when signed out', async (_name, linkName) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: linkName }));

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('has no Roster tab, but the coordinator dashboard route still resolves directly', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link', { name: /^Roster/ })).not.toBeInTheDocument();

    render(
      <MemoryRouter initialEntries={['/coordinator']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in required' }),
    ).toBeInTheDocument();
  });
});
