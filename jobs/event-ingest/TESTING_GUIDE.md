# NorCal SCI Event Scraper - End-to-End Testing Guide

## Current Status

The scraper has been debugged and is ready for testing. Two critical bugs have been fixed:
1. ✓ Syntax error in rich-text.js
2. ✓ Environment variable loading

The only remaining step is to set up the database schema.

## Prerequisites Checklist

- [x] Supabase project created
- [x] Credentials in `.env.local`
- [ ] Database schema created (REQUIRED - see below)
- [ ] Data feed configured (will be done automatically)

## Step 1: Create Database Schema (Required)

The database schema is missing and must be created before running the scraper.

### Option A: Manual Setup (Recommended - 2 minutes)

**If you prefer to do this manually:**

1. Open your Supabase dashboard:
   ```
   https://tgjpjqwavzlezmgljecc.supabase.co
   ```

2. Go to **SQL Editor** (left sidebar)

3. Click **"New query"**

4. Run this command to get the SQL:
   ```bash
   node jobs/event-ingest/apply-migration.js
   ```

5. Copy all the SQL output (starting from `CREATE TABLE data_feeds`)

6. Paste into Supabase SQL Editor

7. Click **"Run"** button or press Cmd/Ctrl + Enter

8. Wait for success message - you should see:
   ```
   Database created successfully
   ```

### Option B: Automated Setup (If you have Supabase CLI)

```bash
supabase db push
```

### Verify Schema is Created

Run this to check:
```bash
node jobs/event-ingest/diagnose-db.js
```

You should see:
```
STATUS: ✓ Database schema is ready for ingestion
```

## Step 2: Verify Supabase Connection

```bash
pnpm -F event-ingest start
```

On first run (no feeds configured), you should see:
```
No active feeds configured. Add feeds to data_feeds table.
```

This is normal! The scraper automatically checks for configured feeds.

## Step 3: Configure the NorCal SCI Feed

The scraper will automatically add the feed if it doesn't exist. Just run:

```bash
node jobs/event-ingest/check-feeds.js
```

If no feeds exist, it will automatically insert the NorCal SCI feed:
- **Name:** NorCal SCI
- **URL:** https://norcalsci.org/events
- **Type:** squarespace
- **Active:** yes

## Step 4: Run the Scraper

```bash
pnpm -F event-ingest start
```

You should see output like:
```
======================================================================
Event Ingestion Worker Starting
======================================================================
Environment: development
Time: 2026-08-18T18:XX:XX.XXXZ

[2026-08-18T18:XX:XX.XXXZ] ℹ Testing Supabase connection...
[2026-08-18T18:XX:XX.XXXZ] ✓ Supabase connection successful
[2026-08-18T18:XX:XX.XXXZ] ℹ Found 1 active feed(s)
[2026-08-18T18:XX:XX.XXXZ] ℹ Processing feed: NorCal SCI
[2026-08-18T18:XX:XX.XXXZ] ℹ Feed URL: https://norcalsci.org/events
[2026-08-18T18:XX:XX.XXXZ] ℹ Using NorCal SCI Events scraper with image download
[2026-08-18T18:XX:XX.XXXZ] ℹ Scraped XXX events from NorCal SCI
[2026-08-18T18:XX:XX.XXXZ] ℹ Preparing to upsert XXX events...
[2026-08-18T18:XX:XX.XXXZ] ✓ Upserted: XX inserted, X updated

======================================================================
Ingestion Summary
======================================================================
Feeds Processed: 1
Events Scraped: XX
Events Inserted: XX
Events Updated: X
Events Deduplicated (cross-feed): 0
Events Failed: 0
Duration: X.XXs
======================================================================
```

## Step 5: Verify Results

### Check events in database:

```bash
# View recent events
SELECT title, start_time, location FROM events 
ORDER BY start_time DESC 
LIMIT 5;

# View event count by feed
SELECT df.name, COUNT(e.id) as event_count
FROM events e
JOIN data_feeds df ON e.feed_id = df.id
GROUP BY df.id, df.name;

# Check for any failed events
SELECT * FROM events WHERE category = 'error';
```

### Check photos in storage:

```sql
-- Uploaded event photos
SELECT event_id, photo_url, storage_type, storage_path FROM event_photos ORDER BY created_at DESC LIMIT 20;
```

Or in Supabase Dashboard: Storage → `event-photos` bucket → `events/`.

## Troubleshooting

### "Could not find the table 'public.data_feeds'"

**Cause:** Database schema hasn't been created yet

**Fix:** Run Step 1 above

### "No active feeds configured"

**Cause:** No data feeds in the database

**Fix:** Run:
```bash
node jobs/event-ingest/check-feeds.js
```

This will automatically insert the NorCal SCI feed.

### "Connection failed: ..."

**Cause:** Environment variables not set or invalid Supabase credentials

**Fix:** 
1. Verify `.env.local` in project root exists
2. Check it has valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. Run diagnostic:
   ```bash
   node jobs/event-ingest/diagnose-db.js
   ```

### Photos not downloading

**Cause:** Network timeout or invalid image URLs

**Fix:** This is logged as a warning and doesn't block the scraper. Check logs for:
```
Warning: Image failed for "[event title]": [error message]
```

## Testing Workflow

### First Run (Test)
```bash
pnpm -F event-ingest start
```

### Second Run (Test Deduplication)
```bash
pnpm -F event-ingest start
```

Expected on second run:
- Events should show as "updated" instead of "inserted"
- No new duplicates created (same event count)

### Example Output Comparison:

First run:
```
Events Scraped: 47
Events Inserted: 47
Events Updated: 0
```

Second run (deduplication):
```
Events Scraped: 47
Events Inserted: 0
Events Updated: 47
```

## Helper Commands

```bash
# Check database status
node jobs/event-ingest/diagnose-db.js

# Show SQL to apply schema
node jobs/event-ingest/apply-migration.js

# Check configured feeds
node jobs/event-ingest/check-feeds.js

# Run scraper with watch mode (restarts on file changes)
pnpm -F event-ingest dev

# Run full test suite
pnpm check
pnpm test
```

## Environment Setup

The scraper loads credentials from `.env.local` in the project root:

```bash
# File: /Users/rantaoca/Documents/ab-peers-prototype/.env.local

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

The scraper supports both `VITE_SUPABASE_*` and `SUPABASE_*` prefixed variables for flexibility.

## Next Steps After Testing

Once end-to-end testing is complete:

1. Run the full test suite:
   ```bash
   pnpm check
   pnpm test
   ```

2. Fix any failing tests

3. Set up automated ingestion (cron job or scheduled task)

4. Monitor ingestion logs and database

5. Set up alerts for failures

## FAQ

**Q: How often should the scraper run?**  
A: Typically once daily or a few times per day. Configure as a cron job or scheduled task.

**Q: What happens if an event is updated on the source?**  
A: The event is automatically updated in the database thanks to the UPSERT logic.

**Q: Can it handle multiple feeds?**  
A: Yes! Add more feeds to the `data_feeds` table. The scraper will process all active feeds.

**Q: Are photos required?**  
A: No. Photo download failures don't block event ingestion. Events are stored even if photos fail.

**Q: How does deduplication work?**  
A: Events are deduplicated via `UNIQUE(feed_id, external_id)` composite key. The scraper also detects same-event duplicates across different feeds and logs them.

## Support

For issues, check:
1. `diagnose-db.js` - Database connectivity
2. `check-feeds.js` - Feed configuration
3. Scraper logs - Detailed error messages
4. Supabase dashboard - Data status

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Event Schema](../supabase/migrations/20260818060000_create_events_schema.sql)
- [Scraper Code](./ingest.js)
- [Rich Text Parser](./scrapers/rich-text.js)
