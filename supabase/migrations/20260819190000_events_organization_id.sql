-- Add organization_id column to events table
-- This allows events to track which organization they belong to directly,
-- supporting feeds like AdaptiveRecHub that aggregate many orgs' events into one feed.
-- For NorCal SCI (one org per feed), this is backfilled from the feed's org.

alter table events add column organization_id uuid references organizations(id);
create index events_organization_id_idx on events(organization_id);

-- Backfill existing events with their feed's organization
update events
set organization_id = data_feeds.organization_id
from data_feeds
where events.feed_id = data_feeds.id
  and events.organization_id is null
  and data_feeds.organization_id is not null;
