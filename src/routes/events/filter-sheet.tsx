import { X } from 'lucide-react';
import { useState } from 'react';

import { forwardGeocode, getCurrentPosition, reverseGeocode } from '@/lib/geocode';
import type { Organization } from '@/lib/organizations';
import type { TaxonomyCategory } from '@/lib/taxonomy';
import { cn } from '@/lib/utils';
import {
  DATE_WINDOW_LABELS,
  DATE_WINDOWS,
  DISTANCE_OPTIONS_MILES,
  defaultFilters,
  EVENT_FORMAT_LABELS,
  EVENT_FORMATS,
  type EventFilterState,
  type NearFilter,
} from '@/routes/events/filters';

interface FilterSheetProps {
  filters: EventFilterState;
  /** The tag vocabulary, read from the database rather than hardcoded here. */
  categories: TaxonomyCategory[];
  /** The organization vocabulary, read from the database rather than hardcoded here. */
  organizations: Organization[];
  /** The city vocabulary, read from `events.city` rather than hardcoded here. */
  cities: string[];
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

export function FilterSheet({
  filters,
  categories,
  organizations,
  cities,
  resultCount,
  onChange,
  onClose,
}: FilterSheetProps) {
  // Feed has no column behind it, so that control stays disabled rather than silently doing
  // nothing when tapped. When, Format, Activities, Organization, City and Near are live.
  const notWired = 'Not filterable yet — the events schema does not carry this field.';

  const [nearQuery, setNearQuery] = useState('');
  const [nearBusy, setNearBusy] = useState(false);
  const [nearError, setNearError] = useState<string | null>(null);

  const toggleFormat = (format: (typeof EVENT_FORMATS)[number]) => {
    onChange({ ...filters, formats: { ...filters.formats, [format]: !filters.formats[format] } });
  };

  const toggleTag = (slug: string) => {
    onChange({ ...filters, tags: { ...filters.tags, [slug]: !filters.tags[slug] } });
  };

  const toggleOrganization = (slug: string) => {
    onChange({
      ...filters,
      organizations: { ...filters.organizations, [slug]: !filters.organizations[slug] },
    });
  };

  const toggleCity = (city: string) => {
    onChange({ ...filters, cities: { ...filters.cities, [city]: !filters.cities[city] } });
  };

  const setNear = (near: NearFilter | null) => {
    onChange({ ...filters, near });
  };

  const setRadius = (radiusMiles: number) => {
    if (filters.near) setNear({ ...filters.near, radiusMiles });
  };

  async function handleUseMyLocation() {
    setNearError(null);
    setNearBusy(true);
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const place = await reverseGeocode(latitude, longitude);
      setNear({
        latitude,
        longitude,
        radiusMiles: filters.near?.radiusMiles ?? DISTANCE_OPTIONS_MILES[1],
        label: place ? place.city : 'my location',
      });
    } catch {
      setNearError('Location permission denied — try a zip code or city instead.');
    } finally {
      setNearBusy(false);
    }
  }

  async function handleSearchNear() {
    if (nearQuery.trim() === '') return;
    setNearError(null);
    setNearBusy(true);
    try {
      const result = await forwardGeocode(nearQuery);
      if (!result) {
        setNearError("Couldn't find that place — try a different zip code or city.");
        return;
      }
      setNear({
        latitude: result.latitude,
        longitude: result.longitude,
        radiusMiles: filters.near?.radiusMiles ?? DISTANCE_OPTIONS_MILES[1],
        label: result.city,
      });
    } catch {
      setNearError("Couldn't look that up — try again.");
    } finally {
      setNearBusy(false);
    }
  }

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
        <p className="text-muted-foreground mt-2 text-xs">
          Online events are included or excluded under Format below. City and Near, below, narrow by
          real location.
        </p>

        <Section>Near</Section>
        {filters.near ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                label={`Near ${filters.near.label}`}
                on
                onClick={() => {
                  setNear(null);
                }}
              />
              <span className="text-muted-foreground text-xs">tap to clear</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {DISTANCE_OPTIONS_MILES.map((miles) => (
                <Chip
                  key={miles}
                  label={`${miles} mi`}
                  on={filters.near?.radiusMiles === miles}
                  onClick={() => {
                    setRadius(miles);
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                void handleUseMyLocation();
              }}
              disabled={nearBusy}
              className="bg-card min-h-11 w-full rounded-xl border-2 text-[15px] font-bold disabled:opacity-60"
            >
              {nearBusy ? 'Finding you…' : 'Use my location'}
            </button>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={nearQuery}
                onChange={(e) => {
                  setNearQuery(e.target.value);
                }}
                placeholder="Zip code or city"
                className="border-input min-h-10 flex-1 rounded-xl border-2 bg-transparent px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void handleSearchNear();
                }}
                disabled={nearBusy || nearQuery.trim() === ''}
                className="bg-card min-h-10 shrink-0 rounded-xl border-2 px-4 text-sm font-bold disabled:opacity-60"
              >
                Search
              </button>
            </div>
            {nearError && <p className="text-destructive mt-1.5 text-xs">{nearError}</p>}
          </>
        )}

        <Section>City</Section>
        {cities.length === 0 && <p className="text-muted-foreground text-xs">Loading cities…</p>}
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <Chip
              key={city}
              label={city}
              on={filters.cities[city] ?? false}
              onClick={() => {
                toggleCity(city);
              }}
            />
          ))}
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
        <div className="flex flex-wrap gap-2">
          {EVENT_FORMATS.map((format) => (
            <Chip
              key={format}
              label={EVENT_FORMAT_LABELS[format]}
              on={filters.formats[format]}
              onClick={() => {
                toggleFormat(format);
              }}
            />
          ))}
        </div>

        <Section>Organization</Section>
        {organizations.length === 0 && (
          <p className="text-muted-foreground text-xs">Loading organizations…</p>
        )}
        <div className="flex flex-wrap gap-2">
          {organizations.map((org) => (
            <Chip
              key={org.slug}
              label={org.name}
              on={filters.organizations[org.slug] ?? false}
              onClick={() => {
                toggleOrganization(org.slug);
              }}
            />
          ))}
        </div>

        <Section>Activities</Section>
        {categories.length === 0 && <p className="text-muted-foreground text-xs">Loading tags…</p>}
        {categories.map((category) => (
          <div key={category.slug}>
            <div className="mt-4 mb-2 flex items-center justify-between">
              <span className="text-[15px] font-bold">{category.name}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {category.children.map((tag) => (
                <Chip
                  key={tag.slug}
                  label={tag.name}
                  on={filters.tags[tag.slug] ?? false}
                  onClick={() => {
                    toggleTag(tag.slug);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="text-muted-foreground mt-3 text-xs">
          Picking no activity shows every event; picking several shows events matching any of them.
        </p>
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
