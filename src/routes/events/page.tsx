import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EventCard } from '@/components/EventCard';
import { getSupabase } from '@/lib/supabase';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  image_url?: string | null;
}

export default function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        const supabase = getSupabase();

        // Fetch events, sorted by start_time ascending
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('id, title, description, start_time')
          .order('start_time', { ascending: true })
          .limit(100);

        if (eventsError) throw eventsError;

        setEvents(eventsData);

        // Fetch primary images for all events
        const { data: photosData, error: photosError } = await supabase
          .from('event_photos')
          .select('event_id, photo_url, is_primary')
          .in(
            'event_id',
            eventsData.map((e: { id: string }) => e.id),
          );

        if (photosError) throw photosError;

        // Build image map: event_id -> primary image URL
        const imagesByEvent: Record<string, string | null> = {};
        eventsData.forEach((event: Event) => {
          imagesByEvent[event.id] = null;
        });

        photosData.forEach(
          (photo: { event_id: string; photo_url: string; is_primary: boolean }) => {
            if (photo.is_primary || !imagesByEvent[photo.event_id]) {
              imagesByEvent[photo.event_id] = photo.photo_url;
            }
          },
        );

        setImageMap(imagesByEvent);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load events';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadEvents();
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-muted-foreground mt-2 text-sm">Loading events…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-destructive mt-2 text-sm">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">Events</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Discover adaptive sports and peer support events across the US.
      </p>

      {events.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">No events found.</p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={{
                id: event.id,
                title: event.title,
                description: event.description ?? 'No description available',
                start_time: event.start_time,
              }}
              image={imageMap[event.id]}
              onClick={() => {
                void navigate(`/event/${event.id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
