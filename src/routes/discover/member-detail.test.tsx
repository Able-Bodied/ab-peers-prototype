import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MEMBERS, ORGS } from '@/mocks/seed';
import { MemberDetail, type MemberDetailProps } from '@/routes/discover/member-detail';
import type { BrowseMember, Topic } from '@/types/domain';

/** Fixtures only — never invent a person (docs/PII.md). */
function fixture(id: string): BrowseMember {
  const member = MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`No fixture ${id}`);
  return member;
}

const orgName = (slug: string) => ORGS.find((o) => o.id === slug)?.name;

const peer = fixture('p_001');
const otherPeer = fixture('p_002');
/** Ilse V. — mentor, verified by Triumph Foundation, capacity open. */
const openMentor = fixture('m_001');
/** Andre H. — mentor, paused. */
const pausedMentor = fixture('m_005');

function renderDetail(overrides: Partial<MemberDetailProps> = {}) {
  const props: MemberDetailProps = {
    member: openMentor,
    viewer: null,
    orgName,
    waved: false,
    sending: false,
    onWave: vi.fn(),
    onTopicSelect: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<MemberDetail {...props} />);
  return props;
}

describe('MemberDetail', () => {
  it('renders nothing until there is a member to show', () => {
    renderDetail({ member: null });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the whole profile the card had to truncate', () => {
    renderDetail({ member: openMentor });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Ilse V.' })).toBeVisible();
    expect(within(dialog).getByText(/50-59 · Fort Collins, Colorado/)).toBeVisible();
    expect(within(dialog).getByText('Since birth')).toBeVisible();
    expect(within(dialog).getByText(/I know the caregiver, benefits/)).toBeVisible();
    expect(within(dialog).getByText('Spanish')).toBeVisible();
    expect(within(dialog).getByText('N/A - not a wheelchair user')).toBeVisible();
    expect(within(dialog).getByText(/Student · Lives with my husband/)).toBeVisible();
    expect(within(dialog).getByText('Verified by Triumph Foundation')).toBeVisible();
    expect(within(dialog).getByText('Open to new people')).toBeVisible();
  });

  it('never renders a phone number or a birth date, even when handed a full member row', () => {
    // BrowseMember omits both fields, so this can only regress by someone widening the prop type.
    // The seeded row is passed whole to prove nothing leaks through structurally.
    const withPrivateFields = MEMBERS.find((m) => m.id === 'p_001');
    if (!withPrivateFields) throw new Error('No fixture p_001');
    renderDetail({ member: withPrivateFields });

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent(withPrivateFields.phone);
    expect(dialog).not.toHaveTextContent(withPrivateFields.birthDate);
    expect(dialog).not.toHaveTextContent('1961');
  });

  it('fills the header with an initials tile when there is no photo', () => {
    renderDetail({ member: peer });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Neve B.' })).toBeVisible();
  });

  it('uses the photo and its alt text when there is one', () => {
    renderDetail({
      member: { ...peer, photoUrl: 'https://example.test/p1.jpg', photoAlt: 'Outside in a chair' },
    });

    expect(screen.getByRole('img', { name: 'Outside in a chair' })).toBeVisible();
  });

  it('surfaces what the viewer and the member have in common', () => {
    renderDetail({ member: peer, viewer: otherPeer });

    expect(screen.getByText('You both like Wheelchair tennis')).toBeVisible();
  });

  it('filters the deck from an "Ask me about" chip instead of sending a message', async () => {
    const user = userEvent.setup();
    const props = renderDetail({ member: openMentor });

    await user.click(screen.getByRole('button', { name: /^Grants & funding/ }));

    expect(props.onTopicSelect).toHaveBeenCalledWith('Grants & funding');
    expect(props.onWave).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('shows a free-text topic without making it tappable', () => {
    // Imported profiles keep the mentor's own wording, which matches nobody (PRD §8.2).
    const freeText = 'moving back in with family after injury' as Topic;
    renderDetail({ member: { ...openMentor, topics: ['Transfers', freeText] } });

    expect(screen.getByRole('button', { name: /^Transfers/ })).toBeVisible();
    expect(screen.getByText(freeText)).toBeVisible();
    expect(screen.queryByRole('button', { name: new RegExp(`^${freeText}`) })).toBeNull();
  });

  it('offers the wave, naming the person', async () => {
    const user = userEvent.setup();
    const props = renderDetail({ member: openMentor });

    await user.click(screen.getByRole('button', { name: 'Say hi to Ilse V.' }));

    expect(props.onWave).toHaveBeenCalledTimes(1);
  });

  it('shows a settled state once waved, and stops asking', async () => {
    const user = userEvent.setup();
    const props = renderDetail({ member: openMentor, waved: true });

    await user.click(screen.getByRole('button', { name: 'You said hi to Ilse V.' }));

    expect(props.onWave).not.toHaveBeenCalled();
  });

  it('shows a pending state while the wave is in flight', () => {
    renderDetail({ member: openMentor, sending: true });

    expect(screen.getByRole('button', { name: 'Sending hi to Ilse V.' })).toBeDisabled();
  });

  it('does not present contact as available for a paused mentor', () => {
    renderDetail({ member: pausedMentor });

    expect(screen.getByText('Paused — not taking new contact right now')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Say hi/ })).not.toBeInTheDocument();
    expect(screen.getByText('Andre H. is not taking new messages right now.')).toBeVisible();
  });

  it('closes through the dialog close control', async () => {
    const user = userEvent.setup();
    const props = renderDetail({ member: openMentor });

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});
