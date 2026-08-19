# Event Ingestion Job

Ingests event data from various calendar sources (Squarespace, NeonCRM, etc.) and syncs to Supabase.

## What it does

- Scrapes Northern California SCI events from Squarespace JSON API
- Uploads event photos to the `event-photos` Supabase Storage bucket
- Deduplicates events using UNIQUE(feed_id, external_id) composite key
- Detects duplicate events across different feed sources
- Updates event records when re-ingested
- Logs ingestion summary (inserted, updated, deduplicated, failed counts)

## Database Setup

Before running the ingestion job, apply every file in `supabase/migrations/` in
filename order (each is a standalone SQL script — copy into the Supabase SQL
Editor and execute, or use the Supabase CLI). In particular,
`20260818110000_event_photos_storage_bucket.sql` creates the `event-photos`
bucket the ingest job uploads photos to — without it, photo uploads fail with
a "bucket not found" error while events still ingest fine.

## Configuration

Create a `.env.local` file in the project root with your Supabase credentials:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

The job will load these values from the parent project's `.env.local`.

## Installation

From the project root:

```bash
pnpm install
```

This installs all workspace dependencies, including those for `event-ingest`.

## Running

### Start ingestion (one-time run)

```bash
pnpm -F event-ingest start
```

### Watch mode (restarts on file changes)

```bash
pnpm -F event-ingest dev
```

## Photo Storage

Event photos are uploaded to the `event-photos` Supabase Storage bucket at:

```
events/{sha256-of-image-bytes}.ext
```

The path is derived from the image bytes, not the event or source URL, so two
events that reference the same photo resolve to the same storage object —
uploading is a no-op the second time, and no photo is ever stored twice.

The ingest job:
- Validates image format (JPEG, PNG, GIF, WEBP)
- Uploads to storage with `upsert: true`, so re-ingesting is idempotent
- Inserts into `event_photos` table with the public URL and storage path
- Skips invalid or oversized (>10MB) images with warnings

## Database Schema

### data_feeds table
Stores configuration for each event source:
- `id`: UUID primary key
- `name`: Display name (e.g. "NorCal SCI Calendar")
- `feed_url`: Source URL
- `feed_type`: Type of feed (squarespace, neoncrm, etc.)
- `is_active`: Enable/disable feed ingestion
- `last_fetched_at`: When last scraped
- `created_at`, `updated_at`: Timestamps

### events table
Normalized event data:
- `id`: UUID primary key
- `feed_id`: Reference to data_feeds
- `external_id`: Unique ID from source
- `title`, `description`, `description_html`: Event content
- `start_time`, `end_time`: Event dates
- `location`: Venue/address
- `url`: Original event URL
- `registration_url`: Registration link (if any)
- `category`: Event category (e.g. "events")
- `needs_ai_verification`: Set by the ingest job when a scraped event is new or its content
  changed since the last run; left alone on an unchanged re-scrape. Cleared by whatever reviews
  the event, not by the ingest job.
- `created_at`, `updated_at`: Timestamps
- **Constraint**: UNIQUE(feed_id, external_id) prevents duplicates from same source

### event_photos table
Photo metadata for events:
- `id`: UUID primary key
- `event_id`: Reference to events
- `photo_url`: Public URL of the photo in the `event-photos` storage bucket
- `is_primary`: Whether this is the featured photo
- `storage_type`: 'local' (filesystem), 'supabase', or 's3' — the ingest job writes 'supabase'
- `storage_path`: Path within the bucket, e.g. `events/{sha256-of-image-bytes}.ext`
- `alt_text`, `description`: Photo metadata
- `uploaded_by`: Who uploaded it (e.g., 'scraper' for automated ingest)
- `created_at`, `updated_at`: Timestamps

## Deduplication

The job handles duplicates at two levels:

### 1. Same-feed deduplication (enforced)
The `UNIQUE(feed_id, external_id)` constraint prevents duplicate events from the same feed source. If the same event is scraped twice, it updates the existing record instead of creating a duplicate.

### 2. Cross-feed deduplication (logged)
When processing events, the job checks if a matching event (same title, same date) exists from a different feed source and logs it. This helps identify when multiple sources publish the same event.

## Troubleshooting

### "Missing required environment variables"
Make sure `SUPABASE_URL` and `SUPABASE_KEY` are set in `.env.local` at the project root.

### "Connection failed"
Verify:
- Supabase project is running
- URL and key are correct
- Database schema has been created (run migration)
- Network connectivity to Supabase is working

### "No active feeds configured"
Add at least one feed to the database:

```sql
INSERT INTO data_feeds (name, feed_url, feed_type, is_active) VALUES
  ('NorCal SCI Calendar', 'https://norcalsci.org/events', 'squarespace', true);
```

### Photo download failures
The scraper logs warnings for failed images but continues. Common causes:
- Invalid URL or broken link
- Unsupported image format
- File exceeds 10MB limit
- Network timeout

Successful photos are cached locally to avoid re-downloading.

## Development

To modify the scraper:
- Base scraper: `scrapers/norcalsci-events-json.js`
- With images: `scrapers/norcalsci-events-json-with-images.js`
- Rich text parser: `scrapers/rich-text.js`
- Main ingestion: `ingest.js`

All scrapers are ES6 modules using top-level await.
