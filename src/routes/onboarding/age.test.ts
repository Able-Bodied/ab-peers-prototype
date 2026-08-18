import { describe, expect, it } from 'vitest';

import { ageBandFor, ageFromBirthDate } from '@/routes/onboarding/age';

describe('ageFromBirthDate', () => {
  it('counts a full year once the birthday has passed this year', () => {
    expect(ageFromBirthDate('1990-01-01', new Date('2026-06-01'))).toBe(36);
  });

  it('does not count the year until the birthday arrives', () => {
    expect(ageFromBirthDate('1990-12-31', new Date('2026-06-01'))).toBe(35);
  });

  it('counts the birthday itself as the new age', () => {
    expect(ageFromBirthDate('1990-06-01', new Date('2026-06-01'))).toBe(36);
  });
});

describe('ageBandFor', () => {
  it('returns null under 18', () => {
    expect(ageBandFor(17)).toBeNull();
  });

  it('buckets the boundary ages into the band that starts there', () => {
    expect(ageBandFor(18)).toBe('18-29');
    expect(ageBandFor(29)).toBe('18-29');
    expect(ageBandFor(30)).toBe('30-39');
    expect(ageBandFor(69)).toBe('60-69');
    expect(ageBandFor(70)).toBe('70+');
    expect(ageBandFor(95)).toBe('70+');
  });
});
