import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

export function PhotoStep({
  photoPreviewUrl,
  submitting,
  submitError,
  onComplete,
}: {
  photoPreviewUrl: string | null;
  submitting: boolean;
  submitError: string | null;
  onComplete: (photoFile: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(photoPreviewUrl);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Add a photo?</h1>
        <p className="text-muted-foreground text-sm">
          Optional. A face makes it feel like a community rather than a directory.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-primary text-primary flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Your selected profile" className="size-full object-cover" />
          ) : (
            <Plus className="size-8" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button type="button" variant="link" onClick={() => inputRef.current?.click()}>
          Choose a photo
        </Button>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        Pick one from your camera roll or take a new one. You can add or change it anytime.
      </p>

      {submitError && <p className="text-destructive text-sm">{submitError}</p>}

      <Button
        onClick={() => {
          onComplete(file);
        }}
        disabled={submitting}
      >
        {submitting ? 'Setting up your profile…' : 'Complete setup'}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          onComplete(null);
        }}
        disabled={submitting}
      >
        Skip for now
      </Button>
    </div>
  );
}
