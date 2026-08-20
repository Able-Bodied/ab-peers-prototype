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

  it('lets a user navigate to another flow from the nav', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Discover/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Mentor Map' })).toBeInTheDocument();
    // Mentor Map renders seed data, not just an empty skeleton.
    expect(screen.getByText('Ilse V.')).toBeInTheDocument();
  });

  it('shows a sign-in prompt on the profile flow when signed out', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Me/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('renders the connect flow with the seed mentor name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Chats/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByText('Ilse V.')).toBeInTheDocument();
  });

  it('renders the coordinator dashboard with seed roster data', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Roster/ }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Coordinator Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Craig Hospital')).toBeInTheDocument();
    // Roster table lists seed mentors.
    expect(screen.getByRole('cell', { name: 'Ilse V.' })).toBeInTheDocument();
  });
});
