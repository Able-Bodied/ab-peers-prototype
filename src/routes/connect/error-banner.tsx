import { Button } from '@/components/ui/button';

/**
 * Whatever went wrong, in the database's own words.
 *
 * **Why the sentence is not rewritten here.** The rules that refuse a wave live
 * in the migration, and so does the wording — "you have reached today's limit of
 * 20 waves" is written once, next to the check that raises it. A second copy in
 * the client is a second copy to get out of step (see src/lib/chat-api.ts's
 * chatErrorMessage). So this renders the sentence verbatim and adds nothing.
 */
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 flex items-start gap-3 rounded-md border p-3 text-sm"
    >
      <p className="flex-1">{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-[46px] shrink-0"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
    </div>
  );
}
