# adaptiverechub.org — events endpoint

Feed source: https://adaptiverechub.org/events/

## Endpoint

```
POST https://adaptiverechub.org/wp-json/kbf/v2/events
Content-Type: application/x-www-form-urlencoded
User-Agent: <a real browser UA>
```

Custom WordPress REST namespace (`/wp-json/kbf/v2` also exposes `programs`, `grants`,
`hubspot`). **No auth, no nonce, no cookies, no session.** Verified with a cold request.

The `kbf_filter_events_nonce` hidden input on the events page is a red herring — the theme's
`events.js` never reads it, and `admin-ajax.php` is not involved. Don't build a nonce/cookie
acquisition step.

## Fetch everything in one request

```bash
curl -s -X POST "https://adaptiverechub.org/wp-json/kbf/v2/events" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" \
  -d "offset=0&limit=500"
```

Returns the full corpus: **420 events, ~1.28 MB, ~1.7 s** (as of 2026-08-18). `limit=1000`
returns the same 420, so that is the whole set, not a server-side cap. A full refresh is one
request — pagination exists but is not needed.

## Parameters

From `filterParams` in the theme's `dist/js/events.js`:

| Param | Notes |
| --- | --- |
| `offset` | Default 0. Verified: `offset=417` returns the last 3. |
| `limit` | Default 12. |
| `search` | Free text. Verified: `search=ski` → 5 results. |
| `latitude`, `longitude`, `radius` | Server-side distance filter; `radius` default 100. |
| `sort` | `closest` is what the site uses. |
| `related_sports`, `age_groups` | Taxonomy filters (not exercised). |

The browser sends `multipart/form-data` via `FormData`, but plain form-encoding works.
`events.js` **omits empty-string values** rather than sending them — mimic that, since
`latitude=""` may not behave like an absent `latitude`.

## Response

```json
{ "success": true, "data": { "content": "<rendered HTML>" } }
```

A single HTML string. No JSON event objects and no total count — count the cards.

```html
<div class="event-card card-item">
  <h4 class="title"><a href="URL">TITLE</a></h4>
  <div class="date"><p>...<span>08/18/26 7:00 AM</span></p></div>
  <div class="location"><p>...<span>ADDRESS</span></p></div>
  <div class="sport"><h6>Sports</h6><p>Golf</p></div>
  <div class="program"><h6>Program</h6><p><a href="...">PROGRAM</a></p></div>
</div>
```

Split on `<div class="event-card card-item">`, strip `<svg>...</svg>` before taking text —
every section is icon-prefixed.

Field coverage across all 420 cards: `title`, `url`, `date`, `location` 100%; `sport` missing 1;
`program` missing 2. Treat sport/program as optional.

## Parsing gotchas

- **Dedupe on URL, not title.** 420 unique URLs, but recurring events repeat titles as separate
  posts with `-2` / `-3` slugs.
- **Dates** are `MM/DD/YY h:mm AM` and need parsing into a real timestamp.
- **Location** is one unstructured address string. No lat/long in the markup — the site geocodes
  client-side. Either geocode yourself or push the work server-side with the geo params.
- **Markup-coupled.** A theme update silently breaks extraction. Assert on card count and field
  coverage in the job rather than failing quiet.

## Event images

Event detail pages (the URL from each card) carry a featured image in the hero section:

```
GET {event_url}
```

```html
<section class="video-hero video-hero-banner ...">
  <div style="background: url(https://adaptiverechub.org/wp-content/uploads/2026/05/Golf-4.png) no-repeat center center / cover;">
    <!-- ... -->
  </div>
</section>
```

**Image extraction:**
1. Follow the event URL (from the card's title link or "Learn More" button).
2. Search the page for `<section class="video-hero">`.
3. Extract the first `style` attribute containing `background: url(...)`.
4. Parse the URL from the `url()` pattern with a regex: `url\(([^)]+)\)`.

**Field coverage:** Coverage is unknown — one sample (golf tournament) had an image, but the
full 420-event corpus hasn't been checked. Images are stored on `wp-content/uploads/` with
date-based paths (`2026/05/`, etc.). The image URL is **not** available from the list endpoint;
per-event fetches are required if you need all images. If you need to know coverage, count
video-hero sections across a sample or full crawl.

**Performance:** Following 420 event URLs is expensive (~420 HTTP requests, Crawl-delay: 10
= ~70 minutes). Consider:
- Fetch images only if explicitly requested (lazy load from detail pages on-demand).
- Cache image URLs in your database to avoid re-fetching.
- Respect the Crawl-delay — if you must fetch all images, spread the requests across a
  background job.

## Politeness

`robots.txt` disallows `/wp-admin/` but not `/wp-json/`, and sets `Crawl-delay: 10`. Since a
full refresh is a single request, the delay costs nothing — honor it. Cloudflare fronts the site
and sets `__cf_bm` on the HTML page; the REST endpoint does not require it, but send a realistic
`User-Agent`.

`events.js` leaks an OpenCage geocoding API key in client source. Do not reuse it.
