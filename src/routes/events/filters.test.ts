import { describe, expect, it } from 'vitest';

import { dateWindowRange, defaultFilters } from '@/routes/events/filters';

// A Wednesday, mid-month, mid-afternoon — far enough from either month boundary that the "month"
// window is unambiguous, and late enough in the day to catch a window that starts at "now".
const NOW = new Date(2026, 7, 12, 15, 30);

describe('dateWindowRange', () => {
  it('returns null for "any" so past events are not silently excluded', () => {
    expect(dateWindowRange('any', NOW)).toBeNull();
  });

  it('starts the window at midnight today, not at the current time', () => {
    const range = dateWindowRange('week', NOW);
    expect(new Date(range?.from ?? '')).toEqual(new Date(2026, 7, 12, 0, 0, 0, 0));
  });

  it('covers seven days including today for "week"', () => {
    const range = dateWindowRange('week', NOW);
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 7, 18, 23, 59, 59, 999));
  });

  it('ends "month" on the last instant of the current month', () => {
    const range = dateWindowRange('month', NOW);
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it('handles February in a leap year', () => {
    const range = dateWindowRange('month', new Date(2028, 1, 3, 9, 0));
    expect(new Date(range?.to ?? '')).toEqual(new Date(2028, 1, 29, 23, 59, 59, 999));
  });

  it('rolls "week" into the next month when the window crosses the boundary', () => {
    const range = dateWindowRange('week', new Date(2026, 7, 29, 10, 0));
    expect(new Date(range?.to ?? '')).toEqual(new Date(2026, 8, 4, 23, 59, 59, 999));
  });
});

describe('defaultFilters', () => {
  it('defaults the date window to this month', () => {
    expect(defaultFilters().when).toBe('month');
  });

  it('returns a fresh object each call so state updates cannot alias the default', () => {
    const a = defaultFilters();
    const b = defaultFilters();
    a.activities.Handcycling = false;
    expect(b.activities.Handcycling).toBe(true);
  });
});
