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
  COMPLETENESS,
  type Completeness,
  DISABILITIES,
  type Disability,
  DURATIONS,
  type DurationBucket,
  INJURY_LEVELS,
  INJURY_MECHANISMS,
  type InjuryLevel,
  type InjuryMechanism,
} from '@/types/domain';

const LEVEL_APPLIES_TO: Disability[] = ['SCI - para', 'SCI - quad', 'Combo (SCI and TBI)'];

export function InjuryStep({
  disability,
  level,
  duration,
  completeness,
  injuryMechanism,
  saving,
  error,
  onSave,
}: {
  disability: Disability;
  level: InjuryLevel | null;
  duration: DurationBucket;
  completeness: string | null;
  injuryMechanism: InjuryMechanism | null;
  saving: boolean;
  error: string | null;
  onSave: (value: {
    disability: Disability;
    level: InjuryLevel | null;
    duration: DurationBucket;
    completeness: Completeness | null;
    injuryMechanism: InjuryMechanism | null;
  }) => void;
}) {
  const [selectedDisability, setSelectedDisability] = useState(disability);
  const [selectedLevel, setSelectedLevel] = useState(level);
  const [selectedDuration, setSelectedDuration] = useState(duration);
  const [selectedCompleteness, setSelectedCompleteness] = useState(
    completeness as Completeness | null,
  );
  const [selectedMechanism, setSelectedMechanism] = useState(injuryMechanism);

  const needsLevel = LEVEL_APPLIES_TO.includes(selectedDisability);

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Your injury</h1>
        <p className="text-muted-foreground text-sm">
          Level and completeness drive the closest-match line on your card.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Injury type</Label>
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

      {needsLevel && (
        <div className="grid gap-2">
          <Label>Complete or incomplete</Label>
          <div className="flex flex-wrap gap-2">
            {COMPLETENESS.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={selectedCompleteness === c}
                onClick={() => {
                  setSelectedCompleteness(c);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="duration">How long have you been disabled?</Label>
        <Select
          value={selectedDuration}
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

      <div className="grid gap-2">
        <Label>How were you injured?</Label>
        <div className="flex flex-wrap gap-2">
          {INJURY_MECHANISMS.map((m) => (
            <Chip
              key={m}
              label={m}
              selected={selectedMechanism === m}
              onClick={() => {
                setSelectedMechanism(m);
              }}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          onSave({
            disability: selectedDisability,
            level: needsLevel ? selectedLevel : null,
            duration: selectedDuration,
            completeness: needsLevel ? selectedCompleteness : null,
            injuryMechanism: selectedMechanism,
          });
        }}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
