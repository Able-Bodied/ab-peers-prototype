/**
 * Domain types for ab-peers-prototype.
 *
 * Single source of truth for every shape in the app. Additive changes are fine;
 * renaming a field is a conversation first — four route folders import from here.
 *
 * Mirrors PRD v5. Where this disagrees with docs/CONTEXT.md, CONTEXT.md wins and
 * this file should be corrected.
 */

/* ------------------------------------------------------------------ enums */

export const DISABILITIES = [
  'SCI - para',
  'SCI - quad',
  'TBI',
  'Spina Bifida',
  'Cerebral Palsy',
  'Amputee',
  'MS',
  'Combo (SCI and TBI)',
  'Other',
] as const;
export type Disability = (typeof DISABILITIES)[number];

/** Level only applies to SCI and Combo. Ranges exist because people describe them that way. */
export const INJURY_LEVELS = [
  'C1',
  'C2',
  'C3',
  'C4',
  'C5',
  'C6',
  'C7',
  'C8',
  'C4/5',
  'C5/6',
  'C6/7',
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T10',
  'T11',
  'T12',
  'T11/12',
  'L1',
  'L2',
  'L3',
  'L4',
  'L5',
  'S1',
  'S2',
  'S3',
  'S4',
  'Do not know',
] as const;
export type InjuryLevel = (typeof INJURY_LEVELS)[number];

export const COMPLETENESS = ['Complete', 'Incomplete', 'Do not know'] as const;
export type Completeness = (typeof COMPLETENESS)[number];

/**
 * How long someone has been disabled. A bucket, not a date — easier to answer,
 * and "Since birth" is a normal option rather than an escape hatch.
 * Always store `durationAnsweredOn` alongside it and roll people forward,
 * or the "newly injured" segment fills with people who no longer are.
 */
export const DURATIONS = [
  'Since birth',
  'Less than 6 months',
  '6 - 12 months',
  '1 - 3 years',
  '3 - 10 years',
  '10+ years',
] as const;
export type DurationBucket = (typeof DURATIONS)[number];

/** Asked in onboarding, because equipment is a browse filter. */
export const EQUIPMENT = [
  'Manual chair',
  'Power assist',
  'Power chair',
  'Scooter',
  'Crutches or walker',
  'Walks unaided',
  'Prefer not to say',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const SPORTS_EQUIPMENT = [
  'Handcycle',
  'Monoski or sit-ski',
  'Sport wheelchair',
  'Racing chair',
  'Off-road or trail chair',
  'Kayak and paddling',
  'FES bike',
  'Standing frame',
  'Adaptive climbing gear',
  'Hunting or fishing rig',
  'Scuba gear',
  'Other',
] as const;
export type SportsEquipment = (typeof SPORTS_EQUIPMENT)[number];

export const GRANTS = [
  'Kelly Brush Foundation',
  'Challenged Athletes Foundation',
  'Reeve Foundation Quality of Life',
  'Triumph Foundation',
  'High Fives',
  'Swim with Mike',
  'State Department of Rehabilitation',
  'VA',
  'Other',
] as const;
export type Grant = (typeof GRANTS)[number];

export const AGE_BANDS = ['18-29', '30-39', '40-49', '50-59', '60-69', '70+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const CAPACITIES = ['open', 'at capacity', 'paused'] as const;
export type Capacity = (typeof CAPACITIES)[number];

export const MEMBER_TYPES = ['peer', 'mentor'] as const;
export type MemberType = (typeof MEMBER_TYPES)[number];

export const RELATIONSHIPS = [
  'Self',
  'Family member (parent)',
  'Family member (partner)',
  'Caregiver',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const EVENT_MODES = ['in-person', 'virtual'] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const ROSTER_VISIBILITY = ['attendees', 'first-names', 'off'] as const;
export type RosterVisibility = (typeof ROSTER_VISIBILITY)[number];

export const INTERESTS = [
  '3D printing',
  'Archery',
  'Baking',
  'Birding',
  'Board games',
  'Camping',
  'Coffee',
  'Cooking',
  'Dogs',
  'Film & TV',
  'Fishing',
  'Gardening',
  'Gym & fitness',
  'Handcycling',
  'Hiking with a trail chair',
  'Kayaking',
  'Live music',
  'Monoskiing',
  'Painting',
  'Photography',
  'Podcasts',
  'Reading',
  'Road trips',
  'Rock climbing',
  'Sailing',
  'Scuba diving',
  'Sled hockey',
  'Swimming',
  'Travel',
  'Video games',
  'Volunteering',
  'Wheelchair basketball',
  'Wheelchair rugby',
  'Wheelchair tennis',
  'Woodworking',
] as const;
export type Interest = (typeof INTERESTS)[number];

/** Craig Q10 + Q23, plus what NorCal's mentors actually say. Free text supplements it. */
export const TOPICS = [
  'Aging with SCI',
  'Baclofen pump',
  'Being injured young',
  'Botox',
  'Bowel program',
  'Choosing a wheelchair',
  'Choosing adaptive equipment',
  'Colostomy',
  'Dating & intimacy',
  'Dictation & assistive tech',
  'Driving & hand controls',
  'Getting back on a bike',
  'Going back to school',
  'Grants & funding',
  'Hiring & managing caregivers',
  'Home modifications',
  'Intermittent catheterization',
  'Mental health',
  'Moving out & living independently',
  'Pain management',
  'Pregnancy & parenting',
  'Pressure sores',
  'Returning to work',
  'SSI/SSDI & benefits',
  'Service animals',
  'Spasticity & tone',
  'Suprapubic catheter',
  'Transfers',
  'Travel & flying',
  'UTIs',
  'Vehicle modifications',
] as const;
export type Topic = (typeof TOPICS)[number];

export const US_STATES = [
  'Arizona',
  'California',
  'Colorado',
  'Florida',
  'Georgia',
  'Idaho',
  'Maryland',
  'Michigan',
  'Minnesota',
  'Nevada',
  'New Jersey',
  'New York',
  'North Carolina',
  'Oregon',
  'Pennsylvania',
  'Texas',
  'Utah',
  'Vermont',
  'Washington',
] as const;
export type UsState = (typeof US_STATES)[number];

/* ------------------------------------------------------------------ models */

export interface Org {
  id: string;
  name: string;
  city: string;
  state: string;
  description: string;
  website: string;
  /** Unclaimed orgs are visible but marked, and are not surfaced without live events. */
  claimed: boolean;
  tags: string[];
  followerCount: number;
}

export interface Member {
  id: string;
  type: MemberType;
  displayName: string;

  /** E.164 format. Never rendered to other members — sign-in identity only. */
  phone: string;

  /** Optional, always. A required photo filters out the people we most need. */
  photoUrl: string | null;
  photoAlt: string | null;
  /** Fallback tile colour when there is no photo. */
  avatarColor: string;

  city: string;
  state: UsState;

  disability: Disability;
  level: InjuryLevel | null;
  completeness: Completeness | null;

  duration: DurationBucket;
  /** ISO date. Used to roll the bucket forward over time. */
  durationAnsweredOn: string;
  /** Derived where known; null for congenital or unknown. Display as a range. */
  yearsSince: number | null;

  /**
   * ISO date (YYYY-MM-DD). Collected once at onboarding for the under-18 gate;
   * never rendered anywhere in the app — every UI surface reads `ageBand` instead.
   */
  birthDate: string;
  ageBand: AgeBand;
  relationship: Relationship;

  equipment: Equipment[];
  equipmentDetail: string | null;
  sportsEquipment: SportsEquipment[];
  willAdviseOnEquipment: boolean;

  grants: Grant[];
  willHelpWithGrants: boolean;

  languages: string[];
  interests: Interest[];
  /** Shown as "Ask me about" and tappable — each one composes an opener. */
  topics: Topic[];

  bio: string;
  employment: string | null;
  living: string | null;

  affiliations: string[];
  /** Org id. Presence of this is what makes someone a Mentor rather than an Experienced peer. */
  verifiedBy: string | null;

  openToMessages: boolean;
  capacity: Capacity | null;

  /** Opt-out of appearing in browse without losing the ability to browse or wave. */
  showInBrowse: boolean;
}

/**
 * A member as anyone *other than that member* is allowed to see them.
 *
 * `phone` and `birthDate` are the two fields that never leave the row they belong to: the phone
 * number is sign-in identity and is "never shown to members" (PRD §6), and the birth date is kept
 * only for the under-18 gate, with every UI surface reading `ageBand` instead (PRD §6.2). Browse
 * surfaces take this type rather than `Member` so that showing either one is a type error, not a
 * code-review catch. The database enforces the same cut independently — the `browse_members` view
 * simply does not select those columns.
 */
export type BrowseMember = Omit<Member, 'phone' | 'birthDate'>;

/** The two segments of Discover. Two only, so the pills stop at each end rather than wrapping. */
export const DISCOVER_SEGMENTS = ['peers', 'mentors'] as const;
export type DiscoverSegment = (typeof DISCOVER_SEGMENTS)[number];

export interface EventItem {
  id: string;
  title: string;
  orgId: string;
  mode: EventMode;
  city: string;
  /** "Virtual" for online events — they deliberately bypass the state filter. */
  state: string;
  /** ISO 8601 with offset. */
  startsAt: string;
  timeLabel: string;
  recurring: boolean;
  recurrenceLabel: string | null;
  activity: string;
  description: string;
  accessNotes: string;
  goingCount: number;
  /** Never render before the viewer has RSVPed. */
  joinUrl: string | null;
  rosterVisibility: RosterVisibility;
}

export interface Wave {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  /** Null for a plain wave; set when sent from an "Ask me about" chip. */
  topic: Topic | null;
  message: string | null;
  createdAt: string;
  wavedBack: boolean;
}

export interface Rsvp {
  eventId: string;
  memberId: string;
  createdAt: string;
  checkedIn: boolean;
}

/** Fake for the prototype. Everything member-facing assumes a session exists. */
export interface Session {
  member: Member;
}

export interface MemberFilters {
  state: UsState | 'All';
  disability: Disability | 'All';
  equipment?: Equipment | 'All';
  /** 'All' is a valid value here too — it's just not distinguishable from any other org id at the type level. */
  orgId?: string;
  duration?: DurationBucket | 'All';
  /** 'All' is a valid value here too — it's just not distinguishable from any other language at the type level. */
  language?: string;
  topic?: Topic | 'All';
  level?: InjuryLevel | 'All';
  ageBand?: AgeBand | 'All';
}

export interface EventFilters {
  state: UsState | 'Virtual' | 'All';
  includeVirtual: boolean;
  /** 'All' is a valid value here too — it's just not distinguishable from any other activity at the type level. */
  activity?: string;
}

/* ------------------------------------------------------------------- chat */

/**
 * Waves, conversations and messages. These mirror the three views in
 * supabase/migrations/20260820140000_chat_messaging.sql one for one — the
 * client never reads the tables underneath, so this is the whole shape of chat
 * as far as the app is concerned.
 *
 * Note what is missing on purpose: `ChatCounterpart` has no `phone` and no
 * `birthDate`, because the views it comes from do not select those columns.
 * PRD §14 — "email and phone are never exposed between members" — and the same
 * cut is made in TypeScript and in the database so that neither one alone is
 * load-bearing. This is the reasoning behind `BrowseMember` above, applied to
 * the other surface that renders somebody who is not you.
 */

export const WAVE_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type WaveStatus = (typeof WAVE_STATUSES)[number];

export const WAVE_DIRECTIONS = ['inbox', 'outbox'] as const;
export type WaveDirection = (typeof WAVE_DIRECTIONS)[number];

export const CONVERSATION_KINDS = ['peer', 'mentor'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const REPORT_REASONS = ['harassment', 'spam', 'impersonation', 'safety', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** As much of another member as any chat surface is allowed to know. */
export interface ChatCounterpart {
  id: string;
  type: MemberType;
  displayName: string;
  photoUrl: string | null;
  city: string;
  state: UsState;
  capacity: Capacity | null;
  /** Prototype only: a seeded demo profile, with no account behind it. */
  isSynthetic: boolean;
  /** Peer Bot: replies to waves and messages on its own — see docs/CHAT.md. */
  isBot: boolean;
}

/** Somebody the viewer may start a conversation with, or already has one with. */
export interface ChatMember extends ChatCounterpart {
  disability: Disability;
  level: InjuryLevel | null;
  ageBand: AgeBand;
  duration: DurationBucket;
  interests: Interest[];
  openToMessages: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** Set when the sender retracted it. The row survives; the body is not shown. */
  deletedAt: string | null;
}

export interface ChatConversation {
  id: string;
  kind: ConversationKind;
  createdAt: string;
  lastMessageAt: string;
  lastReadAt: string;
  archived: boolean;
  muted: boolean;
  /** True when *you* blocked them. You are never told about the reverse. */
  blocked: boolean;
  counterpart: ChatCounterpart;
  unreadCount: number;
  lastMessageBody: string | null;
  lastMessageSenderId: string | null;
}

export interface ChatWave {
  id: string;
  direction: WaveDirection;
  /**
   * On an outbound wave this is never 'declined': turning somebody down does not
   * notify them, so a declined wave goes on reading 'pending' to its sender.
   * See the `chat_waves` view.
   */
  status: WaveStatus;
  topic: Topic | null;
  message: string | null;
  createdAt: string;
  conversationId: string | null;
  counterpart: ChatCounterpart;
}

/** The daily caps and how much of them the viewer has spent, from the database. */
export interface ChatLimits {
  waveDailyLimit: number;
  wavesSentToday: number;
  conversationDailyLimit: number;
  conversationsStartedToday: number;
}
