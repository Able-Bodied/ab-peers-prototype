import { ArrowLeft, MoreVertical, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useChat } from '@/lib/chat';
import {
  groupMessagesByDay,
  initials,
  locationLabel,
  messageTime,
  validateMessage,
} from '@/lib/chat-rules';
import { cn } from '@/lib/utils';
import { BlockDialog, ReportDialog } from '@/routes/messages/safety-dialog';
import type { Capacity, ChatConversation, ChatMessage, ReportReason } from '@/types/domain';

/**
 * One open conversation: its history, its composer, and the four things a
 * member can do about the person on the other end.
 *
 * Archive, mute, block and report live behind one menu rather than on the
 * surface. Three of them are rarely wanted and one of them is close to
 * irreversible in effect, and a row of them across the top of every thread
 * frames each conversation as a thing to be managed rather than had.
 */

const CAPACITY_LABELS: Record<Capacity, string> = {
  open: 'Open to conversations',
  'at capacity': 'At capacity',
  paused: 'Paused',
};

interface ThreadViewProps {
  conversation: ChatConversation;
  viewerId: string | null;
  /** Returns to the inbox. Only reachable on phone widths, where the two panes don't share a screen. */
  onBack: () => void;
}

export function ThreadView({ conversation, viewerId, onBack }: ThreadViewProps) {
  const {
    messagesFor,
    ensureMessages,
    markRead,
    sendMessage,
    retractMessage,
    setArchived,
    setMuted,
    blockMember,
    unblockMember,
    reportMember,
    demoReply,
  } = useChat();

  const { counterpart } = conversation;
  const conversationId = conversation.id;
  const messages = messagesFor(conversationId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureMessages(conversationId);
  }, [conversationId, ensureMessages]);

  // Read receipts move to the newest message actually on screen, so this waits
  // for the history rather than firing on open — see markConversationRead in
  // chat-api.ts for why the cursor is a message timestamp and not the clock.
  useEffect(() => {
    if (messages.length === 0) return;
    void markRead(conversationId);
  }, [conversationId, messages, markRead]);

  // A thread that opens at the top of a year-old history is a thread nobody can
  // reply to without scrolling first. Switching threads needs no equivalent
  // reset of the draft or the menu: page.tsx keys this component on the
  // conversation id, so a different thread is a different component instance.
  const messageCount = messages.length;
  useEffect(() => {
    if (messageCount === 0) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount]);

  function submit() {
    const complaint = validateMessage(draft);
    if (complaint) {
      setProblem(complaint);
      return;
    }
    setProblem(null);
    // The send is optimistic (see chat.tsx), so the box can be cleared now —
    // waiting for the round trip would leave the message sitting in the composer
    // and on screen at the same time.
    void sendMessage(conversationId, draft);
    setDraft('');
  }

  async function submitReport(reason: ReportReason, details: string | null) {
    await reportMember({
      subjectMemberId: counterpart.id,
      conversationId,
      messageId: null,
      reason,
      details,
    });
  }

  const days = groupMessagesByDay(messages);

  return (
    <section
      aria-label={`Conversation with ${counterpart.displayName}`}
      className="flex min-h-0 flex-1 flex-col"
    >
      <header className="bg-background sticky top-0 z-10 flex items-center gap-2 border-b px-2 py-2">
        <Button
          type="button"
          variant="ghost"
          className="size-11 shrink-0 md:hidden"
          aria-label="Back to inbox"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>

        <Avatar className="size-10 shrink-0">
          {counterpart.photoUrl && (
            <AvatarImage src={counterpart.photoUrl} alt="" className="object-cover object-top" />
          )}
          <AvatarFallback className="bg-secondary text-primary text-sm font-bold">
            {initials(counterpart.displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-[15px] leading-tight font-bold">
            <span className="truncate">{counterpart.displayName}</span>
            {counterpart.type === 'mentor' && (
              <span className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                Mentor
              </span>
            )}
            {counterpart.type === 'mentor' && counterpart.capacity && (
              <span className="bg-secondary text-primary shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                {CAPACITY_LABELS[counterpart.capacity]}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-xs">{locationLabel(counterpart)}</p>
        </div>

        <div className="relative shrink-0">
          <Button
            type="button"
            variant="ghost"
            className="size-11"
            aria-label={`Options for your conversation with ${counterpart.displayName}`}
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
            }}
          >
            <MoreVertical aria-hidden="true" />
          </Button>

          {menuOpen && (
            <div className="bg-card absolute top-12 right-0 z-20 w-56 rounded-xl border p-1 shadow-md">
              <MenuItem
                label={conversation.archived ? 'Unarchive' : 'Archive'}
                onSelect={() => {
                  setMenuOpen(false);
                  void setArchived(conversationId, !conversation.archived);
                }}
              />
              <MenuItem
                label={conversation.muted ? 'Unmute' : 'Mute notifications'}
                onSelect={() => {
                  setMenuOpen(false);
                  void setMuted(conversationId, !conversation.muted);
                }}
              />
              <MenuItem
                label={conversation.blocked ? 'Unblock' : `Block ${counterpart.displayName}`}
                onSelect={() => {
                  setMenuOpen(false);
                  if (conversation.blocked) {
                    void unblockMember(counterpart.id);
                  } else {
                    setBlockOpen(true);
                  }
                }}
              />
              <MenuItem
                label={`Report ${counterpart.displayName}`}
                onSelect={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversation.lastMessageBody === null && messages.length === 0 && (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            Nothing has been said yet. Whatever you write first is fine — most people open with why
            they got in touch.
          </p>
        )}

        <ol className="flex flex-col gap-5 px-4 py-4">
          {days.map((day) => (
            <li key={day.date}>
              <p className="text-muted-foreground text-center text-xs font-bold">{day.label}</p>
              <ol className="mt-2 flex flex-col gap-2.5">
                {day.messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    mine={message.senderId === viewerId}
                    counterpartName={counterpart.displayName}
                    onRetract={() => {
                      void retractMessage(message.id, conversationId);
                    }}
                  />
                ))}
              </ol>
            </li>
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      {conversation.blocked ? (
        <div className="bg-secondary/40 border-t px-4 py-4">
          <p className="text-sm leading-snug">
            You blocked {counterpart.displayName}. Neither of you can send messages here. They were
            not told, and unblocking puts things back exactly as they were.
          </p>
          <Button
            type="button"
            className="mt-3 min-h-11 rounded-xl font-bold"
            onClick={() => {
              void unblockMember(counterpart.id);
            }}
          >
            Unblock {counterpart.displayName}
          </Button>
        </div>
      ) : (
        <div className="bg-background border-t px-3 py-3">
          <Label htmlFor="message-composer" className="sr-only">
            Message {counterpart.displayName}
          </Label>
          <div className="flex items-end gap-2">
            <textarea
              id="message-composer"
              value={draft}
              rows={1}
              placeholder="Write a message"
              aria-describedby={problem ? 'composer-problem' : undefined}
              onChange={(event) => {
                setDraft(event.target.value);
                if (problem) setProblem(null);
              }}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is the escape hatch for a second
                // paragraph, which is the convention every other chat app has
                // trained people on.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 max-h-40 min-h-11 flex-1 resize-y rounded-xl border bg-transparent px-3 py-2.5 text-base outline-none focus-visible:ring-[3px]"
            />
            <Button
              type="button"
              className="size-11 shrink-0 rounded-xl"
              aria-label={`Send message to ${counterpart.displayName}`}
              disabled={draft.trim() === ''}
              onClick={submit}
            >
              <SendHorizontal aria-hidden="true" />
            </Button>
          </div>
          {problem && (
            <p id="composer-problem" role="alert" className="text-destructive mt-2 text-sm">
              {problem}
            </p>
          )}

          {counterpart.isSynthetic && (
            <DemoReplyControl conversationId={conversationId} onSend={demoReply} />
          )}
        </div>
      )}

      <BlockDialog
        open={blockOpen}
        counterpartName={counterpart.displayName}
        onOpenChange={setBlockOpen}
        onConfirm={() => {
          void blockMember(counterpart.id);
        }}
      />
      <ReportDialog
        open={reportOpen}
        counterpartName={counterpart.displayName}
        onOpenChange={setReportOpen}
        onSubmit={submitReport}
      />
    </section>
  );
}

function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="hover:bg-secondary flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold"
    >
      {label}
    </button>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  mine: boolean;
  counterpartName: string;
  onRetract: () => void;
}

function MessageRow({ message, mine, counterpartName, onRetract }: MessageRowProps) {
  const retracted = message.deletedAt !== null;

  return (
    <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2',
          mine ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
          retracted && 'bg-muted text-muted-foreground italic',
        )}
      >
        {/* The row survives a retraction so the thread keeps its shape, but the
            body is never rendered again — that is the whole point of retracting. */}
        <p className="text-[15px] leading-snug whitespace-pre-wrap">
          {retracted ? 'Message removed' : message.body}
        </p>
      </div>

      <p className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
        <span className="sr-only">{mine ? 'You' : counterpartName}, </span>
        <span>{messageTime(message.createdAt)}</span>
        {mine && !retracted && (
          <button
            type="button"
            onClick={onRetract}
            aria-label={`Retract your message sent at ${messageTime(message.createdAt)}`}
            className="hover:text-foreground font-semibold underline underline-offset-2"
          >
            Retract
          </button>
        )}
      </p>
    </li>
  );
}

/**
 * Prototype only. The seeded demo profiles have no account behind them, so they
 * cannot answer — without this every demo thread is one-sided and the states
 * worth showing (an unread badge, a reply arriving in an open thread) never
 * happen. The database refuses this call for anyone who is not synthetic, so it
 * cannot post as a real member; it is fenced off and labelled here so that
 * nobody watching a demo mistakes it for something the product does.
 */
function DemoReplyControl({
  conversationId,
  onSend,
}: {
  conversationId: string;
  onSend: (conversationId: string, body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');

  return (
    <div className="border-muted-foreground/30 mt-3 rounded-xl border border-dashed p-3">
      <Label htmlFor="demo-reply" className="text-muted-foreground text-xs font-bold">
        Prototype only — simulate a reply from this demo profile
      </Label>
      <div className="mt-2 flex items-end gap-2">
        <input
          id="demo-reply"
          value={body}
          placeholder="What should they say back?"
          onChange={(event) => {
            setBody(event.target.value);
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 flex-1 rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 rounded-xl text-xs font-bold"
          disabled={body.trim() === ''}
          onClick={() => {
            void onSend(conversationId, body.trim());
            setBody('');
          }}
        >
          Simulate a reply
        </Button>
      </div>
    </div>
  );
}
