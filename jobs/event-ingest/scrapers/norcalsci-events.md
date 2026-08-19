# norcalsci.org — events endpoint

Feed source: https://norcalsci.org/events

## Endpoint

```
GET https://norcalsci.org/events?format=json
Accept: application/json
User-Agent: <a real browser UA>
```

Squarespace JSON export for the events collection. **No auth, no API key.** Squarespace serves
JSON to plain clients, but a realistic `User-Agent` avoids bot heuristics that occasionally gate
the HTML routes.

## Fetch in one request

```bash
curl -s "https://norcalsci.org/events?format=json" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" \
  -H "Accept: application/json"
```

Returns a single response with two collections:

| Collection | Behavior |
| --- | --- |
| `upcoming[]` | All future events, unpaginated. Fetch this once per sync. |
| `past[]` | First 30 past events. Paginated; set `?offset=<N>` to fetch more pages (30 items per page). |

A typical sync fetches only `upcoming[]` (the full future event corpus in one request). Include
past events only if the feed explicitly needs historical data; default is `includePast: false`.

## Response shape

```json
{
  "upcoming": [
    {
      "id": "...",
      "title": "Adaptive Cycling &amp; Lunch",
      "fullUrl": "/events/adaptive-cycling-lunch",
      "startDate": 1708951200000,
      "endDate": 1708954800000,
      "body": "<div ...><div class=\"sqs-html-content\">...</div></div>",
      "location": {
        "addressTitle": "Gino&#39;s Pizza",
        "addressLine1": "123 Main St",
        "addressLine2": "Oakland, CA 94612",
        "addressCountry": "US"
      }
    }
  ],
  "past": [ ... ],
  "pagination": { "nextPage": true, "nextPageOffset": 30 }
}
```

Fields are **HTML-escaped** (Squarespace convention): `&amp;`, `&#39;`, etc. Decode them to match
the rendered page. Timestamps are **epoch milliseconds** — but not simply UTC-and-done: NorCal
SCI's Squarespace account timezone is misconfigured to Eastern, so the epoch encodes the wrong
wall-clock time for a Bay Area org. `norcalsci-events-json.js`'s `toIso()` corrects this by
reinterpreting the NY wall clock as Pacific (see `timezone.js`), and logs an error if a
description's stated clock time stops agreeing with the correction — the signal that NorCal SCI
fixed the underlying misconfiguration and the correction should be removed.

## Parsing

- **HTML entities:** Decode with `cheerio.load('<x>value</x>').text()` to handle all entities.
- **Event body:** Extract from `.sqs-html-content` blocks only (the layout may have nested
  grids). Nested matches would duplicate content; keep outermost blocks only.
- **Address:** Rebuild from `location.{addressTitle, addressLine1, addressLine2,
  addressCountry}`, filtering empty parts, joined by space. Max 200 chars to match the
  scraper's truncation.
- **Timestamps:** Divide epoch milliseconds by 1000, floor to seconds (data carries ~200ms of
  noise from authoring), then emit ISO 8601 UTC.
- **Dedupe:** Use `fullUrl` (absolute URL) as the external ID. Recurring series collapse to a
  single URL on Squarespace; defensive deduplication prevents doubles if they don't.
- **Description:** Pass the extracted event body to `rich-text.js::convertRichText()` unchanged
  — it reuses the same extraction logic the Puppeteer scraper used, so descriptions land in
  the same `{ html, text }` shape.

## Pagination

Past events are served 30 per page. To fetch all past events:

```javascript
let offset = 0;
while (true) {
  const url = new URL('https://norcalsci.org/events?format=json');
  if (offset) url.searchParams.set('offset', String(offset));
  const page = await fetch(url);
  const data = await page.json();
  // ... process data.past[] ...
  if (!data.pagination?.nextPage) break;
  offset = data.pagination.nextPageOffset;
}
```

Default behavior: fetch only `upcoming[]` in one request (it's always complete). Set
`includePast` and `pastPages` options to pull historical data.

## Field coverage

Across the live feed (as of 2026-08-18):

| Field | Coverage |
| --- | --- |
| title | 100% |
| startDate | ~95% (very few events lack a start time) |
| endDate | ~75% (many single-time events) |
| body (description) | ~85% (some events have minimal text) |
| location | ~95% |

All fields are optional in the normalized output except `title` (default to "Untitled Event"
if missing). Treat `startDate` as authoritative; `structuredContent.startDate` is a fallback
for edge cases.

## Event images

Images are embedded in the event body HTML — Squarespace JSON includes the full body as a
rendered HTML string.

**Current handling (NorCalSCI scraper):**

Images are **stripped from descriptions** — `rich-text.js` does not include `img` in its
`ALLOWED_TAGS` set, so `<img>` tags are dropped during sanitization. This keeps descriptions
as text/links only, matching the Puppeteer scraper's prior behavior.

```javascript
// From rich-text.js line 18
const ALLOWED_TAGS = new Set([
  'a', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  // 'img' is NOT allowed
]);
```

**To extract images:**

Parse the raw `body` HTML before passing it to `convertRichText()`:

```javascript
const srcRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
const images = [];
let match;
while ((match = srcRegex.exec(body)) !== null) {
  const src = new URL(match[1], event.location).href; // resolve relative URLs
  images.push(src);
}
```

Images are stored on Squarespace CDN (`cdn.squarespaccdn.com` or similar). Check the live
response to confirm the exact domain — it may differ from the site URL.

**Field coverage:** Unknown — the body HTML may or may not contain `<img>` tags. Not verified
across the live feed. If you need to know, grep the body for `<img>` during a full scrape.

## Gotchas

- **Content type check:** Squarespace falls back to rendering HTML when a collection does not
  support `?format=json` (e.g., a private or deleted collection). Check the response
  `content-type` header — if it's not JSON, treat that as a hard error and skip the feed,
  don't attempt to parse markup.
- **Entity encoding:** JSON fields are HTML-escaped; always decode before use.
- **Timestamp precision:** The `endDate` is sometimes `null` even for events with known durations
  — the page doesn't always expose it. Callers should not assume `endDate` exists.
- **Recurring events:** Squarespace collapses repeating events to a single URL and title. If you
  need individual occurrence dates, you must fetch the event detail page (not included in JSON,
  would require a per-event scrape).

## Politeness

Squarespace does not publish a `robots.txt` with crawl delays. The JSON endpoint is stable and
fast (~1 s for a full sync). Send a realistic `User-Agent` and fetch sparingly (once per sync,
not on every page view).
