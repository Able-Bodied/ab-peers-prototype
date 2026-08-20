import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useFollows } from '@/lib/follows';
import { useRsvps } from '@/lib/rsvps';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { type MockEventAttributes, mockEventAttributes } from '@/routes/events/event-mocks';
import {
  EVENT_FORMAT_LABELS,
  type EventFormat,
  type EventListNavState,
} from '@/routes/events/filters';
import { GoingDialog } from '@/routes/events/going-dialog';

/**
 * Event detail — the full-page view reached by tapping a card on the events list, laid out to
 * match docs/screens/event-org.html ("Event page").
 *
 * Title, time, location, description, the primary photo, RSVP counts, the org badge and the org's
 * events-this-year count are real, read from the `events`, `event_photos`, `event_rsvps` and
 * `organizations` tables. Start/end time and location prefer the scraped column and fall back to
 * the AI-extracted one only when the scraped column is empty (see
 * supabase/migrations/20260819140000_events_ai_extracted_fields.sql and
 * src/routes/events/page.tsx, which does the same thing for the list); the location meta line
 * falls back further, to "Online" for online events, only once both are exhausted. See
 * src/routes/events/event-mocks.ts for the attributes (activity/genre/recurring/matchLine/etc.)
 * that are still invented per event.
 *
 * Each event's `organization_id` (see supabase/migrations/20260819190000_events_organization_id.sql)
 * is the *effective* org for that specific event: the one ingest.js resolved from the scraper's own
 * per-event org when it named one (e.g. AdaptiveRecHub's "Program" — one feed can host many
 * different orgs' events), or the feed's own org otherwise (NorCal SCI's case — one org for every
 * event in that feed). Either way the row's `organizations` embed is already the right one to read,
 * with no fallback logic needed here.
 *
 * TODO(team):
 *  - [x] Real title/time/location/description/photo from Supabase
 *  - [x] "More from this org" using real sibling events
 *  - [x] Persist RSVPs to `event_rsvps`, shared with the events list
 *  - [x] Real org badge from `organizations`, matching the events list
 *  - [x] Real org events-this-year count from `organizations`/`events`
 *  - [x] AI-extracted start/end time and location as a fallback for the scraped columns
 *  - [x] Wire an actual Follow feature, shared with the events feed's Following tab
 */

interface OrganizationEmbed {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

interface EventDetailRow {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  /** CTA-stripped copy from the verification pass; null until that pass has run. */
  description_clean: string | null;
  description_html_clean: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  /** Filled by the AI verification pass only when the scraper found no start_time/end_time/location. */
  ai_extracted_start_time: string | null;
  ai_extracted_end_time: string | null;
  ai_extracted_location: string | null;
  url: string | null;
  registration_url: string | null;
  registration_deadline: string | null;
  event_format: EventFormat | null;
  category: string | null;
  organization_id: string | null;
  /** PostgREST returns an embedded row as an object, or an array on some relationship shapes. */
  organizations?: OrganizationEmbed | OrganizationEmbed[] | null;
  event_tags?: { tags: { slug: string; name: string } | null }[] | null;
}

interface RelatedEventRow {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
}

function orgOf(row: EventDetailRow): OrganizationEmbed | null {
  const org = row.organizations;
  if (!org) return null;
  return (Array.isArray(org) ? org[0] : org) ?? null;
}

function orgNameOf(row: EventDetailRow): string | null {
  return orgOf(row)?.name ?? null;
}

/** The org badge shown next to the hosting card — the event's own effective organization. */
function orgBadgeOf(row: EventDetailRow): { name: string; logoUrl: string | null } | null {
  const org = orgOf(row);
  return org ? { name: org.name, logoUrl: org.logo_url } : null;
}

function orgIdOf(row: EventDetailRow): string | null {
  return orgOf(row)?.id ?? null;
}

function orgSlugOf(row: EventDetailRow): string | null {
  return orgOf(row)?.slug ?? null;
}

function dateTile(isoString: string): { weekday: string; day: string } {
  const date = new Date(isoString);
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function timeLabel(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatWhen(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const weekday = start.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const when = `${weekday} ${monthDay} · ${timeLabel(startIso)}`;
  return endIso ? `${when} – ${timeLabel(endIso)}` : when;
}

/** Deadlines are dates people act on, so this spells the day out rather than abbreviating it. */
function formatDeadline(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Every chip here searches the events list for what it says, so they all look and act alike. */
function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-primary bg-secondary text-primary inline-flex min-h-8 items-center rounded-full border-2 px-3 text-[12.5px] font-semibold"
    >
      {label}
    </button>
  );
}

export default function EventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [moreFromOrg, setMoreFromOrg] = useState<RelatedEventRow[]>([]);
  const [orgEventsThisYear, setOrgEventsThisYear] = useState<number | null>(null);
  // Shared with the events feed, so the counts here and on the card agree.
  const { rsvpFor, setRsvp, countsFor, ensureCounts } = useRsvps();
  // Shared with the events feed's Following tab, so a follow made here shows up there.
  const { isFollowing, toggleFollow } = useFollows();
  const [goingOpen, setGoingOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      if (!id) {
        setError('No event ID provided');
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabase();

        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select(
            'id, title, description, description_html, description_clean, description_html_clean, start_time, end_time, location, ai_extracted_start_time, ai_extracted_end_time, ai_extracted_location, url, registration_url, registration_deadline, event_format, category, organization_id, organizations(id, slug, name, logo_url), event_tags(tags(slug, name))',
          )
          .eq('id', id)
          .single()
          // PostgREST types a nested embed as an array; this relationship returns one row.
          .overrideTypes<EventDetailRow, { merge: false }>();
        if (eventError) throw eventError;

        // Compute orgId right after event loads, use it for both related events and count queries
        const orgId = orgIdOf(eventData);

        const { data: photosData, error: photosError } = await supabase
          .from('event_photos')
          .select('photo_url, is_primary')
          .eq('event_id', id)
          .order('is_primary', { ascending: false })
          .order('display_order', { ascending: true })
          .overrideTypes<{ photo_url: string; is_primary: boolean }[], { merge: false }>();
        if (photosError) throw photosError;

        // Both of these key off the event's own organization_id rather than its feed: one
        // AdaptiveRecHub feed carries hundreds of different orgs' events, so keying off feed_id
        // would list a stranger's events under this org's name and count them as its own.
        let relatedData: RelatedEventRow[] = [];
        let orgEventCount: number | null = null;
        if (orgId) {
          const { data: related, error: relatedError } = await supabase
            .from('events')
            .select('id, title, start_time, location')
            .eq('organization_id', orgId)
            .neq('id', id)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(2);
          if (relatedError) throw relatedError;
          relatedData = related;

          const now = new Date();
          const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
          const yearEnd = new Date(now.getFullYear() + 1, 0, 1).toISOString();
          const { count, error: orgCountError } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gte('start_time', yearStart)
            .lt('start_time', yearEnd);
          if (orgCountError) throw orgCountError;
          orgEventCount = count ?? 0;
        }

        if (cancelled) return;
        setEvent(eventData);
        setPhotoUrl(photosData[0]?.photo_url ?? null);
        setMoreFromOrg(relatedData);
        setOrgEventsThisYear(orgEventCount);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load event');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvent();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (id) ensureCounts([id]);
  }, [id, ensureCounts]);

  const backButton = (
    <button
      type="button"
      onClick={() => {
        void navigate('/events');
      }}
      className="text-primary mb-3 text-sm font-bold"
    >
      ← Events
    </button>
  );

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col">
        {backButton}
        <p className="text-muted-foreground text-sm">Loading event…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col">
        {backButton}
        <p className="text-destructive text-sm">Error: {error ?? 'Event not found'}</p>
      </div>
    );
  }

  const mock: MockEventAttributes = mockEventAttributes(event.id);
  const orgName = orgNameOf(event);
  const orgBadge = orgBadgeOf(event);
  const orgSlug = orgSlugOf(event);
  const following = orgSlug !== null && isFollowing(orgSlug);
  const startTime = event.start_time ?? event.ai_extracted_start_time;
  const endTime = event.end_time ?? event.ai_extracted_end_time;
  // A blank-but-present location (the feed's own "no venue" sentinel) counts as absent too, so it
  // still falls back to the AI-extracted one.
  const venue = event.location?.trim()
    ? event.location.trim()
    : (event.ai_extracted_location ?? '');
  const meta = venue !== '' ? venue : event.event_format === 'online' ? 'Online' : '';
  const rsvp = rsvpFor(event.id);
  const { going, interested } = countsFor(event.id);
  const tags = (event.event_tags ?? []).flatMap((link) => (link.tags ? [link.tags] : []));
  // Pulled out of `event` so the chip's onClick closure keeps the non-null narrowing.
  const format = event.event_format;
  // Prefer the CTA-stripped copy once the verification pass has produced it.
  const bodyHtml = event.description_html_clean ?? event.description_html;
  const bodyText = event.description_clean ?? event.description;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      {backButton}

      <h1 className="text-2xl leading-tight font-bold tracking-tight">{event.title}</h1>
      <p className="text-primary mt-1 text-sm font-bold">
        {startTime ? formatWhen(startTime, endTime) : 'Date to be announced'}
      </p>
      {meta !== '' && <p className="text-muted-foreground mt-0.5 text-sm">{meta}</p>}

      {orgName && (
        <div className="bg-card mt-3.5 flex items-center gap-3 rounded-2xl border p-3">
          <div
            className="bg-card flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
            title={orgBadge?.name ?? orgName}
          >
            {orgBadge?.logoUrl ? (
              <img
                src={orgBadge.logoUrl}
                alt={orgBadge.name}
                className="size-full object-contain p-1"
              />
            ) : (
              <span className="text-primary text-sm font-extrabold" aria-hidden="true">
                {(orgBadge?.name ?? orgName).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{orgName}</div>
            <div className="text-muted-foreground text-xs">
              Hosting{orgEventsThisYear !== null && ` · ${orgEventsThisYear} events this year`}
            </div>
          </div>
          <button
            type="button"
            disabled={orgSlug === null}
            aria-pressed={following}
            onClick={() => {
              if (orgSlug !== null) toggleFollow(orgSlug);
            }}
            className={cn(
              'border-primary text-primary min-h-9 shrink-0 rounded-xl border-2 px-3.5 text-[13px] font-bold',
              following && 'bg-primary text-primary-foreground',
              orgSlug === null && 'opacity-60',
            )}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Chip
            key={tag.slug}
            label={tag.name}
            onClick={() => {
              const state: EventListNavState = { tagSlug: tag.slug };
              void navigate('/events', { state });
            }}
          />
        ))}
        {format && (
          <Chip
            label={EVENT_FORMAT_LABELS[format]}
            onClick={() => {
              const state: EventListNavState = { format };
              void navigate('/events', { state });
            }}
          />
        )}
      </div>

      {photoUrl && (
        <img
          src={photoUrl}
          alt={event.title}
          className="mt-3.5 aspect-video max-h-72 w-full rounded-2xl object-cover"
        />
      )}

      {(bodyHtml ?? bodyText) && (
        <div className="mt-3.5 text-sm leading-relaxed">
          {bodyHtml ? (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized in database
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="whitespace-pre-wrap">{bodyText}</p>
          )}
        </div>
      )}

      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="border-primary text-primary mt-3.5 flex min-h-11 items-center justify-center rounded-xl border-2 text-[13px] font-bold"
        >
          See original event listing
        </a>
      )}

      <h2 className="text-muted-foreground mt-5 mb-2 text-[11.5px] font-bold tracking-widest uppercase">
        Who's going
      </h2>
      <p className="text-primary text-base font-bold">
        {going} going <span className="text-muted-foreground font-semibold">·</span> {interested}{' '}
        interested
      </p>
      {mock.matchLine && <p className="text-accent mt-1 text-sm font-bold">{mock.matchLine}</p>}
      <p className="text-muted-foreground mt-2 text-xs">
        Interested is private — only the number is shown, never who.
      </p>

      {orgName && moreFromOrg.length > 0 && (
        <>
          <h2 className="text-muted-foreground mt-5 mb-2 text-[11.5px] font-bold tracking-widest uppercase">
            More from {orgName}
          </h2>
          <div className="flex flex-col">
            {moreFromOrg.map((related) => {
              const tile = dateTile(related.start_time);
              return (
                <button
                  key={related.id}
                  type="button"
                  onClick={() => {
                    void navigate(`/event/${related.id}`);
                  }}
                  className="flex items-center gap-3 border-b py-2.5 text-left last:border-b-0"
                >
                  <div
                    aria-hidden="true"
                    className="bg-secondary text-primary flex size-12 shrink-0 flex-col items-center justify-center rounded-xl"
                  >
                    <span className="text-[9px] font-bold tracking-wider">{tile.weekday}</span>
                    <span className="text-base leading-none font-bold">{tile.day}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{related.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {[related.location, timeLabel(related.start_time)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {event.registration_deadline && (
        <p className="text-destructive mt-4 text-sm font-bold">
          Register by {formatDeadline(event.registration_deadline)}
        </p>
      )}

      <div className="bg-background sticky bottom-0 mt-5 flex gap-2 py-3">
        <button
          type="button"
          aria-pressed={rsvp === 'interested'}
          onClick={() => {
            setRsvp(event.id, rsvp === 'interested' ? null : 'interested');
          }}
          className={cn(
            'border-primary text-primary min-h-13 flex-1 rounded-xl border-2 text-[15px] font-bold',
            rsvp === 'interested' && 'bg-secondary border-secondary',
          )}
        >
          Interested{rsvp === 'interested' ? ' ✓' : ''}
        </button>
        <button
          type="button"
          aria-pressed={rsvp === 'going'}
          onClick={() => {
            const next = rsvp === 'going' ? null : 'going';
            setRsvp(event.id, next);
            if (next === 'going') setGoingOpen(true);
          }}
          className={cn(
            'border-primary min-h-13 flex-1 rounded-xl border-2 text-[15px] font-bold',
            rsvp === 'going'
              ? 'bg-secondary border-secondary text-primary'
              : 'bg-primary text-primary-foreground',
          )}
        >
          Going{rsvp === 'going' ? ' ✓' : ''}
        </button>
      </div>

      {event.registration_url && (
        <a
          href={event.registration_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary mt-1 text-center text-sm font-bold underline"
        >
          Register or join on the organizer&rsquo;s site
        </a>
      )}

      {startTime && (
        <GoingDialog
          open={goingOpen}
          event={{
            id: event.id,
            title: event.title,
            startTime,
            endTime,
            description: bodyText,
            location: venue || null,
            url: event.url,
            registrationUrl: event.registration_url,
          }}
          onClose={() => {
            setGoingOpen(false);
          }}
        />
      )}
    </div>
  );
}
