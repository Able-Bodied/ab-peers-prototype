/**
 * Shared selectors. Put logic here rather than in a route, so Peers, Mentors
 * and Events agree on what "matching" means.
 */

import type {
  DurationBucket,
  EventFilters,
  EventItem,
  Member,
  MemberFilters,
  Topic,
} from "@/types/domain";

/** Interests the two people have in common — the line that makes a card worth tapping. */
export function sharedInterests(a: Member, b: Member): string[] {
  const mine = new Set(a.interests);
  return b.interests.filter((i) => mine.has(i));
}

/** Under a year in. Routes them to Mentors rather than Peers on first launch. */
export function isNewlyInjured(m: Member): boolean {
  return m.duration === "Less than 6 months" || m.duration === "6 - 12 months";
}

export function defaultTabFor(m: Member): "peers" | "mentors" | "events" {
  return isNewlyInjured(m) ? "mentors" : "peers";
}

/**
 * Roll a duration bucket forward. Store durationAnsweredOn when it is set and
 * call this on read, or the "newly injured" segment fills with people who are not.
 */
export function currentDuration(m: Member, now = new Date()): DurationBucket {
  if (m.duration === "Since birth") return m.duration;
  const months =
    (now.getTime() - new Date(m.durationAnsweredOn).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  const order: DurationBucket[] = [
    "Less than 6 months",
    "6 - 12 months",
    "1 - 3 years",
    "3 - 10 years",
    "10+ years",
  ];
  const floor: Record<string, number> = {
    "Less than 6 months": 0,
    "6 - 12 months": 6,
    "1 - 3 years": 12,
    "3 - 10 years": 36,
    "10+ years": 120,
  };
  const elapsed = floor[m.duration] + months;
  let out: DurationBucket = m.duration;
  for (const b of order) if (elapsed >= floor[b]) out = b;
  return out;
}

export function filterMembers(
  members: Member[],
  f: MemberFilters,
  viewer?: Member,
): Member[] {
  const out = members.filter((m) => {
    if (!m.showInBrowse) return false;
    if (viewer && m.id === viewer.id) return false;
    if (f.state !== "All" && m.state !== f.state) return false;
    if (f.disability !== "All" && m.disability !== f.disability) return false;
    if (f.equipment && f.equipment !== "All" && !m.equipment.includes(f.equipment)) return false;
    if (f.orgId && f.orgId !== "All" && !m.affiliations.includes(f.orgId)) return false;
    if (f.duration && f.duration !== "All" && currentDuration(m) !== f.duration) return false;
    if (f.language && f.language !== "All" && !m.languages.includes(f.language)) return false;
    if (f.topic && f.topic !== "All" && !m.topics.includes(f.topic)) return false;
    return true;
  });
  if (!viewer) return out;
  // Most in common first. Enough of an algorithm at this size.
  return out.sort((a, b) => sharedInterests(viewer, b).length - sharedInterests(viewer, a).length);
}

/**
 * Virtual events ignore the state filter on purpose — they are the only content
 * that makes the tab non-empty everywhere.
 */
export function filterEvents(events: EventItem[], f: EventFilters): EventItem[] {
  return events
    .filter((e) => {
      if (e.mode === "virtual") return f.includeVirtual;
      if (f.state !== "All" && e.state !== f.state) return false;
      if (f.activity && f.activity !== "All" && e.activity !== f.activity) return false;
      return true;
    })
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
}

export function isUpcoming(e: EventItem, now = new Date()): boolean {
  return new Date(e.startsAt) >= now;
}

/** How many people at this event share the viewer's disability. Drives attendance. */
export function matchingAttendees(e: EventItem, viewer: Member): number {
  // Placeholder until RSVPs are real: derived, deterministic, and obviously fake.
  return e.goingCount > 4 && viewer.disability.startsWith("SCI") ? Math.floor(e.goingCount / 3) : 0;
}

/** The opener an "Ask me about" chip composes. Editable before sending. */
export function openerFor(topic: Topic): string {
  return `Hi — I have a question about ${topic.toLowerCase()}.`;
}

/** Mentors who are open take a message straight away; peers need a wave back. */
export function canMessageDirectly(target: Member): boolean {
  return target.type === "mentor" && target.openToMessages && target.capacity === "open";
}
