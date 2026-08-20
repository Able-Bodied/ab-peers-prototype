/**
 * NorCal SCI Events — JSON with Image Upload
 *
 * Extends the base JSON scraper to upload event images to the `event-photos`
 * Supabase Storage bucket. Images are uploaded after events are upserted (so
 * event IDs are known).
 * Storage: event-photos bucket, path events/{sha256-of-bytes}.ext
 * Database: event_photos table (not events.image_url)
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { NorCalSCIEventsJsonScraper } from './norcalsci-events-json.js';

const BUCKET = 'event-photos';

/**
 * Download file from URL using fetch
 */
async function downloadFile(url, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Node.js)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error('Downloaded file is empty');
    }

    if (buffer.byteLength > 10 * 1024 * 1024) {
      throw new Error('File exceeds 10MB limit');
    }

    return Buffer.from(buffer);
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Get file extension and content type from URL
 */
function getFileType(url) {
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  const known = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  if (ext && known[ext]) {
    return { extension: ext, contentType: known[ext] };
  }
  return { extension: '.jpg', contentType: 'image/jpeg' };
}

/**
 * Download an image and upload it to the event-photos bucket.
 *
 * The storage path is derived from the image bytes (sha256), not the source
 * URL or event ID: two events that reference the same photo resolve to the
 * same path, so the upload naturally dedupes instead of storing a second
 * copy. `upsert: true` makes re-uploading the same bytes to that path a
 * cheap no-op rather than an error.
 */
export async function uploadEventImage(sourceUrl, supabase) {
  if (!sourceUrl || !supabase) {
    return { success: false, error: 'sourceUrl and supabase client required' };
  }

  try {
    // Normalize protocol-relative URLs
    let finalUrl = sourceUrl;
    if (finalUrl.startsWith('//')) {
      finalUrl = `https:${finalUrl}`;
    }

    // Validate URL
    try {
      new URL(finalUrl);
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    // Download the image
    const photoBuffer = await downloadFile(finalUrl, 15000);

    if (!photoBuffer || photoBuffer.length === 0) {
      return { success: false, error: 'Downloaded image is empty' };
    }

    // Validate it's actually an image by checking magic bytes
    const validSignatures = [
      [0xff, 0xd8, 0xff], // JPEG
      [0x89, 0x50, 0x4e, 0x47], // PNG
      [0x47, 0x49, 0x46], // GIF
      [0x52, 0x49, 0x46, 0x46], // WEBP
    ];

    const fileStart = photoBuffer.slice(0, 4);
    const isValidImage = validSignatures.some((sig) =>
      sig.every((byte, i) => fileStart[i] === byte),
    );

    if (!isValidImage) {
      return { success: false, error: 'Invalid image format' };
    }

    const { extension, contentType } = getFileType(finalUrl);
    const contentHash = crypto.createHash('sha256').update(photoBuffer).digest('hex');
    const storagePath = `events/${contentHash}${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, photoBuffer, { contentType, upsert: true });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    return {
      success: true,
      photoUrl: publicUrl,
      storagePath,
      size: photoBuffer.length,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extended scraper that carries the source image URL through so ingest.js can
 * upload it after the event row exists.
 */
export class NorCalSCIEventsJsonWithImagesScraper extends NorCalSCIEventsJsonScraper {
  constructor(eventsUrl, options = {}) {
    super(eventsUrl, options);
    this.skipImages = options.skipImages ?? false;
  }

  async normalizeEventWithImage(item, feedId) {
    // Get base event data
    const event = this.normalizeEvent(item, feedId);

    // Carry source image URL for later upload (after event is upserted)
    // This is a non-column field that will be stripped before DB insert
    if (item.assetUrl && !this.skipImages) {
      event.source_image_url = item.assetUrl;
    }

    return event;
  }

  async scrape(feedId) {
    const first = await this.fetchPage();
    const items = [...(first.upcoming || [])];

    if (this.includePast) {
      items.push(...(first.past || []));
      let pagination = first.pagination;
      for (let i = 0; i < this.pastPages && pagination?.nextPage; i++) {
        const page = await this.fetchPage(pagination.nextPageOffset);
        items.push(...(page.past || []));
        pagination = page.pagination;
      }
    }

    // Deduplicate and normalize with images
    const seen = new Set();
    const normalized = [];
    for (const item of items) {
      const event = await this.normalizeEventWithImage(item, feedId);
      if (!event.title || seen.has(event.external_id)) continue;
      seen.add(event.external_id);
      normalized.push(event);
    }

    normalized.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return normalized;
  }
}

export default NorCalSCIEventsJsonWithImagesScraper;
