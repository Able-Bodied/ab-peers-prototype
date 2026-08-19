-- ============================================================================
-- AI-extracted time and location, kept separate from the scraped columns
-- ============================================================================
-- A scraper sometimes has no start/end time or no location for an event, even
-- though the description states one in prose ("Time: 4:00-5:30", "Location:
-- Gino's Pizza, 1761 Monterey St."). The AI verification pass can pull those
-- out, but they must not land in `start_time`/`end_time`/`location`
-- themselves: those columns are what ingest.js diffs against the live feed to
-- decide whether an event changed (see 20260818130000's note on
-- description_clean for the same reasoning), and they are the scraper's own
-- claim, which outranks an inference when both exist.
--
-- So the AI's guesses live in their own columns. A reader prefers the scraped
-- value and falls back to the ai_extracted_* one only when the scraped value
-- is absent -- never the reverse, and never a merge.
--
-- This also means start_time, previously NOT NULL, has to allow null: an
-- event whose start time is only in the description text can now be ingested
-- (rather than silently dropped, see ingest.js) so the AI pass has a row to
-- attach ai_extracted_start_time to.
-- ============================================================================

alter table public.events
  alter column start_time drop not null;

alter table public.events
  add column if not exists ai_extracted_start_time timestamptz,
  add column if not exists ai_extracted_end_time timestamptz,
  add column if not exists ai_extracted_location text;
