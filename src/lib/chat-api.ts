/**
 * Every call chat makes to Supabase, and the row-to-domain mapping that goes
 * with it. Nothing above this file writes a table name or a snake_case column.
 *
 * **Reads go through views, writes go through functions.** The three views
 * (`chat_conversations`, `chat_waves`, `chat_members`) are keyed on the caller's
 * own id in the database, so there is no "which member am I asking about?"
 * parameter to get wrong here — asking for the inbox can only ever return the
 * caller's inbox. The writes that have to hold an invariant across several
 * tables (waving, answering a wave, opening a thread, blocking) are RPCs for
 * the same reason: see the header of
 * supabase/migrations/20260820140000_chat_messaging.sql.
 *
 * **This route talks to the network, deliberately.** src/routes/AGENTS.md makes
 * onboarding the exception to the mock-data rule; chat is the second one, and
 * for a stronger reason than onboarding had. A messaging feature whose messages
 * do not survive a reload demonstrates nothing about messaging, and the parts
 * worth getting right — who may contact whom, what a block does, what a
 * declined wave tells its sender — are exactly the parts that only exist if
 * something enforces them. Tests mock '@/lib/supabase'; they do not hit the
 * network.
 */

import { getSupabase } from '@/lib/supabase';
import type {
  AgeBand,
  Capacity,
  ChatConversation,
  ChatCounterpart,
  ChatLimits,
  ChatMember,
  ChatMessage,
  ChatWave,
  ConversationKind,
  Disability,
  DurationBucket,
  InjuryLevel,
  Interest,
  MemberType,
  ReportReason,
  Topic,
  UsState,
  WaveDirection,
  WaveStatus,
} from '@/types/domain';

/* ------------------------------------------------------------- row shapes */

interface CounterpartColumns {
  counterpart_id: string;
  counterpart_name: string;
  counterpart_photo_url: string | null;
  counterpart_type: string;
  counterpart_city: string;
  counterpart_state: string;
  counterpart_capacity: string | null;
  counterpart_is_synthetic: boolean;
}

interface ConversationRow extends CounterpartColumns {
  id: string;
  kind: string;
  created_at: string;
  last_message_at: string;
  last_read_at: string;
  archived: boolean;
  muted: boolean;
  blocked: boolean;
  /**
   * `count(*)` is a bigint, and PostgREST sends bigints as strings rather than
   * risk a silent precision loss in JSON. Typed as both so the `Number()` in
   * the mapper reads as the necessary coercion it is, rather than as dead code
   * for a lint rule to offer to delete.
   */
  unread_count: number | string;
  last_message_body: string | null;
  last_message_sender_id: string | null;
}

interface WaveRow extends CounterpartColumns {
  id: string;
  direction: string;
  status: string;
  topic: string | null;
  message: string | null;
  created_at: string;
  conversation_id: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}

interface ChatMemberRow {
  id: string;
  type: string;
  display_name: string;
  photo_url: string | null;
  city: string;
  state: string;
  disability: string;
  level: string | null;
  age_band: string;
  duration: string;
  interests: string[];
  capacity: string | null;
  open_to_messages: boolean;
  is_synthetic: boolean;
}

/* ---------------------------------------------------------------- mapping */

function mapCounterpart(row: CounterpartColumns): ChatCounterpart {
  return {
    id: row.counterpart_id,
    displayName: row.counterpart_name,
    photoUrl: row.counterpart_photo_url,
    type: row.counterpart_type as MemberType,
    city: row.counterpart_city,
    state: row.counterpart_state as UsState,
    capacity: row.counterpart_capacity as Capacity | null,
    isSynthetic: row.counterpart_is_synthetic,
  };
}

function mapConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    lastReadAt: row.last_read_at,
    archived: row.archived,
    muted: row.muted,
    blocked: row.blocked,
    counterpart: mapCounterpart(row),
    unreadCount: Number(row.unread_count),
    lastMessageBody: row.last_message_body,
    lastMessageSenderId: row.last_message_sender_id,
  };
}

function mapWave(row: WaveRow): ChatWave {
  return {
    id: row.id,
    direction: row.direction as WaveDirection,
    status: row.status as WaveStatus,
    topic: row.topic as Topic | null,
    message: row.message,
    createdAt: row.created_at,
    conversationId: row.conversation_id,
    counterpart: mapCounterpart(row),
  };
}

function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapChatMember(row: ChatMemberRow): ChatMember {
  return {
    id: row.id,
    type: row.type as MemberType,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    city: row.city,
    state: row.state as UsState,
    disability: row.disability as Disability,
    level: row.level as InjuryLevel | null,
    ageBand: row.age_band as AgeBand,
    duration: row.duration as DurationBucket,
    interests: row.interests as Interest[],
    capacity: row.capacity as Capacity | null,
    openToMessages: row.open_to_messages,
    isSynthetic: row.is_synthetic,
  };
}

/* ----------------------------------------------------------------- errors */

/**
 * The database raises the sentence the member should read — "this mentor is at
 * capacity", "you have reached today's limit of 20 waves" — because those rules
 * live there and a second copy of the wording in the client is a second copy to
 * get out of step. Postgres prefixes some of them, so strip that and keep the
 * sentence.
 */
export function chatErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  const cleaned = raw.replace(/^.*?(?:ERROR|error):\s*/i, '').trim();
  if (!cleaned) return 'Something went wrong. Try again.';
  // A raw constraint or transport failure is not something to show a member.
  if (/violates|constraint|jwt|fetch|network/i.test(cleaned)) {
    return 'Something went wrong. Try again.';
  }
  return cleaned;
}

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error('No data returned.');
  return data;
}

interface PostgrestResult {
  data: unknown;
  error: { message: string } | null;
}

/**
 * `supabase.rpc()` on an untyped client hands back `any`, which spreads into
 * every caller the moment it is destructured. Narrowing it to `unknown` in one
 * place means each function below states the shape it expects — right next to
 * the `returns` clause of the function it is calling — instead of five separate
 * lint suppressions saying the same thing.
 */
async function callRpc(name: string, params?: Record<string, unknown>): Promise<PostgrestResult> {
  return (await getSupabase().rpc(name, params)) as PostgrestResult;
}

/* ------------------------------------------------------------------ reads */

export async function fetchConversations(): Promise<ChatConversation[]> {
  const { data, error } = await getSupabase()
    .from('chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false });
  return (unwrap(data, error) as ConversationRow[]).map(mapConversation);
}

export async function fetchWaves(): Promise<ChatWave[]> {
  const { data, error } = await getSupabase()
    .from('chat_waves')
    .select('*')
    .order('created_at', { ascending: false });
  return (unwrap(data, error) as WaveRow[]).map(mapWave);
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  return (unwrap(data, error) as MessageRow[]).map(mapMessage);
}

export async function fetchChatMembers(): Promise<ChatMember[]> {
  const { data, error } = await getSupabase()
    .from('chat_members')
    .select('*')
    .order('display_name', { ascending: true });
  return (unwrap(data, error) as ChatMemberRow[]).map(mapChatMember);
}

export async function fetchLimits(): Promise<ChatLimits> {
  const { data, error } = await callRpc('chat_limits');
  return unwrap(data, error) as ChatLimits;
}

/* ----------------------------------------------------------------- writes */

/** Say hi. Returns the conversation id when the wave opened a thread outright. */
export async function sendWave(
  toMemberId: string,
  topic: Topic | null,
  message: string | null,
): Promise<{ waveId: string; conversationId: string | null }> {
  const { data, error } = await callRpc('send_wave', {
    p_to: toMemberId,
    p_topic: topic,
    p_message: message,
  });
  const row = unwrap(data, error) as { id: string; conversation_id: string | null };
  return { waveId: row.id, conversationId: row.conversation_id };
}

/** Answer a wave. Accepting returns the new conversation id; declining returns null. */
export async function respondToWave(waveId: string, accept: boolean): Promise<string | null> {
  const { data, error } = await callRpc('respond_to_wave', {
    p_wave: waveId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/** Write first, without waving. Returns the conversation id. */
export async function startConversation(toMemberId: string, body: string): Promise<string> {
  const { data, error } = await callRpc('start_conversation', {
    p_to: toMemberId,
    p_body: body,
  });
  return unwrap(data, error) as string;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<ChatMessage> {
  // `.single()` narrows to one row but still types it as `any` on an untyped
  // client, same as an RPC — so it takes the same treatment.
  const { data, error } = (await getSupabase()
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select()
    .single()) as PostgrestResult;
  return mapMessage(unwrap(data, error) as MessageRow);
}

export async function retractMessage(messageId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw new Error(error.message);
}

/**
 * Move the read cursor to the newest message the viewer has actually seen,
 * rather than to the local clock. The two are nearly the same thing, but a
 * client whose clock runs fast would mark unread messages read, and a message
 * that arrives while the thread is open should not depend on whose clock is
 * right — the timestamp of a real message always does.
 */
export async function markConversationRead(
  conversationId: string,
  memberId: string,
  upToIso: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('conversation_members')
    .update({ last_read_at: upToIso })
    .eq('conversation_id', conversationId)
    .eq('member_id', memberId);
  if (error) throw new Error(error.message);
}

export async function setConversationFlags(
  conversationId: string,
  memberId: string,
  flags: { archived?: boolean; muted?: boolean },
): Promise<void> {
  const { error } = await getSupabase()
    .from('conversation_members')
    .update(flags)
    .eq('conversation_id', conversationId)
    .eq('member_id', memberId);
  if (error) throw new Error(error.message);
}

export async function blockMember(memberId: string): Promise<void> {
  const { error } = await getSupabase().rpc('block_member', { p_member: memberId });
  if (error) throw new Error(error.message);
}

export async function unblockMember(memberId: string, viewerId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('member_blocks')
    .delete()
    .eq('blocker_id', viewerId)
    .eq('blocked_id', memberId);
  if (error) throw new Error(error.message);
}

export async function reportMember(report: {
  reporterId: string;
  subjectMemberId: string;
  conversationId: string | null;
  messageId: string | null;
  reason: ReportReason;
  details: string | null;
}): Promise<void> {
  const { error } = await getSupabase().from('member_reports').insert({
    reporter_id: report.reporterId,
    subject_member_id: report.subjectMemberId,
    conversation_id: report.conversationId,
    message_id: report.messageId,
    reason: report.reason,
    details: report.details,
  });
  if (error) throw new Error(error.message);
}

/** Whether the viewer accepts unsolicited waves and first messages at all (PRD §14). */
export async function setOpenToMessages(memberId: string, open: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('members')
    .update({ open_to_messages: open })
    .eq('id', memberId);
  if (error) throw new Error(error.message);
}

/**
 * Prototype only. The demo population has no auth accounts, so without this
 * every thread in a demo is one-sided and the unread states never occur. The
 * database refuses unless the counterpart is a synthetic profile, so this
 * cannot post as a real person — see `demo_reply` in the migration.
 */
export async function demoReply(conversationId: string, body: string): Promise<void> {
  const { error } = await getSupabase().rpc('demo_reply', {
    p_conversation: conversationId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

/* --------------------------------------------------------------- realtime */

/**
 * New messages, pushed. Realtime re-checks the select policy per subscriber, so
 * this delivers only rows the viewer could have read anyway — subscribing to
 * the table is not subscribing to everybody's mail.
 */
export function subscribeToMessages(onMessage: (message: ChatMessage) => void): () => void {
  const channel = getSupabase()
    .channel('chat-messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload: { new: MessageRow }) => {
        onMessage(mapMessage(payload.new));
      },
    )
    .subscribe();

  return () => {
    void getSupabase().removeChannel(channel);
  };
}
