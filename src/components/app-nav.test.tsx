import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { AppNav, navItems } from '@/components/app-nav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav />
    </MemoryRouter>,
  );
}

describe('AppNav', () => {
  it('offers every destination once, whatever the viewport', () => {
    renderAt('/map');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const item of navItems) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${item.label}`) })).toHaveAttribute(
        'href',
        item.to,
      );
    }
    expect(within(nav).getAllByRole('link')).toHaveLength(navItems.length);
  });

  it('marks the destination for the current route as the current page', () => {
    renderAt('/events');

    expect(screen.getByRole('link', { name: /^Events/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^Discover/ })).not.toHaveAttribute('aria-current');
  });
});
