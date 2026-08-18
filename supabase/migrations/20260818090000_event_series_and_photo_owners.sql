-- ============================================================================
-- Event series: internal grouping of recurring event instances
-- ============================================================================
-- Feeds publish recurring events as independent event rows: Adaptive Rec Hub
-- gives each occurrence its own post with a `-2` / `-3` slug suffix, and other
-- feeds repeat a title across separate URLs. Deduplication on
-- (feed_id, external_id) is still correct -- these really are distinct
-- occurrences -- but nothing currently records that they belong together.
--
-- This migration adds that grouping. It is INTERNAL ONLY for now: no UI reads
-- event_series, and nothing about event rendering changes.
--
-- Matching is delegated to the scrapers. Each scraper knows its feed's URL and
-- title conventions, so it parses a `series_key` off every event (see
-- jobs/event-ingest/scrapers/series-key.js). Keys are only required to be
-- stable *within* a feed, which is why event_series is scoped by feed_id.
--
-- Photo ownership becomes an exclusive choice:
--   - photo on an event  -> belongs to the series implicitly, via events.series_id
--   - photo with no event -> belongs to the series directly
-- ============================================================================

-- ----------------------------------------------------------------------------
-- event_series
-- ----------------------------------------------------------------------------
create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.data_feeds(id) on delete cascade,

  -- Feed-specific grouping key parsed by that feed's scraper, e.g. the event
  -- slug with its `-2` instance suffix removed, joined to a normalized title.
  -- Opaque to the database; only uniqueness within a feed is assumed.
  series_key text not null,

  -- Representative title, refreshed from the most recently ingested member.
  -- Display convenience only -- never a matching input.
  title text not null,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  unique (feed_id, series_key)
);

create index if not exists idx_event_series_feed_id on public.event_series(feed_id);

-- ----------------------------------------------------------------------------
-- events -> series
-- ----------------------------------------------------------------------------
-- series_key is what the scraper emitted; series_id is the resolved row. Both
-- are kept so a re-key is debuggable without joining, and so the trigger below
-- has a single input to react to.
alter table public.events add column if not exists series_key text;
alter table public.events add column if not exists series_id uuid
  references public.event_series(id) on delete set null;

create index if not exists idx_events_series_id on public.events(series_id);

-- Resolve series_key -> series_id, creating the series on first sighting.
-- Runs in the same statement as the ingest job's bulk upsert, so the job only
-- has to add `series_key` to its payload; it never manages series rows itself.
create or replace function public.resolve_event_series()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  resolved_id uuid;
begin
  if new.series_key is null or btrim(new.series_key) = '' then
    -- A scraper that cannot derive a key leaves the event ungrouped rather
    -- than inventing a series of one.
    new.series_key := null;
    new.series_id := null;
    return new;
  end if;

  insert into public.event_series (feed_id, series_key, title)
  values (new.feed_id, new.series_key, new.title)
  on conflict (feed_id, series_key) do update
    set title = excluded.title,
        updated_at = now()
  returning id into resolved_id;

  new.series_id := resolved_id;
  return new;
end;
$$;

drop trigger if exists events_resolve_series on public.events;
create trigger events_resolve_series
  before insert or update of feed_id, series_key, title on public.events
  for each row execute function public.resolve_event_series();

-- ----------------------------------------------------------------------------
-- event_photos: owned by an event XOR by a series
-- ----------------------------------------------------------------------------
alter table public.event_photos alter column event_id drop not null;
alter table public.event_photos add column if not exists series_id uuid
  references public.event_series(id) on delete cascade;

-- Exactly one owner. A photo attached to an event already reaches the series
-- through events.series_id; storing series_id alongside event_id would create
-- a second, divergable path to the same answer.
alter table public.event_photos drop constraint if exists event_photos_owner_xor;
alter table public.event_photos add constraint event_photos_owner_xor check (
  (event_id is not null and series_id is null)
  or (event_id is null and series_id is not null)
);

-- UNIQUE(event_id, photo_url) no longer covers series photos: event_id is NULL
-- for those, and NULLs never conflict in a unique index. Replace it with one
-- partial index per owner kind.
alter table public.event_photos drop constraint if exists event_photos_event_id_photo_url_key;

create unique index if not exists event_photos_event_photo_url
  on public.event_photos (event_id, photo_url)
  where event_id is not null;

create unique index if not exists event_photos_series_photo_url
  on public.event_photos (series_id, photo_url)
  where series_id is not null;

-- At most one primary photo per owner (replaces event_photos_one_primary,
-- which only constrained the event side).
drop index if exists public.event_photos_one_primary;

create unique index if not exists event_photos_one_primary_event
  on public.event_photos (event_id)
  where is_primary and event_id is not null;

create unique index if not exists event_photos_one_primary_series
  on public.event_photos (series_id)
  where is_primary and series_id is not null;

create index if not exists idx_event_photos_series_id on public.event_photos(series_id);

-- Effective series for every photo, whichever way it is owned. Callers that
-- want "all photos for this series" query this instead of unioning two shapes.
create or replace view public.event_photos_resolved as
select
  p.id,
  p.event_id,
  coalesce(p.series_id, e.series_id) as series_id,
  p.event_id is null                 as is_series_photo,
  p.photo_url,
  p.is_primary,
  p.alt_text,
  p.description,
  p.display_order,
  p.storage_type,
  p.storage_path,
  p.uploaded_by,
  p.created_at,
  p.updated_at
from public.event_photos p
left join public.events e on e.id = p.event_id;

-- Without security_invoker the view would run as its owner and bypass the RLS
-- on event_photos / events.
alter view public.event_photos_resolved set (security_invoker = on);

-- ----------------------------------------------------------------------------
-- RLS: same posture as events -- public read, writes only via service_role.
-- ----------------------------------------------------------------------------
alter table public.event_series enable row level security;

drop policy if exists "anyone can view event series" on public.event_series;
create policy "anyone can view event series"
  on public.event_series for select
  using (true);

-- ----------------------------------------------------------------------------
-- Best-effort backfill for rows ingested before series_key existed
-- ----------------------------------------------------------------------------
-- Mirrors series-key.js closely enough to group the obvious cases, but the
-- scrapers remain authoritative: the next ingest run overwrites series_key with
-- the parsed value and the trigger re-resolves series_id. Orphaned series left
-- behind by a re-key are removed by the cleanup query at the bottom of this
-- file.
update public.events e
set series_key = nullif(
  -- normalized title: lowercase, non-alphanumeric runs collapsed to a hyphen
  btrim(regexp_replace(lower(coalesce(e.title, '')), '[^a-z0-9]+', '-', 'g'), '-')
  || '|'
  -- base slug: last path segment of the URL, minus a trailing -<digits>
  -- instance suffix
  || regexp_replace(
       regexp_replace(coalesce(e.url, ''), '^.*/([^/?#]+)/?(?:[?#].*)?$', '\1'),
       '-[0-9]{1,2}$', ''
     ),
  '|'
)
where e.series_key is null
  and coalesce(e.title, '') <> '';

-- ============================================================================
-- MAINTENANCE QUERIES
-- ============================================================================
--
-- Delete series that no longer have members and hold no photos of their own.
-- Safe to run after a scraper changes how it derives series_key.
--
--   delete from public.event_series s
--   where not exists (select 1 from public.events e where e.series_id = s.id)
--     and not exists (select 1 from public.event_photos p where p.series_id = s.id);
--
-- Series with more than one occurrence (i.e. actual recurring events):
--
--   select s.title, s.series_key, count(e.id) as occurrences
--   from public.event_series s
--   join public.events e on e.series_id = s.id
--   group by s.id, s.title, s.series_key
--   having count(e.id) > 1
--   order by occurrences desc;
--
-- Every photo for a series, however it is owned:
--
--   select * from public.event_photos_resolved where series_id = '<uuid>';
--
-- ============================================================================
