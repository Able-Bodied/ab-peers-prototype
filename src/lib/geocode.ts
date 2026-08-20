import { US_STATES, type UsState } from '@/types/domain';

/**
 * Nominatim (OpenStreetMap) geocoding — free, no API key. Shared by the
 * onboarding location step (reverse geocoding a browser position) and the
 * events feed's distance filter (forward geocoding a typed zip/city, and
 * reverse geocoding "use my location" the same way onboarding does).
 *
 * Same provider the ingest job uses server-side for event locations
 * (jobs/event-ingest/scrapers/geocode.js) — keeping both on Nominatim means
 * "city" means the same thing on both sides of the app.
 */

function matchUsState(name: string | undefined): UsState | null {
  if (!name) return null;
  return US_STATES.find((s) => s.toLowerCase() === name.toLowerCase()) ?? null;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  state?: string;
  postcode?: string;
}

function cityOf(address: NominatimAddress): string {
  return address.city ?? address.town ?? address.village ?? address.hamlet ?? '';
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<{ city: string; state: UsState } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { address?: NominatimAddress };
  const address = body.address ?? {};
  const city = cityOf(address);
  const state = matchUsState(address.state);
  if (!city || !state) return null;
  return { city, state };
}

export interface GeocodeResult {
  city: string;
  latitude: number;
  longitude: number;
}

/**
 * Forward-geocodes free text — a zip code, a city name, "Sacramento,  CA" —
 * into coordinates and a resolved city name, for the events feed's distance
 * filter. Returns null (never throws) on no match or a network failure.
 */
export async function forwardGeocode(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const results = (await res.json()) as {
      lat: string;
      lon: string;
      address?: NominatimAddress;
    }[];
    const top = results[0];
    if (!top) return null;
    return {
      city: cityOf(top.address ?? {}) || trimmed,
      latitude: Number(top.lat),
      longitude: Number(top.lon),
    };
  } catch {
    return null;
  }
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });
}
