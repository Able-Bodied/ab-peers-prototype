import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { App } from '@/App';

// Proves the test harness (Vitest + Testing Library + jsdom) is wired up
// end to end, and doubles as a smoke test for the router shell. Test
// behavior (what the user sees/can do), not markup.
describe('App', () => {
  it('redirects to the onboarding flow by default', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeInTheDocument();
  });

  it('lets a user navigate to another flow from the sidebar', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /Mentor Map/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Mentor Map' })).toBeInTheDocument();
    // Mentor Map renders seed data, not just an empty skeleton.
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument();
  });

  it('renders the profile flow with seed mentor data', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Profile/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument();
  });

  it('renders the connect flow with the seed mentor name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /^Connect/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Connect' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument();
  });

  it('renders the coordinator dashboard with seed roster data', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: /Coordinator Dashboard/ }));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Coordinator Dashboard' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Priya Chandrasekaran')).toBeInTheDocument();
    // Roster table lists seed mentors.
    expect(screen.getByRole('cell', { name: 'Jordan Rivera' })).toBeInTheDocument();
  });
});
