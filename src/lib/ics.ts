/**
 * Builds an iCalendar (RFC 5545) file for a single event, so someone who says they're Going can
 * put it in their own calendar.
 *
 * The calendar entry points at the organizer's own event page, not at anything in this app: the
 * host owns the real details, and a link back here would rot the moment the prototype moves. The
 * RSVP link, when the feed gave us one, goes in the description for the same reason.
 */

export interface IcsEventInput {
  /** Used to build the UID, so re-downloading updates the same entry rather than duplicating it. */
  id: string;
  title: string;
  /** ISO 8601. */
  startTime: string;
  /** ISO 8601. Falls back to an hour after the start when the feed omitted it. */
  endTime?: string | null;
  description?: string | null;
  location?: string | null;
  /** The organizer's event page. */
  url?: string | null;
  /** Registration link, when the feed carries one separately from `url`. */
  registrationUrl?: string | null;
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/**
 * RFC 5545 §3.3.11: backslash, semicolon and comma are escaped, and a literal newline becomes an
 * escaped `\n`. Carriage returns are dropped rather than escaped — a bare CR has no meaning in a
 * property value, and leaving it in breaks the folding below.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: content lines are folded at 75 octets, continued by CRLF plus a single space.
 *
 * The limit counts octets, not characters, so folding is done over the UTF-8 bytes — splitting on
 * character index would let a line of accented text exceed the limit, and splitting mid-sequence
 * would corrupt it. The byte cursor only ever advances to a boundary where the next byte is not a
 * continuation byte (0b10xxxxxx).
 */
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let start = 0;

  while (start < bytes.length) {
    // 75 octets on the first line; continuations lose one to the leading space.
    const limit = start === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);

    // Back off to a character boundary so a multi-byte sequence is never split. Continuation
    // bytes match 0b10xxxxxx.
    while (end > start && end < bytes.length && ((bytes[end] ?? 0) & 0xc0) === 0x80) {
      end -= 1;
    }

    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
  }

  return chunks.join('\r\n ');
}

/** RFC 5545 UTC form: 20260818T200000Z. */
function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * The description shown in the calendar entry: the event blurb, then the links the person will
 * actually need on the day.
 */
function buildDescription(event: IcsEventInput): string {
  const parts: string[] = [];

  const blurb = event.description?.trim();
  if (blurb) parts.push(blurb);

  const registration = event.registrationUrl?.trim();
  if (registration) parts.push(`Register: ${registration}`);

  const page = event.url?.trim();
  // Only worth repeating when it isn't the same link as the registration one.
  if (page && page !== registration) parts.push(`Event details: ${page}`);

  return parts.join('\n\n');
}

/**
 * Serializes `event` as the contents of an .ics file.
 *
 * Times are emitted in UTC, which sidesteps having to ship a VTIMEZONE component for whatever zone
 * the feed used; calendar clients render them in the viewer's own zone either way.
 */
export function buildIcsFile(event: IcsEventInput, now: Date = new Date()): string {
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error(
      `Cannot build a calendar entry from an unparseable start time: ${event.startTime}`,
    );
  }

  const parsedEnd = event.endTime ? new Date(event.endTime) : null;
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd > start
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AbleBodied//ab-peers//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@ab-peers`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  const description = buildDescription(event);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);

  const location = event.location?.trim();
  if (location) lines.push(`LOCATION:${escapeText(location)}`);

  // URL takes the organizer's page so the entry links back to the source, not to this prototype.
  const url = event.url?.trim() ?? event.registrationUrl?.trim();
  if (url) lines.push(`URL:${escapeText(url)}`);

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // RFC 5545 requires CRLF between content lines, and a trailing one after the final line.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** A filesystem-safe .ics filename derived from the event title. */
export function icsFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event';
  return `${slug}.ics`;
}
