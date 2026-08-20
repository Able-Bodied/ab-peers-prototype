/**
 * AdaptiveRecHub Events — list endpoint scraper
 *
 * adaptiverechub.org is a hub: one feed carrying events from many different host orgs. Every card
 * names the org hosting it in a "Program" field, which this scraper emits as
 * `organization_name`/`organization_slug` on each event. Those are not columns — `ingest.js`
 * resolves them to `events.organization_id`, the effective org the UI badges and filters by.
 *
 * Endpoint details, field coverage and parsing gotchas are documented in
 * ./adaptiverechub-events.md. Two things that shape this file:
 *
 *  - **One request is the whole refresh.** `limit=500` returns every event the geo filter matches,
 *    unpaginated, so `robots.txt`'s `Crawl-delay: 10` costs nothing to honor.
 *  - **The response is rendered HTML, not JSON events.** That makes extraction markup-coupled: a
 *    theme update breaks it silently. `scrape()` therefore throws rather than returning an empty
 *    list, so a broken selector shows up as a failed feed instead of "0 events today".
 *
 * TODO(team): no event photos yet. Each card's own page carries a hero image, but collecting them
 * means following every event URL (~29 within our radius, ~420 nationally) at Crawl-delay: 10 —
 * see the "Event images" section of adaptiverechub-events.md. Don't build it until we've agreed
 * how: batched background job, lazy per-event fetch from the detail page, or cached-and-rechecked.
 */

import * as cheerio from 'cheerio';
import { zonedPartsToUtc } from './timezone.js';

const ENDPOINT = 'https://adaptiverechub.org/wp-json/kbf/v2/events';

// The site geocodes client-side and passes lat/long to the server, which does the distance filter
// for us. 95101 (downtown San Jose), geocoded via Nominatim: everything this scraper returns is
// therefore Bay Area local, which is what makes the Pacific assumption in parseDate() safe.
const ORIGIN_LATITUDE = 37.389338;
const ORIGIN_LONGITUDE = -121.887614;
const RADIUS_MILES = 100;

// Above the ~420-event national corpus, so one request is always the whole result set.
const PAGE_LIMIT = 500;

// Cloudflare fronts the site; the REST endpoint doesn't require a session, but it does want to
// look like a browser is asking.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

/** `MM/DD/YY h:mm AM|PM`, e.g. the "08/18/26 7:00 AM" in a card's `.date span`. */
const CARD_DATE_PATTERN = /(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

// Every event is within 100mi of San Jose, so a card's clock time is Pacific wall-clock time.
// Unlike NorCal SCI's feed this is a documented assumption, not a correction for a broken account
// timezone — there is no per-event zone in the markup to disagree with.
const EVENT_TIMEZONE = 'America/Los_Angeles';

/**
 * Wall-clock parts from a card's date string, as the UTC instant Pacific reads them at.
 * Returns null for anything that doesn't match — the caller drops that card rather than
 * inventing a time.
 */
function parseCardDate(dateText) {
  const match = CARD_DATE_PATTERN.exec(dateText ?? '');
  if (!match) return null;

  const [, month, day, year, hour, minute, meridiem] = match;
  const hour12 = Number.parseInt(hour, 10) % 12;

  return zonedPartsToUtc(
    {
      // Two-digit years on a feed of upcoming events are unambiguously 2000s.
      year: 2000 + Number.parseInt(year, 10),
      month: Number.parseInt(month, 10),
      day: Number.parseInt(day, 10),
      hour: meridiem.toUpperCase() === 'PM' ? hour12 + 12 : hour12,
      minute: Number.parseInt(minute, 10),
      second: 0,
    },
    EVENT_TIMEZONE,
  );
}

/** Program name → slug, e.g. "ParaCliffHangers – Movement LIC" → "paracliffhangers-movement-lic". */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class AdaptiveRecHubEventsScraper {
  constructor({ latitude, longitude, radiusMiles } = {}) {
    this.latitude = latitude ?? ORIGIN_LATITUDE;
    this.longitude = longitude ?? ORIGIN_LONGITUDE;
    this.radiusMiles = radiusMiles ?? RADIUS_MILES;
  }

  async scrape(feedId) {
    const html = await this.fetchListHtml();
    const $ = cheerio.load(html);
    const cards = $('div.event-card.card-item');

    // The canary the spec asks for: the endpoint answering 200 with markup this scraper can't
    // read is the failure mode to catch loudly, since it otherwise looks like a quiet feed.
    if (cards.length === 0) {
      throw new Error(
        `AdaptiveRecHub returned no parseable event cards (${html.length} bytes of HTML) — ` +
          'the endpoint or its markup has probably changed; see scrapers/adaptiverechub-events.md',
      );
    }

    const events = cards.toArray().flatMap((element) => {
      const event = this.normalizeEvent($(element), feedId);
      return event ? [event] : [];
    });

    if (events.length === 0) {
      throw new Error(
        `AdaptiveRecHub returned ${cards.length} event cards but none could be parsed — ` +
          'the card markup has probably changed; see scrapers/adaptiverechub-events.md',
      );
    }

    const withoutProgram = events.filter((event) => !event.organization_slug).length;
    console.log(
      `  AdaptiveRecHub: ${events.length}/${cards.length} cards parsed, ` +
        `${withoutProgram} without a Program (those fall back to the feed's own org)`,
    );

    return events;
  }

  /** POSTs the list endpoint and unwraps `{success, data: {content}}` into the rendered HTML. */
  async fetchListHtml() {
    // events.js omits empty values rather than sending them, and `latitude=""` is not reliably
    // treated as an absent latitude — so every param here is a real value.
    const body = new URLSearchParams({
      offset: '0',
      limit: String(PAGE_LIMIT),
      latitude: String(this.latitude),
      longitude: String(this.longitude),
      radius: String(this.radiusMiles),
      sort: 'closest',
    });

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body,
    });

    // A wrong path here answers 200-shaped-as-404-page rather than failing the fetch, and its
    // body is a full HTML document with no event cards in it — hence checking the status first.
    if (!response.ok) {
      throw new Error(`AdaptiveRecHub events endpoint returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload?.success || typeof payload.data?.content !== 'string') {
      throw new Error('AdaptiveRecHub events endpoint returned an unexpected response shape');
    }

    return payload.data.content;
  }

  /**
   * One `.event-card` into the plain event shape ingest.js upserts. Cards missing a title, url or
   * readable date are dropped (scrape() fails the feed if that happens to all of them); sport and
   * program are genuinely optional per the spec's coverage counts.
   */
  normalizeEvent($card, feedId) {
    const title = $card.find('.title a').text().trim();
    // Recurring occurrences repeat their title across separate posts with -2/-3 url slugs, so the
    // url is the only stable identity here — dedupe on it, never on the title.
    const url = $card.find('.title a').attr('href')?.trim();
    const startTime = parseCardDate($card.find('.date span').text().trim());
    if (!title || !url || !startTime) return null;

    const sport = $card.find('.sport p').text().trim();
    // The Program is usually a link to that org's hub page, but a plain <p> on some cards.
    const program = ($card.find('.program p a').text() || $card.find('.program p').text()).trim();

    // Sport has no column of its own and Program's column is organization_id, so both are also
    // kept verbatim in the description — the AI verification pass reads this copy for tagging,
    // and nothing the scrape saw is silently discarded.
    const description = [sport && `Sport: ${sport}`, program && `Hosted by: ${program}`]
      .filter(Boolean)
      .join('\n');

    return {
      external_id: url,
      title,
      description,
      // The list endpoint exposes no end time and no rich-text body.
      description_html: '',
      start_time: startTime.toISOString(),
      end_time: null,
      // One unstructured address string; geocode.js turns it into city/lat/long downstream.
      location: $card.find('.location span').text().trim(),
      url,
      feed_id: feedId,
      // Not columns: ingest.js resolves these into events.organization_id.
      organization_name: program || null,
      organization_slug: program ? slugify(program) : null,
    };
  }
}

// Debug harness: `node scrapers/adaptiverechub-events.js` prints what a real scrape sees, without
// touching the database.
if (import.meta.url === `file://${process.argv[1]}`) {
  const events = await new AdaptiveRecHubEventsScraper().scrape('debug-feed-id');
  for (const event of events) {
    console.log(`  ${event.start_time}  ${event.title}  [${event.organization_name ?? '—'}]`);
  }
  console.log(`\nFirst event:\n${JSON.stringify(events[0], null, 2)}`);
}
