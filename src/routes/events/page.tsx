import { useCallback, useEffect, useRef, useState } from 'react';
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

const BATCH_SIZE = 12;

export default function EventsPage() {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<Event[]>([]);
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  // Fetch photos for a set of events
  const fetchPhotosForEvents = useCallback(
    async (eventIds: string[]): Promise<Record<string, string | null>> => {
      if (eventIds.length === 0) return {};

      try {
        const supabase = getSupabase();
        const { data: photosData, error: photosError } = await supabase
          .from('event_photos')
          .select('event_id, photo_url, is_primary')
          .in('event_id', eventIds);

        if (photosError) throw photosError;

        // Build image map: event_id -> primary image URL
        const imagesByEvent: Record<string, string | null> = {};
        eventIds.forEach((eventId) => {
          imagesByEvent[eventId] = null;
        });

        photosData.forEach(
          (photo: { event_id: string; photo_url: string; is_primary: boolean }) => {
            if (photo.is_primary || !imagesByEvent[photo.event_id]) {
              imagesByEvent[photo.event_id] = photo.photo_url;
            }
          },
        );

        return imagesByEvent;
      } catch (err) {
        console.error('Failed to fetch photos:', err);
        return {};
      }
    },
    [],
  );

  // Load initial batch of events
  useEffect(() => {
    async function loadInitialEvents() {
      try {
        setLoading(true);
        setError(null);
        const supabase = getSupabase();

        // Fetch first batch
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('id, title, description, start_time')
          .order('start_time', { ascending: true })
          .range(0, BATCH_SIZE - 1);

        if (eventsError) throw eventsError;

        setEvents(eventsData);
        setOffset(BATCH_SIZE);
        setHasMore(eventsData.length === BATCH_SIZE);

        // Fetch images for initial events
        const newImageMap = await fetchPhotosForEvents(eventsData.map((e: Event) => e.id));
        setImageMap(newImageMap);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load events';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadInitialEvents();
  }, [fetchPhotosForEvents]);

  // Load more events when sentinel becomes visible
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!entry?.isIntersecting || isLoadingMore || !hasMore) {
          return;
        }

        // Trigger load more
        void (async () => {
          try {
            setIsLoadingMore(true);
            const supabase = getSupabase();

            // Fetch next batch
            const { data: moreEventsData, error: eventsError } = await supabase
              .from('events')
              .select('id, title, description, start_time')
              .order('start_time', { ascending: true })
              .range(offset, offset + BATCH_SIZE - 1);

            if (eventsError) throw eventsError;

            if (moreEventsData.length === 0) {
              setHasMore(false);
              return;
            }

            // Fetch images for new events
            const newImageMap = await fetchPhotosForEvents(moreEventsData.map((e: Event) => e.id));

            setEvents((prev) => [...prev, ...moreEventsData]);
            setImageMap((prev) => ({ ...prev, ...newImageMap }));
            setOffset((prev) => prev + BATCH_SIZE);
            setHasMore(moreEventsData.length === BATCH_SIZE);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load more events';
            setError(message);
          } finally {
            setIsLoadingMore(false);
          }
        })();
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [offset, hasMore, isLoadingMore, fetchPhotosForEvents]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="text-muted-foreground mt-2 text-sm">Loading events…</p>
      </div>
    );
  }

  if (error && events.length === 0) {
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
        <>
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

          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} className="mt-8 flex justify-center" data-testid="scroll-sentinel">
            {isLoadingMore && (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
                <p className="text-muted-foreground text-sm">Loading more events…</p>
              </div>
            )}
            {!hasMore && events.length > 0 && (
              <p className="text-muted-foreground text-sm">No more events to load.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
