// Shared domain vocabulary for the AbleBodied peer-mentor matching tool.
//
// This file must stay structurally identical to `packages/types` in the
// `ab-peers` monorepo (see docs/CONTEXT.md — "Working model"). When the
// prototype UI graduates into `ab-peers/apps/web`, these types should be a
// drop-in swap for the real ones. Do not add prototype-only fields here;
// put prototype conveniences in `src/mocks` instead.

export type InjuryType = 'SCI' | 'TBI' | 'SCI+TBI' | 'stroke';

/** Neurological level of injury, e.g. "C5", "T4", "L1". Free text on purpose. */
export type InjuryLevel = string;

export type Completeness = 'complete' | 'incomplete';

export type MobilityEquipment = 'manual chair' | 'power chair' | 'walker' | 'none' | 'other';

export interface Location {
  city: string;
  state: string;
  /** City-center granularity only in mocks — see docs/PII.md. */
  lat: number;
  lng: number;
}

export interface Peer {
  id: string;
  displayName: string;
  pronouns?: string;
  injuryType: InjuryType;
  injuryLevel?: InjuryLevel;
  completeness?: Completeness;
  yearsPostInjury?: number;
  equipment?: MobilityEquipment[];
  location: Location;
  languages: string[];
  interests: string[];
  bio?: string;
  avatarUrl?: string;
}

export interface Mentor extends Peer {
  role: 'mentor';
  menteeCapacity?: number;
  /** e.g. "tendon transfer", "hand cycling", "parenting after injury" */
  topics: string[];
  /** e.g. "Craig Hospital", "NorCal SCI" */
  affiliations: string[];
}

export interface Coordinator {
  id: string;
  displayName: string;
  organizationId: string;
  /** example.com only in mocks — see docs/PII.md. */
  email: string;
}

export interface Organization {
  id: string;
  name: string;
  location: Location;
  website?: string;
}

export interface Connection {
  id: string;
  fromPeerId: string;
  toMentorId: string;
  status: 'requested' | 'accepted' | 'declined';
  createdAt: string;
}
