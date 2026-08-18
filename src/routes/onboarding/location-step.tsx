import { CheckCircle2, LocateFixed } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { US_STATES, type UsState } from '@/types/domain';

function matchUsState(name: string | undefined): UsState | null {
  if (!name) return null;
  return US_STATES.find((s) => s.toLowerCase() === name.toLowerCase()) ?? null;
}

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<{ city: string; state: UsState } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { address?: Record<string, string> };
  const address = body.address ?? {};
  const city = address.city ?? address.town ?? address.village ?? address.hamlet ?? '';
  const state = matchUsState(address.state);
  if (!city || !state) return null;
  return { city, state };
}

export function LocationStep({
  city,
  state,
  showInBrowse,
  onNext,
}: {
  city: string;
  state: UsState | null;
  showInBrowse: boolean;
  onNext: (value: { city: string; state: UsState; showInBrowse: boolean }) => void;
}) {
  const [cityValue, setCityValue] = useState(city);
  const [stateValue, setStateValue] = useState(state);
  const [browseValue, setBrowseValue] = useState(showInBrowse);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const canContinue = cityValue.trim().length > 0 && stateValue !== null;

  function handleUseLocation() {
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reverseGeocode(position.coords.latitude, position.coords.longitude)
          .then((result) => {
            if (!result) {
              setLocationError("Couldn't match that to a city — enter it manually.");
              return;
            }
            setCityValue(result.city);
            setStateValue(result.state);
          })
          .catch(() => {
            setLocationError("Couldn't look up your location — enter it manually.");
          })
          .finally(() => {
            setLocating(false);
          });
      },
      () => {
        setLocationError('Location permission denied — enter it manually.');
        setLocating(false);
      },
    );
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (stateValue)
          onNext({ city: cityValue.trim(), state: stateValue, showInBrowse: browseValue });
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Where do you live?</h1>
        <p className="text-muted-foreground text-sm">
          We show peers and events in your state first. City and state only — never your address.
        </p>
      </div>

      <Button type="button" variant="outline" onClick={handleUseLocation} disabled={locating}>
        <LocateFixed />
        {locating ? 'Finding you…' : 'Use my location'}
      </Button>
      {locationError && <p className="text-destructive text-sm">{locationError}</p>}

      <p className="text-muted-foreground text-center text-xs">or choose it yourself</p>

      <div className="grid gap-2">
        <Label htmlFor="state">State</Label>
        <Select
          {...(stateValue ? { value: stateValue } : {})}
          onValueChange={(v) => {
            setStateValue(v as UsState);
          }}
        >
          <SelectTrigger id="state" className="w-full">
            <SelectValue placeholder="Select a state" />
          </SelectTrigger>
          <SelectContent>
            {US_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="city">City or town</Label>
        <Input
          id="city"
          value={cityValue}
          onChange={(e) => {
            setCityValue(e.target.value);
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          setBrowseValue((v) => !v);
        }}
        aria-pressed={browseValue}
        className={cn(
          'flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
          browseValue
            ? 'border-primary bg-secondary text-primary'
            : 'border-input text-muted-foreground',
        )}
      >
        <CheckCircle2
          className={cn('size-4', browseValue ? 'text-primary' : 'text-muted-foreground')}
        />
        Show me in browse
      </button>

      <Button type="submit" disabled={!canContinue}>
        Continue
      </Button>
    </form>
  );
}
