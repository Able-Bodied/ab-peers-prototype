-- ============================================================================
-- Flag events whose scraped content changed since the last ingest
-- ============================================================================
-- The ingest job (jobs/event-ingest/ingest.js) diffs each scraped event
-- against the row already on file. When the content differs -- a new event,
-- or an existing one whose scraper output changed -- it sets this flag so an
-- AI review pass can catch scraper mistakes before the event is trusted.
-- Unchanged re-scrapes leave the flag as it was; it's cleared by whatever
-- reviews the event, not by this migration or the ingest job.
-- ============================================================================

alter table public.events
  add column if not exists needs_ai_verification boolean not null default false;

create index if not exists idx_events_needs_ai_verification
  on public.events (needs_ai_verification)
  where needs_ai_verification;
