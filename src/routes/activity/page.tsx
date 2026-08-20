import { Card, CardContent } from '@/components/ui/card';

/**
 * Static placeholder for the Activity tab from the docs/ prototype (docs/index.html's
 * activity()) — waves, replies and event reminders land here once notifications exist.
 * No mock feed yet, just the coming-soon note.
 */
export default function ActivityPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Activity</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Waves, replies, and event reminders will land here.
      </p>

      <Card className="mt-6">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          This feature is coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
