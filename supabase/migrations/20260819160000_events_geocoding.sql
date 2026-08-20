-- ============================================================================
-- Event geocoding: city/postal code/coordinates, and a distance RPC
-- ============================================================================
-- The ingest job geocodes each event's free-text `location` (Nominatim, the
-- same provider src/routes/onboarding/location-step.tsx already uses for
-- reverse geocoding) into a city, an optional postal code, coordinates, and
-- whether those coordinates are `exact` (a street address / building match)
-- or `approximate` (resolved only to a city, postcode, or similar area).
--
-- latitude/longitude are never meant to reach the browser -- a peer looking
-- for a support group should not learn a venue's exact coordinates just by
-- opening dev tools, and docs/PII.md already limits invented event locations
-- to city centers for the same reason. Distance filtering is therefore done
-- inside Postgres: nearby_events() takes a search origin and radius and
-- returns matching ids and a distance, never the coordinates themselves. The
-- app calls this RPC and never selects latitude/longitude directly.
-- ============================================================================

alter table public.events
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_precision text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_location_precision_check'
  ) then
    alter table public.events
      add constraint events_location_precision_check
      check (location_precision in ('exact', 'approximate'));
  end if;
end $$;

-- City is the one geocoded field the UI does show (filter chips, "Berkeley ·
-- Northern California SCI Calendar"), so it is worth indexing directly.
create index if not exists idx_events_city on public.events (city) where city is not null;

-- ----------------------------------------------------------------------------
-- nearby_events: haversine distance, no PostGIS dependency
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER (the default for a plain `language sql` function): runs as
-- the calling role, so it is still subject to the "anyone can view events" RLS
-- policy on `events` -- this grants no more read access than a normal SELECT
-- already has, it just never returns the coordinates that SELECT could.
create or replace function public.nearby_events(
  origin_lat double precision,
  origin_lon double precision,
  radius_km double precision
)
returns table (id uuid, distance_km double precision)
language sql
stable
set search_path = public, pg_temp
as $$
  select d.id, d.distance_km
  from (
    select
      e.id,
      6371 * acos(
        greatest(-1, least(1,
          cos(radians(origin_lat)) * cos(radians(e.latitude))
            * cos(radians(e.longitude) - radians(origin_lon))
          + sin(radians(origin_lat)) * sin(radians(e.latitude))
        ))
      ) as distance_km
    from public.events e
    where e.latitude is not null and e.longitude is not null
  ) d
  where d.distance_km <= radius_km
  order by d.distance_km;
$$;

grant execute on function public.nearby_events(double precision, double precision, double precision)
  to anon, authenticated;
