-- ============================================================================
-- NorCal SCI Events Ingestion - Database Schema
-- ============================================================================
-- Copy and paste this entire block into Supabase SQL Editor to set up
-- ============================================================================

-- Create data_feeds table (feed source configuration)
CREATE TABLE data_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  feed_type TEXT NOT NULL CHECK (feed_type IN ('ical', 'rss', 'json', 'squarespace', 'neoncrm', 'norcalsci-events')),
  is_active BOOLEAN DEFAULT true,
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create events table (normalized event data with deduplication)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES data_feeds(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,             -- plain text, for cards and search
  description_html TEXT,        -- sanitized HTML with absolute links, for detail view
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  location TEXT,
  url TEXT,
  registration_url TEXT,
  category TEXT,
  image_url TEXT,               -- primary/featured image for the event
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- DEDUPLICATION KEY: Prevents duplicate events from same source
  UNIQUE(feed_id, external_id)
);

-- Create event_photos table (photos associated with events)
CREATE TABLE event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  alt_text TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  storage_type TEXT DEFAULT 'local' CHECK (storage_type IN ('local', 'supabase', 's3')),
  storage_path TEXT,            -- path like /photos/{feed-id}/photo-{hash}.ext
  uploaded_by TEXT DEFAULT 'scraper',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(event_id, photo_url)
);

-- Performance indexes
CREATE INDEX idx_events_feed_id ON events(feed_id);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_updated ON events(updated_at);
CREATE INDEX idx_feeds_is_active ON data_feeds(is_active);
CREATE INDEX idx_event_photos_event_id ON event_photos(event_id);
CREATE INDEX idx_event_photos_is_primary ON event_photos(is_primary);

-- ============================================================================
-- HELPFUL QUERIES
-- ============================================================================

-- Query 1: Insert a new feed source
-- INSERT INTO data_feeds (name, feed_url, feed_type, is_active) VALUES (
--   'Northern California SCI Calendar',
--   'https://norcalsci.org/calendar',
--   'squarespace',
--   true
-- );

-- Query 2: Get upcoming events
-- SELECT
--   title,
--   start_time,
--   location,
--   df.name as feed_source
-- FROM events e
-- JOIN data_feeds df ON e.feed_id = df.id
-- WHERE start_time >= NOW()
--   AND df.is_active = true
-- ORDER BY start_time ASC;

-- Query 3: Find recently updated events (last 24 hours)
-- SELECT title, updated_at, df.name
-- FROM events e
-- JOIN data_feeds df ON e.feed_id = df.id
-- WHERE updated_at > NOW() - INTERVAL '24 hours'
-- ORDER BY updated_at DESC;

-- Query 4: Events by feed (statistics)
-- SELECT
--   df.name,
--   COUNT(e.id) as event_count,
--   MIN(e.start_time) as first_event,
--   MAX(e.start_time) as latest_event,
--   df.last_fetched_at
-- FROM data_feeds df
-- LEFT JOIN events e ON df.id = e.feed_id
-- WHERE df.is_active = true
-- GROUP BY df.id, df.name
-- ORDER BY df.created_at DESC;

-- Query 5: Check for duplicate issues (should be empty)
-- SELECT feed_id, external_id, COUNT(*) as count
-- FROM events
-- GROUP BY feed_id, external_id
-- HAVING COUNT(*) > 1;

-- Query 6: Delete old events (older than 1 year)
-- DELETE FROM events
-- WHERE start_time < NOW() - INTERVAL '1 year';

-- Query 7: Disable a feed
-- UPDATE data_feeds
-- SET is_active = false
-- WHERE name = 'Northern California SCI Calendar';

-- Query 8: Get feed ingestion history
-- SELECT
--   name,
--   feed_type,
--   last_fetched_at,
--   NOW() - last_fetched_at as time_since_last_fetch,
--   is_active
-- FROM data_feeds
-- ORDER BY last_fetched_at DESC NULLS LAST;

-- ============================================================================
-- SCHEMA NOTES
-- ============================================================================
--
-- DEDUPLICATION MECHANISM:
-- The UNIQUE(feed_id, external_id) constraint ensures:
--   - Same event from same feed = 1 row
--   - Upsert updates existing row when external_id matches
--   - No duplicates even if ingested multiple times
--
-- EXAMPLE:
--   1st run: Event "SCI Meetup 2026-08-15" inserted
--   2nd run: Same event encountered -> UPDATED (not duplicate)
--   3rd run: Same event again -> UPDATED (still no duplicate)
--
-- CASCADE DELETE:
--   If a feed is deleted from data_feeds, all its events are deleted too
--
-- TIMEZONE SUPPORT:
--   All timestamps are "WITH TIME ZONE" (UTC stored, displays in local)
--   start_time/end_time are ISO 8601 format
--
-- INDEXES:
--   feed_id: Fast lookups by source
--   start_time: Fast date range queries
--   updated_at: Fast "what changed" queries
--   is_active: Fast active feed filtering
--
-- ============================================================================
