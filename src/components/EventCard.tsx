import { Card, CardContent } from '@/components/ui/card';

interface Event {
  id: string;
  title: string;
  description: string;
  start_time: string;
}

interface EventCardProps {
  event: Event;
  onClick?: () => void;
  image?: string | null | undefined;
}

function formatEventTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EventCard({ event, onClick, image }: EventCardProps) {
  return (
    <Card
      className="flex cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-lg"
      onClick={onClick}
    >
      {/* Image */}
      <div className="bg-muted aspect-video w-full overflow-hidden">
        {image ? (
          <img src={image} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-muted-foreground text-sm">No image</span>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="flex flex-1 flex-col gap-2 pt-4">
        <h3 className="line-clamp-2 text-sm font-semibold">{event.title}</h3>
        <p className="text-muted-foreground line-clamp-2 text-xs">{event.description}</p>
        <p className="text-muted-foreground mt-auto text-xs">{formatEventTime(event.start_time)}</p>
      </CardContent>
    </Card>
  );
}
