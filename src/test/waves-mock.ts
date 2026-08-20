import { vi } from 'vitest';

import type { MockPostgrestError } from '@/test/browse-members-mock';

export interface WaveRow {
  from_member_id: string;
  to_member_id: string;
  topic: string | null;
  created_at: string;
}

/**
 * A minimal stand-in for the `waves` table's query builder, shared by every test that renders
 * <WavesProvider> (src/lib/waves.tsx). Supports exactly the calls that module makes:
 * `select().eq()` (+ `overrideTypes`) and `insert()`, each awaitable at whatever point the chain
 * ends, the way the real supabase-js builder is.
 *
 * `failInsertWith` is the interesting one: the provider writes optimistically, so the only way to
 * see whether the rollback works is to make the write fail after the UI has already moved.
 */
export function createWavesMock(initialRows: WaveRow[] = []) {
  let rows: WaveRow[] = [...initialRows];
  let insertFailure: MockPostgrestError | null = null;

  function builder() {
    let op: 'select' | 'insert' = 'select';
    const filters: Record<string, string> = {};
    let insertRow: Partial<WaveRow> | null = null;

    function run(): Promise<{ data: unknown; error: MockPostgrestError | null }> {
      if (op === 'insert' && insertRow) {
        if (insertFailure) return Promise.resolve({ data: null, error: insertFailure });
        rows.push({
          from_member_id: insertRow.from_member_id ?? '',
          to_member_id: insertRow.to_member_id ?? '',
          topic: insertRow.topic ?? null,
          created_at: insertRow.created_at ?? new Date().toISOString(),
        });
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({
        data: rows.filter((row) => row.from_member_id === filters.from_member_id),
        error: null,
      });
    }

    const b = {
      select: vi.fn(() => {
        op = 'select';
        return b;
      }),
      eq: vi.fn((column: string, value: string) => {
        filters[column] = value;
        return b;
      }),
      insert: vi.fn((row: Partial<WaveRow>) => {
        op = 'insert';
        insertRow = row;
        return b;
      }),
      overrideTypes: () => run(),
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable, standing in for supabase-js's builder
      then: (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        run().then(onOk, onErr),
      catch: (onErr?: (e: unknown) => unknown) => run().catch(onErr),
    };
    return b;
  }

  return {
    /** Returns a fresh builder for `waves`, or undefined for any other table. */
    forTable: (table: string) => (table === 'waves' ? builder() : undefined),
    get rows() {
      return rows;
    },
    reset: (next: WaveRow[] = []) => {
      rows = [...next];
      insertFailure = null;
    },
    /** Makes every subsequent insert fail with this error, standing in for the DB's own trigger. */
    failInsertWith: (error: MockPostgrestError | null) => {
      insertFailure = error;
    },
  };
}
