import { describe, expect, it } from 'vitest';

import {
  contactability,
  conversationPreview,
  dayLabel,
  groupMessagesByDay,
  initials,
  linkifyMessage,
  locationLabel,
  MESSAGE_MAX_LENGTH,
  messageTime,
  newConversationsRemaining,
  newestMessageAt,
  relativeTime,
  sortConnectMembers,
  sortConversations,
  totalUnread,
  validateMessage,
  WAVE_MESSAGE_MAX_LENGTH,
  waveOutcome,
  waveOutcomeLabel,
  wavesRemaining,
} from '@/lib/chat-rules';
import type {
  ChatConversation,
  ChatCounterpart,
  ChatLimits,
  ChatMember,
  ChatMessage,
} from '@/types/domain';

/**
 * Every time-sensitive assertion is handed this explicitly, so none of them
 * depends on the wall clock. `dayLabel` compares the *viewer's* calendar days
 * rather than UTC ones — day separators have to agree with the local times
 * printed beside them — so "now" is midday UTC and the fixtures sit in the same
 * few hours, which lands them on one local day either side of Greenwich.
 */
const NOW = new Date('2026-08-19T12:00:00.000Z');

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

function counterpart(overrides: Partial<ChatCounterpart> = {}): ChatCounterpart {
  return {
    id: 'm-2',
    type: 'peer',
    displayName: 'Rowan Fakename',
    photoUrl: null,
    city: 'Denver',
    state: 'Colorado',
    capacity: null,
    isSynthetic: true,
    isBot: false,
    ...overrides,
  };
}

function member(overrides: Partial<ChatMember> = {}): ChatMember {
  return {
    ...counterpart(),
    disability: 'SCI - para',
    level: 'T6',
    ageBand: '30-39',
    duration: '3 - 10 years',
    interests: ['Reading'],
    openToMessages: true,
    ...overrides,
  };
}

function conversation(overrides: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c-1',
    kind: 'peer',
    createdAt: '2026-08-10T15:00:00.000Z',
    lastMessageAt: '2026-08-19T09:00:00.000Z',
    lastReadAt: '2026-08-19T08:00:00.000Z',
    archived: false,
    muted: false,
    blocked: false,
    counterpart: counterpart(),
    unreadCount: 0,
    lastMessageBody: 'See you Thursday.',
    lastMessageSenderId: 'm-2',
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    conversationId: 'c-1',
    senderId: 'm-2',
    body: 'Hello there.',
    createdAt: '2026-08-19T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function limits(overrides: Partial<ChatLimits> = {}): ChatLimits {
  return {
    waveDailyLimit: 20,
    wavesSentToday: 0,
    conversationDailyLimit: 10,
    conversationsStartedToday: 0,
    ...overrides,
  };
}

describe('contactability', () => {
  it('lets anyone write to a peer who is open to messages', () => {
    expect(contactability(member())).toEqual({ ok: true, reason: null });
  });

  it('refuses somebody who has turned messages off, without naming a block', () => {
    expect(contactability(member({ openToMessages: false }))).toEqual({
      ok: false,
      reason: 'This person is not accepting new messages right now.',
    });
  });

  it('refuses a mentor at capacity with a reason about capacity', () => {
    expect(contactability(member({ type: 'mentor', capacity: 'at capacity' }))).toEqual({
      ok: false,
      reason: 'This mentor is at capacity and is not taking new conversations right now.',
    });
  });

  it('refuses a paused mentor with a different reason from the capacity one', () => {
    const paused = contactability(member({ type: 'mentor', capacity: 'paused' }));
    const full = contactability(member({ type: 'mentor', capacity: 'at capacity' }));

    expect(paused).toEqual({
      ok: false,
      reason: 'This mentor is paused and is not taking new conversations right now.',
    });
    expect(paused.reason).not.toBe(full.reason);
  });

  // Capacity is a mentor's own choice; never having made it must not quietly
  // take them out of circulation, so null reads as 'open'.
  it('treats a mentor who has never set a capacity as open', () => {
    expect(contactability(member({ type: 'mentor', capacity: null }))).toEqual({
      ok: true,
      reason: null,
    });
  });

  it('lets a peer with no capacity be contacted', () => {
    expect(contactability(member({ type: 'peer', capacity: null }))).toEqual({
      ok: true,
      reason: null,
    });
  });

  it('ignores capacity on a peer, who has none to speak of', () => {
    expect(contactability(member({ type: 'peer', capacity: 'at capacity' })).ok).toBe(true);
  });

  it('answers with the messages-off reason before the capacity one', () => {
    const both = member({ type: 'mentor', capacity: 'paused', openToMessages: false });

    expect(contactability(both).reason).toBe(
      'This person is not accepting new messages right now.',
    );
  });
});

describe('waveOutcome', () => {
  it('opens a thread straight away for an open mentor', () => {
    expect(waveOutcome(member({ type: 'mentor', capacity: 'open' }))).toBe('opens-thread');
  });

  // Same rule as contactability: an unanswered capacity question means open.
  it('opens a thread for a mentor who has never set a capacity', () => {
    expect(waveOutcome(member({ type: 'mentor', capacity: null }))).toBe('opens-thread');
  });

  it('only awaits a reply from a mentor who is at capacity or paused', () => {
    expect(waveOutcome(member({ type: 'mentor', capacity: 'at capacity' }))).toBe('awaits-reply');
    expect(waveOutcome(member({ type: 'mentor', capacity: 'paused' }))).toBe('awaits-reply');
  });

  it('always awaits a reply from a peer, whatever their capacity says', () => {
    expect(waveOutcome(member({ type: 'peer', capacity: 'open' }))).toBe('awaits-reply');
    expect(waveOutcome(member({ type: 'peer', capacity: null }))).toBe('awaits-reply');
    expect(waveOutcome(member({ type: 'peer', capacity: 'at capacity' }))).toBe('awaits-reply');
  });
});

describe('waveOutcomeLabel', () => {
  it('promises an immediate conversation only when the wave opens one', () => {
    expect(waveOutcomeLabel('opens-thread')).toContain('straight away');
    expect(waveOutcomeLabel('awaits-reply')).toContain('If they wave back');
    expect(waveOutcomeLabel('opens-thread')).not.toBe(waveOutcomeLabel('awaits-reply'));
  });
});

describe('wavesRemaining', () => {
  it('counts down from the daily limit', () => {
    expect(wavesRemaining(limits({ waveDailyLimit: 20, wavesSentToday: 3 }))).toBe(17);
  });

  it('reaches exactly zero when the whole allowance is spent', () => {
    expect(wavesRemaining(limits({ waveDailyLimit: 20, wavesSentToday: 20 }))).toBe(0);
  });

  it('never reports a negative allowance when more was counted than the limit', () => {
    expect(wavesRemaining(limits({ waveDailyLimit: 20, wavesSentToday: 25 }))).toBe(0);
  });

  // Before limits load there is nothing to enforce, so the UI must not block.
  it('treats unknown limits as unlimited', () => {
    expect(wavesRemaining(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('newConversationsRemaining', () => {
  it('counts down from the daily limit', () => {
    const spent = limits({ conversationDailyLimit: 10, conversationsStartedToday: 4 });

    expect(newConversationsRemaining(spent)).toBe(6);
  });

  it('reaches exactly zero when the whole allowance is spent', () => {
    const spent = limits({ conversationDailyLimit: 10, conversationsStartedToday: 10 });

    expect(newConversationsRemaining(spent)).toBe(0);
  });

  it('never reports a negative allowance when more was counted than the limit', () => {
    const spent = limits({ conversationDailyLimit: 10, conversationsStartedToday: 14 });

    expect(newConversationsRemaining(spent)).toBe(0);
  });

  it('treats unknown limits as unlimited', () => {
    expect(newConversationsRemaining(null)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('totalUnread', () => {
  it('adds up the unread messages across every thread', () => {
    const threads = [
      conversation({ id: 'c-1', unreadCount: 2 }),
      conversation({ id: 'c-2', unreadCount: 3 }),
    ];

    expect(totalUnread(threads)).toBe(5);
  });

  it('counts a muted thread as zero unread', () => {
    const threads = [
      conversation({ id: 'c-1', unreadCount: 2 }),
      conversation({ id: 'c-2', unreadCount: 40, muted: true }),
    ];

    expect(totalUnread(threads)).toBe(2);
  });

  it('still counts an archived thread, which is tidied away rather than silenced', () => {
    expect(totalUnread([conversation({ unreadCount: 4, archived: true })])).toBe(4);
  });

  it('is zero for an empty inbox', () => {
    expect(totalUnread([])).toBe(0);
  });
});

describe('sortConversations', () => {
  it('puts the most recently spoken-in thread first', () => {
    const older = conversation({ id: 'c-old', lastMessageAt: '2026-08-10T09:00:00.000Z' });
    const newer = conversation({ id: 'c-new', lastMessageAt: '2026-08-19T09:00:00.000Z' });

    expect(sortConversations([older, newer]).map((c) => c.id)).toEqual(['c-new', 'c-old']);
  });

  it('sinks archived threads below live ones however recent they are', () => {
    const archived = conversation({
      id: 'c-archived',
      lastMessageAt: '2026-08-19T11:00:00.000Z',
      archived: true,
    });
    const live = conversation({ id: 'c-live', lastMessageAt: '2026-07-01T09:00:00.000Z' });

    expect(sortConversations([archived, live]).map((c) => c.id)).toEqual(['c-live', 'c-archived']);
  });

  it('still orders archived threads among themselves by recency', () => {
    const olderArchived = conversation({
      id: 'c-a1',
      lastMessageAt: '2026-07-01T09:00:00.000Z',
      archived: true,
    });
    const newerArchived = conversation({
      id: 'c-a2',
      lastMessageAt: '2026-08-01T09:00:00.000Z',
      archived: true,
    });

    expect(sortConversations([olderArchived, newerArchived]).map((c) => c.id)).toEqual([
      'c-a2',
      'c-a1',
    ]);
  });

  it('leaves the array it was given untouched', () => {
    const older = conversation({ id: 'c-old', lastMessageAt: '2026-08-10T09:00:00.000Z' });
    const newer = conversation({ id: 'c-new', lastMessageAt: '2026-08-19T09:00:00.000Z' });
    const input = [older, newer];

    const sorted = sortConversations(input);

    expect(input.map((c) => c.id)).toEqual(['c-old', 'c-new']);
    expect(sorted).not.toBe(input);
  });
});

describe('sortConnectMembers', () => {
  it('pins a bot above the people it was listed among', () => {
    const first = member({ id: 'm-a', displayName: 'Ada' });
    const bot = member({ id: 'm-bot', displayName: 'Peer Bot', isBot: true });
    const last = member({ id: 'm-z', displayName: 'Zed' });

    expect(sortConnectMembers([first, bot, last]).map((m) => m.id)).toEqual([
      'm-bot',
      'm-a',
      'm-z',
    ]);
  });

  it('leaves everyone else in the order they were given', () => {
    const zed = member({ id: 'm-z', displayName: 'Zed' });
    const ada = member({ id: 'm-a', displayName: 'Ada' });

    expect(sortConnectMembers([zed, ada]).map((m) => m.id)).toEqual(['m-z', 'm-a']);
  });

  it('leaves the array it was given untouched', () => {
    const person = member({ id: 'm-a' });
    const bot = member({ id: 'm-bot', isBot: true });
    const input = [person, bot];

    const sorted = sortConnectMembers(input);

    expect(input.map((m) => m.id)).toEqual(['m-a', 'm-bot']);
    expect(sorted).not.toBe(input);
  });
});

describe('conversationPreview', () => {
  it('marks the viewer own last message with a You prefix', () => {
    const thread = conversation({
      lastMessageSenderId: 'me',
      lastMessageBody: 'Thanks, that helps.',
    });

    expect(conversationPreview(thread, 'me')).toBe('You: Thanks, that helps.');
  });

  it('shows the other person words without a prefix', () => {
    const thread = conversation({
      lastMessageSenderId: 'm-2',
      lastMessageBody: 'Thanks, that helps.',
    });

    expect(conversationPreview(thread, 'me')).toBe('Thanks, that helps.');
  });

  it('says there are no messages yet when nothing has been said', () => {
    const thread = conversation({ lastMessageBody: null, lastMessageSenderId: null });

    expect(conversationPreview(thread, 'me')).toBe('No messages yet');
  });

  it('does not prefix another person’s message for a viewer whose id is unknown', () => {
    const thread = conversation({ lastMessageSenderId: 'm-2', lastMessageBody: 'Hi there.' });

    expect(conversationPreview(thread, null)).toBe('Hi there.');
  });

  // Regression test: `lastMessageSenderId === viewerId` used to be true when
  // both were null, so an unknown sender read by a signed-out viewer came out
  // labelled "You: ".
  it('does not claim a signed-out viewer wrote a message with no known sender', () => {
    const thread = conversation({ lastMessageSenderId: null, lastMessageBody: 'Hi there.' });

    expect(conversationPreview(thread, null)).toBe('Hi there.');
  });
});

describe('newestMessageAt', () => {
  it('finds the latest timestamp whatever order the messages arrive in', () => {
    const messages = [
      message({ id: 'm-b', createdAt: '2026-08-19T09:00:00.000Z' }),
      message({ id: 'm-c', createdAt: '2026-08-19T11:00:00.000Z' }),
      message({ id: 'm-a', createdAt: '2026-08-19T07:00:00.000Z' }),
    ];

    expect(newestMessageAt(messages)).toBe('2026-08-19T11:00:00.000Z');
  });

  it('has nothing to have read in an empty thread', () => {
    expect(newestMessageAt([])).toBeNull();
  });
});

describe('groupMessagesByDay', () => {
  it('groups messages into calendar days, oldest first, from shuffled input', () => {
    const days = groupMessagesByDay(
      [
        message({ id: 'm-3', createdAt: '2026-08-19T09:00:00.000Z' }),
        message({ id: 'm-1', createdAt: '2026-08-17T10:00:00.000Z' }),
        message({ id: 'm-4', createdAt: '2026-08-19T10:00:00.000Z' }),
        message({ id: 'm-2', createdAt: '2026-08-18T08:00:00.000Z' }),
      ],
      NOW,
    );

    expect(days.map((day) => day.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
    expect(days.map((day) => day.messages.map((m) => m.id))).toEqual([
      ['m-1'],
      ['m-2'],
      ['m-3', 'm-4'],
    ]);
  });

  it('labels the current day Today and the one before it Yesterday', () => {
    const days = groupMessagesByDay(
      [
        message({ id: 'm-1', createdAt: '2026-08-18T08:00:00.000Z' }),
        message({ id: 'm-2', createdAt: '2026-08-19T09:00:00.000Z' }),
      ],
      NOW,
    );

    expect(days.map((day) => day.label)).toEqual(['Yesterday', 'Today']);
  });

  // Two messages written in the same second have to land in one fixed order, or
  // the thread reshuffles itself between renders.
  it('breaks a tie on identical timestamps by id so the order is stable', () => {
    const days = groupMessagesByDay(
      [
        message({ id: 'msg-b', createdAt: '2026-08-19T09:00:00.000Z' }),
        message({ id: 'msg-a', createdAt: '2026-08-19T09:00:00.000Z' }),
      ],
      NOW,
    );

    expect(days[0]?.messages.map((m) => m.id)).toEqual(['msg-a', 'msg-b']);
  });

  it('has no days at all for an empty thread', () => {
    expect(groupMessagesByDay([], NOW)).toEqual([]);
  });
});

describe('dayLabel', () => {
  it('names the current day Today', () => {
    expect(dayLabel('2026-08-19T09:00:00.000Z', NOW)).toBe('Today');
  });

  it('names the day before Yesterday', () => {
    expect(dayLabel('2026-08-18T23:00:00.000Z', NOW)).toBe('Yesterday');
  });

  it('spells out an older day in this year without repeating the year', () => {
    const label = dayLabel('2026-08-17T10:00:00.000Z', NOW);

    expect(label).not.toBe('Today');
    expect(label).not.toBe('Yesterday');
    expect(label).toContain('17');
    expect(label).not.toContain('2026');
  });

  it('adds the year once the day is in a different one', () => {
    expect(dayLabel('2025-01-05T10:00:00.000Z', NOW)).toContain('2025');
  });
});

describe('messageTime', () => {
  it('renders a clock time and never a date', () => {
    const time = messageTime('2026-08-19T15:04:00.000Z');

    expect(time).toMatch(/\d/);
    expect(time).not.toContain('2026');
  });
});

describe('relativeTime', () => {
  it('calls the last minute just now', () => {
    expect(relativeTime(ago(30 * SECOND), NOW)).toBe('just now');
  });

  it('counts minutes within the hour', () => {
    expect(relativeTime(ago(5 * MINUTE), NOW)).toBe('5 min ago');
  });

  it('counts hours within the day', () => {
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3 hr ago');
  });

  it('says yesterday rather than 1 day ago', () => {
    expect(relativeTime(ago(DAY), NOW)).toBe('yesterday');
  });

  it('counts days within the week', () => {
    expect(relativeTime(ago(4 * DAY), NOW)).toBe('4 days ago');
  });

  it('says last week rather than 1 week ago', () => {
    expect(relativeTime(ago(7 * DAY), NOW)).toBe('last week');
  });

  it('counts weeks up to a month', () => {
    expect(relativeTime(ago(21 * DAY), NOW)).toBe('3 weeks ago');
  });

  it('falls back to a calendar date once it is months old', () => {
    const label = relativeTime(ago(90 * DAY), NOW);

    expect(label).not.toContain('ago');
    expect(label).not.toContain('week');
  });
});

describe('initials', () => {
  it('uses the single letter available from a one-word name', () => {
    expect(initials('Rowan')).toBe('R');
  });

  it('uses first and last initial for a two-word name', () => {
    expect(initials('Rowan Fakename')).toBe('RF');
  });

  it('skips the middle names and keeps first and last', () => {
    expect(initials('Rowan Q. Made-Up Fakename')).toBe('RF');
  });

  it('ignores stray whitespace around and inside the name', () => {
    expect(initials('   rowan    fakename  ')).toBe('RF');
  });

  it('falls back to a question mark when there is no name at all', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});

describe('locationLabel', () => {
  it('shows a city and state and nothing narrower', () => {
    expect(locationLabel(counterpart({ city: 'Denver', state: 'Colorado' }))).toBe(
      'Denver, Colorado',
    );
  });
});

describe('validateMessage', () => {
  it('accepts an ordinary message', () => {
    expect(validateMessage('Hi, thanks for waving.')).toBeNull();
  });

  it('refuses an empty message', () => {
    expect(validateMessage('')).toBe('Write something first.');
  });

  it('refuses a message that is only whitespace', () => {
    expect(validateMessage('   \n\t  ')).toBe('Write something first.');
  });

  it('measures length after trimming, so padding cannot push a message over', () => {
    expect(validateMessage(`  ${'a'.repeat(MESSAGE_MAX_LENGTH)}  `)).toBeNull();
  });

  it('accepts a message of exactly the maximum length', () => {
    expect(validateMessage('a'.repeat(MESSAGE_MAX_LENGTH))).toBeNull();
  });

  it('refuses one character over the maximum and names the limit', () => {
    expect(validateMessage('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toBe(
      'That is longer than the 4000 characters a message can hold.',
    );
  });

  it('measures a wave against the shorter wave limit it was given', () => {
    const body = 'a'.repeat(WAVE_MESSAGE_MAX_LENGTH + 1);

    expect(validateMessage(body, WAVE_MESSAGE_MAX_LENGTH)).toBe(
      'That is longer than the 500 characters a message can hold.',
    );
    expect(
      validateMessage('a'.repeat(WAVE_MESSAGE_MAX_LENGTH), WAVE_MESSAGE_MAX_LENGTH),
    ).toBeNull();
  });

  it('lets a wave-length body through when measured against the message limit', () => {
    expect(validateMessage('a'.repeat(WAVE_MESSAGE_MAX_LENGTH + 1))).toBeNull();
  });
});

describe('linkifyMessage', () => {
  it('returns a plain message as a single text segment', () => {
    expect(linkifyMessage('Hi, how are you?')).toEqual([
      { kind: 'text', text: 'Hi, how are you?' },
    ]);
  });

  it('splits a URL out of surrounding text', () => {
    expect(linkifyMessage('Visit https://ablebodied.org/ for more details')).toEqual([
      { kind: 'text', text: 'Visit ' },
      { kind: 'link', url: 'https://ablebodied.org/' },
      { kind: 'text', text: ' for more details' },
    ]);
  });

  it('renders a message that is only a URL as a single link segment', () => {
    expect(linkifyMessage('https://ablebodied.org/')).toEqual([
      { kind: 'link', url: 'https://ablebodied.org/' },
    ]);
  });

  it('finds more than one URL in the same message', () => {
    expect(linkifyMessage('See https://a.example and https://b.example too')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'link', url: 'https://a.example' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', url: 'https://b.example' },
      { kind: 'text', text: ' too' },
    ]);
  });

  it('peels a trailing sentence mark off the URL rather than linking it', () => {
    expect(linkifyMessage('Visit https://ablebodied.org/.')).toEqual([
      { kind: 'text', text: 'Visit ' },
      { kind: 'link', url: 'https://ablebodied.org/' },
      { kind: 'text', text: '.' },
    ]);
    expect(linkifyMessage('Have you seen (https://ablebodied.org/)?')).toEqual([
      { kind: 'text', text: 'Have you seen (' },
      { kind: 'link', url: 'https://ablebodied.org/' },
      { kind: 'text', text: ')?' },
    ]);
  });

  it('leaves a message with no URL untouched', () => {
    expect(linkifyMessage('no links here')).toEqual([{ kind: 'text', text: 'no links here' }]);
  });
});
