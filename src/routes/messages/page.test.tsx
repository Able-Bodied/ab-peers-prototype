import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatProvider } from '@/lib/chat';
import type { AccountMember } from '@/lib/session';
import MessagesPage from '@/routes/messages/page';
import type { ChatConversation, ChatMessage, ChatWave } from '@/types/domain';

/**
 * The data layer is mocked at '@/lib/chat-api' rather than at the network, so these tests exercise
 * the real ChatProvider — the optimistic send, the message cache and the read cursor are part of
 * what the page's behaviour is, and a fake provider would only assert that the fake works.
 */

const VIEWER_ID = 'viewer-1';
const NOW = new Date('2026-08-19T15:00:00.000Z');
const TODAY = '2026-08-19T14:00:00.000Z';
const YESTERDAY = '2026-08-18T14:00:00.000Z';

const viewer: AccountMember = {
  id: VIEWER_ID,
  type: 'peer',
  displayName: 'Jamie',
  phone: '+15555550100',
  ageBand: '30-39',
  disability: 'SCI - para',
  level: 'T6',
  duration: '3 - 10 years',
  city: 'San Jose',
  state: 'California',
  interests: ['Reading'],
  photoUrl: null,
};

function counterpart(id: string, displayName: string, type: 'peer' | 'mentor') {
  return {
    id,
    displayName,
    photoUrl: null,
    type,
    city: 'Denver',
    state: 'Colorado' as const,
    capacity: type === 'mentor' ? ('open' as const) : null,
    isSynthetic: false,
  };
}

/** Mutable so a test can let an action change what the next refresh returns. */
let conversations: ChatConversation[] = [];
let waves: ChatWave[] = [];
let messagesByConversation: Record<string, ChatMessage[]> = {};

const fetchConversations = vi.fn(() => Promise.resolve(conversations));
const fetchWaves = vi.fn(() => Promise.resolve(waves));
const fetchChatMembers = vi.fn(() => Promise.resolve([]));
const fetchLimits = vi.fn(() =>
  Promise.resolve({
    waveDailyLimit: 20,
    wavesSentToday: 0,
    conversationDailyLimit: 5,
    conversationsStartedToday: 0,
  }),
);
const fetchMessages = vi.fn((conversationId: string) =>
  Promise.resolve(messagesByConversation[conversationId] ?? []),
);
const sendMessage = vi.fn((conversationId: string, senderId: string, body: string) =>
  Promise.resolve({
    id: `saved-${body}`,
    conversationId,
    senderId,
    body,
    createdAt: TODAY,
    deletedAt: null,
  }),
);
const respondToWave = vi.fn((_waveId: string, _accept: boolean) =>
  Promise.resolve<string | null>(null),
);
const markConversationRead = vi.fn((_id: string, _memberId: string, _upTo: string) =>
  Promise.resolve(),
);
const subscribeToMessages = vi.fn((_handler: unknown) => () => undefined);

vi.mock('@/lib/chat-api', () => ({
  chatErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  fetchConversations: () => fetchConversations(),
  fetchWaves: () => fetchWaves(),
  fetchChatMembers: () => fetchChatMembers(),
  fetchLimits: () => fetchLimits(),
  fetchMessages: (id: string) => fetchMessages(id),
  sendMessage: (id: string, senderId: string, body: string) => sendMessage(id, senderId, body),
  retractMessage: () => Promise.resolve(),
  sendWave: () => Promise.resolve({ waveId: 'w', conversationId: null }),
  respondToWave: (waveId: string, accept: boolean) => respondToWave(waveId, accept),
  startConversation: () => Promise.resolve('conv-new'),
  markConversationRead: (id: string, memberId: string, upTo: string) =>
    markConversationRead(id, memberId, upTo),
  setConversationFlags: () => Promise.resolve(),
  blockMember: () => Promise.resolve(),
  unblockMember: () => Promise.resolve(),
  reportMember: () => Promise.resolve(),
  demoReply: () => Promise.resolve(),
  subscribeToMessages: (handler: unknown) => subscribeToMessages(handler),
}));

let sessionMember: AccountMember | null = viewer;

vi.mock('@/lib/session', () => ({
  useSession: () => ({
    member: sessionMember,
    loading: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    deleteMember: () => Promise.resolve(),
  }),
}));

function renderMessages(path = '/messages') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <Routes>
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:conversationId" element={<MessagesPage />} />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
  );
}

function setupUser() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe('MessagesPage', () => {
  beforeEach(() => {
    // Day separators say "Today" and "Yesterday", which are only stable against a fixed clock.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);

    sessionMember = viewer;
    conversations = [
      {
        id: 'conv-1',
        kind: 'mentor',
        createdAt: YESTERDAY,
        lastMessageAt: TODAY,
        lastReadAt: YESTERDAY,
        archived: false,
        muted: false,
        blocked: false,
        counterpart: counterpart('dana-1', 'Dana Ruiz', 'mentor'),
        unreadCount: 2,
        lastMessageBody: 'How did the transfer training go?',
        lastMessageSenderId: 'dana-1',
      },
      {
        id: 'conv-2',
        kind: 'peer',
        createdAt: YESTERDAY,
        lastMessageAt: YESTERDAY,
        lastReadAt: TODAY,
        archived: false,
        muted: false,
        blocked: true,
        counterpart: counterpart('sam-1', 'Sam Okafor', 'peer'),
        unreadCount: 0,
        lastMessageBody: 'See you around.',
        lastMessageSenderId: 'sam-1',
      },
    ];
    waves = [
      {
        id: 'wave-in-1',
        direction: 'inbox',
        status: 'pending',
        topic: 'Transfers',
        message: 'Saw you ride the same chair I just ordered.',
        createdAt: TODAY,
        conversationId: null,
        counterpart: counterpart('ellis-1', 'Ellis Nakamura', 'peer'),
      },
      {
        id: 'wave-out-1',
        direction: 'outbox',
        status: 'pending',
        topic: 'Returning to work',
        message: null,
        createdAt: YESTERDAY,
        conversationId: null,
        counterpart: counterpart('rae-1', 'Rae Whitfield', 'mentor'),
      },
    ];
    messagesByConversation = {
      'conv-1': [
        {
          id: 'm-1',
          conversationId: 'conv-1',
          senderId: 'dana-1',
          body: 'Glad you got in touch.',
          createdAt: YESTERDAY,
          deletedAt: null,
        },
        {
          id: 'm-2',
          conversationId: 'conv-1',
          senderId: VIEWER_ID,
          body: 'Thanks for reaching out.',
          createdAt: TODAY,
          deletedAt: null,
        },
        {
          id: 'm-3',
          conversationId: 'conv-1',
          senderId: 'dana-1',
          body: 'Please pretend I never said this',
          createdAt: TODAY,
          deletedAt: TODAY,
        },
      ],
      'conv-2': [
        {
          id: 'm-4',
          conversationId: 'conv-2',
          senderId: 'sam-1',
          body: 'See you around.',
          createdAt: YESTERDAY,
          deletedAt: null,
        },
      ],
    };

    respondToWave.mockReset().mockResolvedValue(null);
    markConversationRead.mockClear();
    sendMessage.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a conversation with its preview and unread count', async () => {
    renderMessages();

    expect(await screen.findByText('Dana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('How did the transfer training go?')).toBeInTheDocument();
    expect(screen.getByText('2 unread messages')).toBeInTheDocument();
  });

  it('opens a thread, groups its messages by day, and marks it read', async () => {
    const user = setupUser();
    renderMessages();

    await user.click(await screen.findByRole('button', { name: /Dana Ruiz/ }));

    const thread = await screen.findByRole('region', { name: 'Conversation with Dana Ruiz' });
    expect(within(thread).getByText('Yesterday')).toBeInTheDocument();
    expect(within(thread).getByText('Today')).toBeInTheDocument();
    expect(within(thread).getByText('Glad you got in touch.')).toBeInTheDocument();
    expect(within(thread).getByText('Thanks for reaching out.')).toBeInTheDocument();

    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith('conv-1', VIEWER_ID, TODAY);
    });
  });

  it('shows a sent message straight away', async () => {
    const user = setupUser();
    renderMessages('/messages/conv-1');

    const thread = await screen.findByRole('region', { name: 'Conversation with Dana Ruiz' });
    await user.type(within(thread).getByLabelText('Message Dana Ruiz'), 'That went really well.');
    await user.click(within(thread).getByRole('button', { name: 'Send message to Dana Ruiz' }));

    expect(await within(thread).findByText('That went really well.')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith('conv-1', VIEWER_ID, 'That went really well.');
  });

  it('hides the body of a retracted message', async () => {
    renderMessages('/messages/conv-1');

    const thread = await screen.findByRole('region', { name: 'Conversation with Dana Ruiz' });
    expect(await within(thread).findByText('Message removed')).toBeInTheDocument();
    expect(within(thread).queryByText('Please pretend I never said this')).not.toBeInTheDocument();
  });

  it('opens the conversation created by waving back', async () => {
    respondToWave.mockImplementation(() => {
      conversations = [
        ...conversations,
        {
          id: 'conv-3',
          kind: 'peer',
          createdAt: TODAY,
          lastMessageAt: TODAY,
          lastReadAt: TODAY,
          archived: false,
          muted: false,
          blocked: false,
          counterpart: counterpart('ellis-1', 'Ellis Nakamura', 'peer'),
          unreadCount: 0,
          lastMessageBody: null,
          lastMessageSenderId: null,
        },
      ];
      waves = waves.filter((wave) => wave.id !== 'wave-in-1');
      return Promise.resolve('conv-3');
    });

    const user = setupUser();
    renderMessages();

    await user.click(await screen.findByRole('tab', { name: /Waves/ }));
    expect(await screen.findByText('Asked about: Transfers')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wave back at Ellis Nakamura' }));

    expect(respondToWave).toHaveBeenCalledWith('wave-in-1', true);
    expect(
      await screen.findByRole('region', { name: 'Conversation with Ellis Nakamura' }),
    ).toBeInTheDocument();
  });

  it('keeps a wave in the inbox when waving back fails', async () => {
    respondToWave.mockRejectedValue(new Error('That wave is no longer available.'));

    const user = setupUser();
    renderMessages();

    await user.click(await screen.findByRole('tab', { name: /Waves/ }));
    await user.click(await screen.findByRole('button', { name: 'Wave back at Ellis Nakamura' }));

    // A failure says so and changes nothing; a decline would have quietly
    // removed the wave instead.
    expect(await screen.findByText('That wave is no longer available.')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Conversation with Ellis Nakamura' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wave back at Ellis Nakamura' })).toBeEnabled();
  });

  it('reads a sent wave as waiting, and never as declined', async () => {
    const user = setupUser();
    renderMessages();

    await user.click(await screen.findByRole('tab', { name: /Waves/ }));

    expect(await screen.findByText('Waiting to hear back')).toBeInTheDocument();
    expect(screen.getByText('Rae Whitfield')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/declin/i);
  });

  it('offers no composer in a blocked conversation', async () => {
    renderMessages('/messages/conv-2');

    const thread = await screen.findByRole('region', { name: 'Conversation with Sam Okafor' });
    expect(within(thread).queryByLabelText('Message Sam Okafor')).not.toBeInTheDocument();
    expect(within(thread).getByRole('button', { name: 'Unblock Sam Okafor' })).toBeInTheDocument();
  });

  it('points a signed-out visitor at sign-in', async () => {
    sessionMember = null;
    renderMessages();

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
