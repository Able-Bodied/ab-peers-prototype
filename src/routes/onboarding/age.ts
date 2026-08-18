import { AGE_BANDS, type AgeBand } from '@/types/domain';

export function ageFromBirthDate(birthDate: string, now = new Date()): number {
  const born = new Date(birthDate);
  let age = now.getFullYear() - born.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() >= born.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

const BAND_FLOORS: Record<AgeBand, number> = {
  '18-29': 18,
  '30-39': 30,
  '40-49': 40,
  '50-59': 50,
  '60-69': 60,
  '70+': 70,
};

export function ageBandFor(age: number): AgeBand | null {
  if (age < 18) return null;
  let band: AgeBand = '70+';
  for (const candidate of AGE_BANDS) {
    if (age >= BAND_FLOORS[candidate]) band = candidate;
  }
  return band;
}
