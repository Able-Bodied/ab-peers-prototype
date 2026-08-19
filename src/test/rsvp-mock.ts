import { vi } from 'vitest';

export interface RsvpRow {
  event_id: string;
  viewer_id: string;
  status: 'interested' | 'going';
}

/**
 * A minimal stand-in for the `event_rsvps` table's query builder, shared by every test that
 * renders <RsvpProvider> (src/lib/rsvps.tsx). Supports exactly the calls that module makes:
 * select().in() (+ overrideTypes), delete().eq().eq(), and upsert() — each awaitable at whatever
 * point the chain ends, the way the real supabase-js builder is.
 */
export function createEventRsvpsMock(initialRows: RsvpRow[] = []) {
  let rows: RsvpRow[] = [...initialRows];

  function builder() {
    let op: 'select' | 'delete' | 'upsert' = 'select';
    let filters: Record<string, string> = {};
    let inFilter: { ids: string[] } | null = null;
    let upsertRow: RsvpRow | null = null;

    function run(): Promise<{ data: unknown; error: null }> {
      if (op === 'delete') {
        rows = rows.filter(
          (row) => !(row.event_id === filters.event_id && row.viewer_id === filters.viewer_id),
        );
        return Promise.resolve({ data: null, error: null });
      }
      if (op === 'upsert' && upsertRow) {
        const newRow = upsertRow;
        const idx = rows.findIndex(
          (row) => row.event_id === newRow.event_id && row.viewer_id === newRow.viewer_id,
        );
        if (idx >= 0) rows[idx] = { ...rows[idx], ...newRow };
        else rows.push({ ...newRow });
        return Promise.resolve({ data: null, error: null });
      }
      if (inFilter) {
        const ids = inFilter.ids;
        return Promise.resolve({
          data: rows.filter((row) => ids.includes(row.event_id)),
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    }

    const b = {
      select: vi.fn(() => {
        op = 'select';
        return b;
      }),
      in: vi.fn((_column: string, ids: string[]) => {
        inFilter = { ids };
        return b;
      }),
      delete: vi.fn(() => {
        op = 'delete';
        filters = {};
        return b;
      }),
      eq: vi.fn((column: string, value: string) => {
        filters[column] = value;
        return b;
      }),
      upsert: vi.fn((row: RsvpRow) => {
        op = 'upsert';
        upsertRow = row;
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
    /** Returns a fresh builder for `event_rsvps`, or undefined for any other table. */
    forTable: (table: string) => (table === 'event_rsvps' ? builder() : undefined),
    get rows() {
      return rows;
    },
    reset: (next: RsvpRow[] = []) => {
      rows = [...next];
    },
  };
}
