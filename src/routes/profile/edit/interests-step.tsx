import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/routes/onboarding/chip';
import { INTERESTS, type Interest } from '@/types/domain';

export function InterestsStep({
  interests,
  saving,
  error,
  onSave,
}: {
  interests: Interest[];
  saving: boolean;
  error: string | null;
  onSave: (interests: Interest[]) => void;
}) {
  const [selected, setSelected] = useState<Interest[]>(interests);

  function toggle(interest: Interest) {
    setSelected((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Interests &amp; activities</h1>
        <p className="text-muted-foreground text-sm">
          Add or remove as many as you like — no minimum here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((interest) => (
          <Chip
            key={interest}
            label={interest}
            selected={selected.includes(interest)}
            onClick={() => {
              toggle(interest);
            }}
          />
        ))}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          onSave(selected);
        }}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
