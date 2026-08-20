import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useChat } from '@/lib/chat';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { ConversationList } from '@/routes/messages/conversation-list';
import { ThreadView } from '@/routes/messages/thread-view';
import { WaveInbox } from '@/routes/messages/wave-inbox';

/**
 * Messages — where a wave that got answered turns into an actual conversation, and where every
 * conversation a member is already in lives. This is the payoff for the map and the profile: those
 * flows exist to help somebody decide who to talk to, and this is the talking. Two inboxes share
 * the screen because they hold two different kinds of thing — a conversation is a relationship
 * that exists, a wave is a request to start one, and putting an unanswered wave in the same list
 * as a live thread makes it look like a conversation that has gone quiet (PRD §8).
 *
 * Chat runs against the real database rather than mock fixtures, which is the exception
 * src/routes/AGENTS.md carves out for this folder: what is worth proving here — who may contact
 * whom, what a block does, what a declined wave does *not* tell its sender — only exists if
 * something enforces it. All of that lives behind `@/lib/chat`; this page is a view over it.
 *
 * The layout is master/detail. On a phone that is two screens, the list or the open thread, with a
 * back control between them. From `md:` up both fit side by side and the open thread stays in
 * context, which is also what makes the list's selected row worth showing.
 *
 * TODO(team):
 *  - [x] Two segments — Messages and Waves — with counts
 *  - [x] Conversation list with preview, relative time, unread count and a mentor marker
 *  - [x] Thread with day separators, own/their message styling and retraction
 *  - [x] Composer: Enter sends, Shift+Enter for a newline, validated before it sends
 *  - [x] Archive, mute, block and report, with a confirmation step on the two that matter
 *  - [x] Wave inbox: wave back or not now, and a sent list that never says "declined"
 *  - [ ] Search across conversations, once there are enough of them to need it
 *  - [ ] Typing indicators and delivery receipts (needs a presence channel)
 *  - [ ] Report a single message, not just a member — `reportMember` already takes a `messageId`
 */

type Segment = 'messages' | 'waves';

export default function MessagesPage() {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId: string }>();
  const { member, loading: sessionLoading } = useSession();
  const { conversations, waves, loading, error, dismissError } = useChat();

  const [segment, setSegment] = useState<Segment>('messages');

  const viewerId = member?.id ?? null;
  const openConversation = conversations.find((c) => c.id === conversationId);

  if (!member && !sessionLoading) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12 text-center">
        <h1 className="text-lg font-bold">Messages live behind sign-in</h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm">
          Conversations are between two specific people, so we need to know which one you are before
          we can show you yours.
        </p>
        <Link
          to="/onboarding"
          className="bg-primary text-primary-foreground mt-5 inline-flex min-h-11 items-center rounded-xl px-6 font-bold"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
      {error && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 mx-4 mt-2 flex items-center gap-3 rounded-xl border px-3 py-2"
        >
          <p className="flex-1 text-sm">{error}</p>
          <button
            type="button"
            onClick={dismissError}
            className="min-h-11 shrink-0 px-2 text-sm font-bold underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* On a phone the two panes are two screens; from md: up they sit side by side, so the
            pane that is hidden here is hidden by width rather than by unmounting — a thread
            reopened on a wide screen should not have to refetch the list beside it. */}
        <div
          className={cn(
            'min-h-0 w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r',
            // Exactly one unprefixed display utility, so which of `flex` and `hidden`
            // Tailwind happens to emit first never decides the layout.
            openConversation ? 'hidden' : 'flex',
          )}
        >
          <div role="tablist" aria-label="Message inboxes" className="flex gap-2.5 px-4 py-2">
            <SegmentTab
              label="Messages"
              count={conversations.length}
              countNoun="conversations"
              selected={segment === 'messages'}
              onSelect={() => {
                setSegment('messages');
              }}
            />
            <SegmentTab
              label="Waves"
              count={waves.length}
              countNoun="waves"
              selected={segment === 'waves'}
              onSelect={() => {
                setSegment('waves');
              }}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && conversations.length === 0 && waves.length === 0 ? (
              <p className="text-muted-foreground px-4 py-8 text-sm">Loading your messages…</p>
            ) : segment === 'messages' ? (
              <ConversationList
                conversations={conversations}
                viewerId={viewerId}
                selectedId={conversationId ?? null}
                onOpen={(id) => {
                  void navigate(`/messages/${id}`);
                }}
              />
            ) : (
              <WaveInbox
                waves={waves}
                onOpenConversation={(id) => {
                  void navigate(`/messages/${id}`);
                }}
              />
            )}
          </div>
        </div>

        <div
          className={cn('min-h-0 flex-1 flex-col md:flex', openConversation ? 'flex' : 'hidden')}
        >
          {openConversation ? (
            <ThreadView
              key={openConversation.id}
              conversation={openConversation}
              viewerId={viewerId}
              onBack={() => {
                void navigate('/messages');
              }}
            />
          ) : conversationId && !loading ? (
            <div className="px-4 py-10 text-center">
              <p className="text-base font-bold">That conversation isn&rsquo;t here</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
                It may have been blocked, or the link may be for a different account.
              </p>
              <Button
                type="button"
                className="mt-4 min-h-11 rounded-xl font-bold"
                onClick={() => {
                  void navigate('/messages');
                }}
              >
                Back to inbox
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground px-6 py-10 text-center text-sm">
              Pick a conversation to read it here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface SegmentTabProps {
  label: string;
  count: number;
  /** Read out after the number, so the count is a sentence rather than a bare digit. */
  countNoun: string;
  selected: boolean;
  onSelect: () => void;
}

function SegmentTab({ label, count, countNoun, selected, onSelect }: SegmentTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'bg-card inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-5 text-base font-bold',
        selected && 'bg-primary border-primary text-primary-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'bg-secondary text-primary grid min-w-6 place-items-center rounded-full px-1.5 text-xs',
          selected && 'bg-primary-foreground/20 text-primary-foreground',
        )}
      >
        {count}
      </span>
      <span className="sr-only">{countNoun}</span>
    </button>
  );
}
