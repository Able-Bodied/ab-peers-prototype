import { getSupabase } from '@/lib/supabase';
import type { MemberPhoto } from '@/types/domain';

interface MemberPhotoRow {
  id: string;
  url: string;
  alt: string | null;
}

function mapRow(row: MemberPhotoRow): MemberPhoto {
  return { id: row.id, url: row.url, alt: row.alt };
}

export async function fetchMemberPhotos(memberId: string): Promise<MemberPhoto[]> {
  const { data, error } = await getSupabase()
    .from('member_photos')
    .select('id, url, alt')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as MemberPhotoRow[] | null) ?? []).map(mapRow);
}

export async function addMemberPhoto(memberId: string, file: File): Promise<MemberPhoto> {
  const supabase = getSupabase();
  const extension = file.name.split('.').pop() ?? 'jpg';
  const path = `${memberId}/gallery/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, file, { upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;

  const { data, error } = await supabase
    .from('member_photos')
    .insert({ member_id: memberId, url })
    .select('id, url, alt')
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function deleteMemberPhoto(photoId: string): Promise<void> {
  const { error } = await getSupabase().from('member_photos').delete().eq('id', photoId);
  if (error) throw new Error(error.message);
}
