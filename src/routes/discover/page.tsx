import { SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useBrowseMembers } from '@/lib/browse-members';
import { useOrganizations } from '@/lib/organizations';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useWaves } from '@/lib/waves';
import { defaultTabFor, filterMembers } from '@/mocks/selectors';
import { DiscoverFilterSheet } from '@/routes/discover/filter-sheet';
import {
  activeFilterChips,
  activeFilterCount,
  clearedFilters,
  clearFilter,
  defaultDiscoverFilters,
  languagesIn,
  setFilter,
  topicsIn,
} from '@/routes/discover/filters';
import { MemberCard } from '@/routes/discover/member-card';
import { MemberDetail } from '@/routes/discover/member-detail';
import { rankMembers } from '@/routes/discover/ranking';
import {
  inEdgeGuard,
  nextSegment,
  startsInHorizontalScroller,
  swipeDirection,
} from '@/routes/discover/swipe';
import {
  type BrowseMember,
  DISCOVER_SEGMENTS,
  type DiscoverSegment,
  type MemberFilters,
  type Topic,
} from '@/types/domain';

/**
 * Discover — the surface a member browses people on, and the first thing they see after signing
 * up. Peers and Mentors are segment pills at the top rather than two bottom-bar tabs, because at
 * this card size a segment is a change of content and nothing else (PRD §7.0, §5).
 *
 * The people are real rows: `browse_members` (supabase/migrations/
 * 20260820110000_browse_members_view.sql), which is the `members` table minus `phone` and
 * `birth_date`, filtered to people who left "Show me in browse" on, and readable only by the
 * `authenticated` role. That last part is the whole of PRD §5.1 in one grant — events are the
 * public shopfront, people are not — and it is why this page has a signed-out state at all rather
 * than an empty deck.
 *
 * Three things here are deliberate and easy to undo by accident:
 *
 * - **Tapping an "Ask me about" topic filters the deck. It never sends a message.** PRD §8.1
 *   reverses an earlier design that composed and sent an opener in one tap, on the grounds that it
 *   made asking too cheap: there are ~25 mentors and no upper bound on mentees, and volume is what
 *   overwhelms a mentor. Friction in front of the first message is the feature.
 * - **Filtering happens on the client.** The whole browsable set is one fetch (see
 *   `useBrowseMembers`), so a filter toggle is instant and a swipe between segments costs nothing.
 *   At a few hundred people that is the right trade; past that, the sheet filters move into the
 *   query and this comment should go with them.
 * - **Every gesture has a tap equivalent** (PRD §7.2). The pills do what the swipe does.
 *
 * TODO(team):
 *  - [x] Peers / Mentors segments, by pill and by horizontal swipe
 *  - [x] Full-bleed cards from real member rows, one per screen
 *  - [x] State and disability in the Filters sheet, alongside everything else it holds
 *  - [x] "Ask me about" chips filter the deck rather than sending a message
 *  - [x] Say hi, rate limited, with the mentor-capacity rules applied
 *  - [ ] Waves inbox — the other half of §8, and where a wave back opens a thread
 *  - [ ] Ranking should fold in who a coordinator introduced, once introductions exist
 */

const SEGMENT_LABELS: Record<DiscoverSegment, string> = {
  peers: 'Peers',
  mentors: 'Mentors',
};

const SEGMENT_EMPTY_COPY: Record<DiscoverSegment, string> = {
  peers: 'No peers match these filters yet.',
  mentors: 'No mentors match these filters yet.',
};

export default function DiscoverPage() {
  const { member: account, loading: sessionLoading } = useSession();
  const { members, loading, error, requiresSignIn, reload } = useBrowseMembers();
  const { organizations } = useOrganizations();
  const { hasWaved, sendWave, sendingTo, error: waveError, remainingToday } = useWaves();

  const [segment, setSegment] = useState<DiscoverSegment | null>(null);
  const [filters, setFilters] = useState<MemberFilters>({ ...defaultDiscoverFilters });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  /**
   * The viewer as other members see them. The session carries only the subset onboarding collects
   * (`AccountMember`), which is not enough to rank against — so the viewer's own row is picked out
   * of the browsable set, where it already is. Null until it loads, or if they have switched
   * themselves out of browse, in which case the deck simply keeps its incoming order.
   */
  const viewer: BrowseMember | null = useMemo(
    () => (account ? (members.find((m) => m.id === account.id) ?? null) : null),
    [account, members],
  );

  /**
   * Newly injured people land on Mentors, everyone else on Peers (PRD §6.1's routing table). It is
   * a default and not a lock — the pills are right there — so it applies only until the person
   * chooses, which is what the null segment state tracks.
   */
  const defaultSegment: DiscoverSegment =
    account && defaultTabFor(account) === 'mentors' ? 'mentors' : 'peers';
  const activeSegment = segment ?? defaultSegment;

  const orgName = useCallback(
    (slug: string) => organizations.find((org) => org.slug === slug)?.name,
    [organizations],
  );

  const inSegment = useMemo(
    () =>
      members.filter(
        (m) =>
          m.id !== account?.id &&
          (activeSegment === 'mentors' ? m.type === 'mentor' : m.type === 'peer'),
      ),
    [members, activeSegment, account],
  );

  const visible = useMemo(
    () => rankMembers(filterMembers(inSegment, filters), viewer),
    [inSegment, filters, viewer],
  );

  const detailMember = useMemo(
    () => (detailId ? (members.find((m) => m.id === detailId) ?? null) : null),
    [detailId, members],
  );

  const filterCount = activeFilterCount(filters);
  const chips = activeFilterChips(filters, orgName);

  const deckRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; target: Element | null } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // A drag starting in iOS's reserved left edge belongs to the system back gesture.
    if (inEdgeGuard(event.clientX)) {
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      target: event.target instanceof Element ? event.target : null,
    };
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;

    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    if (!direction) return;
    // An interest or topic strip with somewhere left to scroll keeps its own gesture.
    if (startsInHorizontalScroller(start.target, deckRef.current, direction)) return;

    setSegment(nextSegment(activeSegment, direction));
  }

  /** PRD §8.1 — a topic chip is a filter, not an outbound message. */
  const onTopicSelect = useCallback((topic: Topic) => {
    setFilters((current) => setFilter(current, 'topic', topic));
    setDetailId(null);
  }, []);

  if (sessionLoading || (loading && members.length === 0)) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm" role="status">
        Loading people…
      </p>
    );
  }

  // PRD §5.1: every peer and mentor profile is behind sign-in. This is the honest cost of that
  // decision, so it should read as a door rather than as a failure.
  if (requiresSignIn || !account) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Find peers. Find mentors.</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          Member profiles are only visible to other members, so nobody's name, photo or injury level
          is on the open web. Signing up takes about two minutes.
        </p>
        <a
          href="/onboarding"
          className="bg-accent text-accent-foreground mt-6 inline-flex min-h-[46px] items-center rounded-full px-6 font-bold"
        >
          Get started
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={reload}
          className="bg-secondary text-secondary-foreground mt-4 min-h-[46px] rounded-full px-6 text-sm font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="sr-only">Discover</h1>

      {/*
        Peers, Mentors, and the Filters button — three standalone pills, matching
        docs/screens/events-screen.html's `.top` bar rather than a joined segmented track. The
        swipe below does exactly what the segment pills do, never more (PRD §7.2); State and
        Disability moved into the sheet so this row stays exactly three buttons.
      */}
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Browse peers or mentors" className="flex gap-2">
          {DISCOVER_SEGMENTS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={activeSegment === option}
              onClick={() => {
                setSegment(option);
              }}
              className={cn(
                'focus-visible:ring-ring min-h-[46px] rounded-full border-2 px-6 text-base font-bold focus-visible:ring-2 focus-visible:outline-none',
                activeSegment === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-foreground',
              )}
            >
              {SEGMENT_LABELS[option]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setSheetOpen(true);
          }}
          aria-label={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
          className="bg-card focus-visible:ring-ring relative ml-auto grid size-[46px] shrink-0 place-items-center rounded-full border-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          {filterCount > 0 ? (
            <span className="bg-accent text-accent-foreground absolute -top-1 -right-1 grid size-5 place-items-center rounded-full text-[11px] font-bold">
              {filterCount}
            </span>
          ) : null}
        </button>
      </div>

      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                setFilters((current) => clearFilter(current, chip.key));
              }}
              aria-label={`Remove filter ${chip.label}`}
              className="border-primary bg-secondary text-primary inline-flex min-h-[36px] items-center gap-1 rounded-full border-2 px-3 text-xs font-semibold"
            >
              {chip.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFilters(clearedFilters());
            }}
            className="text-muted-foreground min-h-[36px] px-2 text-xs font-semibold underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {waveError ? (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {waveError}
        </p>
      ) : null}
      {remainingToday <= 3 && remainingToday > 0 ? (
        <p className="text-muted-foreground mt-3 text-xs" role="status">
          {remainingToday} more {remainingToday === 1 ? 'hi' : 'his'} today.
        </p>
      ) : null}

      <div
        ref={deckRef}
        data-testid="deck"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="mt-4 flex flex-col gap-4 pb-8"
      >
        {visible.length === 0 ? (
          <div className="py-16 text-center" role="status">
            <p className="text-sm font-semibold">{SEGMENT_EMPTY_COPY[activeSegment]}</p>
            {filterCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setFilters(clearedFilters());
                }}
                className="bg-secondary text-secondary-foreground mt-4 min-h-[46px] rounded-full px-6 text-sm font-semibold"
              >
                Clear filters
              </button>
            ) : (
              <p className="text-muted-foreground mt-2 text-sm">
                Try the other segment, or check back — people are still joining.
              </p>
            )}
          </div>
        ) : (
          visible.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              viewer={viewer}
              orgName={orgName}
              waved={hasWaved(member.id)}
              sending={sendingTo === member.id}
              onWave={() => {
                void sendWave(member.id);
              }}
              onTopicSelect={onTopicSelect}
              onOpenDetail={() => {
                setDetailId(member.id);
              }}
            />
          ))
        )}
      </div>

      <DiscoverFilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onChange={setFilters}
        organizations={organizations}
        languages={languagesIn(members)}
        topics={topicsIn(members)}
        resultCount={visible.length}
      />

      <MemberDetail
        member={detailMember}
        viewer={viewer}
        orgName={orgName}
        waved={detailMember ? hasWaved(detailMember.id) : false}
        sending={detailMember ? sendingTo === detailMember.id : false}
        onWave={() => {
          if (detailMember) void sendWave(detailMember.id);
        }}
        onTopicSelect={onTopicSelect}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />
    </div>
  );
}
