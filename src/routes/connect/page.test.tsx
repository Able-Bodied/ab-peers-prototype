import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatProvider } from '@/lib/chat';
import ConnectPage from '@/routes/connect/page';
import type { ChatConversation, ChatLimits, ChatMember } from '@/types/domain';

const api = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchWaves: vi.fn(),
  fetchChatMembers: vi.fn(),
  fetchLimits: vi.fn(),
  fetchMessages: vi.fn(),
  sendWave: vi.fn(),
  respondToWave: vi.fn(),
  startConversation: vi.fn(),
  sendMessage: vi.fn(),
  retractMessage: vi.fn(),
  markConversationRead: vi.fn(),
  setConversationFlags: vi.fn(),
  blockMember: vi.fn(),
  unblockMember: vi.fn(),
  reportMember: vi.fn(),
  setOpenToMessages: vi.fn(),
  demoReply: vi.fn(),
  subscribeToMessages: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/chat-api', () => ({
  ...api,
  chatErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong. Try again.',
}));

const session: { member: { id: string } | null } = vi.hoisted(() => ({
  member: { id: 'viewer-1' },
}));

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    member: session.member,
    loading: false,
    refresh: vi.fn(),
    signOut: vi.fn(),
    deleteMember: vi.fn(),
  }),
}));

function chatMember(
  overrides: Partial<ChatMember> & Pick<ChatMember, 'id' | 'displayName'>,
): ChatMember {
  return {
    type: 'peer',
    photoUrl: null,
    city: 'San Jose',
    state: 'California',
    capacity: null,
    isSynthetic: false,
    isBot: false,
    disability: 'SCI - para',
    level: 'T6',
    ageBand: '30-39',
    duration: '3 - 10 years',
    interests: [],
    openToMessages: true,
    ...overrides,
  };
}

const ROSA = chatMember({ id: 'peer-1', displayName: 'Rosa Nunez' });
const MAYA = chatMember({
  id: 'mentor-1',
  displayName: 'Maya Ellis',
  type: 'mentor',
  capacity: 'open',
});
const DANA = chatMember({
  id: 'mentor-2',
  displayName: 'Dana Boyd',
  type: 'mentor',
  capacity: 'at capacity',
});
const QUIET = chatMember({ id: 'peer-2', displayName: 'Sam Okafor', openToMessages: false });

const LIMITS: ChatLimits = {
  waveDailyLimit: 20,
  wavesSentToday: 3,
  conversationDailyLimit: 5,
  conversationsStartedToday: 0,
};

function conversationWith(member: ChatMember, id: string): ChatConversation {
  return {
    id,
    kind: member.type === 'mentor' ? 'mentor' : 'peer',
    createdAt: '2026-08-18T10:00:00.000Z',
    lastMessageAt: '2026-08-18T10:05:00.000Z',
    lastReadAt: '2026-08-18T10:05:00.000Z',
    archived: false,
    muted: false,
    blocked: false,
    counterpart: member,
    unreadCount: 0,
    lastMessageBody: 'See you Thursday.',
    lastMessageSenderId: member.id,
  };
}

function renderConnect() {
  return render(
    <MemoryRouter initialEntries={['/connect']}>
      <ChatProvider>
        <Routes>
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/messages/:id" element={<p>Thread screen</p>} />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
  );
}

describe('ConnectPage', () => {
  beforeEach(() => {
    session.member = { id: 'viewer-1' };
    api.fetchConversations.mockReset().mockResolvedValue([]);
    api.fetchWaves.mockReset().mockResolvedValue([]);
    api.fetchChatMembers.mockReset().mockResolvedValue([ROSA, MAYA, DANA, QUIET]);
    api.fetchLimits.mockReset().mockResolvedValue(LIMITS);
    api.sendWave.mockReset().mockResolvedValue({ waveId: 'wave-1', conversationId: null });
    api.startConversation.mockReset().mockResolvedValue('conv-new');
  });

  it('points a signed-out visitor at sign-in', () => {
    session.member = null;
    renderConnect();

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('says a wave to an open mentor opens the conversation straight away', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Maya Ellis' }));

    expect(screen.getByText(/opens a conversation straight away/i)).toBeInTheDocument();
  });

  it('lands in the new thread when a wave to an open mentor opened one', async () => {
    api.sendWave.mockResolvedValue({ waveId: 'wave-1', conversationId: 'conv-7' });
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Maya Ellis' }));
    await user.click(screen.getByRole('button', { name: 'Send hello' }));

    expect(await screen.findByText('Thread screen')).toBeInTheDocument();
  });

  it('confirms a wave to a peer rather than opening a thread', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));
    expect(screen.getByText(/if they wave back, the conversation opens/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send hello' }));

    expect(await screen.findByText('Your hello is on its way')).toBeInTheDocument();
    expect(screen.queryByText('Thread screen')).not.toBeInTheDocument();
    expect(api.sendWave).toHaveBeenCalledWith('peer-1', null, null);
  });

  it('sends the topic and note a wave was given', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));
    await user.click(screen.getByRole('button', { name: 'Transfers' }));
    await user.click(screen.getByRole('button', { name: 'Send hello' }));

    expect(api.sendWave).toHaveBeenCalledWith(
      'peer-1',
      'Transfers',
      'Hi! I was hoping to ask you about Transfers.',
    );
  });

  it('refuses to wave a mentor who is at capacity, and says why', async () => {
    const user = userEvent.setup();
    renderConnect();

    expect(await screen.findByText('Dana Boyd')).toBeInTheDocument();
    expect(
      screen.getByText('This mentor is at capacity and is not taking new conversations right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Say hi to Dana Boyd' })).not.toBeInTheDocument();

    // And the row is inert — there is no compose panel behind it.
    await user.click(screen.getByText('Dana Boyd'));
    expect(screen.queryByRole('button', { name: 'Send hello' })).not.toBeInTheDocument();
  });

  it('refuses to wave somebody who has turned off unsolicited contact', async () => {
    renderConnect();

    expect(await screen.findByText('Sam Okafor')).toBeInTheDocument();
    expect(
      screen.getByText('This person is not accepting new messages right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Say hi to Sam Okafor' })).not.toBeInTheDocument();
  });

  it('refuses to wave once the daily allowance is spent, and says why', async () => {
    api.fetchLimits.mockResolvedValue({ ...LIMITS, wavesSentToday: 20 });
    const user = userEvent.setup();
    renderConnect();

    expect(await screen.findByText(/0 of 20 waves left today/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Say hi to Rosa Nunez' }));

    expect(screen.getByRole('button', { name: 'Send hello' })).toBeDisabled();
    expect(screen.getByText(/used up today's waves/i)).toBeInTheDocument();
    expect(api.sendWave).not.toHaveBeenCalled();
  });

  it('offers to open an existing conversation instead of waving again', async () => {
    api.fetchConversations.mockResolvedValue([conversationWith(ROSA, 'conv-3')]);
    renderConnect();

    const link = await screen.findByRole('link', {
      name: 'Open conversation with Rosa Nunez',
    });
    expect(link).toHaveAttribute('href', '/messages/conv-3');
    expect(screen.queryByRole('button', { name: 'Say hi to Rosa Nunez' })).not.toBeInTheDocument();
  });

  it('writes a first message and lands in the thread it created', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));
    await user.click(screen.getByRole('button', { name: 'Write a message' }));
    await user.type(screen.getByLabelText('Your message'), 'Hi Rosa, how did you find your chair?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Thread screen')).toBeInTheDocument();
    expect(api.startConversation).toHaveBeenCalledWith(
      'peer-1',
      'Hi Rosa, how did you find your chair?',
    );
  });

  it('refuses an empty first message', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));
    await user.click(screen.getByRole('button', { name: 'Write a message' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Write something first.')).toBeInTheDocument();
    expect(api.startConversation).not.toHaveBeenCalled();
  });

  it("shows the database's own sentence when a wave is refused", async () => {
    api.sendWave.mockRejectedValue(new Error('This mentor is at capacity.'));
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));
    await user.click(screen.getByRole('button', { name: 'Send hello' }));

    expect(await screen.findByText('This mentor is at capacity.')).toBeInTheDocument();
    expect(screen.queryByText('Your hello is on its way')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('This mentor is at capacity.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your hello is on its way')).not.toBeInTheDocument();
  });

  it('filters the list by name', async () => {
    const user = userEvent.setup();
    renderConnect();

    await screen.findByText('Rosa Nunez');
    await user.type(screen.getByLabelText('Search by name'), 'dana');

    expect(screen.getByText('Dana Boyd')).toBeInTheDocument();
    expect(screen.queryByText('Rosa Nunez')).not.toBeInTheDocument();
  });

  it('never offers to reveal a phone number or an email address', async () => {
    const user = userEvent.setup();
    renderConnect();

    await user.click(await screen.findByRole('button', { name: 'Say hi to Rosa Nunez' }));

    for (const forbidden of [/reveal/i, /phone/i, /email/i, /contact info/i]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});
