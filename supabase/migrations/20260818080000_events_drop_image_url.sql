-- ============================================================================
-- Drop events.image_url column; event_photos is now the source of truth
-- ============================================================================
-- The events.image_url column stored a single image per event. With the new
-- event_photos table as the canonical storage, events can have multiple images
-- and image metadata (alt text, ordering, storage type) is centralized.
-- This migration drops the column and ensures exactly one primary photo per
-- event (if any) via a unique index on (event_id) WHERE is_primary.
-- ============================================================================

alter table public.events drop column if exists image_url;

-- Ensure at most one primary photo per event
create unique index if not exists event_photos_one_primary
  on public.event_photos (event_id)
  where is_primary;
