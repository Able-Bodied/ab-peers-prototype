/**
 * The parts of chat that are decisions rather than plumbing: who may be
 * contacted, what a wave will do when it lands, and how a thread reads on
 * screen. Pure functions over plain data, so they can be tested without a
 * database and reasoned about without a component.
 *
 * **These duplicate rules the database also enforces, on purpose.** The
 * database is the authority — see the migration header — and it is what stops a
 * hand-written request. But a button that fires a request everyone already
 * knows will be refused spends a round trip to arrive at a worse version of an
 * answer we could have given instantly, and it teaches people the button
 * sometimes just fails. So the client refuses early *and* shows the server's
 * own sentence verbatim whenever one comes back anyway. If a rule here moves,
 * move it in the migration too; where they disagree, the migration wins.
 */

import type {
  ChatConversation,
  ChatCounterpart,
  ChatLimits,
  ChatMember,
  ChatMessage,
} from '@/types/domain';

/** Why somebody cannot be contacted, in the words the sender should see. */
export interface Contactability {
  ok: boolean;
  reason: string | null;
}

/**
 * Mirrors `chat_assert_can_contact`. A mentor with no capacity set counts as
 * open: capacity is something a mentor chooses, and the absence of a choice
 * should not quietly take them out of circulation.
 */
export function contactability(
  member: Pick<ChatMember, 'type' | 'capacity' | 'openToMessages'>,
): Contactability {
  if (!member.openToMessages) {
    return { ok: false, reason: 'This person is not accepting new messages right now.' };
  }
  if (member.type === 'mentor') {
    const capacity = member.capacity ?? 'open';
    // Worded exactly as `chat_assert_contact_allowed` raises it, so a member
    // does not get one sentence from the button and a different one from the
    // server when the two happen to disagree about the same fact.
    if (capacity === 'at capacity') {
      return {
        ok: false,
        reason: 'This mentor is at capacity and is not taking new conversations right now.',
      };
    }
    if (capacity === 'paused') {
      return {
        ok: false,
        reason: 'This mentor is paused and is not taking new conversations right now.',
      };
    }
  }
  return { ok: true, reason: null };
}

/**
 * What will actually happen when the wave lands — the PRD §8 asymmetry, which
 * is the one thing worth saying on the button before somebody taps it.
 *
 * This answers "what would a wave do", not "may you wave": it looks at capacity
 * and not at `openToMessages`, so it will happily describe a thread opening
 * with a mentor who has unsolicited contact switched off. Call `contactability`
 * first and only use this once it says yes — which is the order every caller
 * needs anyway, since the copy is pointless if the button is disabled.
 */
export type WaveOutcome = 'opens-thread' | 'awaits-reply';

export function waveOutcome(member: Pick<ChatMember, 'type' | 'capacity'>): WaveOutcome {
  return member.type === 'mentor' && (member.capacity ?? 'open') === 'open'
    ? 'opens-thread'
    : 'awaits-reply';
}

export function waveOutcomeLabel(outcome: WaveOutcome): string {
  return outcome === 'opens-thread'
    ? 'They have volunteered to hear from people, so this opens a conversation straight away.'
    : 'They will see your hello. If they wave back, the conversation opens.';
}

export function wavesRemaining(limits: ChatLimits | null): number {
  if (!limits) return Number.POSITIVE_INFINITY;
  return Math.max(0, limits.waveDailyLimit - limits.wavesSentToday);
}

export function newConversationsRemaining(limits: ChatLimits | null): number {
  if (!limits) return Number.POSITIVE_INFINITY;
  return Math.max(0, limits.conversationDailyLimit - limits.conversationsStartedToday);
}

/**
 * Total unread across every thread, for the nav badge.
 *
 * Archived threads count; muted ones do not. That is a deliberate split, and it
 * means a muted thread can show "2 unread" on its own row while contributing
 * nothing here — which is what muting is for. Muting says "stop pulling me back
 * into the app", not "pretend these were read": the messages are still unread,
 * and hiding that from the person on the row would be lying to them about their
 * own inbox. Archiving is tidying, so an archived thread that gets a reply
 * should still be able to say so.
 */
export function totalUnread(conversations: ChatConversation[]): number {
  return conversations.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0);
}

/**
 * Inbox order: most recently spoken in first. Archived threads sink below
 * everything else rather than disappearing — archiving is tidying, not deleting,
 * and a thread you archived and then got a reply in should still be findable.
 */
export function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt);
  });
}

/**
 * Connect's order: bots first, everyone else in the order they arrived.
 *
 * A bot answers instantly and costs nobody an awkward reply, which makes it the
 * safest first thing to try for somebody who has never messaged anyone here —
 * and the hardest to find by surname if it sits in the middle of an alphabetical
 * roster. Pinning it is the one exception to that alphabetical order; the sort
 * is stable, so the people below keep whatever order they were given.
 */
export function sortConnectMembers(members: ChatMember[]): ChatMember[] {
  return [...members].sort((a, b) => Number(b.isBot) - Number(a.isBot));
}

/** What a thread shows in the list under the name. */
export function conversationPreview(
  conversation: ChatConversation,
  viewerId: string | null,
): string {
  if (!conversation.lastMessageBody) return 'No messages yet';
  // `viewerId` is null while the session loads and when signed out, and a row
  // can carry a body with no sender. Without the null check those two nulls
  // match each other and somebody else's words get labelled "You:".
  const mine = viewerId !== null && conversation.lastMessageSenderId === viewerId;
  return mine ? `You: ${conversation.lastMessageBody}` : conversation.lastMessageBody;
}

/**
 * The newest message timestamp in a thread, which is what the read cursor is
 * moved to. Null when there is nothing to have read.
 */
export function newestMessageAt(messages: ChatMessage[]): string | null {
  let newest: string | null = null;
  for (const message of messages) {
    if (newest === null || Date.parse(message.createdAt) > Date.parse(newest)) {
      newest = message.createdAt;
    }
  }
  return newest;
}

export interface MessageDay {
  /** ISO date (YYYY-MM-DD), used as the group key. */
  date: string;
  label: string;
  messages: ChatMessage[];
}

/**
 * The viewer's calendar day, not UTC's.
 *
 * Slicing `toISOString()` was the obvious way to write this and it is wrong
 * everywhere west of Greenwich: for a reader in Denver, a message sent at 8pm
 * is already tomorrow in UTC, so it would file under a separator dated the next
 * day while the timestamp printed beside it — which uses the local zone — still
 * said 8:00 PM. Day separators and message times have to agree about what day
 * it is, and the one they should agree on is the reader's.
 */
function dayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

export function dayLabel(iso: string, now = new Date()): string {
  const key = dayKey(iso);
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: key.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  });
}

/** Messages grouped into day runs, oldest first, so a thread can render date separators. */
export function groupMessagesByDay(messages: ChatMessage[], now = new Date()): MessageDay[] {
  const ordered = [...messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  );
  const days: MessageDay[] = [];
  for (const message of ordered) {
    const date = dayKey(message.createdAt);
    const last = days.at(-1);
    if (last?.date === date) {
      last.messages.push(message);
    } else {
      days.push({ date, label: dayLabel(message.createdAt, now), messages: [message] });
    }
  }
  return days;
}

export function messageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "2 days ago" / "just now", for wave cards and thread list rows. */
export function relativeTime(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'yesterday' : `${String(days)} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? 'last week' : `${String(weeks)} weeks ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Initials for the fallback tile when somebody has no photo (PRD §6.4). */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** "Denver, Colorado" — the only granularity a member's location is ever shown at (PRD §14). */
export function locationLabel(counterpart: Pick<ChatCounterpart, 'city' | 'state'>): string {
  return `${counterpart.city}, ${counterpart.state}`;
}

/**
 * A message body as it should be stored: trimmed, and refused if empty or over
 * the limit the `messages` table will refuse anyway.
 */
export const MESSAGE_MAX_LENGTH = 4000;
export const WAVE_MESSAGE_MAX_LENGTH = 500;

export function validateMessage(body: string, max = MESSAGE_MAX_LENGTH): string | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return 'Write something first.';
  if (trimmed.length > max) {
    return `That is longer than the ${String(max)} characters a message can hold.`;
  }
  return null;
}

export type MessageSegment = { kind: 'text'; text: string } | { kind: 'link'; url: string };

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;

/**
 * Splits a message body around any URLs it contains, so the renderer can turn
 * just those spans into links rather than dropping `dangerouslySetInnerHTML`
 * on a message somebody else typed. Trailing punctuation a sentence would
 * naturally end a URL with — `.`, `,`, `)`, `!`, `?` — is peeled back into the
 * surrounding text, so "visit https://ablebodied.org/." links the address and
 * not the full stop after it.
 */
export function linkifyMessage(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index;
    let url = match[0];
    let end = start + url.length;
    const trailing = /[.,!?)]+$/.exec(url);
    if (trailing) {
      url = url.slice(0, url.length - trailing[0].length);
      end -= trailing[0].length;
    }
    if (url === '') continue;

    if (start > cursor) segments.push({ kind: 'text', text: body.slice(cursor, start) });
    segments.push({ kind: 'link', url });
    cursor = end;
  }

  if (cursor < body.length) segments.push({ kind: 'text', text: body.slice(cursor) });
  return segments;
}
