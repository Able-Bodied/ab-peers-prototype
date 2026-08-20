import type {
  AgeBand,
  Disability,
  DurationBucket,
  InjuryLevel,
  Interest,
  UsState,
} from '@/types/domain';

export interface OnboardingData {
  phone: string;
  displayName: string;
  birthDate: string;
  ageBand: AgeBand | null;
  disability: Disability | null;
  level: InjuryLevel | null;
  duration: DurationBucket | null;
  city: string;
  state: UsState | null;
  showInBrowse: boolean;
  interests: Interest[];
  photoFile: File | null;
  photoPreviewUrl: string | null;
}

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  phone: '',
  displayName: '',
  birthDate: '',
  ageBand: null,
  disability: null,
  level: null,
  duration: null,
  city: '',
  state: null,
  showInBrowse: true,
  interests: [],
  photoFile: null,
  photoPreviewUrl: null,
};

export const PROFILE_STEP_IDS = [
  'name',
  'birthday',
  'disability',
  'location',
  'photo',
  'interests',
] as const;
export type ProfileStepId = (typeof PROFILE_STEP_IDS)[number];

export type StepId = 'welcome' | 'phone' | 'verify' | ProfileStepId;

export const STEP_ORDER: StepId[] = ['welcome', 'phone', 'verify', ...PROFILE_STEP_IDS];

export function isProfileStep(step: StepId): step is ProfileStepId {
  return (PROFILE_STEP_IDS as readonly string[]).includes(step);
}
