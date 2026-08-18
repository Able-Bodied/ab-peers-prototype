import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/routes/onboarding/chip';
import { INTERESTS, type Interest } from '@/types/domain';

const MIN_INTERESTS = 3;

export function InterestsStep({
  interests,
  onNext,
}: {
  interests: Interest[];
  onNext: (interests: Interest[]) => void;
}) {
  const [selected, setSelected] = useState<Interest[]>(interests);

  function toggle(interest: Interest) {
    setSelected((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  }

  const canContinue = selected.length >= MIN_INTERESTS;

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onNext(selected);
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">What are you into?</h1>
        <p className="text-muted-foreground text-sm">
          Pick at least {MIN_INTERESTS}. Shared interests are what people tap on.
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

      <Button type="submit" disabled={!canContinue}>
        Continue
      </Button>
    </form>
  );
}
