import { useCallback, useEffect, useRef, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import type {
  AgeBand,
  BrowseMember,
  Capacity,
  Completeness,
  Disability,
  DurationBucket,
  Equipment,
  Grant,
  InjuryLevel,
  Interest,
  MemberType,
  Relationship,
  SportsEquipment,
  Topic,
  UsState,
} from '@/types/domain';

/**
 * Everyone the viewer is allowed to browse, read from the `browse_members` view.
 *
 * Three things are deliberate here.
 *
 * **The view, not the table.** `browse_members` selects every `members` column *except* `phone`
 * and `birth_date`, and filters to `show_in_browse = true`. That cut is the database's own copy of
 * the rule in PRD §6/§6.2 — a phone number is sign-in identity and a birth date exists only for
 * the under-18 gate, so neither may ever reach another member's screen. `BrowseMember` (Omit<
 * Member, 'phone' | 'birthDate'>) makes rendering one a type error; the view makes fetching one
 * impossible. Selecting from `members` here would quietly undo half of that, so don't.
 *
 * **One unfiltered fetch of the whole set.** At prototype scale the browsable set is around 65
 * rows — a single round trip of a few tens of kilobytes. Buying every row up front is what makes
 * switching between the Peers and Mentors segments and applying the filter sheet feel instant:
 * both are pure array work over what is already in memory, through `filterMembers` in
 * src/mocks/selectors.ts, with no spinner and no network in the loop. Filtering server-side
 * instead would put a request between a tap on a filter chip and the deck redrawing, which is the
 * one interaction this page is judged on.
 *
 * That stops being the right trade the moment the browsable set stops fitting comfortably in a
 * phone's memory and a single response — call it low thousands of rows, or the point where photos
 * and bios push the payload past a megabyte, whichever comes first. At that point browse becomes
 * location- or segment-scoped and the filters move into the query (`.eq()`, `.contains()`,
 * `.range()` for pagination), and `filterMembers` narrows to whatever the server could not do.
 * Until then, a paginated fetch would be slower *and* more code.
 *
 * **Not signed in is a state, not an error.** PRD §5.1 puts events in front of the sign-in wall
 * and people behind it, and the view is granted to `authenticated` only. An anonymous client
 * therefore gets a permission error from Postgres rather than an empty list, and "no members" and
 * "you need an account to see members" are completely different screens. `requiresSignIn` carries
 * that distinction out to the page so it can say the useful thing instead of rendering an empty
 * deck or a raw database message.
 */

/** The snake_case shape of one `public.browse_members` row. */
export interface BrowseMemberRow {
  id: string;
  type: string;
  display_name: string;
  photo_url: string | null;
  photo_alt: string | null;
  avatar_color: string;
  city: string;
  state: string;
  disability: string;
  level: string | null;
  completeness: string | null;
  duration: string;
  duration_answered_on: string;
  years_since: number | null;
  age_band: string;
  relationship: string;
  equipment: string[] | null;
  equipment_detail: string | null;
  sports_equipment: string[] | null;
  will_advise_on_equipment: boolean;
  grants: string[] | null;
  will_help_with_grants: boolean;
  languages: string[] | null;
  interests: string[] | null;
  topics: string[] | null;
  bio: string;
  employment: string | null;
  living: string | null;
  affiliations: string[] | null;
  verified_by: string | null;
  open_to_messages: boolean;
  capacity: string | null;
  show_in_browse: boolean;
  /**
   * The last three are selected by the view but have no place on `BrowseMember` and are
   * deliberately not mapped. `is_synthetic` marks the seeded demo rows
   * (supabase/migrations/20260820120000_seed_synthetic_members.sql) and is an operational fact
   * about a row, not something a member has; the timestamps are audit columns. They are declared
   * here so this interface stays an honest description of what comes back rather than a wish.
   */
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * The single place a database row becomes a member the rest of the app can reason about.
 *
 * Two rules it enforces, both of which the callers rely on without checking:
 *
 * - **A null array is an empty array.** The columns are declared `not null default '{}'`, but a
 *   view can outlive the constraint that filled it — an older row, a left join added later, a
 *   column added ahead of its backfill. `sharedInterests` and `filterMembers` call `.includes()`
 *   on these unconditionally, so one null here is a crash on the deck rather than a missing chip.
 * - **Text becomes its union.** `disability`, `level`, `capacity` and friends are `text` with a
 *   check constraint on the database side and a string-literal union on this side. The cast is the
 *   seam between the two, and keeping it here means exactly one file has to change if a
 *   vocabulary does — see src/types/domain.ts, which is the list the check constraints mirror.
 *
 * `capacity`, `level` and `completeness` stay nullable on purpose: "no answer" is a real and
 * common answer for all three, and flattening it to a default would invent a fact about a person.
 */
export function mapBrowseRow(row: BrowseMemberRow): BrowseMember {
  return {
    id: row.id,
    type: row.type as MemberType,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    photoAlt: row.photo_alt,
    avatarColor: row.avatar_color,
    city: row.city,
    state: row.state as UsState,
    disability: row.disability as Disability,
    level: row.level as InjuryLevel | null,
    completeness: row.completeness as Completeness | null,
    duration: row.duration as DurationBucket,
    durationAnsweredOn: row.duration_answered_on,
    yearsSince: row.years_since,
    ageBand: row.age_band as AgeBand,
    relationship: row.relationship as Relationship,
    equipment: (row.equipment ?? []) as Equipment[],
    equipmentDetail: row.equipment_detail,
    sportsEquipment: (row.sports_equipment ?? []) as SportsEquipment[],
    willAdviseOnEquipment: row.will_advise_on_equipment,
    grants: (row.grants ?? []) as Grant[],
    willHelpWithGrants: row.will_help_with_grants,
    languages: row.languages ?? [],
    interests: (row.interests ?? []) as Interest[],
    topics: (row.topics ?? []) as Topic[],
    bio: row.bio,
    employment: row.employment,
    living: row.living,
    affiliations: row.affiliations ?? [],
    verifiedBy: row.verified_by,
    openToMessages: row.open_to_messages,
    capacity: row.capacity as Capacity | null,
    showInBrowse: row.show_in_browse,
  };
}

/**
 * Postgres raises `42501` (insufficient_privilege) when a role has no SELECT grant on a relation,
 * and PostgREST answers a missing or expired JWT with `PGRST301`. Both mean the same thing to the
 * viewer — "you are not signed in" — and neither is worth showing them verbatim.
 */
function isPermissionError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42501' || error.code === 'PGRST301') return true;
  return (error.message ?? '').toLowerCase().includes('permission denied');
}

const SIGN_IN_MESSAGE = 'Sign in to see peers and mentors.';

export function useBrowseMembers(): {
  members: BrowseMember[];
  loading: boolean;
  error: string | null;
  /** True when the fetch failed *because* nobody is signed in, rather than because it broke. */
  requiresSignIn: boolean;
  reload: () => void;
} {
  const [members, setMembers] = useState<BrowseMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);

  /**
   * The usual `let cancelled = false` closure covers unmount but not `reload`: a retry started
   * while the first request is still in the air would have two responses racing for the same
   * state, and the loser is whichever the network happens to deliver second. A request counter
   * covers both — a response applies only if nothing newer has started, and the effect's cleanup
   * bumps it so an unmounted fetch is simply never newest.
   */
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);

    try {
      const { data, error: queryError } = await getSupabase()
        .from('browse_members')
        .select('*')
        .overrideTypes<BrowseMemberRow[], { merge: false }>();

      if (requestRef.current !== requestId) return;

      if (queryError) {
        const signedOut = isPermissionError(queryError);
        setRequiresSignIn(signedOut);
        setError(signedOut ? SIGN_IN_MESSAGE : queryError.message);
        setMembers([]);
        return;
      }

      setRequiresSignIn(false);
      setError(null);
      setMembers(data.map(mapBrowseRow));
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setRequiresSignIn(false);
      setError(err instanceof Error ? err.message : 'Failed to load members');
      setMembers([]);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { members, loading, error, requiresSignIn, reload };
}
