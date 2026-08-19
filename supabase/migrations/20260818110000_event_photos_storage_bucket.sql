-- ============================================================================
-- event-photos storage bucket
-- ============================================================================
-- event_photos.storage_type already allowed 'supabase' as an option (see
-- 20260818060000_create_events_schema.sql) but no bucket existed for it. The
-- ingest job now uploads scraped images here instead of writing them to
-- public/photos/events on whatever machine runs the job.
--
-- Path scheme: events/{sha256-of-image-bytes}.{ext}. Content-addressed rather
-- than per-event, so two events that share a source image resolve to the same
-- object -- the upload is a no-op the second time (see uploadEventImage in
-- jobs/event-ingest/scrapers/norcalsci-events-json-with-images.js) and no
-- event ever needs a private copy of a photo another event already stored.
--
-- Posture mirrors events/event_photos: public read, no anon write policy.
-- Uploads run through the ingest job's service_role key, which bypasses RLS.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can view event photos in storage" on storage.objects;
create policy "anyone can view event photos in storage"
  on storage.objects for select
  using (bucket_id = 'event-photos');
