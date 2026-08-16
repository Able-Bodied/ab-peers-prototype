// Mock fixtures for the prototype. Every value here is invented — see
// docs/PII.md and src/mocks/AGENTS.md before adding or editing anything in
// this file. Names come from a fixed fake-name list, emails are
// `@example.com`, and coordinates are city-center only (no street-level
// precision, no real member data of any kind).

import type { Coordinator, Location, Mentor, Organization } from '@/types/domain';

// -- Locations (city-center only) -------------------------------------------

const denver: Location = { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 };
const sanJose: Location = { city: 'San Jose', state: 'CA', lat: 37.3382, lng: -121.8863 };
const atlanta: Location = { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 };
const chicago: Location = { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 };
const austin: Location = { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 };
const seattle: Location = { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 };
const miami: Location = { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 };
const minneapolis: Location = { city: 'Minneapolis', state: 'MN', lat: 44.9778, lng: -93.265 };

// -- Organizations ------------------------------------------------------------

export const organizations: Organization[] = [
  {
    id: 'org-craig',
    name: 'Craig Hospital',
    location: denver,
    website: 'https://example.com/craig-hospital',
  },
  {
    id: 'org-norcal',
    name: 'NorCal SCI Network',
    location: sanJose,
    website: 'https://example.com/norcal-sci',
  },
];

// -- Coordinators ---------------------------------------------------------

export const coordinators: Coordinator[] = [
  {
    id: 'coord-1',
    displayName: 'Priya Chandrasekaran',
    organizationId: 'org-craig',
    email: 'priya.chandrasekaran@example.com',
  },
  {
    id: 'coord-2',
    displayName: 'Marcus Whitfield',
    organizationId: 'org-norcal',
    email: 'marcus.whitfield@example.com',
  },
];

// -- Mentors ----------------------------------------------------------------

export const mentors: Mentor[] = [
  {
    id: 'mentor-1',
    role: 'mentor',
    displayName: 'Jordan Rivera',
    pronouns: 'they/them',
    injuryType: 'SCI',
    injuryLevel: 'C5',
    completeness: 'incomplete',
    yearsPostInjury: 9,
    equipment: ['power chair'],
    location: denver,
    languages: ['English', 'Spanish'],
    interests: ['hand cycling', 'adaptive skiing', 'cooking'],
    bio: 'Injured in a diving accident in 2017. Loves helping newly injured folks figure out adaptive sports early.',
    menteeCapacity: 3,
    topics: ['hand cycling', 'adaptive skiing', 'returning to work'],
    affiliations: ['Craig Hospital'],
  },
  {
    id: 'mentor-2',
    role: 'mentor',
    displayName: 'Alex Kim',
    pronouns: 'she/her',
    injuryType: 'SCI',
    injuryLevel: 'T4',
    completeness: 'complete',
    yearsPostInjury: 14,
    equipment: ['manual chair'],
    location: sanJose,
    languages: ['English', 'Korean'],
    interests: ['wheelchair basketball', 'travel'],
    bio: 'Paraplegic since a car accident in 2011. Two-time adaptive travel blogger, happy to talk logistics.',
    menteeCapacity: 4,
    topics: ['travel logistics', 'wheelchair basketball', 'dating after injury'],
    affiliations: ['NorCal SCI Network'],
  },
  {
    id: 'mentor-3',
    role: 'mentor',
    displayName: 'Morgan Blake',
    pronouns: 'he/him',
    injuryType: 'SCI',
    injuryLevel: 'L1',
    completeness: 'incomplete',
    yearsPostInjury: 5,
    equipment: ['walker', 'manual chair'],
    location: atlanta,
    languages: ['English'],
    interests: ['woodworking', 'parenting'],
    bio: 'Incomplete SCI from a workplace fall. Dad of two, focused on parenting-after-injury peer support.',
    menteeCapacity: 2,
    topics: ['parenting after injury', 'home accessibility'],
    affiliations: ['Craig Hospital'],
  },
  {
    id: 'mentor-4',
    role: 'mentor',
    displayName: 'Taylor Reyes',
    pronouns: 'she/her',
    injuryType: 'SCI',
    injuryLevel: 'C7',
    completeness: 'complete',
    yearsPostInjury: 21,
    equipment: ['manual chair'],
    location: chicago,
    languages: ['English', 'Spanish'],
    interests: ['tendon transfer surgery', 'public speaking'],
    bio: 'Long-time peer mentor and disability advocate. Has been through two tendon transfer surgeries and speaks widely about the recovery process.',
    menteeCapacity: 5,
    topics: ['tendon transfer', 'advocacy', 'returning to work'],
    affiliations: ['Craig Hospital', 'NorCal SCI Network'],
  },
  {
    id: 'mentor-5',
    role: 'mentor',
    displayName: 'Sam Whitfield',
    pronouns: 'they/them',
    injuryType: 'SCI+TBI',
    injuryLevel: 'C4',
    completeness: 'incomplete',
    yearsPostInjury: 3,
    equipment: ['power chair'],
    location: austin,
    languages: ['English'],
    interests: ['gaming', 'cognitive rehab', 'music'],
    bio: 'Motorcycle accident survivor navigating both SCI and TBI recovery. New mentor, especially interested in supporting other dual-diagnosis peers.',
    menteeCapacity: 2,
    topics: ['dual diagnosis support', 'adaptive gaming'],
    affiliations: ['NorCal SCI Network'],
  },
  {
    id: 'mentor-6',
    role: 'mentor',
    displayName: 'Casey Nakamura',
    pronouns: 'he/him',
    injuryType: 'SCI',
    injuryLevel: 'T10',
    completeness: 'complete',
    yearsPostInjury: 8,
    equipment: ['manual chair'],
    location: seattle,
    languages: ['English', 'Japanese'],
    interests: ['hand cycling', 'rock climbing'],
    bio: 'Former competitive cyclist, now competes in adaptive hand cycling. Enjoys mentoring athletes returning to sport.',
    menteeCapacity: 3,
    topics: ['hand cycling', 'returning to sport'],
    affiliations: ['Craig Hospital'],
  },
  {
    id: 'mentor-7',
    role: 'mentor',
    displayName: 'Riley Okafor',
    pronouns: 'she/they',
    injuryType: 'SCI',
    injuryLevel: 'C6',
    completeness: 'incomplete',
    yearsPostInjury: 12,
    equipment: ['power chair', 'walker'],
    location: miami,
    languages: ['English', 'French'],
    interests: ['fashion', 'travel', 'mentoring students'],
    bio: 'Works in adaptive fashion design. Mentors college-age peers balancing school and rehab.',
    menteeCapacity: 3,
    topics: ['college and school', 'adaptive fashion', 'travel logistics'],
    affiliations: ['NorCal SCI Network'],
  },
  {
    id: 'mentor-8',
    role: 'mentor',
    displayName: 'Jamie Delgado',
    pronouns: 'he/him',
    injuryType: 'SCI',
    injuryLevel: 'L4',
    completeness: 'complete',
    yearsPostInjury: 6,
    equipment: ['walker', 'none'],
    location: minneapolis,
    languages: ['English'],
    interests: ['running', 'nutrition'],
    bio: 'Ambulatory after an incomplete-turned-recovered lower level injury. Focuses on nutrition and fitness peer support.',
    menteeCapacity: 4,
    topics: ['fitness and nutrition', 'ambulatory recovery'],
    affiliations: ['Craig Hospital'],
  },
];
