/**
 * NorCal SCI Events Ingestion Worker
 * Scrapes Northern California SCI events with photos and syncs to Supabase
 * Handles deduplication via UNIQUE(feed_id, external_id) composite key
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  downloadEventImage,
  NorCalSCIEventsJsonWithImagesScraper,
} from './scrapers/norcalsci-events-json-with-images.js';

// Load environment configuration in priority order:
// 1. Local .env in event-ingest directory (highest priority)
// 2. .env.local from project root
// 3. .env from project root (lowest priority)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const jobEnvPath = path.join(__dirname, '.env');
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = path.join(projectRoot, '.env');

// Load in reverse priority order (earlier loads are overridden by later ones)
dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath });
dotenv.config({ path: jobEnvPath }); // Load job-specific .env last (highest priority)

// Validate environment configuration
function validateEnvironment() {
  // Support both SUPABASE_* and VITE_SUPABASE_* variable names
  // Use service_role key to bypass RLS policies (required for inserting events)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)');
  if (!supabaseKey) missing.push('SUPABASE_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY)');

  if (missing.length > 0) {
    console.error('Failed to validate environment:');
    missing.forEach((key) => {
      console.error(`   - ${key}`);
    });
    console.error('\nPlease set these in your .env file:');
    console.error('  SUPABASE_URL=https://your-project.supabase.co');
    console.error('  SUPABASE_KEY=your-service-role-key (required to bypass RLS)');
    console.error('  Or set VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  // Validate URL format
  try {
    new URL(supabaseUrl);
  } catch (error) {
    console.error('SUPABASE_URL is not a valid URL:', supabaseUrl);
    process.exit(1);
  }

  // Validate key format (basic check)
  if (supabaseKey.length < 20) {
    console.error('SUPABASE_KEY appears invalid (too short)');
    process.exit(1);
  }

  return { supabaseUrl, supabaseKey };
}

const { supabaseUrl, supabaseKey } = validateEnvironment();
const supabase = createClient(supabaseUrl, supabaseKey);

class EventIngestionWorker {
  constructor() {
    this.supabase = supabase;
    this.stats = {
      feedsProcessed: 0,
      eventsScraped: 0,
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsFailed: 0,
      eventsDeduplicated: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Log with timestamp
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix =
      {
        info: 'ℹ ',
        success: '✓',
        error: '✗',
        warning: 'W',
      }[level] || '';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  /**
   * Fetch all active feeds from database
   */
  async getActiveFeeds() {
    const { data, error } = await this.supabase
      .from('data_feeds')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      this.log(`Failed to fetch feeds: ${error.message}`, 'error');
      throw error;
    }

    return data || [];
  }

  /**
   * Check for potential duplicate events from other feeds
   * Uses title+date matching to detect same event from different sources
   */
  async checkForDuplicatesByContent(title, startTime, currentFeedId) {
    try {
      if (!startTime) return null;

      // Normalize date to day (ignore time component for matching)
      const eventDate = new Date(startTime);
      const dayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      // Query for events with same title on same day from other feeds
      const { data, error } = await this.supabase
        .from('events')
        .select('id, feed_id, external_id, title, start_time')
        .eq('title', title)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString())
        .neq('feed_id', currentFeedId);

      if (error) {
        this.log(`  Error checking for content duplicates: ${error.message}`, 'warning');
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      this.log(`  Failed to check for duplicates: ${error.message}`, 'warning');
      return null;
    }
  }

  /**
   * Upsert events for a specific feed
   * Uses UNIQUE(feed_id, external_id) for safe deduplication
   * Also checks for title+date duplicates across feeds
   * Returns count of inserted vs updated events
   */
  async upsertEvents(feedId, events) {
    if (events.length === 0) {
      this.log('  No events to upsert', 'info');
      return { inserted: 0, updated: 0, failed: 0, deduplicated: 0 };
    }

    try {
      let dedupCount = 0;

      // Prepare event payloads with validation
      // Track source_image_url separately (non-column field for later download)
      const eventImageMap = {};
      const payloads = events
        .filter((event) => {
          // Skip events without required fields
          if (!event.external_id) {
            console.warn(`  Skipping event without external_id: ${event.title}`);
            return false;
          }
          if (!event.title) {
            console.warn(`  Skipping event without title`);
            return false;
          }
          if (!event.start_time) {
            console.warn(`  Skipping event without start_time: ${event.title}`);
            return false;
          }
          return true;
        })
        .map((event) => {
          // Save source image URL for post-upsert download
          if (event.source_image_url) {
            eventImageMap[event.external_id] = event.source_image_url;
          }

          return {
            feed_id: feedId,
            external_id: event.external_id,
            title: event.title,
            description: event.description || '',
            description_html: event.description_html || '',
            start_time: event.start_time,
            end_time: event.end_time || null,
            location: event.location || '',
            url: event.url || '',
            registration_url: event.registration_url || null,
            category: event.category || null,
            updated_at: event.updated_at || new Date().toISOString(),
          };
        });

      this.log(`  Preparing to upsert ${payloads.length} events...`, 'info');

      // Check for cross-feed duplicates (optional, for logging)
      for (const payload of payloads) {
        const duplicate = await this.checkForDuplicatesByContent(
          payload.title,
          payload.start_time,
          feedId,
        );
        if (duplicate) {
          dedupCount++;
          this.log(
            `  Event "${payload.title}" matches existing event from feed ${duplicate.feed_id}`,
            'info',
          );
        }
      }

      // Upsert using composite unique key (feed_id, external_id)
      // On conflict, update the record; on new insert, create it
      const { data, error, status } = await this.supabase
        .from('events')
        .upsert(payloads, {
          onConflict: 'feed_id,external_id',
          ignoreDuplicates: false, // Update on conflict
        })
        .select('id, external_id, created_at');

      if (error) {
        this.log(`Upsert error (status ${status}): ${error.message}`, 'error');
        this.log(`Error details: ${JSON.stringify(error)}`, 'error');
        throw error;
      }

      // PostgreSQL upsert behavior:
      // - If INSERT succeeds, created_at is recent
      // - If UPDATE succeeds, created_at is old
      // We detect new records by checking if created_at is within last minute
      const now = Date.now();
      let inserted = 0;
      let updated = 0;
      const externalIdToDbId = {};

      if (Array.isArray(data)) {
        data.forEach((record) => {
          try {
            const createdTime = new Date(record.created_at).getTime();
            if (now - createdTime < 60000) {
              // Created within last 60 seconds = inserted
              inserted++;
            } else {
              // Created before = updated
              updated++;
            }
          } catch (e) {
            // If we can't parse date, assume it's an update
            updated++;
          }
          // Build map from external_id to db event id for image download phase
          externalIdToDbId[record.external_id] = record.id;
        });
      }

      return {
        inserted,
        updated,
        failed: 0,
        deduplicated: dedupCount,
        total: payloads.length,
        eventImageMap,
        externalIdToDbId,
      };
    } catch (error) {
      this.log(`Failed to upsert events: ${error.message}`, 'error');
      return {
        inserted: 0,
        updated: 0,
        failed: events.length,
        deduplicated: 0,
        error: error.message,
      };
    }
  }

  /**
   * Download images for events and insert into event_photos table
   * Called after upsert so event IDs are known
   * Does not fail the event ingest if individual images fail
   */
  async downloadImagesAndInsertPhotos(eventImageMap, externalIdToDbId) {
    if (Object.keys(eventImageMap).length === 0) {
      this.log('  No images to download', 'info');
      return { downloaded: 0, cached: 0, failed: 0, photosInserted: 0 };
    }

    let downloaded = 0;
    let cached = 0;
    let failed = 0;
    let photosInserted = 0;

    for (const [externalId, sourceImageUrl] of Object.entries(eventImageMap)) {
      const dbEventId = externalIdToDbId[externalId];
      if (!dbEventId) {
        this.log(`  Warning: Could not find database event ID for ${externalId}`, 'warning');
        failed++;
        continue;
      }

      try {
        // Download the image
        const imageResult = await downloadEventImage(sourceImageUrl, dbEventId);

        if (!imageResult.success) {
          this.log(
            `  Warning: Image failed for event ${dbEventId}: ${imageResult.error}`,
            'warning',
          );
          failed++;
          continue;
        }

        if (imageResult.cached) {
          cached++;
        } else {
          downloaded++;
        }

        // Insert into event_photos with upsert on UNIQUE(event_id, photo_url)
        const photoUrl = imageResult.filePath;
        const { error: photoError } = await this.supabase.from('event_photos').upsert(
          {
            event_id: dbEventId,
            photo_url: photoUrl,
            is_primary: true,
            display_order: 0,
            storage_type: 'local',
            storage_path: photoUrl,
            uploaded_by: 'scraper',
            alt_text: null,
          },
          {
            onConflict: 'event_id,photo_url',
            ignoreDuplicates: false, // Update if already exists
          },
        );

        if (photoError) {
          this.log(
            `  Warning: Failed to insert photo row for event ${dbEventId}: ${photoError.message}`,
            'warning',
          );
          failed++;
        } else {
          photosInserted++;
        }
      } catch (error) {
        this.log(
          `  Warning: Unexpected error downloading image for event ${dbEventId}: ${error.message}`,
          'warning',
        );
        failed++;
      }
    }

    return { downloaded, cached, failed, photosInserted };
  }

  /**
   * Scrape NorCal SCI events with images
   */
  async scrapeNorCalSCIEvents(feed) {
    this.log(`  Using NorCal SCI Events scraper with image download`, 'info');
    const scraper = new NorCalSCIEventsJsonWithImagesScraper(feed.feed_url, { skipImages: false });

    const events = await scraper.scrape(feed.id);
    return events;
  }

  /**
   * Process the NorCal SCI events feed
   */
  async processFeed(feed) {
    this.log(`\nProcessing feed: ${feed.name}`, 'info');
    this.log(`Feed URL: ${feed.feed_url}`, 'info');

    try {
      const events = await this.scrapeNorCalSCIEvents(feed);

      if (!Array.isArray(events)) {
        throw new Error(`Expected array of events, got ${typeof events}`);
      }

      this.log(`  Scraped ${events.length} events from ${feed.name}`, 'info');
      this.stats.eventsScraped += events.length;

      // Upsert events to database
      const result = await this.upsertEvents(feed.id, events);

      if (result.failed && result.failed > 0) {
        this.log(`  Upsert failed for ${result.failed} events`, 'warning');
        this.stats.eventsFailed += result.failed;
      } else {
        this.log(
          `  Upserted: ${result.inserted} inserted, ${result.updated} updated${
            result.deduplicated > 0 ? `, ${result.deduplicated} deduplicated` : ''
          }`,
          'success',
        );
        this.stats.eventsInserted += result.inserted;
        this.stats.eventsUpdated += result.updated;
        this.stats.eventsDeduplicated += result.deduplicated || 0;
      }

      // Download images and insert into event_photos (happens after upsert)
      if (result.eventImageMap && Object.keys(result.eventImageMap).length > 0) {
        const imageResult = await this.downloadImagesAndInsertPhotos(
          result.eventImageMap,
          result.externalIdToDbId,
        );
        this.log(
          `  Images: ${imageResult.downloaded} downloaded, ${imageResult.cached} cached, ${imageResult.failed} failed, ${imageResult.photosInserted} inserted`,
          'info',
        );
      }

      // Update last_fetched_at timestamp
      const { error: updateError } = await this.supabase
        .from('data_feeds')
        .update({
          last_fetched_at: new Date().toISOString(),
          is_active: true,
        })
        .eq('id', feed.id);

      if (updateError) {
        this.log(`  Failed to update last_fetched_at: ${updateError.message}`, 'warning');
      }

      return true;
    } catch (error) {
      this.log(`  Failed to process feed ${feed.name}: ${error.message}`, 'error');
      this.log(`  Stack: ${error.stack?.split('\n')[1] || ''}`, 'error');
      this.stats.eventsFailed++;
      return false;
    }
  }

  /**
   * Test database connection
   */
  async testConnection() {
    this.log('Testing Supabase connection...', 'info');
    try {
      const { data, error } = await this.supabase
        .from('data_feeds')
        .select('count', { count: 'exact' })
        .limit(1);

      if (error) {
        this.log(`Connection failed: ${error.message}`, 'error');
        return false;
      }

      this.log('Supabase connection successful', 'success');
      return true;
    } catch (error) {
      this.log(`Connection test failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Run the complete ingestion cycle
   */
  async run() {
    this.stats.startTime = new Date();

    console.log('\n' + '='.repeat(70));
    console.log('Event Ingestion Worker Starting');
    console.log('='.repeat(70));
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Time: ${new Date().toISOString()}\n`);

    try {
      // Test database connection first
      const connected = await this.testConnection();
      if (!connected) {
        this.log('Cannot proceed without database connection', 'error');
        process.exit(1);
      }

      // Get active feeds
      const feeds = await this.getActiveFeeds();
      this.log(`Found ${feeds.length} active feed(s)`, 'info');

      if (feeds.length === 0) {
        this.log('No active feeds configured. Add feeds to data_feeds table.', 'warning');
        this.log('Example SQL:', 'info');
        this.log(
          `
  INSERT INTO data_feeds (name, feed_url, feed_type, is_active) VALUES
  ('NorCal SCI Calendar', 'https://norcalsci.org/calendar', 'squarespace', true),
  ('BORP Calendar', 'https://borp.app.neoncrm.com/nx/portal/event-calendar', 'neoncrm', true);
        `,
          'info',
        );
        return;
      }

      // Process each feed
      for (const feed of feeds) {
        await this.processFeed(feed);
        this.stats.feedsProcessed++;
      }

      // Print summary
      this.printSummary();
    } catch (error) {
      this.log(`Fatal error: ${error.message}`, 'error');
      this.log(`Stack: ${error.stack?.split('\n')[1] || ''}`, 'error');
      process.exit(1);
    }
  }

  /**
   * Print execution summary
   */
  printSummary() {
    this.stats.endTime = new Date();
    const duration = (this.stats.endTime - this.stats.startTime) / 1000;

    console.log('\n' + '='.repeat(70));
    console.log('Ingestion Summary');
    console.log('='.repeat(70));
    console.log(`Feeds Processed: ${this.stats.feedsProcessed}`);
    console.log(`Events Scraped: ${this.stats.eventsScraped}`);
    console.log(`Events Inserted: ${this.stats.eventsInserted}`);
    console.log(`Events Updated: ${this.stats.eventsUpdated}`);
    console.log(`Events Deduplicated (cross-feed): ${this.stats.eventsDeduplicated}`);
    console.log(`Events Failed: ${this.stats.eventsFailed}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log('='.repeat(70) + '\n');
  }
}

// Run worker
const worker = new EventIngestionWorker();
await worker.run();
