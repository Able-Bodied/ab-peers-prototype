import { Check, Hand, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { canMessageDirectly, currentDuration, sharedInterests } from '@/mocks/selectors';
import type { BrowseMember, Topic } from '@/types/domain';

/**
 * The full-bleed browse card (PRD §7.0). The photo *is* the card: it fills the frame and
 * everything else sits on top of it. Purely presentational — it takes `waved`/`sending` and
 * calls `onWave`; it never fetches, and it holds no data state of its own.
 */

export interface MemberCardProps {
  member: BrowseMember;
  viewer: BrowseMember | null;
  /** slug -> display name, for the affiliation / verified-by badge. */
  orgName: (slug: string) => string | undefined;
  waved: boolean;
  sending: boolean;
  onWave: () => void;
  /** PRD §8.1: tapping a topic FILTERS the deck. It never sends a message. */
  onTopicSelect: (topic: Topic) => void;
  onOpenDetail: () => void;
}

/**
 * Whether this person is reachable right now.
 *
 * Peers are always wave-able — a wave back is what opens the thread (PRD §8), so
 * `canMessageDirectly` being false for them is normal rather than a closed door. Mentors are the
 * ones who set capacity, and a mentor who is paused (or has switched unsolicited contact off)
 * must not be shown a button that pretends contact is available.
 */
export type ContactPolicy = 'available' | 'delayed' | 'closed';

export function contactPolicy(member: BrowseMember): ContactPolicy {
  if (member.type !== 'mentor') return 'available';
  if (!member.openToMessages || member.capacity === 'paused') return 'closed';
  if (member.capacity === 'at capacity') return 'delayed';
  return canMessageDirectly(member) ? 'available' : 'closed';
}

export function initialsOf(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, '').charAt(0))
    .filter(Boolean);
  return (letters.slice(0, 2).join('') || '?').toUpperCase();
}

/**
 * Time since injury as a pill. Reads `currentDuration()` rather than the stored bucket, so
 * somebody who answered "Less than 6 months" two years ago doesn't stay newly injured forever.
 */
export function durationLabel(member: BrowseMember): string {
  const bucket = currentDuration(member);
  if (bucket === 'Since birth') return 'Since birth';
  // "since injury" only makes sense for the person themselves — a parent or caregiver profile
  // gets the bare bucket.
  return member.relationship === 'Self' ? `${bucket} since injury` : bucket;
}

const CAPACITY_LABELS = {
  open: 'Open',
  'at capacity': 'At capacity',
  paused: 'Paused',
} as const;

/** The org shown on a mentor card: the verifying org if there is one, else the first affiliation. */
function cardOrgLabel(
  member: BrowseMember,
  orgName: (slug: string) => string | undefined,
): string | null {
  if (member.verifiedBy) {
    const name = orgName(member.verifiedBy);
    return name ? `Verified by ${name}` : null;
  }
  const first = member.affiliations[0];
  return first ? (orgName(first) ?? null) : null;
}

export interface MemberWaveButtonProps {
  member: BrowseMember;
  waved: boolean;
  sending: boolean;
  onWave: () => void;
  /** 'card' is the large circle on the deck; 'detail' is the wide button inside the profile. */
  variant: 'card' | 'detail';
}

/**
 * "Say hi" — the primary action in the product, and on a card the largest tap target on screen
 * (64px circle, well over the 46px floor). Its accessible name always names the person, because
 * a screen-reader user meets several of these in a row.
 */
export function MemberWaveButton({
  member,
  waved,
  sending,
  onWave,
  variant,
}: MemberWaveButtonProps) {
  const policy = contactPolicy(member);
  const onCard = variant === 'card';

  if (policy === 'closed') {
    return (
      <p
        className={cn(
          'rounded-2xl px-3 py-2 text-xs font-semibold',
          onCard ? 'bg-black/50 text-white' : 'bg-secondary text-secondary-foreground text-sm',
        )}
      >
        {member.displayName} is not taking new messages right now.
      </p>
    );
  }

  // Once you've waved the button stops asking. It stays on screen so the state is legible, but it
  // reads as done rather than as an unfinished task.
  const label = waved
    ? `You said hi to ${member.displayName}`
    : sending
      ? `Sending hi to ${member.displayName}`
      : policy === 'delayed'
        ? `Say hi to ${member.displayName} — at capacity, may take a while to hear back`
        : `Say hi to ${member.displayName}`;

  const Icon = waved ? Check : sending ? Loader2 : Hand;

  return (
    <button
      type="button"
      // aria-disabled rather than disabled, so the finished state stays focusable and announced.
      aria-disabled={waved}
      aria-busy={sending}
      disabled={sending}
      onClick={() => {
        if (!waved) onWave();
      }}
      aria-label={onCard ? label : undefined}
      className={cn(
        'focus-visible:ring-ring inline-flex shrink-0 items-center justify-center gap-2 font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        onCard
          ? 'size-16 rounded-full shadow-lg'
          : 'min-h-12 w-full rounded-2xl px-4 text-sm shadow-sm',
        waved
          ? 'bg-secondary text-secondary-foreground'
          : 'bg-accent text-accent-foreground hover:brightness-105',
      )}
    >
      <Icon className={cn('size-6', sending && 'animate-spin')} aria-hidden="true" />
      {onCard ? null : <span>{label}</span>}
    </button>
  );
}

export function MemberCard({
  member,
  viewer,
  orgName,
  waved,
  sending,
  onWave,
  onTopicSelect,
  onOpenDetail,
}: MemberCardProps) {
  const isMentor = member.type === 'mentor';
  const shared = viewer ? sharedInterests(viewer, member) : [];
  const sharedSet = new Set<string>(shared);
  // Shared interests lead the strip; the rest follow in the member's own order.
  const interests = [...shared, ...member.interests.filter((i) => !sharedSet.has(i))];

  // Name, then what decides whether this is the right person; age and city go second (PRD §7.0).
  const primaryLine = [member.disability, member.level, member.equipment.join(', ')]
    .filter(Boolean)
    .join(' · ');
  const secondaryLine = `${member.ageBand} · ${member.city}, ${member.state}`;
  const orgLabel = isMentor ? cardOrgLabel(member, orgName) : null;

  return (
    <article
      className={cn(
        'bg-card relative w-full overflow-hidden rounded-3xl',
        // Mentors is closer to a decision than a browse (PRD §7.0) — the mentor card is shorter so
        // more of the next one peeks in and four people can be compared with less scrolling.
        isMentor ? 'h-[58svh] min-h-[420px]' : 'h-[70svh] min-h-[480px]',
      )}
    >
      {member.photoUrl ? (
        <img
          src={member.photoUrl}
          alt={member.photoAlt ?? ''}
          className="absolute inset-0 z-0 size-full object-cover"
        />
      ) : (
        // No photo is a first-class case, not a hole: the tile fills the same frame in the
        // member's own colour (PRD §6.4). The name is already text, so the initials are decorative.
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 grid place-items-center"
          style={{ backgroundColor: member.avatarColor }}
        >
          <span className="text-[5rem] leading-none font-black tracking-tight text-white/85">
            {initialsOf(member.displayName)}
          </span>
        </div>
      )}

      {/*
        The card body is a button *behind* the content rather than a wrapper around it. Wrapping
        would swallow the wave button and the topic chips into one giant control; sitting behind,
        with the content layer transparent to pointer events, keeps three separate tab stops.
      */}
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`More about ${member.displayName}`}
        className="focus-visible:ring-ring absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
      >
        <span className="absolute top-4 right-4 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white">
          More
        </span>
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 bg-gradient-to-b from-black/70 to-transparent pt-4 pr-24 pb-10 pl-4">
        <h3 className="text-2xl leading-tight font-bold text-white">{member.displayName}</h3>
        <p className="text-sm font-semibold text-white">{primaryLine}</p>
        <p className="text-xs font-medium text-white/85">{secondaryLine}</p>
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          <span className="rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold text-white">
            {durationLabel(member)}
          </span>
          {orgLabel && (
            <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-1 text-[11px] font-bold">
              {orgLabel}
            </span>
          )}
          {isMentor && member.capacity && (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-black">
              {CAPACITY_LABELS[member.capacity]}
            </span>
          )}
        </div>
      </div>

      {/*
        The scrim is a fixed fade strip above a solid backdrop, rather than one gradient stretched
        over the whole block. A stretched gradient makes readability depend on how tall the block
        happens to be: it was fine on a peer card and failed on a mentor one, where the extra
        "Ask me about" strip pushes the shared-interest line up into the part that has already
        faded out — accent orange on a warm initials tile, which is exactly the pairing that stops
        being legible. Splitting the two means every line of text sits on the same near-black
        whatever the card's height and whatever colour the member's tile is.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col">
        <div className="h-14 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="flex flex-col gap-2.5 bg-black/85 pb-4">
          <div className="flex items-end gap-3 pr-4 pl-4">
            <div className="min-w-0 flex-1">
              {shared.length > 0 && (
                <p className="text-accent mb-1 text-xs font-bold">
                  You both like {shared.join(', ')}
                </p>
              )}
              <p className="line-clamp-3 text-sm leading-snug text-white/90">{member.bio}</p>
            </div>
            <div className="pointer-events-auto">
              <MemberWaveButton
                member={member}
                waved={waved}
                sending={sending}
                onWave={onWave}
                variant="card"
              />
            </div>
          </div>

          {member.topics.length > 0 && (
            <div className="pointer-events-auto">
              <p className="px-4 text-[11px] font-bold tracking-wide text-white/70 uppercase">
                Ask me about
              </p>
              {/*
              A drag that starts on a strip scrolls the strip; it must not change segment
              (PRD §7.2). No right padding, so the last chip runs off the edge on purpose — that
              overflow is what says there is more.
            */}
              <div className="mt-1 flex gap-2 overflow-x-auto pb-0.5 pl-4">
                {member.topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      onTopicSelect(topic);
                    }}
                    aria-label={`${topic} — show everyone who talks about this`}
                    className="focus-visible:ring-ring inline-flex min-h-[46px] shrink-0 items-center rounded-full bg-white/95 px-4 text-xs font-bold text-black focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {interests.length > 0 && (
            <div className="pointer-events-auto flex gap-2 overflow-x-auto pl-4">
              {interests.map((interest) => {
                const isShared = sharedSet.has(interest);
                return (
                  <span
                    key={interest}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold',
                      isShared
                        ? 'bg-accent text-accent-foreground font-bold'
                        : 'bg-white/20 text-white',
                    )}
                  >
                    {interest}
                    {isShared && <span className="sr-only"> — you both like this</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
