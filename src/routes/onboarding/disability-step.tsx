import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Chip } from '@/routes/onboarding/chip';
import {
  DISABILITIES,
  type Disability,
  DURATIONS,
  type DurationBucket,
  INJURY_LEVELS,
  type InjuryLevel,
} from '@/types/domain';

const LEVEL_APPLIES_TO: Disability[] = ['SCI - para', 'SCI - quad', 'Combo (SCI and TBI)'];

export function DisabilityStep({
  disability,
  level,
  duration,
  onNext,
}: {
  disability: Disability | null;
  level: InjuryLevel | null;
  duration: DurationBucket | null;
  onNext: (value: {
    disability: Disability;
    level: InjuryLevel | null;
    duration: DurationBucket;
  }) => void;
}) {
  const [selectedDisability, setSelectedDisability] = useState(disability);
  const [selectedLevel, setSelectedLevel] = useState(level);
  const [selectedDuration, setSelectedDuration] = useState(duration);

  const needsLevel = selectedDisability !== null && LEVEL_APPLIES_TO.includes(selectedDisability);
  const canContinue =
    selectedDisability !== null &&
    selectedDuration !== null &&
    (!needsLevel || selectedLevel !== null);

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selectedDisability || !selectedDuration) return;
        onNext({
          disability: selectedDisability,
          level: needsLevel ? selectedLevel : null,
          duration: selectedDuration,
        });
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">What's your disability?</h1>
        <p className="text-muted-foreground text-sm">
          The most-used filter. Pick the closest match.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {DISABILITIES.map((d) => (
          <Chip
            key={d}
            label={d}
            selected={selectedDisability === d}
            onClick={() => {
              setSelectedDisability(d);
            }}
          />
        ))}
      </div>

      {needsLevel && (
        <div className="grid gap-2">
          <Label htmlFor="injury-level">Level of injury</Label>
          <Select
            {...(selectedLevel ? { value: selectedLevel } : {})}
            onValueChange={(v) => {
              setSelectedLevel(v as InjuryLevel);
            }}
          >
            <SelectTrigger id="injury-level" className="w-full">
              <SelectValue placeholder="Select a level" />
            </SelectTrigger>
            <SelectContent>
              {INJURY_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="duration">How long have you been disabled?</Label>
        <Select
          {...(selectedDuration ? { value: selectedDuration } : {})}
          onValueChange={(v) => {
            setSelectedDuration(v as DurationBucket);
          }}
        >
          <SelectTrigger id="duration" className="w-full">
            <SelectValue placeholder="Select a duration" />
          </SelectTrigger>
          <SelectContent>
            {DURATIONS.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={!canContinue}>
        Continue
      </Button>
    </form>
  );
}
