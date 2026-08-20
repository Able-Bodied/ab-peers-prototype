import { Minus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ageBandFor, ageFromBirthDate } from '@/routes/onboarding/age';

export function BirthdayStep({
  birthDate,
  onNext,
}: {
  birthDate: string;
  onNext: (birthDate: string, age: number) => void;
}) {
  const [value, setValue] = useState(birthDate);
  const [blocked, setBlocked] = useState(false);
  const age = value ? ageFromBirthDate(value) : null;

  if (blocked) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div className="border-primary text-primary flex size-16 items-center justify-center rounded-full border-2">
          <Minus className="size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-balance">PeerConnect is for people 18 and over.</h1>
          <p className="text-muted-foreground text-sm text-balance">
            If you are younger and looking for peer support, ask your rehab team about a youth
            programme — Craig, Triumph and Ability360 all run them with proper supervision.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (age === null) return;
        if (age < 18) {
          setBlocked(true);
          return;
        }
        onNext(value, age);
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">When's your birthday?</h1>
        <p className="text-muted-foreground text-sm">
          Members see an age range, never your date of birth.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="birth-date">Date of birth</Label>
        <Input
          id="birth-date"
          type="date"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          max={new Date().toISOString().slice(0, 10)}
        />
        {age !== null && (
          <p className="text-muted-foreground text-sm">
            You're {age}. We'll show others "{ageBandFor(age)}".
          </p>
        )}
      </div>

      <Button type="submit" disabled={age === null}>
        Continue
      </Button>
    </form>
  );
}
