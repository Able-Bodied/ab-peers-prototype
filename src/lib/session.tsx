import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import type {
  AgeBand,
  ChildrenStatus,
  Disability,
  DurationBucket,
  Independence,
  InjuryLevel,
  InjuryMechanism,
  Interest,
  MemberType,
  RelationshipStatus,
  Topic,
  UsState,
} from '@/types/domain';

/** Matches supabase/migrations/20260817203100_onboarding_members.sql and
 * 20260820194122_profile_editor_fields.sql's `members` table. */
interface MemberRow {
  id: string;
  type: string;
  display_name: string;
  phone: string;
  age_band: string;
  disability: string;
  level: string | null;
  duration: string;
  city: string;
  state: string;
  interests: string[];
  photo_url: string | null;
  bio: string | null;
  mentor_interest: boolean;
  completeness: string | null;
  injury_mechanism: string | null;
  independence: string | null;
  relationship_status: string | null;
  children: string | null;
  employment: string | null;
  languages: string[];
  topics: string[];
  life_now_visible: boolean;
}

/**
 * What's actually in the `members` table — the subset of Member fields
 * onboarding collects. Not the full Member shape: richer profile fields
 * (bio, languages, affiliations, topics...) are filled in later, outside
 * the onboarding wizard. birthDate is deliberately excluded — every UI
 * surface reads ageBand instead, same rule as the wizard itself.
 */
export interface AccountMember {
  id: string;
  type: MemberType;
  displayName: string;
  phone: string;
  ageBand: AgeBand;
  disability: Disability;
  level: InjuryLevel | null;
  duration: DurationBucket;
  city: string;
  state: UsState;
  interests: Interest[];
  photoUrl: string | null;
  bio: string;
  mentorInterest: boolean;
  completeness: string | null;
  injuryMechanism: InjuryMechanism | null;
  independence: Independence | null;
  relationshipStatus: RelationshipStatus | null;
  children: ChildrenStatus | null;
  employment: string | null;
  languages: string[];
  topics: Topic[];
  lifeNowVisible: boolean;
}

function mapRowToMember(row: MemberRow): AccountMember {
  return {
    id: row.id,
    type: row.type as MemberType,
    displayName: row.display_name,
    phone: row.phone,
    ageBand: row.age_band as AgeBand,
    disability: row.disability as Disability,
    level: row.level as InjuryLevel | null,
    duration: row.duration as DurationBucket,
    city: row.city,
    state: row.state as UsState,
    interests: row.interests as Interest[],
    photoUrl: row.photo_url,
    bio: row.bio ?? '',
    mentorInterest: row.mentor_interest,
    completeness: row.completeness,
    injuryMechanism: row.injury_mechanism as InjuryMechanism | null,
    independence: row.independence as Independence | null,
    relationshipStatus: row.relationship_status as RelationshipStatus | null,
    children: row.children as ChildrenStatus | null,
    employment: row.employment,
    languages: row.languages,
    topics: row.topics as Topic[],
    lifeNowVisible: row.life_now_visible,
  };
}

async function fetchOwnMember(userId: string): Promise<AccountMember | null> {
  // The untyped client returns `any` here — cast to the known table shape.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await getSupabase()
    .from('members')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRowToMember(data as MemberRow) : null;
}

interface SessionContextValue {
  member: AccountMember | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Dev/testing convenience: deletes the caller's own `members` row (not
   * their auth account, which the anon key can't do) so onboarding can be
   * re-run against the same phone number. See supabase/migrations/
   * 20260818054456_members_delete_own_row.sql.
   */
  deleteMember: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<AccountMember | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMember(null);
      return;
    }
    const own = await fetchOwnMember(session.user.id);
    setMember(own);
  }, []);

  useEffect(() => {
    void refresh().finally(() => {
      setLoading(false);
    });

    const {
      data: { subscription },
    } = getSupabase().auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [refresh]);

  async function signOut() {
    await getSupabase().auth.signOut();
    setMember(null);
  }

  async function deleteMember() {
    if (!member) return;
    const { error } = await getSupabase().from('members').delete().eq('id', member.id);
    if (error) throw new Error(error.message);
    setMember(null);
  }

  return (
    <SessionContext.Provider value={{ member, loading, refresh, signOut, deleteMember }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used within a SessionProvider');
  return value;
}

export { fetchOwnMember };
