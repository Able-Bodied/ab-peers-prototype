-- ============================================================================
-- Correct the NorCal SCI feed's display name: "NorCal CI" -> "NorCal SCI"
-- ============================================================================
-- 20260819170000 renamed data_feeds.name from "Northern California SCI
-- Calendar" to "NorCal CI" -- a typo (missing the S). This corrects it to
-- "NorCal SCI", which also now matches organizations.name for the same org
-- (20260819120000), so the feed's display name and the org's real name agree.
-- ============================================================================

update public.data_feeds
set name = 'NorCal SCI'
where feed_url = 'https://norcalsci.org/events'
  and name = 'NorCal CI';
