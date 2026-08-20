import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function WelcomeStep({ onNext, onLogIn }: { onNext: () => void; onLogIn: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-balance">A community of peers with disabilities.</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Ask the questions you can't ask anyone else, and answer them for someone behind you.
        </p>
      </div>

      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="bg-primary size-1.5 rounded-full" />
        <span className={cn('size-1.5 rounded-full', 'bg-muted-foreground/30')} />
      </div>

      <Button className="w-full" size="lg" onClick={onNext}>
        Get started
      </Button>
      <p className="text-sm">
        <span className="text-muted-foreground">Already a member? </span>
        <button
          type="button"
          onClick={onLogIn}
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Log in
        </button>
      </p>
    </div>
  );
}
