import { vi } from 'vitest';

import type { BrowseMemberRow } from '@/lib/browse-members';

/**
 * A minimal stand-in for the `browse_members` view's query builder, shared by every test that
 * calls `useBrowseMembers` (src/lib/browse-members.ts). Supports exactly the calls that module
 * makes: `select('*')` followed by `overrideTypes()`, awaitable at whatever point the chain ends,
 * the way the real supabase-js builder is.
 *
 * `failWith` exists because the two most important paths through that hook are failures: an
 * anonymous viewer hits the view's `authenticated`-only grant and must be told to sign in, and
 * anything else must be told apart from that. Both are error responses, so a mock that can only
 * succeed can only test the boring case.
 */

/**
 * PostgREST's own error type extends `Error` and carries a `code`, so the stand-in does too —
 * a plain object would let code that checks `instanceof Error` pass in tests and fail in
 * production.
 */
export class MockPostgrestError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MockPostgrestError';
    this.code = code;
  }
}

/** What Postgres actually answers an anonymous client with when the grant is `authenticated`. */
export function permissionDeniedError(): MockPostgrestError {
  return new MockPostgrestError('permission denied for view browse_members', '42501');
}

export function createBrowseMembersMock(initialRows: BrowseMemberRow[] = []) {
  let rows: BrowseMemberRow[] = [...initialRows];
  let failure: MockPostgrestError | null = null;

  function builder() {
    function run(): Promise<{ data: unknown; error: MockPostgrestError | null }> {
      if (failure) return Promise.resolve({ data: null, error: failure });
      return Promise.resolve({ data: rows, error: null });
    }

    const b = {
      select: vi.fn(() => b),
      overrideTypes: () => run(),
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable, standing in for supabase-js's builder
      then: (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        run().then(onOk, onErr),
      catch: (onErr?: (e: unknown) => unknown) => run().catch(onErr),
    };
    return b;
  }

  return {
    /** Returns a fresh builder for `browse_members`, or undefined for any other relation. */
    forTable: (table: string) => (table === 'browse_members' ? builder() : undefined),
    reset: (next: BrowseMemberRow[] = []) => {
      rows = [...next];
      failure = null;
    },
    /** Makes every subsequent select answer with this error until cleared with `null`. */
    failWith: (error: MockPostgrestError | null) => {
      failure = error;
    },
  };
}

/**
 * One browsable row, overridable field by field. Deliberately a placeholder rather than a
 * plausible person (docs/PII.md): tests should never carry anything that reads like a real
 * member's profile.
 */
export function browseMemberRow(overrides: Partial<BrowseMemberRow> = {}): BrowseMemberRow {
  return {
    id: 'member-1',
    type: 'peer',
    display_name: 'Test Member One',
    photo_url: null,
    photo_alt: null,
    avatar_color: '#2E5C8A',
    city: 'Testville',
    state: 'California',
    disability: 'SCI - para',
    level: 'T6',
    completeness: 'Complete',
    duration: '3 - 10 years',
    duration_answered_on: '2026-01-01',
    years_since: 5,
    age_band: '30-39',
    relationship: 'Self',
    equipment: ['Manual chair'],
    equipment_detail: null,
    sports_equipment: [],
    will_advise_on_equipment: false,
    grants: [],
    will_help_with_grants: false,
    languages: ['English'],
    interests: ['Reading'],
    topics: ['Transfers'],
    bio: '',
    employment: null,
    living: null,
    affiliations: [],
    verified_by: null,
    open_to_messages: false,
    capacity: null,
    show_in_browse: true,
    is_synthetic: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
