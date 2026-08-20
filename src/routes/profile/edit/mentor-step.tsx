import { Button } from '@/components/ui/button';

export function MentorStep({
  mentorInterest,
  saving,
  error,
  onSave,
}: {
  mentorInterest: boolean;
  saving: boolean;
  error: string | null;
  onSave: (mentorInterest: boolean) => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Do you want to be a mentor?</h1>
        <p className="text-muted-foreground text-sm">
          An explicit question, asked once. Nothing you fill in elsewhere turns this on by itself.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          If you say yes
        </h3>
        <p className="text-sm">
          Craig and NorCal train their mentors. If an organization vouches for you, their badge
          appears on your profile — this just tells us you're interested, so a coordinator can
          follow up. It doesn't make you a mentor on its own.
        </p>
      </div>

      {mentorInterest && (
        <p className="text-primary text-sm font-medium">
          You've told us you're interested — thanks! A coordinator will follow up.
        </p>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          onSave(true);
        }}
        disabled={saving || mentorInterest}
      >
        {saving ? 'Saving…' : mentorInterest ? "You're on the list" : 'Yes, I will help'}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          onSave(false);
        }}
        disabled={saving}
      >
        Not now
      </Button>
    </div>
  );
}
