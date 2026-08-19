import { describe, expect, it } from 'vitest';

import { buildIcsFile, icsFilename } from '@/lib/ics';

const NOW = new Date('2026-08-18T12:00:00.000Z');

const BASE = {
  id: 'abc-123',
  title: 'Caregiver MeetUp',
  startTime: '2026-08-18T20:00:00+00:00',
  endTime: '2026-08-18T21:00:00+00:00',
};

/** Unfolds RFC 5545 continuation lines so assertions can read a property as one string. */
function properties(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

function property(ics: string, name: string): string | undefined {
  return properties(ics).find((line) => line.startsWith(`${name}:`));
}

describe('buildIcsFile', () => {
  it('wraps a single event in a VCALENDAR envelope', () => {
    const lines = properties(buildIcsFile(BASE, NOW));

    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
  });

  it('emits start and end times in UTC', () => {
    const ics = buildIcsFile(BASE, NOW);

    expect(property(ics, 'DTSTART')).toBe('DTSTART:20260818T200000Z');
    expect(property(ics, 'DTEND')).toBe('DTEND:20260818T210000Z');
  });

  it('defaults to an hour when the feed gave no end time', () => {
    const ics = buildIcsFile({ ...BASE, endTime: null }, NOW);

    expect(property(ics, 'DTEND')).toBe('DTEND:20260818T210000Z');
  });

  it('defaults to an hour when the end time precedes the start', () => {
    const ics = buildIcsFile({ ...BASE, endTime: '2026-08-18T19:00:00+00:00' }, NOW);

    expect(property(ics, 'DTEND')).toBe('DTEND:20260818T210000Z');
  });

  it('links the entry to the organizer page rather than to this app', () => {
    const ics = buildIcsFile({ ...BASE, url: 'https://norcalsci.org/events/abc' }, NOW);

    expect(property(ics, 'URL')).toBe('URL:https://norcalsci.org/events/abc');
    expect(ics).not.toContain('ab-peers.');
  });

  it('falls back to the registration link when there is no event page', () => {
    const ics = buildIcsFile({ ...BASE, url: null, registrationUrl: 'https://example.com/r' }, NOW);

    expect(property(ics, 'URL')).toBe('URL:https://example.com/r');
  });

  it('puts both links in the description when they differ', () => {
    const ics = buildIcsFile(
      {
        ...BASE,
        description: 'An hour of chatter.',
        url: 'https://norcalsci.org/events/abc',
        registrationUrl: 'https://example.com/register',
      },
      NOW,
    );
    const description = property(ics, 'DESCRIPTION') ?? '';

    expect(description).toContain('An hour of chatter.');
    expect(description).toContain('Register: https://example.com/register');
    expect(description).toContain('Event details: https://norcalsci.org/events/abc');
  });

  it('does not repeat one link under two headings', () => {
    const url = 'https://norcalsci.org/events/abc';
    const description =
      property(buildIcsFile({ ...BASE, url, registrationUrl: url }, NOW), 'DESCRIPTION') ?? '';

    expect(description).toContain(`Register: ${url}`);
    expect(description).not.toContain('Event details:');
  });

  it('does not print a link the blurb already contains', () => {
    // Real shape of these listings: the CTA is still in the copy until the verification pass
    // strips it, so appending the same URL again would show it twice in the calendar entry.
    const registrationUrl = 'https://us02web.zoom.us/meeting/register/abc';
    const ics = buildIcsFile(
      {
        ...BASE,
        description: `An hour of chatter.\n\nRegister HERE (${registrationUrl})`,
        registrationUrl,
      },
      NOW,
    );
    const description = property(ics, 'DESCRIPTION') ?? '';

    expect(description).not.toContain('Register: ');
    expect(description.match(/us02web\.zoom\.us/g)).toHaveLength(1);
  });

  it('still adds the link when the blurb does not mention it', () => {
    const ics = buildIcsFile(
      { ...BASE, description: 'An hour of chatter.', registrationUrl: 'https://example.com/r' },
      NOW,
    );

    expect(property(ics, 'DESCRIPTION')).toContain('Register: https://example.com/r');
  });

  it('does not print the event page twice either', () => {
    const url = 'https://norcalsci.org/events/abc';
    const ics = buildIcsFile({ ...BASE, description: `Details at ${url}`, url }, NOW);
    const description = property(ics, 'DESCRIPTION') ?? '';

    expect(description).not.toContain('Event details:');
    expect(description.match(/norcalsci\.org/g)).toHaveLength(1);
  });

  it('omits properties the feed had nothing for', () => {
    const ics = buildIcsFile(BASE, NOW);

    expect(property(ics, 'LOCATION')).toBeUndefined();
    expect(property(ics, 'DESCRIPTION')).toBeUndefined();
    expect(property(ics, 'URL')).toBeUndefined();
  });

  it('treats a blank location as absent rather than emitting an empty property', () => {
    const ics = buildIcsFile({ ...BASE, location: '   ' }, NOW);

    expect(property(ics, 'LOCATION')).toBeUndefined();
  });

  it('escapes characters that would otherwise end the property', () => {
    const ics = buildIcsFile(
      { ...BASE, title: 'Rugby; scrimmage, open', description: 'Line one\nLine two' },
      NOW,
    );

    expect(property(ics, 'SUMMARY')).toBe('SUMMARY:Rugby\\; scrimmage\\, open');
    expect(property(ics, 'DESCRIPTION')).toBe('DESCRIPTION:Line one\\nLine two');
  });

  it('keeps every content line within the 75-octet limit', () => {
    const ics = buildIcsFile(
      {
        ...BASE,
        title: 'A very long event title '.repeat(8),
        description: 'Sobre la reunión de cuidadores — acentuación deliberada. '.repeat(6),
      },
      NOW,
    );

    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('survives a round trip through folding without losing multi-byte characters', () => {
    const title = 'Reunión de cuidadores — café, charla y conexión '.repeat(4);
    const ics = buildIcsFile({ ...BASE, title }, NOW);

    expect(property(ics, 'SUMMARY')).toBe(`SUMMARY:${title.replace(/,/g, '\\,')}`);
  });

  it('gives the same event a stable UID so re-downloading updates one entry', () => {
    expect(property(buildIcsFile(BASE, NOW), 'UID')).toBe('UID:abc-123@ab-peers');
  });

  it('refuses to build an entry from an unparseable start time', () => {
    expect(() => buildIcsFile({ ...BASE, startTime: 'not a date' }, NOW)).toThrow(/start time/);
  });

  it('ends with a trailing CRLF, as the spec requires', () => {
    expect(buildIcsFile(BASE, NOW).endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('icsFilename', () => {
  it('slugifies the title', () => {
    expect(icsFilename('Caregiver MeetUp')).toBe('caregiver-meetup.ics');
  });

  it('collapses punctuation rather than leaving it in a filename', () => {
    expect(icsFilename('Rugby: open scrimmage!')).toBe('rugby-open-scrimmage.ics');
  });

  it('falls back when the title has nothing usable in it', () => {
    expect(icsFilename('!!!')).toBe('event.ics');
  });
});
