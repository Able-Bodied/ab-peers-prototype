import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase';

export function ProfilePhotoStep({
  memberId,
  photoUrl,
  saving,
  error,
  onSave,
}: {
  memberId: string;
  photoUrl: string | null;
  saving: boolean;
  error: string | null;
  onSave: (photoUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(photoUrl);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : photoUrl);
  }

  async function handleSave() {
    if (!file) return;
    setUploading(true);
    setLocalError(null);
    try {
      const supabase = getSupabase();
      const extension = file.name.split('.').pop() ?? 'jpg';
      const path = `${memberId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
      onSave(url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Profile photo</h1>
        <p className="text-muted-foreground text-sm">
          The photo shown on your card and profile. You can change it anytime.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-primary text-primary flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Your profile" className="size-full object-cover" />
          ) : (
            <Plus className="size-8" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Profile photo"
          onChange={handleFileChange}
        />
        <Button type="button" variant="link" onClick={() => inputRef.current?.click()}>
          Choose a photo
        </Button>
      </div>

      {(localError ?? error) && <p className="text-destructive text-sm">{localError ?? error}</p>}

      <Button
        onClick={() => {
          void handleSave();
        }}
        disabled={!file || uploading || saving}
      >
        {uploading || saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
