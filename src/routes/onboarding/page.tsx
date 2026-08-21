import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogoSplash } from '@/components/logo-splash';
import { Button } from '@/components/ui/button';
import { fetchOwnMember, useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { ageBandFor } from '@/routes/onboarding/age';
import { BirthdayStep } from '@/routes/onboarding/birthday-step';
import { DisabilityStep } from '@/routes/onboarding/disability-step';
import { InterestsStep } from '@/routes/onboarding/interests-step';
import { LocationStep } from '@/routes/onboarding/location-step';
import { NameStep } from '@/routes/onboarding/name-step';
import { PhoneStep } from '@/routes/onboarding/phone-step';
import { PhotoStep } from '@/routes/onboarding/photo-step';
import { submitOnboarding } from '@/routes/onboarding/submit-onboarding';
import {
  INITIAL_ONBOARDING_DATA,
  isProfileStep,
  type OnboardingData,
  PROFILE_STEP_IDS,
  STEP_ORDER,
} from '@/routes/onboarding/types';
import { VerifyStep } from '@/routes/onboarding/verify-step';
import { WelcomeStep } from '@/routes/onboarding/welcome-step';
import type { Interest } from '@/types/domain';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState(INITIAL_ONBOARDING_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = STEP_ORDER[stepIndex] ?? 'welcome';

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }
  function goToPhone() {
    setStepIndex(STEP_ORDER.indexOf('phone'));
  }

  // Phone auth doubles as sign-in: a phone that already has a members row
  // is a returning user, so skip straight past profile creation.
  async function handleVerified() {
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      if (session) {
        const existing = await fetchOwnMember(session.user.id);
        if (existing) {
          void navigate('/profile', { replace: true });
          return;
        }
      }
    } catch {
      // Couldn't check — fall through and treat as a new profile.
    }
    goNext();
  }

  async function handleComplete(finalData: OnboardingData) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitOnboarding(finalData);
      await refresh();
      void navigate('/profile', { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Adding a photo unlocks the (still-skippable) interests step; skipping the
  // photo skips interests too and finishes setup right away.
  function handlePhotoNext(photoFile: File | null) {
    const finalData = { ...data, photoFile };
    setData(finalData);
    if (photoFile) {
      goNext();
    } else {
      void handleComplete(finalData);
    }
  }

  function handleInterestsNext(interests: Interest[]) {
    const finalData = { ...data, interests };
    setData(finalData);
    void handleComplete(finalData);
  }

  function handleInterestsSkip() {
    const finalData = { ...data, interests: [] };
    setData(finalData);
    void handleComplete(finalData);
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-6">
        <LogoSplash />
      </div>

      {isProfileStep(step) && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2"
                onClick={goBack}
                aria-label="Back"
              >
                <ChevronLeft />
              </Button>
              <p className="text-primary text-sm font-semibold">PeerConnect</p>
            </div>
            <p className="text-muted-foreground text-xs">
              Step {PROFILE_STEP_IDS.indexOf(step) + 1} of {PROFILE_STEP_IDS.length}
            </p>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{
                width: `${((PROFILE_STEP_IDS.indexOf(step) + 1) / PROFILE_STEP_IDS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {step === 'welcome' && <WelcomeStep onNext={goNext} onLogIn={goToPhone} />}

      {step === 'phone' && (
        <PhoneStep
          onNext={(phone) => {
            setData((d) => ({ ...d, phone }));
            goNext();
          }}
        />
      )}

      {step === 'verify' && (
        <VerifyStep
          phone={data.phone}
          onNext={() => {
            void handleVerified();
          }}
        />
      )}

      {step === 'name' && (
        <NameStep
          displayName={data.displayName}
          onNext={(displayName) => {
            setData((d) => ({ ...d, displayName }));
            goNext();
          }}
        />
      )}

      {step === 'birthday' && (
        <BirthdayStep
          birthDate={data.birthDate}
          onNext={(birthDate, age) => {
            setData((d) => ({ ...d, birthDate, ageBand: ageBandFor(age) }));
            goNext();
          }}
        />
      )}

      {step === 'disability' && (
        <DisabilityStep
          disability={data.disability}
          level={data.level}
          duration={data.duration}
          onNext={(value) => {
            setData((d) => ({ ...d, ...value }));
            goNext();
          }}
        />
      )}

      {step === 'location' && (
        <LocationStep
          city={data.city}
          state={data.state}
          showInBrowse={data.showInBrowse}
          onNext={(value) => {
            setData((d) => ({ ...d, ...value }));
            goNext();
          }}
        />
      )}

      {step === 'photo' && (
        <PhotoStep
          photoPreviewUrl={data.photoPreviewUrl}
          submitting={submitting}
          submitError={submitError}
          onNext={handlePhotoNext}
        />
      )}

      {step === 'interests' && (
        <InterestsStep
          interests={data.interests}
          submitting={submitting}
          submitError={submitError}
          onNext={handleInterestsNext}
          onSkip={handleInterestsSkip}
        />
      )}
    </div>
  );
}
