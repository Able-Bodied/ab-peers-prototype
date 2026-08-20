/**
 * The order cards come off the deck in.
 *
 * `filterMembers()` decides *who* is in the deck; this decides who is on top. It is separate from
 * the filter because it is the one place the product's own goal — "immediately see relevant peers"
 * — turns into a rule, and because ordering is the kind of thing that gets argued about and so
 * should be one testable function rather than a comparator buried in JSX.
 *
 * Three signals, in descending weight:
 *
 * 1. **Same state.** The strongest one we have that costs nothing. Location plus a shared injury
 *    is the whole premise of meeting up, and the state filter on the bar exists because people
 *    reach for it first (PRD §7.1). Ranking by it means someone gets a locally relevant deck
 *    without having to touch a filter, which matters most for the newly injured person who is
 *    least equipped to go searching (docs/CONTEXT.md).
 * 2. **Stage match.** PRD §6.1's table: someone under a year in wants a person five to ten years
 *    ahead, and someone over a year in wants a person at a similar stage. So this is not "closest
 *    duration wins" — for a newly injured viewer it is the opposite.
 * 3. **Shared interests.** The line that makes a card worth tapping (PRD §8.2), and the tiebreak
 *    once the two above are level.
 *
 * With no viewer — nobody signed in, or the viewer's own row not in the browsable set — the deck
 * keeps its incoming order rather than inventing a ranking out of nothing.
 */

import { currentDuration, isNewlyInjured, sharedInterests } from '@/mocks/selectors';
import type { BrowseMember, DurationBucket } from '@/types/domain';

/** Rough years-since-injury for each bucket, for comparing stages. */
const STAGE_YEARS: Record<DurationBucket, number> = {
  'Since birth': 30,
  'Less than 6 months': 0.25,
  '6 - 12 months': 0.75,
  '1 - 3 years': 2,
  '3 - 10 years': 6,
  '10+ years': 15,
};

/**
 * How well this person's stage suits the viewer's, 0..1.
 *
 * A newly injured viewer scores someone five to ten years ahead highest — that is the person who
 * is proof it gets better. Everyone else scores a similar stage highest, because at that point
 * what people want is someone to do things with rather than someone to ask.
 */
export function stageScore(viewer: BrowseMember, candidate: BrowseMember): number {
  const viewerYears = STAGE_YEARS[currentDuration(viewer)];
  const candidateYears = STAGE_YEARS[currentDuration(candidate)];

  if (isNewlyInjured({ duration: currentDuration(viewer) })) {
    const ahead = candidateYears - viewerYears;
    if (ahead <= 0) return 0;
    // Peaks at 7.5 years ahead, the middle of the PRD's five-to-ten band, and falls away either
    // side rather than cutting off — someone four years ahead is still worth meeting.
    return 1 / (1 + Math.abs(ahead - 7.5) / 7.5);
  }

  return 1 / (1 + Math.abs(candidateYears - viewerYears) / 5);
}

/** Higher sorts first. Exported so the weighting is visible to a test rather than implied. */
export function relevanceScore(viewer: BrowseMember, candidate: BrowseMember): number {
  const sameState = candidate.state === viewer.state ? 1 : 0;
  const shared = sharedInterests(viewer, candidate).length;
  return sameState * 100 + stageScore(viewer, candidate) * 10 + Math.min(shared, 5);
}

/**
 * Returns a new array; does not mutate. Ties keep their incoming order, so a deck does not
 * reshuffle under someone as they scroll.
 */
export function rankMembers<T extends BrowseMember>(
  members: T[],
  viewer: BrowseMember | null,
): T[] {
  if (!viewer) return [...members];
  return members
    .map((member, index) => ({ member, index, score: relevanceScore(viewer, member) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.member);
}
