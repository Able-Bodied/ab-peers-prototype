import { ArrowLeft, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sharedInterests } from '@/mocks/selectors';
import { EQUIPMENT_FILTER_OPTIONS, type FilterSelect } from '@/routes/discover/filters';
import {
  contactPolicy,
  durationLabel,
  initialsOf,
  MemberWaveButton,
} from '@/routes/discover/member-card';
import { type BrowseMember, TOPICS } from '@/types/domain';

/**
 * The full profile behind a card (PRD §8). Everything the card had to truncate: the whole bio,
 * "Ask me about", interests, languages, equipment, sports equipment, grants, employment and
 * living, affiliation and verification, capacity, and the wave.
 *
 * It takes a `BrowseMember`, which is the point: `phone` and `birthDate` are not on that type, so
 * rendering either one here is a type error rather than a code-review catch.
 *
 * On phones this is the whole screen rather than a card floating over the deck — it covers the
 * bottom tab bar, and is left by the back arrow over the photo, the same way the app's other
 * detail screens are (see src/routes/event/page.tsx). From `sm:` up it goes back to being a
 * centred dialog, where a full-screen takeover would be the wrong shape.
 */

export interface MemberDetailProps {
  member: BrowseMember | null;
  viewer: BrowseMember | null;
  orgName: (slug: string) => string | undefined;
  waved: boolean;
  sending: boolean;
  /** Set when the viewer already has a thread with this person — the wave becomes "Open chat". */
  conversationId: string | null;
  onWave: () => void;
  /** PRD §8.1: tapping a chip FILTERS the deck. It never sends a message. */
  onFilterSelect: FilterSelect;
  onOpenChange: (open: boolean) => void;
}

/**
 * PRD §8.2: only controlled-vocabulary topics are tappable. Imported profiles keep the mentor's
 * own wording for display, and a free-text string matches nobody — a chip that returns one result
 * is a broken promise, so those render as plain text.
 */
const CONTROLLED_TOPICS = new Set<string>(TOPICS);

const CAPACITY_TEXT = {
  open: 'Open to new people',
  'at capacity': 'At capacity — a wave still lands, but a reply may take a while',
  paused: 'Paused — not taking new contact right now',
} as const;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
        {label}
      </h3>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );
}

/**
 * Chips for a vocabulary Discover has no filter for — sports equipment, grants, affiliations.
 * Same reasoning as a free-text topic above: with nowhere to land, a tap would be a promise the
 * deck cannot keep, so these stay plain text.
 */
function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="bg-secondary text-secondary-foreground rounded-full px-3 py-1.5 text-xs font-semibold"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/**
 * Chips that narrow the deck. Tapping one closes this profile and returns to the Discover listing
 * with that filter applied — the same trip an "Ask me about" chip makes, and the same one an event
 * tag makes back to the events list.
 *
 * Generic over the vocabulary so the caller's `onSelect` keeps the item's real type (an `Interest`
 * stays an `Interest`, not a `string`) all the way through to `FilterSelect`.
 */
function FilterChips<T extends string>({
  items,
  hint,
  filterable,
  onSelect,
}: {
  items: T[];
  /** Completes the chip's accessible name: "Spanish — show everyone who speaks this". */
  hint: string;
  /** Values the deck cannot be narrowed to, rendered plain. Everything is tappable by default. */
  filterable?: (item: T) => boolean;
  onSelect: (item: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) =>
        filterable === undefined || filterable(item) ? (
          <button
            key={item}
            type="button"
            onClick={() => {
              onSelect(item);
            }}
            aria-label={`${item} — ${hint}`}
            className="border-primary bg-secondary text-primary focus-visible:ring-ring inline-flex min-h-8 items-center rounded-full border-2 px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
          >
            {item}
          </button>
        ) : (
          <span
            key={item}
            className="bg-secondary text-secondary-foreground inline-flex min-h-8 items-center rounded-full px-3 text-xs font-semibold"
          >
            {item}
          </span>
        ),
      )}
    </div>
  );
}

export function MemberDetail({
  member,
  viewer,
  orgName,
  waved,
  sending,
  conversationId,
  onWave,
  onFilterSelect,
  onOpenChange,
}: MemberDetailProps) {
  const shared = member && viewer ? sharedInterests(viewer, member) : [];
  const sharedSet = new Set<string>(shared);

  const verifiedByName = member?.verifiedBy ? orgName(member.verifiedBy) : undefined;
  const affiliationNames = member
    ? member.affiliations
        .filter((slug) => slug !== member.verifiedBy)
        .map((slug) => orgName(slug) ?? slug)
    : [];

  /**
   * Shared interests lead, as they do on the card; the rest follow in the member's own order.
   * Partitioned out of `member.interests` rather than concatenating `shared`, which
   * `sharedInterests()` hands back as plain strings — going through the member's own array keeps
   * these typed as `Interest`, which is what `onFilterSelect('interest', …)` needs.
   */
  const interests = member
    ? [
        ...member.interests.filter((i) => sharedSet.has(i)),
        ...member.interests.filter((i) => !sharedSet.has(i)),
      ]
    : [];

  const reachable = member !== null && contactPolicy(member) !== 'closed';
  const waveButton = member && (
    <MemberWaveButton
      member={member}
      waved={waved}
      sending={sending}
      onWave={onWave}
      variant="detail"
    />
  );

  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      {member && (
        <DialogContent
          // The back arrow is the only way out, so the stock close "X" would be a second control
          // doing the same job in the opposite corner.
          showCloseButton={false}
          className={cn(
            'gap-0 overflow-y-auto p-0',
            // Phones: the whole screen, covering the bottom tab bar (which sits at z-40).
            'top-0 left-0 h-svh max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0',
            // Tablets up: back to a centred card.
            'sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[88svh] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border',
          )}
        >
          {/*
            The photo is shown whole rather than cropped to a fixed band: a vertical portrait
            letterboxes with margins either side instead of losing its top and bottom, which is
            what the event page does with an event's photo. The initials tile has no intrinsic
            size, so that case keeps a fixed height to fill.
          */}
          <div className="bg-muted relative w-full shrink-0">
            {member.photoUrl ? (
              <img
                src={member.photoUrl}
                alt={member.photoAlt ?? ''}
                className="mx-auto block max-h-96 w-auto max-w-full object-contain"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid h-52 w-full place-items-center"
                style={{ backgroundColor: member.avatarColor }}
              >
                <span className="text-[4rem] leading-none font-black text-white/85">
                  {initialsOf(member.displayName)}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
              }}
              aria-label="Back"
              // size-12, not size-11: this is the only way out of a full-screen view, so it stays
              // above the 46px tap-target floor the rest of the app keeps to.
              className="focus-visible:ring-ring absolute top-3 left-3 grid size-12 place-items-center rounded-full bg-black/55 text-white focus-visible:ring-2 focus-visible:outline-none"
            >
              <ArrowLeft className="size-6" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-5 p-5">
            <DialogHeader className="gap-1 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-2xl font-bold">{member.displayName}</DialogTitle>
                  <DialogDescription className="text-foreground text-sm font-semibold">
                    {[member.disability, member.level, member.completeness]
                      .filter(Boolean)
                      .join(' · ')}
                  </DialogDescription>
                  <p className="text-muted-foreground text-sm">
                    {member.ageBand} · {member.city}, {member.state}
                  </p>
                </div>

                {/*
                  Once there is a thread, the thread *is* the connection — there is nothing left to
                  ask for, so the same slot opens it instead (as Connect's roster rows do).
                */}
                {conversationId !== null ? (
                  <Link
                    to={`/messages/${conversationId}`}
                    aria-label={`Open chat with ${member.displayName}`}
                    className="bg-accent text-accent-foreground focus-visible:ring-ring inline-flex min-h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-bold shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <MessageCircle className="size-6" aria-hidden="true" />
                    <span>Open chat</span>
                  </Link>
                ) : reachable ? (
                  waveButton
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs font-bold">
                  {durationLabel(member)}
                </span>
                {verifiedByName && (
                  <span className="bg-accent text-accent-foreground rounded-full px-3 py-1 text-xs font-bold">
                    Verified by {verifiedByName}
                  </span>
                )}
              </div>
            </DialogHeader>

            {member.type === 'mentor' && member.capacity && (
              <p
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm font-semibold',
                  member.capacity === 'open'
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {CAPACITY_TEXT[member.capacity]}
              </p>
            )}

            {/* Deliberately not in the header: "…is not taking new messages right now" is a
                sentence, and it needs the full width to read as one rather than squeezing the
                name beside it. */}
            {conversationId === null && !reachable ? waveButton : null}

            {member.bio && (
              <Section label="In their words">
                <p className="leading-relaxed whitespace-pre-line">{member.bio}</p>
              </Section>
            )}

            {member.topics.length > 0 && (
              <Section label="Ask me about">
                <div className="flex flex-wrap gap-2">
                  {member.topics.map((topic) =>
                    CONTROLLED_TOPICS.has(topic) ? (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => {
                          onFilterSelect('topic', topic);
                        }}
                        // PRD §8.1: this filters the browse deck. It does not send a message.
                        aria-label={`${topic} — show everyone who talks about this`}
                        className="border-primary text-primary focus-visible:ring-ring inline-flex min-h-12 items-center rounded-full border-2 px-4 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {topic}
                      </button>
                    ) : (
                      <span
                        key={topic}
                        className="bg-secondary text-secondary-foreground inline-flex min-h-12 items-center rounded-full px-4 text-sm font-semibold"
                      >
                        {topic}
                      </span>
                    ),
                  )}
                </div>
              </Section>
            )}

            {member.interests.length > 0 && (
              <Section label="Interests">
                {shared.length > 0 && (
                  <p className="text-primary mb-2 text-sm font-bold">
                    You both like {shared.join(', ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {interests.map((interest) => {
                    const isShared = sharedSet.has(interest);
                    return (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => {
                          onFilterSelect('interest', interest);
                        }}
                        aria-label={`${interest} — show everyone who likes this${
                          isShared ? ', which you both do' : ''
                        }`}
                        className={cn(
                          'focus-visible:ring-ring inline-flex min-h-8 items-center rounded-full border-2 px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none',
                          isShared
                            ? 'border-accent bg-accent text-accent-foreground font-bold'
                            : 'border-primary bg-secondary text-primary',
                        )}
                      >
                        {interest}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {member.languages.length > 0 && (
              <Section label="Languages">
                <FilterChips
                  items={member.languages}
                  hint="show everyone who speaks this"
                  onSelect={(language) => {
                    onFilterSelect('language', language);
                  }}
                />
              </Section>
            )}

            <Section label="What they use">
              {/*
                "Prefer not to say" is a real answer but not a browse intent — the Filters sheet
                leaves it out for that reason (see EQUIPMENT_FILTER_OPTIONS), so a chip for it here
                would open a deck of people who declined to answer.
              */}
              <FilterChips
                items={member.equipment}
                hint="show everyone who uses this"
                filterable={(equipment) => EQUIPMENT_FILTER_OPTIONS.includes(equipment)}
                onSelect={(equipment) => {
                  onFilterSelect('equipment', equipment);
                }}
              />
              {member.equipmentDetail && (
                <p className="text-muted-foreground mt-2">{member.equipmentDetail}</p>
              )}
              {member.willAdviseOnEquipment && (
                <p className="text-primary mt-2 font-semibold">Happy to advise on equipment</p>
              )}
            </Section>

            {member.sportsEquipment.length > 0 && (
              <Section label="Sports equipment">
                <Chips items={member.sportsEquipment} />
              </Section>
            )}

            {(member.grants.length > 0 || member.willHelpWithGrants) && (
              <Section label="Grants">
                {member.grants.length > 0 ? (
                  <Chips items={member.grants} />
                ) : (
                  <p className="text-muted-foreground">No grants listed</p>
                )}
                {member.willHelpWithGrants && (
                  <p className="text-primary mt-2 font-semibold">
                    Happy to help with grant applications
                  </p>
                )}
              </Section>
            )}

            {[member.employment, member.living].some(Boolean) && (
              <Section label="Day to day">
                <p>{[member.employment, member.living].filter(Boolean).join(' · ')}</p>
              </Section>
            )}

            {affiliationNames.length > 0 && (
              <Section label="Affiliated with">
                <Chips items={affiliationNames} />
              </Section>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
