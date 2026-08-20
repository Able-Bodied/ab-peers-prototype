import { useState } from 'react';

import { Button } from '@/components/ui/button';

const MAX_LENGTH = 280;

export function BioStep({
  bio,
  saving,
  error,
  onSave,
}: {
  bio: string;
  saving: boolean;
  error: string | null;
  onSave: (bio: string) => void;
}) {
  const [value, setValue] = useState(bio);

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">In your own words</h1>
        <p className="text-muted-foreground text-sm">
          The lines under your photo. People read this before anything else on your profile.
        </p>
      </div>

      <div className="grid gap-1">
        <textarea
          className="border-input min-h-28 w-full rounded-md border bg-transparent p-3 text-sm shadow-xs"
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder="Bay Area native, three years post. Handcycle most weekends, work in software, dad to two."
        />
        <p className="text-muted-foreground text-xs">
          {value.length}/{MAX_LENGTH} characters
        </p>
      </div>

      <p className="text-muted-foreground text-sm">
        We never rewrite this — it's the one part of your profile that has to sound like you.
      </p>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          onSave(value.trim());
        }}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
