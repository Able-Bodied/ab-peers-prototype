-- ============================================================================
-- Events schema: RLS policies + NorCal SCI feed seed
-- ============================================================================
-- 20260818060000_create_events_schema.sql created the tables but no policies.
-- New tables in the public schema have RLS enabled, so with no policies the
-- anon key could neither read nor write, leaving the tables unusable.
--
-- Posture:
--   READ  - public. These are public community calendar listings, and the
--           prototype frontend renders them with the anon key (which ships in
--           the Vite bundle and is therefore public by definition).
--   WRITE - no anon policy. The ingest job is a trusted server-side process
--           and must authenticate with the service_role key, which bypasses
--           RLS. Granting anon INSERT/UPDATE here would let anyone holding the
--           public bundle key write arbitrary events.
-- ============================================================================

alter table public.data_feeds enable row level security;
alter table public.events enable row level security;
alter table public.event_photos enable row level security;

-- Feed configuration holds only public calendar URLs; readable so that the
-- ops/verification scripts and any feed-attribution UI work with the anon key.
drop policy if exists "anyone can view data feeds" on public.data_feeds;
create policy "anyone can view data feeds"
  on public.data_feeds for select
  using (true);

drop policy if exists "anyone can view events" on public.events;
create policy "anyone can view events"
  on public.events for select
  using (true);

drop policy if exists "anyone can view event photos" on public.event_photos;
create policy "anyone can view event photos"
  on public.event_photos for select
  using (true);

-- Seed the NorCal SCI feed. Runs as the table owner, so it bypasses RLS.
-- feed_url is UNIQUE, so this is safe to re-run.
insert into public.data_feeds (name, feed_url, feed_type, is_active)
values (
  'Northern California SCI Calendar',
  'https://norcalsci.org/events',
  'squarespace',
  true
)
on conflict (feed_url) do nothing;
