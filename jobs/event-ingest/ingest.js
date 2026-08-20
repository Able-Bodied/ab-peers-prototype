/**
 * NorCal SCI Events Ingestion Worker
 * Scrapes Northern California SCI events with photos and syncs to Supabase
 * Handles deduplication via UNIQUE(feed_id, external_id) composite key
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AdaptiveRecHubEventsScraper } from './scrapers/adaptiverechub-events.js';
import { geocodeEvents } from './scrapers/geocode.js';
import {
  NorCalSCIEventsJsonWithImagesScraper,
  uploadEventImage,
} from './scrapers/norcalsci-events-json-with-images.js';
import {
  findSeriesMatch,
  SERIES_MATCH_THRESHOLD,
  titleSimilarity,
} from './scrapers/series-match.js';

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

// Columns compared to decide whether a re-scraped event counts as "changed"
// for needs_ai_verification purposes. Photos are tracked separately and
// don't factor in.
const DIFF_TEXT_FIELDS = [
  'title',
  'description',
  'description_html',
  'location',
  'url',
  'registration_url',
  'category',
];

function normalizeText(value) {
  return (value ?? '').trim();
}

// Mirrors supabase/migrations/20260819100000_events_needs_pii_review.sql — organizer contact
// details are fine to store (they're already public in the listing), but new rows still need the
// flag set so a future policy change can find them without re-scanning every description.
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}/;

function containsPii(...texts) {
  return texts.some((text) => text && (EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text)));
}

function normalizeTime(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? normalizeText(value) : ms;
}

/**
 * True if a scraped event's content differs from the row already on file
 * (or if there is no row on file yet).
 */
function eventContentChanged(existing, incoming) {
  if (!existing) return true;

  for (const field of DIFF_TEXT_FIELDS) {
    if (normalizeText(existing[field]) !== normalizeText(incoming[field])) {
      return true;
    }
  }

  return (
    normalizeTime(existing.start_time) !== normalizeTime(incoming.start_time) ||
    normalizeTime(existing.end_time) !== normalizeTime(incoming.end_time)
  );
}

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
      eventsNeedingVerification: 0,
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
   * Groups this batch's scraped events into series by fuzzy title match
   * (see scrapers/series-match.js), then resolves each group against
   * event_series rows already on file for this feed — exact title match
   * first, falling back to fuzzy — creating a new series row only when
   * nothing on file is close enough. Mutates `events` in place, setting
   * `series_id`.
   *
   * Batch-local grouping happens before touching the database so a series
   * with several occurrences in one scrape (a weekly meetup, say) only needs
   * one round trip to resolve, not one per occurrence.
   */
  async resolveEventSeries(feedId, events) {
    const groups = [];
    for (const event of events) {
      const group = groups.find(
        (g) => titleSimilarity(g.title, event.title) >= SERIES_MATCH_THRESHOLD,
      );
      if (group) group.events.push(event);
      else groups.push({ title: event.title, events: [event] });
    }

    const { data: existing, error } = await this.supabase
      .from('event_series')
      .select('id, title')
      .eq('feed_id', feedId);

    if (error) {
      this.log(
        `  Failed to load existing series, leaving this batch ungrouped: ${error.message}`,
        'warning',
      );
      return events;
    }

    const candidates = [...(existing || [])];

    for (const group of groups) {
      const match = findSeriesMatch(group.title, candidates);
      let seriesId = match?.id;

      if (!seriesId) {
        const { data: created, error: insertError } = await this.supabase
          .from('event_series')
          .insert({ feed_id: feedId, title: group.title })
          .select('id, title')
          .single();

        if (insertError) {
          this.log(`  Failed to create series "${group.title}": ${insertError.message}`, 'warning');
          continue;
        }
        seriesId = created.id;
        candidates.push(created);
      }

      for (const event of group.events) {
        event.series_id = seriesId;
      }
    }

    return events;
  }

  /**
   * Resolves the *effective* organization for every event in a batch and writes it to
   * `event.organization_id`, so `events.organization_id` is always the right org to badge,
   * filter and count by — no reader ever has to fall back through `data_feeds` (see
   * supabase/migrations/20260819190000_events_organization_id.sql).
   *
   * A scraper that names a per-event org (AdaptiveRecHub's "Program", carried as
   * `organization_slug`/`organization_name`) wins; find-or-create resolves it to a row. An event
   * with no named org falls back to the feed's own `organization_id` — which is what every
   * NorCal SCI event gets, and what the ~2/420 Program-less AdaptiveRecHub cards get ("Adaptive
   * Rec Hub", seeded as that feed's org). Mutates `events` in place.
   */
  async resolveEventOrganizations(feed, events) {
    // Null when a feed has no org of its own: such an event keeps organization_id null rather
    // than borrowing an unrelated org, and the UI simply shows no badge for it.
    const fallbackOrgId = feed.organization_id ?? null;

    const slugsNeeded = new Set(
      events.flatMap((event) => (event.organization_slug ? [event.organization_slug] : [])),
    );

    // Find-or-create one row per distinct slug in the batch, so a program hosting six of this
    // scrape's events costs one lookup rather than six.
    const slugToId = new Map();
    for (const slug of slugsNeeded) {
      // The org's page on the hub, from the list card's program link. It's the only route to the
      // org's actual website, so the AI pass starts there when backfilling a logo (Phase 6).
      const sourceUrl = events.find((e) => e.organization_slug === slug)?.organization_url || null;

      // maybeSingle(): "no such org yet" is the expected case on a first scrape, not an error.
      const { data: existing, error: lookupError } = await this.supabase
        .from('organizations')
        .select('id, source_url')
        .eq('slug', slug)
        .maybeSingle();

      if (lookupError) {
        this.log(`  Warning: Failed to look up org "${slug}": ${lookupError.message}`, 'warning');
        continue;
      }

      if (existing) {
        slugToId.set(slug, existing.id);
        // Backfill only. An org row that predates this column — or that a human has since
        // corrected — keeps what it has; we never overwrite with a freshly scraped guess.
        if (!existing.source_url && sourceUrl) {
          const { error: backfillError } = await this.supabase
            .from('organizations')
            .update({ source_url: sourceUrl })
            .eq('id', existing.id);
          if (backfillError) {
            this.log(
              `  Warning: Failed to set source_url for "${slug}": ${backfillError.message}`,
              'warning',
            );
          }
        }
        continue;
      }

      // logo_url is left null deliberately — the AI verification pass backfills it from the org's
      // own site (jobs/event-ingest/prompts/ai-verify-events.md), rather than guessing a URL here.
      const orgName = events.find((e) => e.organization_slug === slug)?.organization_name || slug;
      const { data: created, error: createError } = await this.supabase
        .from('organizations')
        .insert({ name: orgName, slug, source_url: sourceUrl })
        .select('id')
        .single();

      if (createError) {
        this.log(`  Warning: Failed to create org "${slug}": ${createError.message}`, 'warning');
        continue;
      }

      this.log(`  Created organization "${orgName}" (${slug})`, 'info');
      slugToId.set(slug, created.id);
    }

    for (const event of events) {
      event.organization_id = slugToId.get(event.organization_slug) ?? fallbackOrgId;
    }

    return events;
  }

  /**
   * Upsert events for a specific feed
   * Uses UNIQUE(feed_id, external_id) for safe deduplication
   * Also checks for title+date duplicates across feeds
   * Returns count of inserted vs updated events
   */
  async upsertEvents(feed, events) {
    if (events.length === 0) {
      this.log('  No events to upsert', 'info');
      return { inserted: 0, updated: 0, failed: 0, deduplicated: 0 };
    }

    const feedId = feed.id;

    try {
      let dedupCount = 0;

      // Resolve event organizations (per-event orgs for AdaptiveRecHub, fallback to feed's org)
      await this.resolveEventOrganizations(feed, events);

      // Load existing rows for this feed so we can tell which scraped events
      // actually changed vs. which are byte-for-byte re-scrapes, and so
      // geocoding can be skipped for a `location` that hasn't changed.
      const { data: existingRows, error: existingError } = await this.supabase
        .from('events')
        .select(
          'external_id, title, description, description_html, start_time, end_time, location, url, registration_url, category, needs_ai_verification, city, postal_code, latitude, longitude, location_precision',
        )
        .eq('feed_id', feedId);

      if (existingError) {
        this.log(
          `  Failed to load existing events for diff, treating all as changed: ${existingError.message}`,
          'warning',
        );
      }

      const existingByExternalId = new Map(
        (existingRows || []).map((row) => [row.external_id, row]),
      );

      // Required fields: external_id and title. start_time is *not* required
      // — an event whose time is only stated in the description prose still
      // gets a row, with start_time null until the AI verification pass fills
      // in ai_extracted_start_time (see 20260819140000_events_ai_extracted_fields.sql).
      const validEvents = events.filter((event) => {
        if (!event.external_id) {
          console.warn(`  Skipping event without external_id: ${event.title}`);
          return false;
        }
        if (!event.title) {
          console.warn(`  Skipping event without title`);
          return false;
        }
        return true;
      });

      await this.resolveEventSeries(feedId, validEvents);
      await geocodeEvents(validEvents, existingByExternalId);

      // Prepare event payloads
      // Track source_image_url separately (non-column field for later download)
      const eventImageMap = {};
      const payloads = validEvents.map((event) => {
        // Save source image URL for post-upsert download
        if (event.source_image_url) {
          eventImageMap[event.external_id] = event.source_image_url;
        }

        const payload = {
          feed_id: feedId,
          external_id: event.external_id,
          title: event.title,
          description: event.description || '',
          description_html: event.description_html || '',
          start_time: event.start_time || null,
          end_time: event.end_time || null,
          location: event.location || '',
          url: event.url || '',
          registration_url: event.registration_url || null,
          category: event.category || null,
          series_id: event.series_id || null,
          organization_id: event.organization_id || null,
          city: event.city || null,
          postal_code: event.postal_code || null,
          latitude: event.latitude ?? null,
          longitude: event.longitude ?? null,
          location_precision: event.location_precision || null,
          updated_at: event.updated_at || new Date().toISOString(),
          // Detail-page freshness (20260819210000_event_source_tracking.sql). Scrapers that don't
          // read a per-event page leave both undefined, and the row keeps whatever it had.
          ...(event.source_last_modified === undefined
            ? {}
            : { source_last_modified: event.source_last_modified }),
          ...(event.detail_fetched_at === undefined
            ? {}
            : { detail_fetched_at: event.detail_fetched_at }),
        };

        // New or changed events need a human/AI to re-check the scrape;
        // an unchanged re-scrape keeps whatever verification state it had.
        const existing = existingByExternalId.get(event.external_id);
        payload.needs_ai_verification = eventContentChanged(existing, payload)
          ? true
          : (existing?.needs_ai_verification ?? false);
        payload.needs_pii_review = containsPii(payload.description, payload.description_html);

        return payload;
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
        needsVerification: payloads.filter((p) => p.needs_ai_verification).length,
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
   * Upload images for events to the event-photos storage bucket and insert
   * into event_photos. Called after upsert so event IDs are known.
   * Does not fail the event ingest if individual images fail.
   */
  async uploadImagesAndInsertPhotos(eventImageMap, externalIdToDbId) {
    if (Object.keys(eventImageMap).length === 0) {
      this.log('  No images to upload', 'info');
      return { uploaded: 0, failed: 0, photosInserted: 0 };
    }

    let uploaded = 0;
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
        // Upload the image (content-addressed path, so a photo shared with
        // another event resolves to the same storage object)
        const imageResult = await uploadEventImage(sourceImageUrl, this.supabase);

        if (!imageResult.success) {
          this.log(
            `  Warning: Image failed for event ${dbEventId}: ${imageResult.error}`,
            'warning',
          );
          failed++;
          continue;
        }

        uploaded++;

        // Clear this event's existing photo row before inserting: photo_url
        // is content-addressed, so a changed source image (or a leftover row
        // from before this bucket existed) won't match the old row, and the
        // one-primary-photo-per-event index rejects a second INSERT rather
        // than updating over it.
        const { error: deleteError } = await this.supabase
          .from('event_photos')
          .delete()
          .eq('event_id', dbEventId);

        if (deleteError) {
          this.log(
            `  Warning: Failed to clear old photo rows for event ${dbEventId}: ${deleteError.message}`,
            'warning',
          );
        }

        const { error: photoError } = await this.supabase.from('event_photos').insert({
          event_id: dbEventId,
          photo_url: imageResult.photoUrl,
          is_primary: true,
          display_order: 0,
          storage_type: 'supabase',
          storage_path: imageResult.storagePath,
          uploaded_by: 'scraper',
          alt_text: null,
        });

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
          `  Warning: Unexpected error uploading image for event ${dbEventId}: ${error.message}`,
          'warning',
        );
        failed++;
      }
    }

    return { uploaded, failed, photosInserted };
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
   * What we already hold for a feed's events, keyed by `external_id`, for scrapers that fetch a
   * per-event detail page.
   *
   * Two jobs. `source_last_modified` lets the scraper compare against the source's own sitemap and
   * skip pages that haven't changed. The copy fields let it carry a skipped event's stored
   * description forward — without them the upsert would overwrite a description scraped from an
   * event's page with the far thinner one derived from its list card, undoing the fetch every time
   * it was correctly skipped.
   *
   * A failure here is not fatal: an empty map means "nothing on file", which makes every page look
   * stale and costs a slow-but-correct full pass.
   */
  async loadDetailFetchState(feedId) {
    const { data, error } = await this.supabase
      .from('events')
      .select('external_id, source_last_modified, description, description_html, registration_url')
      .eq('feed_id', feedId);

    if (error) {
      this.log(
        `  Failed to load detail-fetch state, re-fetching every event page: ${error.message}`,
        'warning',
      );
      return new Map();
    }

    return new Map((data ?? []).map((row) => [row.external_id, row]));
  }

  /**
   * Dispatch to the appropriate scraper based on feed_type
   */
  async scrapeFeed(feed) {
    switch (feed.feed_type) {
      case 'adaptiverechub-events': {
        this.log('  Using AdaptiveRecHub Events scraper', 'info');
        // The scraper needs to know what we already hold before it decides which event pages are
        // worth a 10-second crawl slot — and, for the ones it skips, what copy to carry forward.
        const priorByExternalId = await this.loadDetailFetchState(feed.id);
        return await new AdaptiveRecHubEventsScraper().scrape(feed.id, { priorByExternalId });
      }
      case 'squarespace':
      case 'norcalsci-events-json':
        return await this.scrapeNorCalSCIEvents(feed);
      default:
        throw new Error(`Unknown feed type: ${feed.feed_type}`);
    }
  }

  /**
   * Process a single feed
   */
  async processFeed(feed) {
    this.log(`\nProcessing feed: ${feed.name}`, 'info');
    this.log(`Feed URL: ${feed.feed_url}`, 'info');

    try {
      const events = await this.scrapeFeed(feed);

      if (!Array.isArray(events)) {
        throw new Error(`Expected array of events, got ${typeof events}`);
      }

      this.log(`  Scraped ${events.length} events from ${feed.name}`, 'info');
      this.stats.eventsScraped += events.length;

      // Upsert events to database
      const result = await this.upsertEvents(feed, events);

      if (result.failed && result.failed > 0) {
        this.log(`  Upsert failed for ${result.failed} events`, 'warning');
        this.stats.eventsFailed += result.failed;
      } else {
        this.log(
          `  Upserted: ${result.inserted} inserted, ${result.updated} updated${
            result.deduplicated > 0 ? `, ${result.deduplicated} deduplicated` : ''
          }${result.needsVerification > 0 ? `, ${result.needsVerification} flagged for AI verification` : ''}`,
          'success',
        );
        this.stats.eventsInserted += result.inserted;
        this.stats.eventsUpdated += result.updated;
        this.stats.eventsDeduplicated += result.deduplicated || 0;
        this.stats.eventsNeedingVerification += result.needsVerification || 0;
      }

      // Upload images and insert into event_photos (happens after upsert)
      if (result.eventImageMap && Object.keys(result.eventImageMap).length > 0) {
        const imageResult = await this.uploadImagesAndInsertPhotos(
          result.eventImageMap,
          result.externalIdToDbId,
        );
        this.log(
          `  Images: ${imageResult.uploaded} uploaded, ${imageResult.failed} failed, ${imageResult.photosInserted} inserted`,
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
      let feeds = await this.getActiveFeeds();

      // Support --feed-url=<url> flag to narrow to one feed (for scoped testing)
      const feedUrlArg = process.argv.find((arg) => arg.startsWith('--feed-url='));
      if (feedUrlArg) {
        const feedUrl = feedUrlArg.split('=')[1];
        feeds = feeds.filter((f) => f.feed_url === feedUrl);
        this.log(`Filtering to feed(s) with URL: ${feedUrl}`, 'info');
      }

      this.log(`Found ${feeds.length} active feed(s)`, 'info');

      if (feeds.length === 0) {
        this.log('No active feeds configured. Add feeds to data_feeds table.', 'warning');
        this.log('Example SQL:', 'info');
        this.log(
          `
  INSERT INTO data_feeds (name, feed_url, feed_type, is_active) VALUES
  ('NorCal SCI', 'https://norcalsci.org/calendar', 'squarespace', true),
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
    console.log(`Events Flagged for AI Verification: ${this.stats.eventsNeedingVerification}`);
    console.log(`Events Failed: ${this.stats.eventsFailed}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log('='.repeat(70) + '\n');
  }
}

// Run worker
const worker = new EventIngestionWorker();
await worker.run();
