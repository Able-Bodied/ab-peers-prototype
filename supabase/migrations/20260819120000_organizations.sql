-- ============================================================================
-- Organizations: one row per publishing org, so a feed's identity is data the
-- UI can badge and filter on instead of just a `data_feeds.name` string
-- ============================================================================
-- Each `data_feeds` row maps to exactly one organization (organization_id).
-- Splitting them rather than reusing `data_feeds` directly for this is what
-- lets two calendar feeds from the same org (e.g. an iCal feed and a
-- Squarespace scrape) share one badge and one filter chip later, without a
-- migration when that happens.
-- ============================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  -- Hotlinked from the org's own site rather than mirrored into storage — same posture as
  -- registration_url elsewhere in this schema: it's their asset, not ours to host.
  logo_url text,
  created_at timestamptz not null default now()
);

alter table public.data_feeds add column if not exists organization_id uuid references public.organizations(id);

create index if not exists idx_data_feeds_organization_id on public.data_feeds (organization_id);

alter table public.organizations enable row level security;

drop policy if exists "anyone can view organizations" on public.organizations;
create policy "anyone can view organizations"
  on public.organizations for select
  using (true);

-- ---------------------------------------------------------------------------
-- Seed NorCal SCI and link the existing feed to it
-- ---------------------------------------------------------------------------
-- Logo pulled from the org's own site (norcalsci.org), where it serves as both
-- the header logo and the favicon.

insert into public.organizations (slug, name, logo_url) values
  (
    'norcal-sci',
    'NorCal SCI',
    'https://images.squarespace-cdn.com/content/v1/639f51bcb6f2d126acbc35ab/7eb6efd8-35fc-4e3a-a1e4-d84ab6449079/Screen%2BShot%2B2017-04-19%2Bat%2B1.41.55%2BPM+-+Edited.png?format=300w'
  )
on conflict (slug) do nothing;

update public.data_feeds
set organization_id = (select id from public.organizations where slug = 'norcal-sci')
where feed_url = 'https://norcalsci.org/events'
  and organization_id is null;
