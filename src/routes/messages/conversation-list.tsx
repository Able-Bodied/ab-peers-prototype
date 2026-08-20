import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { conversationPreview, initials, relativeTime, sortConversations } from '@/lib/chat-rules';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/types/domain';

/**
 * The inbox: one row per conversation, newest first.
 *
 * Every row is a single button rather than a card with a tap target inside it.
 * On a phone the whole row is the thing being aimed at, and a row where only
 * the name is live is a row that appears to ignore most taps.
 */

interface ConversationListProps {
  conversations: ChatConversation[];
  viewerId: string | null;
  /** The thread currently open, so its row can read as selected on wide screens. */
  selectedId: string | null;
  onOpen: (conversationId: string) => void;
}

export function ConversationList({
  conversations,
  viewerId,
  selectedId,
  onOpen,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-base font-bold">No conversations yet</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
          Find someone on the map whose story sounds like yours and send them a wave. When they wave
          back, the conversation opens here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {sortConversations(conversations).map((conversation) => {
        const { counterpart } = conversation;
        const unread = conversation.unreadCount;

        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(conversation.id);
              }}
              aria-current={conversation.id === selectedId ? 'true' : undefined}
              className={cn(
                'hover:bg-secondary/60 flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left',
                conversation.id === selectedId && 'bg-secondary',
                // Archiving is tidying, not deleting (see sortConversations) — so an
                // archived thread stays legible but visibly steps back.
                conversation.archived && 'opacity-60',
              )}
            >
              <Avatar className="size-11 shrink-0">
                {counterpart.photoUrl && (
                  <AvatarImage
                    src={counterpart.photoUrl}
                    alt=""
                    className="object-cover object-top"
                  />
                )}
                <AvatarFallback className="bg-secondary text-primary text-sm font-bold">
                  {initials(counterpart.displayName)}
                </AvatarFallback>
              </Avatar>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[15px] font-bold">{counterpart.displayName}</span>
                  {counterpart.type === 'mentor' && (
                    <span className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                      Mentor
                    </span>
                  )}
                  {counterpart.isBot && (
                    <span className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                      Bot
                    </span>
                  )}
                  {conversation.archived && (
                    <span className="bg-secondary text-muted-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                      Archived
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {relativeTime(conversation.lastMessageAt)}
                  </span>
                </span>

                <span className="mt-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      'text-muted-foreground truncate text-[13px]',
                      unread > 0 && 'text-foreground font-semibold',
                    )}
                  >
                    {conversationPreview(conversation, viewerId)}
                  </span>
                  {unread > 0 && (
                    <>
                      {/* The pill carries the number for sighted readers; the sentence
                          beside it carries the same fact for a screen reader, so the
                          count never depends on noticing a coloured dot. */}
                      <span
                        aria-hidden="true"
                        className="bg-primary text-primary-foreground ml-auto grid min-w-6 shrink-0 place-items-center rounded-full px-2 py-0.5 text-xs font-bold"
                      >
                        {unread}
                      </span>
                      <span className="sr-only">
                        {unread} unread {unread === 1 ? 'message' : 'messages'}
                      </span>
                    </>
                  )}
                  {conversation.muted && <span className="sr-only">Muted</span>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
