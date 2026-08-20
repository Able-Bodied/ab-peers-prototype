import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { LogoSplash } from '@/components/logo-splash';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';

/**
 * Route-level gate: a signed-out visitor sees a sign-in prompt instead of the page.
 * /onboarding is the sign-up/sign-in flow itself, so it's the one route that never
 * wraps in this — everything else defaults to asking for sign-in first.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { member, loading } = useSession();

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6">
          <LogoSplash />
        </div>
        <h1 className="text-2xl font-semibold">Sign in required</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Sign in or join PeerConnect to see this page.
        </p>
        <Button asChild className="mt-4">
          <Link to="/onboarding">Sign in</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
