import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';

/**
 * Unlisted, credential-gated login — not in `App.tsx`'s `flows` list, so it never appears in the
 * sidebar, but it is not a bypass of auth: it runs the exact same two Supabase calls the phone/
 * verify wizard does (`signInWithOtp` then `verifyOtp`), so a wrong phone or code fails exactly
 * the way it would in the UI. What it skips is clicking through two screens and waiting on a real
 * SMS, not the credential check itself.
 *
 * AGENTS.md documents a fixed test user (phone 1111111111, code 111111) on the hosted Supabase
 * project this repo's `.env.local` points at, for agents and scripts that need to reach an
 * authenticated screen without a real phone.
 *
 * Usage: /dev-login?phone=1111111111&code=111111&next=/discover
 */
export default function DevLoginPage() {
  const [searchParams] = useSearchParams();
  const { loading: sessionLoading } = useSession();
  const [authDone, setAuthDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneParam = searchParams.get('phone');
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/discover';

  useEffect(() => {
    if (!phoneParam || !code) {
      setError('Pass phone and code as query params, e.g. /dev-login?phone=1111111111&code=111111');
      return;
    }
    const phone = phoneParam.startsWith('+') ? phoneParam : `+1${phoneParam}`;
    const otpCode = code;
    let cancelled = false;

    async function run() {
      const supabase = getSupabase();
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
      if (otpError) {
        if (!cancelled) setError(otpError.message);
        return;
      }
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone,
        token: otpCode,
        type: 'sms',
      });
      if (cancelled) return;
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      setAuthDone(true);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [phoneParam, code]);

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center text-sm">
        <p className="text-destructive font-semibold">Dev login failed</p>
        <p className="text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  // Auth succeeded once `authDone` is set; wait for the session to finish loading the member row
  // (or find there isn't one) before handing off, so `next` sees the same session state a real
  // sign-in would leave it in.
  if (authDone && !sessionLoading) {
    return <Navigate to={next} replace />;
  }

  return (
    <p role="status" className="text-muted-foreground py-16 text-center text-sm">
      Signing in…
    </p>
  );
}
