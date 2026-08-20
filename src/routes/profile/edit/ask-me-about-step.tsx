import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Chip } from '@/routes/onboarding/chip';
import { TOPICS, type Topic } from '@/types/domain';

const SELF_CARE_TOPICS: Topic[] = [
  'Suprapubic catheter',
  'Intermittent catheterization',
  'Bowel program',
  'Wound care',
  'Baclofen pump',
  'FES',
  'Wheelchair assist devices',
];

const GENERAL_TOPICS = TOPICS.filter((t) => !SELF_CARE_TOPICS.includes(t));

export function AskMeAboutStep({
  topics,
  saving,
  error,
  onSave,
}: {
  topics: Topic[];
  saving: boolean;
  error: string | null;
  onSave: (topics: Topic[]) => void;
}) {
  const [selected, setSelected] = useState<Topic[]>(topics);

  function toggle(topic: Topic) {
    setSelected((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Ask me about</h1>
        <p className="text-muted-foreground text-sm">
          Fixed lists, so tapping one finds everybody else who talks about it.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Topics I'm happy to talk about</Label>
        <div className="flex flex-wrap gap-2">
          {GENERAL_TOPICS.map((topic) => (
            <Chip
              key={topic}
              label={topic}
              selected={selected.includes(topic)}
              onClick={() => {
                toggle(topic);
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Self-care devices and procedures</Label>
        <div className="flex flex-wrap gap-2">
          {SELF_CARE_TOPICS.map((topic) => (
            <Chip
              key={topic}
              label={topic}
              selected={selected.includes(topic)}
              onClick={() => {
                toggle(topic);
              }}
            />
          ))}
        </div>
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
