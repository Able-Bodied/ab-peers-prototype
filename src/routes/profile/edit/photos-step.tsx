import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { addMemberPhoto, deleteMemberPhoto } from '@/lib/member-photos';
import type { MemberPhoto } from '@/types/domain';

export function PhotosStep({
  memberId,
  photos,
  error,
  onPhotosChange,
}: {
  memberId: string;
  photos: MemberPhoto[];
  error: string | null;
  onPhotosChange: (photos: MemberPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setLocalError(null);
    try {
      const photo = await addMemberPhoto(memberId, file);
      onPhotosChange([...photos, photo]);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(photoId: string) {
    setBusy(true);
    setLocalError(null);
    try {
      await deleteMemberPhoto(photoId);
      onPhotosChange(photos.filter((p) => p.id !== photoId));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not remove that photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Your photos</h1>
        <p className="text-muted-foreground text-sm">
          Not portraits — photos of you doing something. Travelling, handcycling, in the garden,
          cooking, with the dog.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg">
            <img src={photo.url} alt={photo.alt ?? ''} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => {
                void handleDelete(photo.id);
              }}
              disabled={busy}
              aria-label="Remove photo"
              className="bg-background/80 absolute top-1 right-1 flex size-6 items-center justify-center rounded-full"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="border-primary text-primary flex aspect-square items-center justify-center rounded-lg border-2 border-dashed"
        >
          <Plus className="size-6" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Add a photo"
          onChange={(e) => {
            void handleFileChange(e);
          }}
        />
      </div>

      {(localError ?? error) && <p className="text-destructive text-sm">{localError ?? error}</p>}
    </div>
  );
}
