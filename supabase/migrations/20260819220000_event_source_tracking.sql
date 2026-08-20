-- ============================================================================
-- Source tracking: per-event detail-page freshness, and an org's page on its hub
-- ============================================================================
-- AdaptiveRecHub's list endpoint returns one card per event with only a title,
-- date, venue and Program. The real description and the registration link live
-- on each event's own page, and fetching those is expensive: robots.txt asks
-- for a 10 second crawl delay, so a full pass over ~29 local events costs ~5
-- minutes of wall clock.
--
-- The site's sitemap (https://adaptiverechub.org/wp-sitemap.xml, split across
-- wp-sitemap-posts-events-N.xml) carries a <lastmod> for every event page. That
-- makes the fetch incremental: compare the sitemap's lastmod against the value
-- we stored the last time we read that page, and skip the page entirely when it
-- has not changed. On a steady-state refresh that is zero detail fetches.
--
-- Neither existing column can play this role. `events.updated_at` is when *we*
-- last wrote the row, which every ingest touches, and `data_feeds.last_fetched_at`
-- is feed-level. Both would say "fresh" for a page we have never read.
-- ============================================================================

alter table public.events
  -- The <lastmod> the sitemap advertised when we last fetched this event's page.
  -- Null means "never fetched" and always sorts as stale, so a new event is
  -- fetched once and then left alone until the source actually changes it.
  add column if not exists source_last_modified timestamptz,
  -- When we last fetched the page, as opposed to when the source last changed
  -- it. Kept separate so an operator can tell "unchanged since we looked" from
  -- "we have not looked in a month" when a feed goes quiet.
  add column if not exists detail_fetched_at timestamptz;

-- The ingest job's staleness check reads these two by feed, once per run.
create index if not exists idx_events_detail_freshness
  on public.events (feed_id, source_last_modified);

alter table public.organizations
  -- The org's own page on the hub that published it -- AdaptiveRecHub's
  -- "Program" page, which the list card already links to. It is not the org's
  -- website: it is the hub's page *about* the org, and it carries a "Visit
  -- Website" link to the real site plus that org's genuine social accounts.
  --
  -- That distinction is the point. An event's "Learn more" button generally
  -- points at a registration platform (borp.app.neoncrm.com), and the social
  -- links in an event page's footer belong to the hub's operator rather than to
  -- the org hosting the event -- so both are wrong sources for an org's logo.
  -- The AI verification pass (jobs/event-ingest/prompts/ai-verify-events.md,
  -- Phase 6) starts from this column for exactly that reason.
  add column if not exists source_url text;
