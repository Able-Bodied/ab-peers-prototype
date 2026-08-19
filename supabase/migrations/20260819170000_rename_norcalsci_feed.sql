-- ============================================================================
-- Rename the NorCal SCI feed's display name
-- ============================================================================
-- data_feeds.name ("Northern California SCI Calendar", set by the seed insert
-- in 20260818070000) is the display name shown as the event card's org line
-- throughout the app -- distinct from organizations.name ("NorCal SCI", the
-- badge/logo identity added in 20260819120000). This renames the feed only;
-- the organizations row is untouched.
-- ============================================================================

update public.data_feeds
set name = 'NorCal CI'
where feed_url = 'https://norcalsci.org/events'
  and name = 'Northern California SCI Calendar';
