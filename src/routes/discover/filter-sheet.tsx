/**
 * The Discover filter sheet — everything behind the Filters button, so the top row stays the
 * three buttons in docs/screens/events-screen.html's `.top` bar (Peers, Mentors, Filters).
 *
 * State and Disability come first, since they used to live on the bar and still narrow the most.
 * Then, in the order the PRD argues for: Equipment (manual versus power is a larger difference in
 * daily life than two levels of injury), then Organization (how someone referred by Craig will
 * look for their own hospital's mentors), then Level, Time since disability, Languages, Interests,
 * Age band.
 *
 * State and Organization are cut down to California / NorCal SCI for now (@/routes/discover/
 * filters.ts) — this prototype only has the one launch org. Interests stands in for the PRD's
 * "Topics" section here, since onboarding's `interests` step is the vocabulary this flow actually
 * collects; tapping an "Ask me about" chip on a card still filters by the real `topic` field
 * regardless of what this sheet offers.
 *
 * Presentational only. It renders the `filters` it is handed and calls `onChange` with the next
 * whole object — there is no source of truth in here, so the page and the sheet can never drift.
 *
 * There is no shadcn Sheet in this repo, so this composes one out of `components/ui/dialog`:
 * the same Radix dialog semantics (modal, focus trap, Escape to close, title and description
 * announced), pinned to the bottom of the screen and given a scrolling middle instead of a
 * centred card.
 */

import { ChevronDown, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  activeFilterCount,
  clearedFilters,
  DISCOVER_STATE_OPTIONS,
  EQUIPMENT_FILTER_OPTIONS,
  levelApplies,
  setDisability,
  setFilter,
} from '@/routes/discover/filters';
import {
  AGE_BANDS,
  DISABILITIES,
  DURATIONS,
  INJURY_LEVELS,
  INTERESTS,
  type InjuryLevel,
  type Interest,
  type MemberFilters,
} from '@/types/domain';

export interface DiscoverFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: MemberFilters;
  onChange: (next: MemberFilters) => void;
  organizations: { slug: string; name: string }[];
  languages: string[];
  resultCount: number;
  /**
   * The interest vocabulary to offer — pass `interestsIn(members)` so every chip returns somebody
   * (PRD §8.2). Optional so the sheet still renders standalone; it then falls back to the full
   * controlled list.
   */
  interests?: Interest[];
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        // 46px minimum tap target — this audience includes people with limited hand function,
        // and a 38px chip is a miss they have to undo.
        'bg-card focus-visible:ring-ring inline-flex min-h-[46px] items-center rounded-full border-2 px-4 text-[13px] font-semibold focus-visible:ring-2 focus-visible:outline-none',
        on && 'border-primary bg-secondary text-primary',
      )}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  /** Explicitly `| undefined` so a caller can pass a hint that is only sometimes there. */
  hint?: string | undefined;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="mt-5 first:mt-1">
      <h3
        id={headingId}
        className="text-muted-foreground mb-2 text-[11.5px] font-bold tracking-widest uppercase"
      >
        {title}
      </h3>
      {hint !== undefined && <p className="text-muted-foreground mb-2 text-xs">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/**
 * One filter, one value. The "All" chip clears it, and tapping the selected chip again clears it
 * too — `aria-pressed` promises a toggle, so it behaves like one.
 */
function ChipGroup<T extends string>({
  allLabel,
  options,
  value,
  onSelect,
}: {
  allLabel: string;
  options: readonly T[];
  value: T | 'All' | undefined;
  onSelect: (next: T | undefined) => void;
}) {
  const selected = value === undefined || value === 'All' ? null : value;
  return (
    <>
      <Chip
        label={allLabel}
        on={selected === null}
        onClick={() => {
          onSelect(undefined);
        }}
      />
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          on={selected === option}
          onClick={() => {
            onSelect(selected === option ? undefined : option);
          }}
        />
      ))}
    </>
  );
}

/**
 * Level, multiple at once. A disclosure rather than a floating popover — the sheet is already a
 * modal dialog, and stacking a second layer of portal/focus-trap on top of it is more than this
 * needs. Closed, the trigger summarizes the pick ("Any level", "C5", "3 levels"); open, it drops a
 * row of the same 46px chips every other section uses.
 */
function LevelDropdown({
  id,
  levels,
  selected,
  onChange,
  disabled,
}: {
  id: string;
  levels: readonly InjuryLevel[];
  selected: InjuryLevel[];
  onChange: (next: InjuryLevel[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? 'Any level'
      : selected.length === 1
        ? selected[0]
        : `${selected.length} levels`;

  function toggle(level: InjuryLevel) {
    onChange(selected.includes(level) ? selected.filter((l) => l !== level) : [...selected, level]);
  }

  return (
    <div className="w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="border-input bg-card focus-visible:ring-ring flex min-h-[46px] w-full items-center justify-between rounded-xl border-2 px-3 text-[15px] font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      >
        {summary}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && !disabled ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip
            label="Any level"
            on={selected.length === 0}
            onClick={() => {
              onChange([]);
            }}
          />
          {levels.map((level) => (
            <Chip
              key={level}
              label={level}
              on={selected.includes(level)}
              onClick={() => {
                toggle(level);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DiscoverFilterSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  organizations,
  languages,
  resultCount,
  interests,
}: DiscoverFilterSheetProps) {
  const levelDropdownId = useId();
  const activeCount = activeFilterCount(filters);
  const interestOptions = interests ?? [...INTERESTS];
  const canFilterByLevel = levelApplies(filters.disability);
  const people = resultCount === 1 ? 'person' : 'people';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-auto bottom-0 left-[50%] grid max-h-[92vh] w-full max-w-none translate-y-0 grid-rows-[auto_1fr_auto] gap-0 rounded-t-2xl rounded-b-none p-0 sm:max-w-xl"
      >
        <DialogHeader className="gap-1 px-5 pt-4 pb-2 text-left">
          <div className="flex items-center gap-3">
            <DialogTitle className="flex-1 text-2xl font-bold tracking-tight">Filters</DialogTitle>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
              }}
              aria-label="Close filters"
              className="bg-card focus-visible:ring-ring grid size-[46px] shrink-0 place-items-center rounded-full border-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <DialogDescription>
            Everything here narrows the deck further, and nothing is permanent.
          </DialogDescription>
          <p className="text-[13px] font-semibold">
            {activeCount === 0
              ? 'No filters yet'
              : `${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} active`}
          </p>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 pb-4">
          <Section title="State">
            <ChipGroup
              allLabel="All states"
              options={DISCOVER_STATE_OPTIONS}
              value={filters.state}
              onSelect={(state) => {
                onChange({ ...filters, state: state ?? 'All' });
              }}
            />
          </Section>

          <Section title="Disability">
            <ChipGroup
              allLabel="All disabilities"
              options={DISABILITIES}
              value={filters.disability}
              onSelect={(disability) => {
                onChange(setDisability(filters, disability ?? 'All'));
              }}
            />
          </Section>

          <Section
            title="Equipment"
            hint="Manual versus power is a big difference in daily life — often bigger than two levels of injury."
          >
            <ChipGroup
              allLabel="All equipment"
              options={EQUIPMENT_FILTER_OPTIONS}
              value={filters.equipment}
              onSelect={(equipment) => {
                onChange(setFilter(filters, 'equipment', equipment));
              }}
            />
          </Section>

          <Section title="Organization" hint="Find the mentors from your own hospital or program.">
            <Chip
              label="All organizations"
              on={filters.orgId === undefined || filters.orgId === 'All'}
              onClick={() => {
                onChange(setFilter(filters, 'orgId', undefined));
              }}
            />
            {organizations.map((org) => (
              <Chip
                key={org.slug}
                label={org.name}
                on={filters.orgId === org.slug}
                onClick={() => {
                  onChange(
                    setFilter(filters, 'orgId', filters.orgId === org.slug ? undefined : org.slug),
                  );
                }}
              />
            ))}
          </Section>

          <Section
            title="Level"
            hint={
              canFilterByLevel
                ? undefined
                : 'Level applies to spinal cord injuries. Pick SCI - para, SCI - quad or Combo for Disability above to filter by it.'
            }
          >
            <label htmlFor={levelDropdownId} className="sr-only">
              Level of injury
            </label>
            <LevelDropdown
              id={levelDropdownId}
              levels={INJURY_LEVELS}
              selected={filters.level ?? []}
              disabled={!canFilterByLevel}
              onChange={(next) => {
                onChange(setFilter(filters, 'level', next.length > 0 ? next : undefined));
              }}
            />
          </Section>

          <Section title="Time since disability">
            <ChipGroup
              allLabel="Any length of time"
              options={DURATIONS}
              value={filters.duration}
              onSelect={(duration) => {
                onChange(setFilter(filters, 'duration', duration));
              }}
            />
          </Section>

          <Section
            title="Languages"
            hint={
              languages.length === 0 ? 'Nobody in this set has listed a language yet.' : undefined
            }
          >
            <ChipGroup
              allLabel="All languages"
              options={languages}
              value={filters.language}
              onSelect={(language) => {
                onChange(setFilter(filters, 'language', language));
              }}
            />
          </Section>

          <Section
            title="Interests"
            hint={
              interestOptions.length === 0
                ? 'Nobody in this set has listed an interest yet.'
                : 'What people are into. Only interests somebody here has are offered.'
            }
          >
            <ChipGroup
              allLabel="All interests"
              options={interestOptions}
              value={filters.interest}
              onSelect={(interest) => {
                onChange(setFilter(filters, 'interest', interest));
              }}
            />
          </Section>

          <Section title="Age band">
            <ChipGroup
              allLabel="All ages"
              options={AGE_BANDS}
              value={filters.ageBand}
              onSelect={(ageBand) => {
                onChange(setFilter(filters, 'ageBand', ageBand));
              }}
            />
          </Section>
        </div>

        <div className="px-5 pt-2.5 pb-4">
          {/* The count is live, so filtering yourself down to nobody is visible before you
              commit to it rather than after you close the sheet. */}
          <p role="status" className="text-muted-foreground mb-2 text-xs">
            {resultCount === 0
              ? 'Nobody matches these filters — clear one to see people again.'
              : `${resultCount} ${people} match these filters.`}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={activeCount === 0}
              onClick={() => {
                onChange(clearedFilters());
              }}
              className="bg-card focus-visible:ring-ring min-h-[46px] shrink-0 rounded-xl border-2 px-4 text-[15px] font-bold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
              }}
              className="bg-primary text-primary-foreground focus-visible:ring-ring min-h-[46px] flex-1 rounded-xl text-[17px] font-bold focus-visible:ring-2 focus-visible:outline-none"
            >
              Show {resultCount} {people}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
