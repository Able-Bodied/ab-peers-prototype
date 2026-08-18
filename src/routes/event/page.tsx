import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabase } from '@/lib/supabase';

interface EventDetail {
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
}

function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function EventPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvent() {
      if (!id) {
        setError('No event ID provided');
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabase();

        // Fetch event details
        const { data: eventData, error: eventError } = await supabase
          .from('events')
          .select(
            'id, title, description, description_html, start_time, end_time, location, url, registration_url, category',
          )
          .eq('id', id)
          .single();

        if (eventError) throw eventError;

        setEvent(eventData);

        // Fetch event photos
        const { data: photosData, error: photosError } = await supabase
          .from('event_photos')
          .select('photo_url, is_primary')
          .eq('event_id', id)
          .order('is_primary', { ascending: false })
          .order('display_order', { ascending: true });

        if (photosError) throw photosError;

        if (photosData.length > 0) {
          setImages(photosData.map((p: { photo_url: string }) => p.photo_url));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load event';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadEvent();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => {
            void navigate('/events');
          }}
          className="mb-4"
        >
          ← Back to Events
        </Button>
        <p className="text-muted-foreground text-sm">Loading event…</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => {
            void navigate('/events');
          }}
          className="mb-4"
        >
          ← Back to Events
        </Button>
        <p className="text-destructive text-sm">Error: {error ?? 'Event not found'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => {
          void navigate('/events');
        }}
        className="mb-4"
      >
        ← Back to Events
      </Button>

      <Card>
        <CardHeader>
          <div className="space-y-2">
            <CardTitle className="text-2xl">{event.title}</CardTitle>
            <div className="flex flex-wrap gap-2">
              {event.category && <Badge variant="outline">{event.category}</Badge>}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Images */}
          {images.length > 0 && (
            <div className="space-y-2">
              {images.map((image) => (
                <img
                  key={image}
                  src={image}
                  alt={event.title}
                  className="w-full rounded-lg object-cover"
                />
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-3 rounded-lg bg-accent/50 p-4">
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">Date & Time</p>
              <p className="text-sm">{formatEventTime(event.start_time)}</p>
              {event.end_time && (
                <p className="text-muted-foreground text-xs">
                  Ends: {new Date(event.end_time).toLocaleTimeString()}
                </p>
              )}
            </div>

            {event.location && (
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">Location</p>
                <p className="text-sm">{event.location}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {event.description_html ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div
                // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized in database
                dangerouslySetInnerHTML={{
                  __html: event.description_html,
                }}
              />
            </div>
          ) : event.description ? (
            <div className="whitespace-pre-wrap text-sm">{event.description}</div>
          ) : null}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {event.registration_url && (
              <Button asChild>
                <a href={event.registration_url} target="_blank" rel="noopener noreferrer">
                  Register or Join
                </a>
              </Button>
            )}
            {event.url && (
              <Button variant="outline" asChild>
                <a href={event.url} target="_blank" rel="noopener noreferrer">
                  View Event Details
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
