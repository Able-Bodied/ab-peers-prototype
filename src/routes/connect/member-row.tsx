import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { contactability, initials, locationLabel } from '@/lib/chat-rules';
import { cn } from '@/lib/utils';
import type { Capacity, ChatMember } from '@/types/domain';

/**
 * How a mentor's capacity reads to somebody else. The stored values are written
 * for the mentor setting them ('at capacity'); these are written for the person
 * deciding whether to reach out.
 */
const CAPACITY_LABELS: Record<Capacity, string> = {
  open: 'Open to new conversations',
  'at capacity': 'At capacity',
  paused: 'Paused',
};

/** "SCI - para · T6" — level only exists for the injuries that have one. */
function disabilityLine(member: ChatMember): string {
  return member.level ? `${member.disability} · ${member.level}` : member.disability;
}

interface MemberRowProps {
  member: ChatMember;
  /** Set when the viewer already has a thread with this person. */
  conversationId: string | null;
  onSelect: () => void;
}

/**
 * One person in the list of people the viewer can reach.
 *
 * **Why unreachable people are still listed.** Hiding a mentor who is at
 * capacity would make the roster silently different every time somebody looked
 * at it, and would leave the searcher wondering whether they misremembered the
 * name. Showing the row with the reason is the honest version: the person is
 * real, they are just not taking conversations this week.
 */
export function MemberRow({ member, conversationId, onSelect }: MemberRowProps) {
  const reach = contactability(member);
  const unavailable = !reach.ok && conversationId === null;

  return (
    <li
      className={cn(
        'bg-card text-card-foreground rounded-xl border p-3 shadow-sm',
        unavailable && 'opacity-75',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="size-12">
          {member.photoUrl ? <AvatarImage src={member.photoUrl} alt="" /> : null}
          <AvatarFallback className="text-sm font-medium">
            {initials(member.displayName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{member.displayName}</span>
            {member.type === 'mentor' ? (
              <>
                <Badge variant="secondary">Mentor</Badge>
                {/* A mentor who never set a capacity counts as open — see contactability(). */}
                <Badge variant="outline">{CAPACITY_LABELS[member.capacity ?? 'open']}</Badge>
              </>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">{locationLabel(member)}</p>
          <p className="text-muted-foreground text-sm">{disabilityLine(member)}</p>
        </div>
      </div>

      <div className="mt-3">
        {conversationId !== null ? (
          // Already talking: the thread is the connection, so there is nothing
          // to open that is not already open.
          <Button asChild variant="outline" className="min-h-[46px] w-full">
            <Link to={`/messages/${conversationId}`}>
              Open conversation with {member.displayName}
            </Link>
          </Button>
        ) : reach.ok ? (
          <Button onClick={onSelect} className="min-h-[46px] w-full">
            Say hi to {member.displayName}
          </Button>
        ) : (
          <p className="bg-muted/60 text-muted-foreground rounded-md px-3 py-2 text-sm">
            {reach.reason}
          </p>
        )}
      </div>
    </li>
  );
}
