-- Add AdaptiveRecHub feed support
-- Widens feed_type constraint to include adaptiverechub-events,
-- seeds the Adaptive Rec Hub organization (fallback for events with no Program),
-- and creates the feed row.

-- Drop the original feed_type check constraint and add a widened one
alter table data_feeds drop constraint if exists data_feeds_feed_type_check;
alter table data_feeds
  add constraint feed_type_check
  check (feed_type in ('ical', 'rss', 'json', 'squarespace', 'neoncrm', 'norcalsci-events', 'norcalsci-events-json', 'adaptiverechub-events'));

-- Seed the Adaptive Rec Hub organization (fallback org for events with no Program field)
insert into organizations (name, slug, default_timezone)
values (
  'Adaptive Rec Hub',
  'adaptive-rec-hub',
  'America/Los_Angeles'
) on conflict (slug) do nothing;

-- Create the AdaptiveRecHub feed, linked to the fallback org
insert into data_feeds (name, feed_url, feed_type, organization_id, is_active)
select
  'AdaptiveRecHub Events',
  'https://adaptiverechub.org/events/',
  'adaptiverechub-events',
  (select id from organizations where slug = 'adaptive-rec-hub'),
  true
where not exists (
  select 1 from data_feeds where feed_url = 'https://adaptiverechub.org/events/'
);
