import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { FollowsProvider, useFollows } from '@/lib/follows';

function Harness({ orgSlug = 'norcal-sci' }: { orgSlug?: string }) {
  const { isFollowing, toggleFollow } = useFollows();

  return (
    <div>
      <p>
        {orgSlug}: {isFollowing(orgSlug) ? 'following' : 'not following'}
      </p>
      <button
        type="button"
        onClick={() => {
          toggleFollow(orgSlug);
        }}
      >
        toggle {orgSlug}
      </button>
    </div>
  );
}

describe('FollowsProvider', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('starts with nothing followed', () => {
    render(
      <FollowsProvider>
        <Harness />
      </FollowsProvider>,
    );

    expect(screen.getByText('norcal-sci: not following')).toBeInTheDocument();
  });

  it('follows and unfollows on toggle', async () => {
    render(
      <FollowsProvider>
        <Harness />
      </FollowsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'toggle norcal-sci' }));
    expect(screen.getByText('norcal-sci: following')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'toggle norcal-sci' }));
    expect(screen.getByText('norcal-sci: not following')).toBeInTheDocument();
  });

  it('keeps separate state for separate organizations', async () => {
    render(
      <FollowsProvider>
        <Harness orgSlug="norcal-sci" />
        <Harness orgSlug="borp" />
      </FollowsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'toggle norcal-sci' }));

    expect(screen.getByText('norcal-sci: following')).toBeInTheDocument();
    expect(screen.getByText('borp: not following')).toBeInTheDocument();
  });

  it('shares one answer across everything showing that organization', async () => {
    render(
      <FollowsProvider>
        <Harness orgSlug="norcal-sci" />
        <Harness orgSlug="norcal-sci" />
      </FollowsProvider>,
    );

    expect(screen.getAllByText('norcal-sci: not following')).toHaveLength(2);

    const toggle = screen.getAllByRole('button', { name: 'toggle norcal-sci' })[0];
    if (!toggle) throw new Error('expected a toggle button');
    await userEvent.click(toggle);

    expect(screen.getAllByText('norcal-sci: following')).toHaveLength(2);
  });

  it('survives a reload via localStorage', async () => {
    const { unmount } = render(
      <FollowsProvider>
        <Harness />
      </FollowsProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'toggle norcal-sci' }));
    unmount();

    render(
      <FollowsProvider>
        <Harness />
      </FollowsProvider>,
    );

    expect(screen.getByText('norcal-sci: following')).toBeInTheDocument();
  });
});
