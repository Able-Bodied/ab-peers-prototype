import { getSupabase } from '@/lib/supabase';
import type { OnboardingData } from '@/routes/onboarding/types';

export async function submitOnboarding(data: OnboardingData): Promise<void> {
  const supabase = getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to verify your phone number before finishing setup.');

  let photoUrl: string | null = null;
  if (data.photoFile) {
    const extension = data.photoFile.name.split('.').pop() ?? 'jpg';
    const path = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, data.photoFile, { upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    photoUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
  }

  const { error: upsertError } = await supabase.from('members').upsert({
    id: user.id,
    display_name: data.displayName,
    phone: data.phone,
    birth_date: data.birthDate,
    age_band: data.ageBand,
    disability: data.disability,
    level: data.level,
    duration: data.duration,
    city: data.city,
    state: data.state,
    interests: data.interests,
    photo_url: photoUrl,
  });
  if (upsertError) throw new Error(upsertError.message);
}
