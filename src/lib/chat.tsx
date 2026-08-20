import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as api from '@/lib/chat-api';
import { chatErrorMessage } from '@/lib/chat-api';
import { newestMessageAt } from '@/lib/chat-rules';
import { useSession } from '@/lib/session';
import type {
  ChatConversation,
  ChatLimits,
  ChatMember,
  ChatMessage,
  ChatWave,
  ReportReason,
  Topic,
} from '@/types/domain';

/**
 * One store for every chat surface: the inbox, a thread, the wave list and the
 * composer all read from here.
 *
 * **Why a provider and not per-route state.** The unread badge in the nav, the
 * thread list and the open thread are three views of the same rows, and a
 * message arriving has to change all three at once. Held per route, opening a
 * thread would refetch a list the app already had, and the badge would go on
 * claiming an unread message the member is currently looking at. Same reasoning
 * as src/lib/rsvps.tsx, with more surfaces to keep in agreement.
 *
 * **Why messages are cached per conversation.** A thread is opened, left and
 * reopened constantly while somebody browses their inbox; refetching the whole
 * history each time makes the app feel slower than the network actually is.
 * Realtime keeps the cache honest — every insert the viewer is allowed to see
 * arrives on the subscription, whether or not that thread is on screen.
 *
 * **Why sends are optimistic.** Typing and pressing enter should show the
 * message immediately; a chat that waits for a round trip before echoing what
 * you typed feels broken even when it is working. Failures roll the message
 * back and surface the reason, exactly as RSVPs do.
 */

interface ChatContextValue {
  conversations: ChatConversation[];
  waves: ChatWave[];
  limits: ChatLimits | null;
  /** Everyone the viewer may write to, plus everyone they already are writing to. */
  members: ChatMember[];
  loading: boolean;
  /** The last thing that went wrong, in words worth showing. Cleared by `dismissError`. */
  error: string | null;
  dismissError: () => void;
  refresh: () => Promise<void>;

  messagesFor: (conversationId: string) => ChatMessage[];
  /** Loads a thread's history once. Safe to call from a render effect. */
  ensureMessages: (conversationId: string) => void;
  conversationWith: (memberId: string) => ChatConversation | undefined;

  sendMessage: (conversationId: string, body: string) => Promise<void>;
  retractMessage: (messageId: string, conversationId: string) => Promise<void>;
  /**
   * `ok` is separate from `conversationId` because null means two different
   * things: a wave to a peer succeeded and is waiting for a wave back, and a
   * wave that was refused outright. Collapsing them made the composer show
   * "your hello is on its way" over the top of an error saying it was not.
   */
  sendWave: (
    toMemberId: string,
    topic: Topic | null,
    message: string | null,
  ) => Promise<{ ok: boolean; conversationId: string | null }>;
  /** Same shape as `sendWave`, and for the same reason: a decline and a failure both have no thread. */
  respondToWave: (
    waveId: string,
    accept: boolean,
  ) => Promise<{ ok: boolean; conversationId: string | null }>;
  startConversation: (toMemberId: string, body: string) => Promise<string>;
  markRead: (conversationId: string) => Promise<void>;
  setArchived: (conversationId: string, archived: boolean) => Promise<void>;
  setMuted: (conversationId: string, muted: boolean) => Promise<void>;
  blockMember: (memberId: string) => Promise<void>;
  unblockMember: (memberId: string) => Promise<void>;
  reportMember: (input: {
    subjectMemberId: string;
    conversationId: string | null;
    messageId: string | null;
    reason: ReportReason;
    details: string | null;
  }) => Promise<void>;
  /** Prototype only — see api.demoReply. */
  demoReply: (conversationId: string, body: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Shared, so `messagesFor` hands back a stable identity for a thread that has
 * not loaded. Never mutate it — every caller here copies rather than pushes.
 */
const NO_MESSAGES: ChatMessage[] = [];

export function ChatProvider({ children }: { children: ReactNode }) {
  const { member } = useSession();
  const viewerId = member?.id ?? null;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [waves, setWaves] = useState<ChatWave[]>([]);
  const [limits, setLimits] = useState<ChatLimits | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which threads have been fetched (or are in flight), so ensureMessages can be
  // called from an effect on every render without refetching.
  const loadedThreads = useRef<Set<string>>(new Set());

  // Mirrors of the two pieces of state `markRead` needs, so that callback can
  // stay stable — see the comment on it.
  const messagesRef = useRef<Record<string, ChatMessage[]>>({});
  const conversationsRef = useRef<ChatConversation[]>([]);
  messagesRef.current = messages;
  conversationsRef.current = conversations;

  const refresh = useCallback(async () => {
    if (!viewerId) {
      setConversations([]);
      setWaves([]);
      setMembers([]);
      setLimits(null);
      return;
    }
    const [nextConversations, nextWaves, nextMembers, nextLimits] = await Promise.all([
      api.fetchConversations(),
      api.fetchWaves(),
      api.fetchChatMembers(),
      api.fetchLimits(),
    ]);
    setConversations(nextConversations);
    setWaves(nextWaves);
    setMembers(nextMembers);
    setLimits(nextLimits);
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    setLoading(true);
    void refresh()
      .catch((err: unknown) => {
        setError(chatErrorMessage(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [viewerId, refresh]);

  // Realtime. The subscription is torn down and rebuilt when the viewer
  // changes, so a signed-out session is never left listening.
  useEffect(() => {
    if (!viewerId) return;
    return api.subscribeToMessages((message) => {
      setMessages((prev) => {
        const existing = prev[message.conversationId];
        // Only extend a thread already in the cache; one that has never been
        // opened will fetch the whole history when it is.
        if (!existing) return prev;
        if (existing.some((m) => m.id === message.id)) return prev;
        return { ...prev, [message.conversationId]: [...existing, message] };
      });
      // The inbox row's preview, ordering and unread count all move with it,
      // and a message can also be the one that created a brand new thread.
      void refresh().catch(() => {
        // A failed background refresh is not worth interrupting anyone over —
        // the next action reloads anyway.
      });
    });
  }, [viewerId, refresh]);

  const ensureMessages = useCallback((conversationId: string) => {
    if (loadedThreads.current.has(conversationId)) return;
    loadedThreads.current.add(conversationId);
    void api
      .fetchMessages(conversationId)
      .then((rows) => {
        setMessages((prev) => ({ ...prev, [conversationId]: rows }));
      })
      .catch((err: unknown) => {
        loadedThreads.current.delete(conversationId);
        setError(chatErrorMessage(err));
      });
  }, []);

  // One shared empty array rather than a fresh `[]` per call. Callers put this
  // result in effect dependencies, and a new array identity on every render for
  // a thread that has not loaded yet would re-run those effects forever.
  const messagesFor = useCallback(
    (conversationId: string) => messages[conversationId] ?? NO_MESSAGES,
    [messages],
  );

  const conversationWith = useCallback(
    (memberId: string) => conversations.find((c) => c.counterpart.id === memberId),
    [conversations],
  );

  /** Runs an action, turning any failure into `error` and re-throwing nothing. */
  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      return await action();
    } catch (err: unknown) {
      setError(chatErrorMessage(err));
      return null;
    }
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, body: string) => {
      if (!viewerId) return;
      const trimmed = body.trim();
      const optimistic: ChatMessage = {
        id: `pending-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
        conversationId,
        senderId: viewerId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      };
      setMessages((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] ?? []), optimistic],
      }));

      try {
        const saved = await api.sendMessage(conversationId, viewerId, trimmed);
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((m) =>
            m.id === optimistic.id ? saved : m,
          ),
        }));
        await refresh();
      } catch (err: unknown) {
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).filter((m) => m.id !== optimistic.id),
        }));
        setError(chatErrorMessage(err));
      }
    },
    [viewerId, refresh],
  );

  const retractMessage = useCallback(
    async (messageId: string, conversationId: string) => {
      await guard(async () => {
        await api.retractMessage(messageId);
        const now = new Date().toISOString();
        setMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] ?? []).map((m) =>
            m.id === messageId ? { ...m, deletedAt: now } : m,
          ),
        }));
        await refresh();
      });
    },
    [guard, refresh],
  );

  const sendWave = useCallback(
    async (toMemberId: string, topic: Topic | null, message: string | null) => {
      try {
        const result = await api.sendWave(toMemberId, topic, message);
        await guard(() => refresh());
        return { ok: true, conversationId: result.conversationId };
      } catch (err: unknown) {
        setError(chatErrorMessage(err));
        return { ok: false, conversationId: null };
      }
    },
    [guard, refresh],
  );

  const respondToWave = useCallback(
    async (waveId: string, accept: boolean) => {
      try {
        const conversationId = await api.respondToWave(waveId, accept);
        await guard(() => refresh());
        return { ok: true, conversationId };
      } catch (err: unknown) {
        setError(chatErrorMessage(err));
        return { ok: false, conversationId: null };
      }
    },
    [guard, refresh],
  );

  const startConversation = useCallback(
    async (toMemberId: string, body: string) => {
      const id = await guard(() => api.startConversation(toMemberId, body));
      if (id) {
        // The thread is new, so its history is whatever was just written.
        loadedThreads.current.delete(id);
      }
      await guard(() => refresh());
      if (!id) throw new Error('Could not start that conversation.');
      return id;
    },
    [guard, refresh],
  );

  /**
   * Read through refs rather than closing over `messages` and `conversations`,
   * so this keeps one identity for the life of the provider. A thread view calls
   * it from an effect; if it changed on every state update — which it would,
   * since a message arriving updates both — that effect would re-run on every
   * render and lean on the early return below to settle down.
   */
  const markRead = useCallback(
    async (conversationId: string) => {
      if (!viewerId) return;
      const upTo = newestMessageAt(messagesRef.current[conversationId] ?? NO_MESSAGES);
      if (!upTo) return;
      const conversation = conversationsRef.current.find((c) => c.id === conversationId);
      if (conversation && Date.parse(conversation.lastReadAt) >= Date.parse(upTo)) return;

      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0, lastReadAt: upTo } : c)),
      );
      await guard(() => api.markConversationRead(conversationId, viewerId, upTo));
    },
    [viewerId, guard],
  );

  const setFlags = useCallback(
    async (conversationId: string, flags: { archived?: boolean; muted?: boolean }) => {
      if (!viewerId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, ...flags } : c)),
      );
      await guard(() => api.setConversationFlags(conversationId, viewerId, flags));
      await guard(() => refresh());
    },
    [viewerId, guard, refresh],
  );

  const setArchived = useCallback(
    (conversationId: string, archived: boolean) => setFlags(conversationId, { archived }),
    [setFlags],
  );

  const setMuted = useCallback(
    (conversationId: string, muted: boolean) => setFlags(conversationId, { muted }),
    [setFlags],
  );

  const blockMember = useCallback(
    async (memberId: string) => {
      await guard(() => api.blockMember(memberId));
      await guard(() => refresh());
    },
    [guard, refresh],
  );

  const unblockMember = useCallback(
    async (memberId: string) => {
      if (!viewerId) return;
      await guard(() => api.unblockMember(memberId, viewerId));
      await guard(() => refresh());
    },
    [viewerId, guard, refresh],
  );

  const reportMember = useCallback(
    async (input: {
      subjectMemberId: string;
      conversationId: string | null;
      messageId: string | null;
      reason: ReportReason;
      details: string | null;
    }) => {
      if (!viewerId) return;
      await guard(() => api.reportMember({ ...input, reporterId: viewerId }));
    },
    [viewerId, guard],
  );

  const demoReply = useCallback(
    async (conversationId: string, body: string) => {
      await guard(() => api.demoReply(conversationId, body));
      await guard(() => refresh());
    },
    [guard, refresh],
  );

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      waves,
      limits,
      members,
      loading,
      error,
      dismissError,
      refresh,
      messagesFor,
      ensureMessages,
      conversationWith,
      sendMessage,
      retractMessage,
      sendWave,
      respondToWave,
      startConversation,
      markRead,
      setArchived,
      setMuted,
      blockMember,
      unblockMember,
      reportMember,
      demoReply,
    }),
    [
      conversations,
      waves,
      limits,
      members,
      loading,
      error,
      dismissError,
      refresh,
      messagesFor,
      ensureMessages,
      conversationWith,
      sendMessage,
      retractMessage,
      sendWave,
      respondToWave,
      startConversation,
      markRead,
      setArchived,
      setMuted,
      blockMember,
      unblockMember,
      reportMember,
      demoReply,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used within a ChatProvider');
  return value;
}
