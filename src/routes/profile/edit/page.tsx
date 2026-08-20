import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { fetchMemberPhotos } from '@/lib/member-photos';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import { AskMeAboutStep } from '@/routes/profile/edit/ask-me-about-step';
import { BioStep } from '@/routes/profile/edit/bio-step';
import { ProfileEditHub } from '@/routes/profile/edit/hub';
import { InjuryStep } from '@/routes/profile/edit/injury-step';
import { InterestsStep } from '@/routes/profile/edit/interests-step';
import { LifeNowStep } from '@/routes/profile/edit/life-now-step';
import { MentorStep } from '@/routes/profile/edit/mentor-step';
import { PhotosStep } from '@/routes/profile/edit/photos-step';
import { ProfilePhotoStep } from '@/routes/profile/edit/profile-photo-step';
import type { EditStepId } from '@/routes/profile/edit/types';
import type { MemberPhoto } from '@/types/domain';

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const { member, loading, refresh } = useSession();
  const [step, setStep] = useState<EditStepId>('hub');
  const [photos, setPhotos] = useState<MemberPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member) return;
    fetchMemberPhotos(member.id)
      .then(setPhotos)
      .catch(() => {
        // Best-effort — the hub just shows no photos added if this fails.
      })
      .finally(() => {
        setPhotosLoading(false);
      });
  }, [member]);

  if (loading || (member && photosLoading)) {
    return <p className="text-muted-foreground text-sm">Loading your profile…</p>;
  }

  if (!member) {
    void navigate('/profile', { replace: true });
    return null;
  }

  const memberId = member.id;

  async function saveFields(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await getSupabase()
        .from('members')
        .update(patch)
        .eq('id', memberId);
      if (updateError) throw new Error(updateError.message);
      await refresh();
      setStep('hub');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 mb-2"
        onClick={() => {
          if (step === 'hub') {
            void navigate('/profile');
          } else {
            setStep('hub');
          }
        }}
        aria-label="Back"
      >
        <ChevronLeft />
      </Button>

      {step === 'hub' && (
        <ProfileEditHub member={member} photoCount={photos.length} onSelect={setStep} />
      )}

      {step === 'profilePhoto' && (
        <ProfilePhotoStep
          memberId={member.id}
          photoUrl={member.photoUrl}
          saving={saving}
          error={error}
          onSave={(photoUrl) => {
            void saveFields({ photo_url: photoUrl });
          }}
        />
      )}

      {step === 'bio' && (
        <BioStep
          bio={member.bio}
          saving={saving}
          error={error}
          onSave={(bio) => {
            void saveFields({ bio });
          }}
        />
      )}

      {step === 'photos' && (
        <PhotosStep memberId={member.id} photos={photos} error={error} onPhotosChange={setPhotos} />
      )}

      {step === 'interests' && (
        <InterestsStep
          interests={member.interests}
          saving={saving}
          error={error}
          onSave={(interests) => {
            void saveFields({ interests });
          }}
        />
      )}

      {step === 'mentor' && (
        <MentorStep
          mentorInterest={member.mentorInterest}
          saving={saving}
          error={error}
          onSave={(mentorInterest) => {
            void saveFields({ mentor_interest: mentorInterest });
          }}
        />
      )}

      {step === 'injury' && (
        <InjuryStep
          disability={member.disability}
          level={member.level}
          duration={member.duration}
          completeness={member.completeness}
          injuryMechanism={member.injuryMechanism}
          saving={saving}
          error={error}
          onSave={(value) => {
            void saveFields({
              disability: value.disability,
              level: value.level,
              duration: value.duration,
              completeness: value.completeness,
              injury_mechanism: value.injuryMechanism,
            });
          }}
        />
      )}

      {step === 'lifeNow' && (
        <LifeNowStep
          independence={member.independence}
          relationshipStatus={member.relationshipStatus}
          childrenStatus={member.children}
          employment={member.employment}
          languages={member.languages}
          lifeNowVisible={member.lifeNowVisible}
          saving={saving}
          error={error}
          onSave={(value) => {
            void saveFields({
              independence: value.independence,
              relationship_status: value.relationshipStatus,
              children: value.childrenStatus,
              employment: value.employment,
              languages: value.languages,
              life_now_visible: value.lifeNowVisible,
            });
          }}
        />
      )}

      {step === 'askMeAbout' && (
        <AskMeAboutStep
          topics={member.topics}
          saving={saving}
          error={error}
          onSave={(topics) => {
            void saveFields({ topics });
          }}
        />
      )}
    </div>
  );
}
