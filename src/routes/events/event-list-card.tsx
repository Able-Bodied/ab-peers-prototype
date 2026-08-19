import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MockEventAttributes } from '@/routes/events/event-mocks';

export type RsvpState = 'interested' | 'going' | null;

export interface FeedEvent {
  id: string;
  title: string;
  startTime: string;
  /** Null when the feed omitted it; the calendar entry then assumes an hour. */
  endTime: string | null;
  description: string | null;
  /** Free-text venue from the feed, e.g. "Valley Medical, building C". */
  location: string | null;
  /** The organizer's own event page. */
  url: string | null;
  /** Registration link, when the feed carries one separately from `url`. */
  registrationUrl: string | null;
  /** Publishing organization, from the event's `data_feeds` row. */
  orgName: string | null;
  /** Primary photo from `event_photos`, if the ingest job found one. */
  photoUrl: string | null;
  mock: MockEventAttributes;
}

interface EventListCardProps {
  event: FeedEvent;
  rsvp: RsvpState;
  onOpen: () => void;
  onRsvp: (next: RsvpState) => void;
  onDismiss: () => void;
}

function dateTile(isoString: string): { weekday: string; day: string } {
  const date = new Date(isoString);
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    day: String(date.getDate()),
  };
}

function timeLabel(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function EventListCard({ event, rsvp, onOpen, onRsvp, onDismiss }: EventListCardProps) {
  const { mock } = event;
  const { weekday, day } = dateTile(event.startTime);

  // The second meta line prefers the real venue when the feed gave us one, and falls back to the
  // invented activity tag so the card doesn't collapse to a single line. Feeds routinely emit an
  // empty string rather than omitting the field, so blank-but-present has to count as absent —
  // otherwise the line renders a dangling separator with nothing after it.
  const venue = event.location?.trim() ?? '';
  const secondary = venue === '' ? mock.activity : venue;

  const going = mock.goingCount + (rsvp === 'going' ? 1 : 0);
  const interested = mock.interestedCount + (rsvp === 'interested' ? 1 : 0);

  return (
    <article className="bg-card relative flex gap-3 rounded-2xl border p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Not interested in ${event.title}`}
        className="text-muted-foreground hover:bg-secondary absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      <div className="flex shrink-0 flex-col items-center gap-1.5">
        {/* Decorative restatement of the date that the title button already announces below. */}
        <div
          aria-hidden="true"
          className="bg-secondary text-primary flex size-14 shrink-0 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-[10.5px] font-bold tracking-wider">{weekday}</span>
          <span className="text-xl leading-none font-bold">{day}</span>
        </div>

        {event.photoUrl && (
          <img src={event.photoUrl} alt="" className="h-10 w-14 rounded-lg object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="w-full text-left">
          <h3 className="pr-6 text-base leading-tight font-bold">{event.title}</h3>

          {(mock.mode === 'virtual' || mock.recurring) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {mock.mode === 'virtual' && (
                <span className="bg-accent text-accent-foreground rounded-lg px-2 py-0.5 text-[10px] font-bold">
                  Online
                </span>
              )}
              {mock.recurring && (
                <span className="bg-secondary text-primary rounded-lg px-2 py-0.5 text-[10px] font-bold">
                  Recurring
                </span>
              )}
            </div>
          )}

          <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
            {[event.orgName, mock.city].filter(Boolean).join(' · ')}
            <br />
            {timeLabel(event.startTime)} · {secondary}
          </p>

          <p className="text-primary mt-1.5 text-xs font-bold">
            {going} going <span className="text-muted-foreground font-semibold">·</span>{' '}
            {interested} interested
          </p>

          {mock.matchLine && (
            <p className="text-accent mt-0.5 text-xs font-bold">{mock.matchLine}</p>
          )}
        </button>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            aria-pressed={rsvp === 'interested'}
            onClick={() => {
              onRsvp(rsvp === 'interested' ? null : 'interested');
            }}
            className={cn(
              'border-primary text-primary inline-flex min-h-9 items-center rounded-xl border-2 px-4 text-[13.5px] font-bold',
              rsvp === 'interested' && 'bg-secondary border-secondary',
            )}
          >
            Interested{rsvp === 'interested' ? ' ✓' : ''}
          </button>
          <button
            type="button"
            aria-pressed={rsvp === 'going'}
            onClick={() => {
              onRsvp(rsvp === 'going' ? null : 'going');
            }}
            className={cn(
              'border-primary inline-flex min-h-9 items-center rounded-xl border-2 px-4 text-[13.5px] font-bold',
              rsvp === 'going'
                ? 'bg-secondary border-secondary text-primary'
                : 'bg-primary text-primary-foreground',
            )}
          >
            Going{rsvp === 'going' ? ' ✓' : ''}
          </button>
        </div>
      </div>
    </article>
  );
}
