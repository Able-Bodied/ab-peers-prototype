import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ACTIVITIES_BY_GENRE, GENRES } from '@/routes/events/event-mocks';
import {
  DATE_WINDOW_LABELS,
  DATE_WINDOWS,
  defaultFilters,
  type EventFilterState,
  FORMATS,
} from '@/routes/events/filters';

interface FilterSheetProps {
  filters: EventFilterState;
  /** Count shown on the confirm button, so the effect of a change is visible before closing. */
  resultCount: number;
  onChange: (next: EventFilterState) => void;
  onClose: () => void;
}

function Section({ children }: { children: string }) {
  return (
    <h3 className="text-muted-foreground mt-5 mb-2 text-[11.5px] font-bold tracking-widest uppercase">
      {children}
    </h3>
  );
}

function Chip({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? false}
      aria-pressed={on}
      className={cn(
        'bg-card inline-flex min-h-9 items-center rounded-full border-2 px-3.5 text-[13px] font-semibold',
        on && 'border-primary bg-secondary text-primary',
        disabled === true && 'opacity-60',
      )}
    >
      {label}
    </button>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative h-7 w-12 shrink-0 rounded-full', on ? 'bg-primary' : 'bg-border')}
    >
      <span
        className={cn(
          'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all',
          on ? 'left-[22px]' : 'left-0.5',
        )}
      />
    </span>
  );
}

export function FilterSheet({ filters, resultCount, onChange, onClose }: FilterSheetProps) {
  // Everything except "When" is presentational until the schema carries these attributes, so the
  // controls are rendered disabled rather than silently doing nothing when tapped.
  const notWired = 'Not filterable yet — the events schema does not carry this field.';

  return (
    // Full-bleed on a phone, which is the target; on a wider screen it stays the width of the list
    // behind it rather than stretching a phone layout across a desktop.
    <div className="bg-background fixed inset-0 z-50 mx-auto flex w-full max-w-xl flex-col">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <h2 className="flex-1 text-2xl font-bold tracking-tight">Filters</h2>
        <button
          type="button"
          onClick={() => {
            onChange(defaultFilters());
          }}
          className="text-primary text-sm font-bold"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filters"
          className="bg-card grid size-9 shrink-0 place-items-center rounded-full border-2"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        <Section>Feed</Section>
        <div className="flex gap-2" title={notWired}>
          {(['foryou', 'everything'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled
              aria-pressed={filters.feed === mode}
              className={cn(
                'bg-card min-h-11 flex-1 rounded-xl border-2 text-[15px] font-bold opacity-60',
                filters.feed === mode && 'bg-primary border-primary text-primary-foreground',
              )}
            >
              {mode === 'foryou' ? 'For you' : 'Everything'}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          For you is built from what you picked at signup and what you&rsquo;ve marked since.
          Everything is the full list.
        </p>

        <Section>Where</Section>
        <div className="flex flex-wrap gap-2" title={notWired}>
          <Chip label={filters.place} on disabled onClick={() => undefined} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-b py-3">
          <div>
            <div className="text-sm font-bold">Include online events</div>
            <div className="text-muted-foreground text-xs">They ignore the state filter</div>
          </div>
          <Toggle on={filters.includeOnline} />
        </div>

        <Section>When</Section>
        <div className="flex flex-wrap gap-2">
          {DATE_WINDOWS.map((when) => (
            <Chip
              key={when}
              label={DATE_WINDOW_LABELS[when]}
              on={filters.when === when}
              onClick={() => {
                onChange({ ...filters, when });
              }}
            />
          ))}
        </div>

        <Section>Format</Section>
        <div className="flex flex-wrap gap-2" title={notWired}>
          {FORMATS.map((format) => (
            <Chip
              key={format}
              label={format}
              on={filters.formats[format]}
              disabled
              onClick={() => undefined}
            />
          ))}
        </div>

        <Section>Activities</Section>
        {GENRES.map((genre) => (
          <div key={genre}>
            <div className="mt-4 mb-2 flex items-center justify-between">
              <span className="text-[15px] font-bold">{genre}</span>
              <Toggle on />
            </div>
            <div className="flex flex-wrap gap-2" title={notWired}>
              {(ACTIVITIES_BY_GENRE[genre] ?? []).map((activity) => (
                <Chip
                  key={activity}
                  label={activity}
                  on={filters.activities[activity] ?? false}
                  disabled
                  onClick={() => undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pt-2.5 pb-4">
        <button
          type="button"
          onClick={onClose}
          className="bg-primary text-primary-foreground min-h-13 w-full rounded-xl text-[17px] font-bold"
        >
          Show {resultCount} events
        </button>
      </div>
    </div>
  );
}
