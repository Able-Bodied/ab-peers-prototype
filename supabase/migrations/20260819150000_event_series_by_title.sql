-- ============================================================================
-- event_series: match on title (fuzzy), not on a URL-derived key
-- ============================================================================
-- 20260818090000 introduced event_series keyed by series_key -- a scraper-
-- specific string combining a normalized title with a URL slug, resolved to a
-- series_id by an exact-match trigger (INSERT ... ON CONFLICT). In practice no
-- scraper ever set series_key (jobs/event-ingest/scrapers/series-key.js,
-- referenced in that migration's comments, was never written), so the trigger
-- has been dead code since day one, and the URL half of the key does not even
-- generalize -- NorCal SCI's recurring events do not repeat a URL the way
-- Adaptive Rec Hub's do (see norcalsci-events.md's "Recurring events" gotcha).
--
-- This replaces it with matching on `title` alone, done in the ingest job:
-- exact match first, falling back to fuzzy (Levenshtein-based) similarity --
-- see jobs/event-ingest/scrapers/series-match.js. Fuzzy matching cannot be
-- expressed as a SQL UNIQUE constraint, so it cannot live in a trigger the way
-- series_key did; the job now resolves series_id itself and writes it
-- directly, the same way it writes every other event column.
-- ============================================================================

drop trigger if exists events_resolve_series on public.events;
drop function if exists public.resolve_event_series();

-- Auto-named from the inline `unique (feed_id, series_key)` in 20260818090000;
-- has to go before the column it covers can be dropped.
alter table public.event_series drop constraint if exists event_series_feed_id_series_key_key;

alter table public.events drop column if exists series_key;
alter table public.event_series drop column if exists series_key;

-- ----------------------------------------------------------------------------
-- Merge series rows the old (title + URL slug) key split apart, now that the
-- key is title alone. A recurring NorCal SCI event whose URL varied between
-- occurrences (the common case -- see the file header) got a fresh series row
-- every time under the old scheme; those collapse to one row here, keeping
-- the oldest as canonical, before the unique index below can be added.
-- ----------------------------------------------------------------------------
do $$
declare
  dup record;
  keep_id uuid;
begin
  for dup in
    select feed_id, lower(btrim(title)) as norm_title
    from public.event_series
    group by feed_id, lower(btrim(title))
    having count(*) > 1
  loop
    select id into keep_id
    from public.event_series
    where feed_id = dup.feed_id and lower(btrim(title)) = dup.norm_title
    order by created_at asc
    limit 1;

    update public.events
    set series_id = keep_id
    where series_id in (
      select id from public.event_series
      where feed_id = dup.feed_id and lower(btrim(title)) = dup.norm_title and id <> keep_id
    );

    -- A series-owned photo (event_id null) on a row about to be deleted: repoint it too, unless
    -- the canonical row already has a photo at that same URL or already has a primary, in which
    -- case the partial unique indexes below would reject the repoint -- drop it rather than fail
    -- the whole migration over what should be rare leftover data.
    update public.event_photos p
    set series_id = keep_id
    where p.series_id in (
      select id from public.event_series
      where feed_id = dup.feed_id and lower(btrim(title)) = dup.norm_title and id <> keep_id
    )
    and not exists (
      select 1 from public.event_photos existing
      where existing.series_id = keep_id
        and (existing.photo_url = p.photo_url or (existing.is_primary and p.is_primary))
    );

    delete from public.event_photos
    where series_id in (
      select id from public.event_series
      where feed_id = dup.feed_id and lower(btrim(title)) = dup.norm_title and id <> keep_id
    );

    delete from public.event_series
    where feed_id = dup.feed_id and lower(btrim(title)) = dup.norm_title and id <> keep_id;
  end loop;
end $$;

-- Exact-duplicate safety net: the job's own exact-match step should always
-- reuse an existing row for an identical title, so this should never actually
-- reject an insert in practice -- it exists in case a bug (or a second writer)
-- ever tries to create two rows for the same feed with the same title.
create unique index if not exists event_series_feed_id_title_key
  on public.event_series (feed_id, lower(btrim(title)));
