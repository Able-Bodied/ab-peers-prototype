import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MEMBERS, ORGS } from '@/mocks/seed';
import { MemberCard, type MemberCardProps } from '@/routes/discover/member-card';
import type { BrowseMember } from '@/types/domain';

/** Fixtures only — never invent a person (docs/PII.md). */
function fixture(id: string): BrowseMember {
  const member = MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`No fixture ${id}`);
  return member;
}

const orgName = (slug: string) => ORGS.find((o) => o.id === slug)?.name;

/**
 * Neve B. — peer, no photo, likes wheelchair tennis. `open_to_messages` is overridden on: the
 * seed fixture has it off, same as most of the demo peer population, but these tests are about
 * the wave button's own mechanics — a peer who is actually reachable is covered separately below.
 */
const peer: BrowseMember = { ...fixture('p_001'), openToMessages: true };
/** Elias B. — peer who shares wheelchair tennis with Neve. */
const otherPeer = fixture('p_002');
/** Ilse V. — mentor, verified by Triumph Foundation, capacity open. */
const openMentor = fixture('m_001');
/** Felix F. — mentor, at capacity. */
const busyMentor = fixture('m_003');
/** Andre H. — mentor, paused. */
const pausedMentor = fixture('m_005');

function renderCard(overrides: Partial<MemberCardProps> = {}) {
  const props: MemberCardProps = {
    member: peer,
    viewer: null,
    orgName,
    waved: false,
    sending: false,
    onWave: vi.fn(),
    onTopicSelect: vi.fn(),
    onOpenDetail: vi.fn(),
    ...overrides,
  };
  render(<MemberCard {...props} />);
  return props;
}

describe('MemberCard', () => {
  it('leads with the details that decide whether this is the right person', () => {
    renderCard({ member: peer });

    expect(screen.getByRole('heading', { name: 'Neve B.' })).toBeVisible();
    expect(screen.getByText(/TBI · Manual chair/)).toBeVisible();
    expect(screen.getByText(/60-69 · Salinas, California/)).toBeVisible();
    expect(screen.getByText('10+ years since injury')).toBeVisible();
    expect(screen.getByText(/Mostly here for the dogs crowd/)).toBeVisible();
  });

  it('shows a peer no organization or capacity badge', () => {
    renderCard({ member: peer });

    expect(screen.queryByText(/Verified by/)).not.toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });

  it('adds the verifying organization and the capacity badge on a mentor card', () => {
    renderCard({ member: openMentor });

    expect(screen.getByText('Verified by Triumph Foundation')).toBeVisible();
    expect(screen.getByText('Open')).toBeVisible();
  });

  it('fills the frame with an initials tile when there is no photo', () => {
    renderCard({ member: peer });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Neve B.' })).toBeVisible();
  });

  it('uses the photo and its alt text when there is one', () => {
    renderCard({
      member: { ...peer, photoUrl: 'https://example.test/p1.jpg', photoAlt: 'Outside in a chair' },
    });

    expect(screen.getByRole('img', { name: 'Outside in a chair' })).toBeVisible();
  });

  it('surfaces what the viewer and the member have in common', () => {
    renderCard({ member: peer, viewer: otherPeer });

    expect(screen.getByText('You both like Wheelchair tennis')).toBeVisible();
  });

  it('says nothing about shared interests when there is no viewer', () => {
    renderCard({ member: peer, viewer: null });

    expect(screen.queryByText(/You both like/)).not.toBeInTheDocument();
  });

  it('names the person in the wave button and calls onWave when tapped', async () => {
    const user = userEvent.setup();
    const props = renderCard({ member: peer });

    await user.click(screen.getByRole('button', { name: 'Say hi to Neve B.' }));

    expect(props.onWave).toHaveBeenCalledTimes(1);
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it('opens the profile from the card body without waving', async () => {
    const user = userEvent.setup();
    const props = renderCard({ member: peer });

    await user.click(screen.getByRole('button', { name: 'More about Neve B.' }));

    expect(props.onOpenDetail).toHaveBeenCalledTimes(1);
    expect(props.onWave).not.toHaveBeenCalled();
  });

  it('shows a settled state once waved, and stops asking', async () => {
    const user = userEvent.setup();
    const props = renderCard({ member: peer, waved: true });

    const button = screen.getByRole('button', { name: 'You said hi to Neve B.' });
    expect(screen.queryByRole('button', { name: 'Say hi to Neve B.' })).not.toBeInTheDocument();

    await user.click(button);
    expect(props.onWave).not.toHaveBeenCalled();
  });

  it('shows a pending state while the wave is in flight', () => {
    renderCard({ member: peer, sending: true });

    const button = screen.getByRole('button', { name: 'Sending hi to Neve B.' });
    expect(button).toBeDisabled();
  });

  it('filters the deck from a topic chip rather than sending anything', async () => {
    const user = userEvent.setup();
    const props = renderCard({ member: openMentor });

    await user.click(screen.getByRole('button', { name: /^Home modifications/ }));

    expect(props.onTopicSelect).toHaveBeenCalledWith('Home modifications');
    expect(props.onWave).not.toHaveBeenCalled();
    expect(props.onOpenDetail).not.toHaveBeenCalled();
  });

  it('is honest about a mentor who is at capacity but still reachable', () => {
    renderCard({ member: busyMentor });

    expect(screen.getByText('At capacity')).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Say hi to Felix F. — at capacity, may take a while to hear back',
      }),
    ).toBeVisible();
  });

  it('offers no wave at all on a peer who has turned off unsolicited contact', () => {
    // `chat_assert_contact_allowed()` refuses any wave, peer or mentor, once
    // `open_to_messages` is off — see contactPolicy() in member-card.tsx.
    renderCard({ member: { ...peer, openToMessages: false } });

    expect(screen.queryByRole('button', { name: /Say hi/ })).not.toBeInTheDocument();
    expect(screen.getByText('Neve B. is not taking new messages right now.')).toBeVisible();
  });

  it('offers no wave at all on a paused mentor', () => {
    renderCard({ member: pausedMentor });

    expect(screen.getByText('Paused')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Say hi/ })).not.toBeInTheDocument();
    expect(screen.getByText('Andre H. is not taking new messages right now.')).toBeVisible();
  });

  it('still lets the profile be opened for a paused mentor', async () => {
    const user = userEvent.setup();
    const props = renderCard({ member: pausedMentor });

    await user.click(screen.getByRole('button', { name: 'More about Andre H.' }));

    expect(props.onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
