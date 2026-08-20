import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Chip } from '@/routes/onboarding/chip';
import {
  CHILDREN_STATUSES,
  type ChildrenStatus,
  INDEPENDENCE_LEVELS,
  type Independence,
  RELATIONSHIP_STATUSES,
  type RelationshipStatus,
} from '@/types/domain';

export function LifeNowStep({
  independence,
  relationshipStatus,
  childrenStatus,
  employment,
  languages,
  lifeNowVisible,
  saving,
  error,
  onSave,
}: {
  independence: Independence | null;
  relationshipStatus: RelationshipStatus | null;
  childrenStatus: ChildrenStatus | null;
  employment: string | null;
  languages: string[];
  lifeNowVisible: boolean;
  saving: boolean;
  error: string | null;
  onSave: (value: {
    independence: Independence | null;
    relationshipStatus: RelationshipStatus | null;
    childrenStatus: ChildrenStatus | null;
    employment: string | null;
    languages: string[];
    lifeNowVisible: boolean;
  }) => void;
}) {
  const [selectedIndependence, setSelectedIndependence] = useState(independence);
  const [selectedRelationship, setSelectedRelationship] = useState(relationshipStatus);
  const [selectedChildren, setSelectedChildren] = useState(childrenStatus);
  const [employmentValue, setEmploymentValue] = useState(employment ?? '');
  const [languageList, setLanguageList] = useState(languages);
  const [newLanguage, setNewLanguage] = useState('');
  const [visible, setVisible] = useState(lifeNowVisible);

  function addLanguage() {
    const trimmed = newLanguage.trim();
    if (trimmed && !languageList.includes(trimmed)) {
      setLanguageList((prev) => [...prev, trimmed]);
    }
    setNewLanguage('');
  }

  function removeLanguage(language: string) {
    setLanguageList((prev) => prev.filter((l) => l !== language));
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Life now</h1>
        <p className="text-muted-foreground text-sm">Every field is optional.</p>
      </div>

      <div className="grid gap-2">
        <Label>Independence</Label>
        <div className="flex flex-wrap gap-2">
          {INDEPENDENCE_LEVELS.map((i) => (
            <Chip
              key={i}
              label={i}
              selected={selectedIndependence === i}
              onClick={() => {
                setSelectedIndependence(i);
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Relationship</Label>
        <div className="flex flex-wrap gap-2">
          {RELATIONSHIP_STATUSES.map((r) => (
            <Chip
              key={r}
              label={r}
              selected={selectedRelationship === r}
              onClick={() => {
                setSelectedRelationship(r);
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Children</Label>
        <div className="flex flex-wrap gap-2">
          {CHILDREN_STATUSES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={selectedChildren === c}
              onClick={() => {
                setSelectedChildren(c);
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="employment">Work</Label>
        <Input
          id="employment"
          value={employmentValue}
          onChange={(e) => {
            setEmploymentValue(e.target.value);
          }}
          placeholder="e.g. Employed · Software"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="new-language">Languages</Label>
        <div className="flex flex-wrap gap-2">
          {languageList.map((language) => (
            <Chip
              key={language}
              label={language}
              selected
              onClick={() => {
                removeLanguage(language);
              }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            id="new-language"
            value={newLanguage}
            onChange={(e) => {
              setNewLanguage(e.target.value);
            }}
            placeholder="Add a language"
          />
          <Button type="button" variant="outline" onClick={addLanguage}>
            Add
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setVisible((v) => !v);
        }}
        aria-pressed={visible}
        className={cn(
          'flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
          visible
            ? 'border-primary bg-secondary text-primary'
            : 'border-input text-muted-foreground',
        )}
      >
        <CheckCircle2
          className={cn('size-4', visible ? 'text-primary' : 'text-muted-foreground')}
        />
        Show Life now on my profile
      </button>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          onSave({
            independence: selectedIndependence,
            relationshipStatus: selectedRelationship,
            childrenStatus: selectedChildren,
            employment: employmentValue.trim() || null,
            languages: languageList,
            lifeNowVisible: visible,
          });
        }}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
