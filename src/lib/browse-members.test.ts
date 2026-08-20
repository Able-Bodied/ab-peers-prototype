import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mapBrowseRow, useBrowseMembers } from '@/lib/browse-members';
import {
  browseMemberRow,
  createBrowseMembersMock,
  MockPostgrestError,
  permissionDeniedError,
} from '@/test/browse-members-mock';

/**
 * The mock answers for `browse_members` and nothing else, which is load-bearing: `phone` and
 * `birth_date` are stripped by the view, not by this module, so a hook that reached for `members`
 * instead would get `undefined` back here and fail every test below rather than quietly shipping
 * two columns that must never leave the row (PRD §5.1, docs/PII.md).
 */
const browseMembers = createBrowseMembersMock();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: (table: string) => browseMembers.forTable(table) }),
}));

describe('mapBrowseRow', () => {
  it('turns a row into the member the rest of the app reads', () => {
    const mapped = mapBrowseRow(
      browseMemberRow({
        id: 'm-9',
        type: 'mentor',
        display_name: 'Test Member Nine',
        photo_url: 'https://example.test/p.jpg',
        photo_alt: 'A description',
        avatar_color: '#123456',
        city: 'Testville',
        state: 'Oregon',
        disability: 'SCI - quad',
        level: 'C5/6',
        completeness: 'Incomplete',
        duration: '10+ years',
        duration_answered_on: '2025-03-04',
        years_since: 12,
        age_band: '40-49',
        relationship: 'Caregiver',
        equipment: ['Power chair', 'Manual chair'],
        equipment_detail: 'A specific model',
        sports_equipment: ['Handcycle'],
        will_advise_on_equipment: true,
        grants: ['High Fives'],
        will_help_with_grants: true,
        languages: ['English', 'Spanish'],
        interests: ['Kayaking', 'Reading'],
        topics: ['Transfers', 'UTIs'],
        bio: 'A short bio.',
        employment: 'Works part time',
        living: 'Lives independently',
        affiliations: ['norcal-sci'],
        verified_by: 'norcal-sci',
        open_to_messages: true,
        capacity: 'open',
        show_in_browse: true,
      }),
    );

    expect(mapped).toEqual({
      id: 'm-9',
      type: 'mentor',
      displayName: 'Test Member Nine',
      photoUrl: 'https://example.test/p.jpg',
      photoAlt: 'A description',
      avatarColor: '#123456',
      city: 'Testville',
      state: 'Oregon',
      disability: 'SCI - quad',
      level: 'C5/6',
      completeness: 'Incomplete',
      duration: '10+ years',
      durationAnsweredOn: '2025-03-04',
      yearsSince: 12,
      ageBand: '40-49',
      relationship: 'Caregiver',
      equipment: ['Power chair', 'Manual chair'],
      equipmentDetail: 'A specific model',
      sportsEquipment: ['Handcycle'],
      willAdviseOnEquipment: true,
      grants: ['High Fives'],
      willHelpWithGrants: true,
      languages: ['English', 'Spanish'],
      interests: ['Kayaking', 'Reading'],
      topics: ['Transfers', 'UTIs'],
      bio: 'A short bio.',
      employment: 'Works part time',
      living: 'Lives independently',
      affiliations: ['norcal-sci'],
      verifiedBy: 'norcal-sci',
      openToMessages: true,
      capacity: 'open',
      showInBrowse: true,
    });
  });

  it('never hands a null array to the deck, which calls includes() on all of them', () => {
    const mapped = mapBrowseRow(
      browseMemberRow({
        equipment: null,
        sports_equipment: null,
        grants: null,
        languages: null,
        interests: null,
        topics: null,
        affiliations: null,
      }),
    );

    expect(mapped.equipment).toEqual([]);
    expect(mapped.sportsEquipment).toEqual([]);
    expect(mapped.grants).toEqual([]);
    expect(mapped.languages).toEqual([]);
    expect(mapped.interests).toEqual([]);
    expect(mapped.topics).toEqual([]);
    expect(mapped.affiliations).toEqual([]);
  });

  it('keeps "no answer" as no answer for level, completeness and capacity', () => {
    const mapped = mapBrowseRow(
      browseMemberRow({ level: null, completeness: null, capacity: null, years_since: null }),
    );

    expect(mapped.level).toBeNull();
    expect(mapped.completeness).toBeNull();
    expect(mapped.capacity).toBeNull();
    expect(mapped.yearsSince).toBeNull();
  });

  it('keeps an unverified member unverified rather than inventing an affiliation', () => {
    const mapped = mapBrowseRow(
      browseMemberRow({ verified_by: null, affiliations: ['bay-adapt'] }),
    );

    expect(mapped.verifiedBy).toBeNull();
    expect(mapped.affiliations).toEqual(['bay-adapt']);
  });

  it('carries a member who opted out of browse through unchanged', () => {
    // The view filters these out, so one reaching the mapper means the view changed — the mapper
    // must report what the row says, not quietly flip it.
    expect(mapBrowseRow(browseMemberRow({ show_in_browse: false })).showInBrowse).toBe(false);
  });
});

describe('useBrowseMembers', () => {
  beforeEach(() => {
    browseMembers.reset();
  });

  it('loads the whole browsable set in one go', async () => {
    browseMembers.reset([
      browseMemberRow({ id: 'a', display_name: 'Test Member A' }),
      browseMemberRow({ id: 'b', display_name: 'Test Member B', type: 'mentor' }),
    ]);

    const { result } = renderHook(() => useBrowseMembers());
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.members.map((m) => m.displayName)).toEqual([
      'Test Member A',
      'Test Member B',
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.requiresSignIn).toBe(false);
  });

  it('finishes loading with an empty deck rather than hanging when nobody is browsable', async () => {
    const { result } = renderHook(() => useBrowseMembers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.members).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.requiresSignIn).toBe(false);
  });

  it('asks an anonymous viewer to sign in instead of showing a database error', async () => {
    browseMembers.reset([browseMemberRow()]);
    browseMembers.failWith(permissionDeniedError());

    const { result } = renderHook(() => useBrowseMembers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.requiresSignIn).toBe(true);
    expect(result.current.error).toBe('Sign in to see peers and mentors.');
    expect(result.current.members).toEqual([]);
  });

  it('tells a real failure apart from a signed-out one', async () => {
    browseMembers.failWith(new MockPostgrestError('connection reset', 'XX000'));

    const { result } = renderHook(() => useBrowseMembers());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.requiresSignIn).toBe(false);
    expect(result.current.error).toBe('connection reset');
  });

  it('recovers on reload after a failure', async () => {
    browseMembers.failWith(new MockPostgrestError('connection reset', 'XX000'));

    const { result } = renderHook(() => useBrowseMembers());
    await waitFor(() => {
      expect(result.current.error).toBe('connection reset');
    });

    browseMembers.reset([browseMemberRow({ id: 'a', display_name: 'Test Member A' })]);
    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.members.map((m) => m.displayName)).toEqual(['Test Member A']);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
