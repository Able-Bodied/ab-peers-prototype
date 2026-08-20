import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sharedInterests } from '@/mocks/selectors';
import { durationLabel, initialsOf, MemberWaveButton } from '@/routes/discover/member-card';
import { type BrowseMember, TOPICS, type Topic } from '@/types/domain';

/**
 * The full profile behind a card (PRD §8). Everything the card had to truncate: the whole bio,
 * "Ask me about", interests, languages, equipment, sports equipment, grants, employment and
 * living, affiliation and verification, capacity, and the wave.
 *
 * It takes a `BrowseMember`, which is the point: `phone` and `birthDate` are not on that type, so
 * rendering either one here is a type error rather than a code-review catch.
 */

export interface MemberDetailProps {
  member: BrowseMember | null;
  viewer: BrowseMember | null;
  orgName: (slug: string) => string | undefined;
  waved: boolean;
  sending: boolean;
  onWave: () => void;
  onTopicSelect: (topic: Topic) => void;
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

export function MemberDetail({
  member,
  viewer,
  orgName,
  waved,
  sending,
  onWave,
  onTopicSelect,
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

  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      {member && (
        <DialogContent className="max-h-[88svh] gap-0 overflow-y-auto p-0 sm:max-w-md">
          <div className="relative h-52 w-full shrink-0 overflow-hidden">
            {member.photoUrl ? (
              <img
                src={member.photoUrl}
                alt={member.photoAlt ?? ''}
                className="size-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-full place-items-center"
                style={{ backgroundColor: member.avatarColor }}
              >
                <span className="text-[4rem] leading-none font-black text-white/85">
                  {initialsOf(member.displayName)}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5 p-5">
            <DialogHeader className="gap-1">
              <DialogTitle className="text-2xl font-bold">{member.displayName}</DialogTitle>
              <DialogDescription className="text-foreground text-sm font-semibold">
                {[member.disability, member.level, member.completeness].filter(Boolean).join(' · ')}
              </DialogDescription>
              <p className="text-muted-foreground text-sm">
                {member.ageBand} · {member.city}, {member.state}
              </p>
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
                          onTopicSelect(topic);
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
                  {[...shared, ...member.interests.filter((i) => !sharedSet.has(i))].map(
                    (interest) => {
                      const isShared = sharedSet.has(interest);
                      return (
                        <span
                          key={interest}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-semibold',
                            isShared
                              ? 'bg-accent text-accent-foreground font-bold'
                              : 'bg-secondary text-secondary-foreground',
                          )}
                        >
                          {interest}
                          {isShared && <span className="sr-only"> — you both like this</span>}
                        </span>
                      );
                    },
                  )}
                </div>
              </Section>
            )}

            {member.languages.length > 0 && (
              <Section label="Languages">
                <Chips items={member.languages} />
              </Section>
            )}

            <Section label="What they use">
              <Chips items={member.equipment} />
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

            <MemberWaveButton
              member={member}
              waved={waved}
              sending={sending}
              onWave={onWave}
              variant="detail"
            />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
