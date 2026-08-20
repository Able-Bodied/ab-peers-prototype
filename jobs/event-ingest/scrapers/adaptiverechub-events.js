/**
 * AdaptiveRecHub events scraper
 *
 * Scrapes events from https://adaptiverechub.org/events/ within 100 miles of a given location.
 * Each event names a "Program" (host organization) — these become organization_name/organization_slug
 * fields on the scraped event; ingest.js resolves them to organization_id in the DB.
 *
 * TODO: Per-event image fetching. The spec at adaptiverechub-events.md documents how (~420 requests,
 * crawl-delay: 10). Don't implement until we've decided how to batch/throttle/lazy-fetch N images
 * without hammering adaptiverechub.org. For now, only the list endpoint is scraped; each event's
 * photo_url remains null.
 */

import https from 'https';
import * as cheerio from 'cheerio';
import { zonedPartsToUtc } from './timezone.js';

class AdaptiveRecHubScraper {
  static DEFAULT_LATITUDE = 37.389338;
  static DEFAULT_LONGITUDE = -121.887614;
  static DEFAULT_RADIUS_MILES = 100;

  async scrape(feedId) {
    const html = await this.fetchHtml();
    const $ = cheerio.load(html);

    const cards = [];
    $('div.event-card.card-item').each((index, element) => {
      const event = this.normalizeEvent($(element), feedId);
      if (event) {
        cards.push(event);
      }
    });

    return cards;
  }

  async fetchHtml() {
    const params = new URLSearchParams({
      latitude: AdaptiveRecHubScraper.DEFAULT_LATITUDE.toString(),
      longitude: AdaptiveRecHubScraper.DEFAULT_LONGITUDE.toString(),
      radius: AdaptiveRecHubScraper.DEFAULT_RADIUS_MILES.toString(),
      offset: '0',
      limit: '500',
      sort: 'closest',
    });

    const body = params.toString();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'adaptiverechub.org',
        path: '/wp-json/kbf/v2/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const htmlContent = json.data?.content || '';
            resolve(htmlContent);
          } catch (err) {
            reject(new Error(`Failed to parse JSON response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  normalizeEvent($card, feedId) {
    try {
      // Parse fields using cheerio selectors
      const title = $card.find('.title a').text().trim();
      const url = $card.find('.title a').attr('href');
      const dateText = $card.find('.date span').text().trim();
      const location = $card.find('.location span').text().trim();
      const sport = $card.find('.sport p').text().trim();

      // Program can be in a link or plain text
      let programText = $card.find('.program p a').text().trim();
      if (!programText) {
        programText = $card.find('.program p').text().trim();
      }

      if (!title || !url) return null;

      // Parse date to ISO 8601 (Pacific time assumed — every event within 100mi of San Jose is Bay Area local)
      const startTime = this.parseDate(dateText);
      if (!startTime) return null;

      // Org slug: slugify the program name, or leave null if not found
      const organizationSlug = programText ? this.slugify(programText) : null;

      // Construct description with sport and program context (not stored as separate columns)
      let description = '';
      if (sport) description += `Sport: ${sport}\n`;
      if (programText) description += `Hosted by: ${programText}`;
      description = description.trim() || null;

      return {
        external_id: url, // Dedupe on URL, as per spec
        title,
        description,
        start_time: startTime,
        end_time: null, // List endpoint doesn't expose end_time
        location: location || null,
        url,
        feed_id: feedId,
        // Extra fields for ingest.js to resolve to organization_id
        organization_name: programText || null,
        organization_slug: organizationSlug,
      };
    } catch (err) {
      console.error('Error parsing event card:', err);
      return null;
    }
  }

  parseDate(dateText) {
    if (!dateText) return null;
    // Format: MM/DD/YY h:mm AM|PM
    const match = dateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}) (\d{1,2}):(\d{2}) (AM|PM)/i);
    if (!match) return null;

    const [, month, day, year, hour, minute, period] = match;
    const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);

    let hourNum = parseInt(hour);
    const minNum = parseInt(minute);

    // Convert 12-hour to 24-hour format
    if (period.toUpperCase() === 'PM' && hourNum !== 12) {
      hourNum += 12;
    } else if (period.toUpperCase() === 'AM' && hourNum === 12) {
      hourNum = 0;
    }

    const parts = {
      year: fullYear,
      month: parseInt(month),
      day: parseInt(day),
      hour: hourNum,
      minute: minNum,
      second: 0,
    };

    // Convert from Pacific time to UTC
    return zonedPartsToUtc(parts, 'America/Los_Angeles');
  }

  slugify(text) {
    if (!text) return null;
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-+|-+$/g, ''); // Trim hyphens from start/end
  }
}

// CLI debug harness
if (import.meta.url === `file://${process.argv[1]}`) {
  const scraper = new AdaptiveRecHubScraper();
  try {
    const events = await scraper.scrape('debug-feed-id');
    console.log(`Scraped ${events.length} events:`);
    events.forEach((e) => {
      console.log(`  - ${e.title} (${e.start_time}) [${e.organization_name || 'no program'}]`);
    });
    if (events.length > 0) {
      console.log('\nFirst event (raw):');
      console.log(JSON.stringify(events[0], null, 2));
    }
  } catch (err) {
    console.error('Scraper error:', err);
    process.exit(1);
  }
}

export default AdaptiveRecHubScraper;
