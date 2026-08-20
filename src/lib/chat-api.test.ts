import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import {
  chatErrorMessage,
  fetchChatMembers,
  fetchConversations,
  fetchLimits,
  fetchMessages,
  fetchWaves,
  markConversationRead,
  respondToWave,
  sendWave,
  startConversation,
  subscribeToMessages,
} from '@/lib/chat-api';
import type { ChatMessage } from '@/types/domain';

/* ------------------------------------------------------------- fake client */

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

type BuilderFn = Mock<(...args: unknown[]) => FakeBuilder>;

/**
 * Just enough of PostgREST's builder to satisfy the chains this module writes:
 * every method hands the same object back, and the object is itself the promise
 * the chain is awaited as, so `.select().eq().order()` and `.update().eq().eq()`
 * both work without knowing which link is the last one.
 */
interface FakeBuilder extends Promise<QueryResult> {
  select: BuilderFn;
  insert: BuilderFn;
  update: BuilderFn;
  delete: BuilderFn;
  eq: BuilderFn;
  order: BuilderFn;
  single: BuilderFn;
}

function createBuilder(result: QueryResult): FakeBuilder {
  const builder = Promise.resolve(result) as FakeBuilder;
  const chain = (..._args: unknown[]): FakeBuilder => builder;
  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.single = vi.fn(chain);
  return builder;
}

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

interface FakeChannel {
  on: Mock<(event: string, filter: Record<string, unknown>, handler: ChangeHandler) => FakeChannel>;
  subscribe: Mock<() => FakeChannel>;
}

let tableResult: QueryResult = { data: [], error: null };
let rpcResult: QueryResult = { data: null, error: null };
let lastBuilder: FakeBuilder | null = null;
let lastHandler: ChangeHandler | null = null;

const fromSpy = vi.fn((_table: string): FakeBuilder => {
  lastBuilder = createBuilder(tableResult);
  return lastBuilder;
});

const rpcSpy = vi.fn(
  (_name: string, _params?: Record<string, unknown>): Promise<QueryResult> =>
    Promise.resolve(rpcResult),
);

const fakeChannel: FakeChannel = {
  on: vi.fn((_event, _filter, handler) => {
    lastHandler = handler;
    return fakeChannel;
  }),
  subscribe: vi.fn(() => fakeChannel),
};

const channelSpy = vi.fn((_name: string): FakeChannel => fakeChannel);
const removeChannelSpy = vi.fn((_channel: FakeChannel): Promise<string> => Promise.resolve('ok'));

const fakeClient = {
  from: fromSpy,
  rpc: rpcSpy,
  channel: channelSpy,
  removeChannel: removeChannelSpy,
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => fakeClient,
}));

/** The builder the module last asked for, for asserting what it sent. */
function builder(): FakeBuilder {
  if (!lastBuilder) throw new Error('No query was made.');
  return lastBuilder;
}

/* ------------------------------------------------------------------- rows */

/**
 * Realistic view rows, plus `phone` and `birth_date` that the views do not
 * actually select. They are here so the mapping tests can prove the domain
 * shapes drop them even if a view ever started handing them over.
 */
const counterpartColumns = {
  counterpart_id: 'm-2',
  counterpart_name: 'Rowan Fakename',
  counterpart_photo_url: null,
  counterpart_type: 'mentor',
  counterpart_city: 'Denver',
  counterpart_state: 'Colorado',
  counterpart_capacity: 'open',
  counterpart_is_synthetic: true,
  counterpart_is_bot: false,
  phone: '+15555550123',
  birth_date: '1990-04-02',
};

const conversationRow = {
  ...counterpartColumns,
  id: 'c-1',
  kind: 'mentor',
  created_at: '2026-08-10T15:00:00.000Z',
  last_message_at: '2026-08-19T09:30:00.000Z',
  last_read_at: '2026-08-19T09:00:00.000Z',
  archived: false,
  muted: false,
  blocked: false,
  // Sent as a string on purpose: `unread_count` is a bigint `count(*)`, and the
  // mapper's `Number()` is what keeps the badge arithmetic from concatenating.
  unread_count: '2',
  last_message_body: 'Are you around Thursday?',
  last_message_sender_id: 'm-2',
};

const waveRow = {
  ...counterpartColumns,
  id: 'w-1',
  direction: 'inbox',
  status: 'pending',
  topic: 'Bowel program',
  message: 'Hi, could I ask you about this?',
  created_at: '2026-08-19T08:00:00.000Z',
  conversation_id: null,
};

const messageRow = {
  id: 'msg-1',
  conversation_id: 'c-1',
  sender_id: 'm-2',
  body: 'Are you around Thursday?',
  created_at: '2026-08-19T09:30:00.000Z',
  deleted_at: null,
};

const chatMemberRow = {
  id: 'm-2',
  type: 'mentor',
  display_name: 'Rowan Fakename',
  photo_url: null,
  city: 'Denver',
  state: 'Colorado',
  disability: 'SCI - para',
  level: 'T6',
  age_band: '30-39',
  duration: '3 - 10 years',
  interests: ['Reading', 'Handcycling'],
  capacity: 'open',
  open_to_messages: true,
  is_synthetic: true,
  is_bot: false,
  phone: '+15555550123',
  birth_date: '1990-04-02',
};

const expectedCounterpart = {
  id: 'm-2',
  displayName: 'Rowan Fakename',
  photoUrl: null,
  type: 'mentor',
  city: 'Denver',
  state: 'Colorado',
  capacity: 'open',
  isSynthetic: true,
  isBot: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  tableResult = { data: [], error: null };
  rpcResult = { data: null, error: null };
  lastBuilder = null;
  lastHandler = null;
});

/* ------------------------------------------------------------------ tests */

describe('chatErrorMessage', () => {
  it('drops a Postgres ERROR prefix and keeps the sentence behind it', () => {
    expect(chatErrorMessage({ message: 'ERROR:  That member does not exist.' })).toBe(
      'That member does not exist.',
    );
  });

  it('drops a prefixed severity and function name too', () => {
    expect(
      chatErrorMessage({
        message: 'send_wave error: You cannot start a conversation with yourself.',
      }),
    ).toBe('You cannot start a conversation with yourself.');
  });

  it('falls back to something generic when there is no message at all', () => {
    expect(chatErrorMessage({ message: '' })).toBe('Something went wrong. Try again.');
    expect(chatErrorMessage({})).toBe('Something went wrong. Try again.');
    expect(chatErrorMessage(null)).toBe('Something went wrong. Try again.');
    expect(chatErrorMessage(undefined)).toBe('Something went wrong. Try again.');
    expect(chatErrorMessage('a bare string is not an error object')).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('hides a raw constraint violation behind the generic message', () => {
    expect(
      chatErrorMessage({
        message:
          'duplicate key value violates unique constraint "conversations_member_low_member_high_key"',
      }),
    ).toBe('Something went wrong. Try again.');
    expect(
      chatErrorMessage({
        message: 'new row for relation "messages" violates check constraint "messages_body_check"',
      }),
    ).toBe('Something went wrong. Try again.');
  });

  it('hides transport and auth noise behind the generic message', () => {
    expect(chatErrorMessage({ message: 'TypeError: Failed to fetch' })).toBe(
      'Something went wrong. Try again.',
    );
    expect(chatErrorMessage({ message: 'NetworkError when attempting to fetch a resource.' })).toBe(
      'Something went wrong. Try again.',
    );
    expect(chatErrorMessage({ message: 'JWT expired' })).toBe('Something went wrong. Try again.');
  });

  it('shows a human sentence exactly as the database wrote it', () => {
    expect(
      chatErrorMessage({
        message: 'This mentor is at capacity and is not taking new conversations right now.',
      }),
    ).toBe('This mentor is at capacity and is not taking new conversations right now.');
  });

  // Every `raise exception` in supabase/migrations/*_chat_messaging.sql, verbatim.
  // These sentences are written for the member to read, so the whole job of this
  // function is to not touch them.
  const DATABASE_SENTENCES = [
    'You must be signed in to do that.',
    'You cannot start a conversation with yourself.',
    'That member does not exist.',
    'This person is not accepting new messages right now.',
    'This mentor is at capacity and is not taking new conversations right now.',
    'This mentor is paused and is not taking new conversations right now.',
    'You already have a conversation with this person.',
    'You have already waved at this person. Give them a chance to answer.',
    "You have reached today's limit of 20 waves. Try again tomorrow.",
    'That wave is not yours to answer.',
    'You have already answered this wave.',
    'A first message cannot be empty.',
    'You have started as many new conversations as you can today. Try again tomorrow.',
    'You cannot block yourself.',
    'That conversation is not yours.',
    'demo_reply only works with synthetic demo profiles.',
  ];

  it.each(DATABASE_SENTENCES)('passes through the database sentence: %s', (sentence) => {
    expect(chatErrorMessage({ message: sentence })).toBe(sentence);
  });
});

describe('fetchConversations', () => {
  it('reads the conversations view, newest thread first', async () => {
    tableResult = { data: [conversationRow], error: null };

    await fetchConversations();

    expect(fromSpy).toHaveBeenCalledWith('chat_conversations');
    expect(builder().order).toHaveBeenCalledWith('last_message_at', { ascending: false });
  });

  it('turns a view row into a conversation with its counterpart nested', async () => {
    tableResult = { data: [conversationRow], error: null };

    const conversations = await fetchConversations();

    expect(conversations).toEqual([
      {
        id: 'c-1',
        kind: 'mentor',
        createdAt: '2026-08-10T15:00:00.000Z',
        lastMessageAt: '2026-08-19T09:30:00.000Z',
        lastReadAt: '2026-08-19T09:00:00.000Z',
        archived: false,
        muted: false,
        blocked: false,
        counterpart: expectedCounterpart,
        unreadCount: 2,
        lastMessageBody: 'Are you around Thursday?',
        lastMessageSenderId: 'm-2',
      },
    ]);
  });

  it('counts unread as a number even though the view sends a bigint string', async () => {
    tableResult = { data: [conversationRow], error: null };

    const conversations = await fetchConversations();

    expect(conversations[0]?.unreadCount).toBe(2);
  });

  it('never carries a phone number or a birth date into a conversation', async () => {
    tableResult = { data: [conversationRow], error: null };

    const conversations = await fetchConversations();

    expect(conversations[0]).not.toHaveProperty('phone');
    expect(conversations[0]).not.toHaveProperty('birthDate');
    expect(conversations[0]?.counterpart).not.toHaveProperty('phone');
    expect(conversations[0]?.counterpart).not.toHaveProperty('birthDate');
  });

  it('rejects with whatever the database refused with', async () => {
    tableResult = {
      data: null,
      error: { message: 'permission denied for view chat_conversations' },
    };

    await expect(fetchConversations()).rejects.toThrow(
      'permission denied for view chat_conversations',
    );
  });
});

describe('fetchWaves', () => {
  it('reads the waves view, newest wave first', async () => {
    tableResult = { data: [waveRow], error: null };

    await fetchWaves();

    expect(fromSpy).toHaveBeenCalledWith('chat_waves');
    expect(builder().order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('turns a view row into a wave with its counterpart nested', async () => {
    tableResult = { data: [waveRow], error: null };

    const waves = await fetchWaves();

    expect(waves).toEqual([
      {
        id: 'w-1',
        direction: 'inbox',
        status: 'pending',
        topic: 'Bowel program',
        message: 'Hi, could I ask you about this?',
        createdAt: '2026-08-19T08:00:00.000Z',
        conversationId: null,
        counterpart: expectedCounterpart,
      },
    ]);
  });

  it('never carries a phone number or a birth date into a wave', async () => {
    tableResult = { data: [waveRow], error: null };

    const waves = await fetchWaves();

    expect(waves[0]).not.toHaveProperty('phone');
    expect(waves[0]?.counterpart).not.toHaveProperty('phone');
    expect(waves[0]?.counterpart).not.toHaveProperty('birthDate');
  });

  it('rejects with whatever the database refused with', async () => {
    tableResult = { data: null, error: { message: 'permission denied for view chat_waves' } };

    await expect(fetchWaves()).rejects.toThrow('permission denied for view chat_waves');
  });
});

describe('fetchMessages', () => {
  it('asks for one conversation, oldest message first', async () => {
    tableResult = { data: [messageRow], error: null };

    await fetchMessages('c-1');

    expect(fromSpy).toHaveBeenCalledWith('messages');
    expect(builder().eq).toHaveBeenCalledWith('conversation_id', 'c-1');
    expect(builder().order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('turns a message row into the domain shape', async () => {
    tableResult = { data: [messageRow], error: null };

    const messages = await fetchMessages('c-1');

    expect(messages).toEqual([
      {
        id: 'msg-1',
        conversationId: 'c-1',
        senderId: 'm-2',
        body: 'Are you around Thursday?',
        createdAt: '2026-08-19T09:30:00.000Z',
        deletedAt: null,
      },
    ]);
  });

  it('keeps the retraction timestamp on a message that was taken back', async () => {
    tableResult = {
      data: [{ ...messageRow, deleted_at: '2026-08-19T09:31:00.000Z' }],
      error: null,
    };

    const messages = await fetchMessages('c-1');

    expect(messages[0]?.deletedAt).toBe('2026-08-19T09:31:00.000Z');
  });

  it('rejects with whatever the database refused with', async () => {
    tableResult = { data: null, error: { message: 'permission denied for table messages' } };

    await expect(fetchMessages('c-1')).rejects.toThrow('permission denied for table messages');
  });
});

describe('fetchChatMembers', () => {
  it('reads the members view in name order', async () => {
    tableResult = { data: [chatMemberRow], error: null };

    await fetchChatMembers();

    expect(fromSpy).toHaveBeenCalledWith('chat_members');
    expect(builder().order).toHaveBeenCalledWith('display_name', { ascending: true });
  });

  it('turns a member row into the domain shape', async () => {
    tableResult = { data: [chatMemberRow], error: null };

    const members = await fetchChatMembers();

    expect(members).toEqual([
      {
        id: 'm-2',
        type: 'mentor',
        displayName: 'Rowan Fakename',
        photoUrl: null,
        city: 'Denver',
        state: 'Colorado',
        disability: 'SCI - para',
        level: 'T6',
        ageBand: '30-39',
        duration: '3 - 10 years',
        interests: ['Reading', 'Handcycling'],
        capacity: 'open',
        openToMessages: true,
        isSynthetic: true,
        isBot: false,
      },
    ]);
  });

  it('never carries a phone number or a birth date into a member', async () => {
    tableResult = { data: [chatMemberRow], error: null };

    const members = await fetchChatMembers();

    expect(members[0]).not.toHaveProperty('phone');
    expect(members[0]).not.toHaveProperty('birthDate');
  });

  it('rejects with whatever the database refused with', async () => {
    tableResult = { data: null, error: { message: 'permission denied for view chat_members' } };

    await expect(fetchChatMembers()).rejects.toThrow('permission denied for view chat_members');
  });
});

describe('fetchLimits', () => {
  it('returns the caps the database reports, already in domain casing', async () => {
    rpcResult = {
      data: {
        waveDailyLimit: 20,
        wavesSentToday: 3,
        conversationDailyLimit: 10,
        conversationsStartedToday: 1,
      },
      error: null,
    };

    const limits = await fetchLimits();

    // Second argument is the parameter bag, which this RPC does not take.
    expect(rpcSpy).toHaveBeenCalledWith('chat_limits', undefined);
    expect(limits).toEqual({
      waveDailyLimit: 20,
      wavesSentToday: 3,
      conversationDailyLimit: 10,
      conversationsStartedToday: 1,
    });
  });
});

describe('markConversationRead', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The point of taking a timestamp rather than reading the clock: a client
  // running fast would otherwise mark messages read that nobody has seen.
  it('sends the timestamp it was given rather than the current clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));

    await markConversationRead('c-1', 'm-1', '2026-08-19T09:30:00.000Z');

    expect(fromSpy).toHaveBeenCalledWith('conversation_members');
    expect(builder().update).toHaveBeenCalledWith({ last_read_at: '2026-08-19T09:30:00.000Z' });
  });

  it('moves the cursor for one member of one conversation', async () => {
    await markConversationRead('c-1', 'm-1', '2026-08-19T09:30:00.000Z');

    expect(builder().eq).toHaveBeenCalledWith('conversation_id', 'c-1');
    expect(builder().eq).toHaveBeenCalledWith('member_id', 'm-1');
  });

  it('rejects with whatever the database refused with', async () => {
    tableResult = { data: null, error: { message: 'That conversation is not yours.' } };

    await expect(markConversationRead('c-1', 'm-1', '2026-08-19T09:30:00.000Z')).rejects.toThrow(
      'That conversation is not yours.',
    );
  });
});

describe('sendWave', () => {
  it('calls send_wave with the recipient, topic and note', async () => {
    rpcResult = { data: { id: 'w-1', conversation_id: null }, error: null };

    await sendWave('m-2', 'Bowel program', 'Hi, could I ask you about this?');

    expect(rpcSpy).toHaveBeenCalledWith('send_wave', {
      p_to: 'm-2',
      p_topic: 'Bowel program',
      p_message: 'Hi, could I ask you about this?',
    });
  });

  it('reports the conversation the wave opened when it opened one', async () => {
    rpcResult = { data: { id: 'w-1', conversation_id: 'c-9' }, error: null };

    expect(await sendWave('m-2', null, null)).toEqual({ waveId: 'w-1', conversationId: 'c-9' });
  });

  it('reports no conversation when the wave is still waiting to be answered', async () => {
    rpcResult = { data: { id: 'w-1', conversation_id: null }, error: null };

    expect(await sendWave('m-2', null, null)).toEqual({ waveId: 'w-1', conversationId: null });
  });

  it('rejects with whatever the database refused with', async () => {
    rpcResult = { data: null, error: { message: 'You have already waved at this person.' } };

    await expect(sendWave('m-2', null, null)).rejects.toThrow(
      'You have already waved at this person.',
    );
  });
});

describe('respondToWave', () => {
  it('calls respond_to_wave and returns the conversation an accept opened', async () => {
    rpcResult = { data: 'c-4', error: null };

    const conversationId = await respondToWave('w-1', true);

    expect(rpcSpy).toHaveBeenCalledWith('respond_to_wave', { p_wave: 'w-1', p_accept: true });
    expect(conversationId).toBe('c-4');
  });

  it('returns nothing when the wave was declined', async () => {
    rpcResult = { data: null, error: null };

    const conversationId = await respondToWave('w-1', false);

    expect(rpcSpy).toHaveBeenCalledWith('respond_to_wave', { p_wave: 'w-1', p_accept: false });
    expect(conversationId).toBeNull();
  });

  it('rejects with whatever the database refused with', async () => {
    rpcResult = { data: null, error: { message: 'You have already answered this wave.' } };

    await expect(respondToWave('w-1', true)).rejects.toThrow(
      'You have already answered this wave.',
    );
  });
});

describe('startConversation', () => {
  it('calls start_conversation with the recipient and the first message', async () => {
    rpcResult = { data: 'c-3', error: null };

    const conversationId = await startConversation('m-2', 'Hi, I saw your profile.');

    expect(rpcSpy).toHaveBeenCalledWith('start_conversation', {
      p_to: 'm-2',
      p_body: 'Hi, I saw your profile.',
    });
    expect(conversationId).toBe('c-3');
  });

  it('rejects with whatever the database refused with', async () => {
    rpcResult = { data: null, error: { message: 'A first message cannot be empty.' } };

    await expect(startConversation('m-2', ' ')).rejects.toThrow('A first message cannot be empty.');
  });
});

describe('subscribeToMessages', () => {
  it('listens for inserted messages and hands them over already mapped', () => {
    const received: ChatMessage[] = [];

    subscribeToMessages((message) => received.push(message));

    expect(channelSpy).toHaveBeenCalledWith('chat-messages');
    expect(fakeChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      expect.any(Function),
    );

    lastHandler?.({ new: messageRow });

    expect(received).toEqual([
      {
        id: 'msg-1',
        conversationId: 'c-1',
        senderId: 'm-2',
        body: 'Are you around Thursday?',
        createdAt: '2026-08-19T09:30:00.000Z',
        deletedAt: null,
      },
    ]);
  });

  it('returns a function that removes the channel again', () => {
    const unsubscribe = subscribeToMessages(() => undefined);

    expect(removeChannelSpy).not.toHaveBeenCalled();

    unsubscribe();

    expect(removeChannelSpy).toHaveBeenCalledWith(fakeChannel);
  });
});
