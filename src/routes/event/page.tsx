import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { type MockEventAttributes, mockEventAttributes } from '@/routes/events/event-mocks';

/**
 * Event detail — the full-page view reached by tapping a card on the events list, laid out to
 * match docs/screens/event-org.html ("Event page").
 *
 * Title, time, location, description and the primary photo are real, read from the `events` and
 * `event_photos` tables. Everything else on this page — the org's verified badge and event count,
 * activity/format chips, access notes, and RSVP counts — is invented per event by event-mocks.ts,
 * for the same reason the events list invents it: those columns don't exist yet. See
 * src/routes/events/event-mocks.ts for the mapping back to `EventItem`.
 *
 * TODO(team):
 *  - [x] Real title/time/location/description/photo from Supabase
 *  - [x] "More from this org" using real sibling events
 *  - [ ] Wire an actual Follow feature (currently a disabled button)
 *  - [ ] Persist RSVPs — Interested/Going are local state and reset on reload, same as the list
 */

type RsvpState = 'interested' | 'going' | null;

interface EventDetailRow {
  id: string;
  title: string;
  description: string | null;
  description_html: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  url: string | null;
  registration_url: string | null;
  category: string | null;
  feed_id: string;
  data_feeds?: { name: string } | { name: string }[] | null;
}

interface RelatedEventRow {
  id: string;
  title: string;
  start_time: string;
  location: string | null;
}

function orgNameOf(row: EventDetailRow): string | null {
  const feed = row.data_feeds;
  if (!feed) return null;
  return (Array.isArray(feed) ? feed[0]?.name : feed.name) ?? null;
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

function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-8 items-center rounded-full border-2 px-3 text-[12.5px] font-semibold',
        on
          ? 'border-primary bg-secondary text-primary'
          : 'border-border text-muted-foreground border-dashed',
      )}
    >
      {label}
    </span>
  );
}

export default function EventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [moreFromOrg, setMoreFromOrg] = useState<RelatedEventRow[]>([]);
  const [rsvp, setRsvp] = useState<RsvpState>(null);
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
            'id, title, description, description_html, start_time, end_time, location, url, registration_url, category, feed_id, data_feeds(name)',
          )
          .eq('id', id)
          .single();
        if (eventError) throw eventError;

        const { data: photosData, error: photosError } = await supabase
          .from('event_photos')
          .select('photo_url, is_primary')
          .eq('event_id', id)
          .order('is_primary', { ascending: false })
          .order('display_order', { ascending: true })
          .overrideTypes<{ photo_url: string; is_primary: boolean }[], { merge: false }>();
        if (photosError) throw photosError;

        const { data: relatedData, error: relatedError } = await supabase
          .from('events')
          .select('id, title, start_time, location')
          .eq('feed_id', eventData.feed_id)
          .neq('id', id)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(2);
        if (relatedError) throw relatedError;

        if (cancelled) return;
        setEvent(eventData);
        setPhotoUrl(photosData[0]?.photo_url ?? null);
        setMoreFromOrg(relatedData);
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
  const venue = event.location?.trim() ?? '';
  const meta = [venue === '' ? null : venue, mock.city].filter(Boolean).join(' · ');
  const going = mock.goingCount + (rsvp === 'going' ? 1 : 0);
  const interested = mock.interestedCount + (rsvp === 'interested' ? 1 : 0);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      {backButton}

      <h1 className="text-2xl leading-tight font-bold tracking-tight">{event.title}</h1>
      <p className="text-primary mt-1 text-sm font-bold">
        {formatWhen(event.start_time, event.end_time)}
      </p>
      {meta !== '' && <p className="text-muted-foreground mt-0.5 text-sm">{meta}</p>}

      {orgName && (
        <div className="bg-card mt-3.5 flex items-center gap-3 rounded-2xl border p-3">
          <div className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold">
            {orgName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <span className="truncate">{orgName}</span>
              {mock.orgVerified && (
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground grid size-4 shrink-0 place-items-center rounded-full text-[9px]"
                >
                  ✓
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              Hosting · {mock.orgEventsThisYear} events this year
            </div>
          </div>
          <button
            type="button"
            disabled
            title="Not wired yet — no follow feature in this prototype."
            className="border-primary text-primary min-h-9 shrink-0 rounded-xl border-2 px-3.5 text-[13px] font-bold opacity-60"
          >
            Follow
          </button>
        </div>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        <Chip label={mock.genre} on />
        <Chip label={mock.activity} on />
        <Chip label={mock.mode === 'virtual' ? 'Online' : 'In person'} on={false} />
        {mock.beginner && <Chip label="Beginner-friendly" on={false} />}
      </div>

      {photoUrl && (
        <img
          src={photoUrl}
          alt={event.title}
          className="mt-3.5 aspect-video max-h-72 w-full rounded-2xl object-cover"
        />
      )}

      {(event.description_html ?? event.description) && (
        <div className="mt-3.5 text-sm leading-relaxed">
          {event.description_html ? (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized in database
              dangerouslySetInnerHTML={{ __html: event.description_html }}
            />
          ) : (
            <p className="whitespace-pre-wrap">{event.description}</p>
          )}
        </div>
      )}

      <p className="text-muted-foreground mt-3.5 text-sm font-semibold">{mock.accessNotes}</p>
      {mock.accessWarning && (
        <p className="text-destructive mt-1 text-sm font-bold">{mock.accessWarning}</p>
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

      <div className="bg-background sticky bottom-0 mt-5 flex gap-2 py-3">
        <button
          type="button"
          aria-pressed={rsvp === 'interested'}
          onClick={() => {
            setRsvp(rsvp === 'interested' ? null : 'interested');
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
            setRsvp(rsvp === 'going' ? null : 'going');
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
          Register or join on the organizer's site
        </a>
      )}
    </div>
  );
}
