/**
 * NorCal SCI Events — JSON with Image Download
 *
 * Extends the base JSON scraper to download and save event images locally.
 * Images are stored after events are upserted (so event IDs are known).
 * Storage: public/photos/events/{event-id}/photo-{hash}.ext
 * Database: event_photos table (not events.image_url)
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { NorCalSCIEventsJsonScraper } from './norcalsci-events-json.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PHOTOS_DIR = path.join(__dirname, '..', '..', '..', 'public', 'photos', 'events');

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
 * Get file extension from URL
 */
function getFileExtension(url) {
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  if (ext && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
    return ext;
  }
  return '.jpg';
}

/**
 * Download and save image for an event
 */
export async function downloadEventImage(sourceUrl, eventId) {
  if (!sourceUrl || !eventId) {
    return { success: false, error: 'sourceUrl and eventId required' };
  }

  try {
    // Normalize protocol-relative URLs
    let finalUrl = sourceUrl;
    if (finalUrl.startsWith('//')) {
      finalUrl = 'https:' + finalUrl;
    }

    // Validate URL
    try {
      new URL(finalUrl);
    } catch {
      return { success: false, error: 'Invalid URL' };
    }

    // Create event directory
    const eventPhotoDir = path.join(PHOTOS_DIR, eventId);
    await fs.mkdir(eventPhotoDir, { recursive: true });

    // Generate filename from URL hash
    const photoHash = crypto.createHash('md5').update(sourceUrl).digest('hex').substring(0, 8);
    const extension = getFileExtension(finalUrl);
    const filename = `photo-${photoHash}${extension}`;
    const filePath = path.join(eventPhotoDir, filename);
    const relativePath = `/photos/events/${eventId}/${filename}`;

    // Check if already cached
    try {
      await fs.access(filePath);
      return { success: true, filePath: relativePath, cached: true };
    } catch {
      // File doesn't exist, download it
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

    // Save to disk
    await fs.writeFile(filePath, photoBuffer);

    return {
      success: true,
      filePath: relativePath,
      size: photoBuffer.length,
      cached: false,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Extended scraper that downloads images
 */
export class NorCalSCIEventsJsonWithImagesScraper extends NorCalSCIEventsJsonScraper {
  constructor(eventsUrl, options = {}) {
    super(eventsUrl, options);
    this.skipImages = options.skipImages ?? false;
    this.imageStats = {
      attempted: 0,
      downloaded: 0,
      cached: 0,
      failed: 0,
    };
  }

  async normalizeEventWithImage(item, feedId) {
    // Get base event data
    const event = this.normalizeEvent(item, feedId);

    // Carry source image URL for later download (after event is upserted)
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

  getImageStats() {
    const total = this.imageStats.attempted;
    const success = this.imageStats.downloaded + this.imageStats.cached;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : 0;

    return {
      ...this.imageStats,
      total,
      successCount: success,
      successRate: `${successRate}%`,
    };
  }
}

export default NorCalSCIEventsJsonWithImagesScraper;
