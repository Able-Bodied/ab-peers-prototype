import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NameStep({
  displayName,
  onNext,
}: {
  displayName: string;
  onNext: (displayName: string) => void;
}) {
  const [value, setValue] = useState(displayName);
  const canContinue = value.trim().length > 0;

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (canContinue) onNext(value.trim());
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">What should people call you?</h1>
        <p className="text-muted-foreground text-sm">This is the name on your profile.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          placeholder="e.g. Alex R."
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          autoFocus
        />
        <p className="text-muted-foreground text-xs">First name and last initial is plenty.</p>
      </div>

      <Button type="submit" disabled={!canContinue}>
        Continue
      </Button>
    </form>
  );
}
