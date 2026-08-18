import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabase } from '@/lib/supabase';

function formatUsPhone(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function PhoneStep({ onNext }: { onNext: (phone: string) => void }) {
  const [digits, setDigits] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = digits.length === 10;

  async function handleSubmit() {
    if (!canContinue) return;
    setSending(true);
    setError(null);
    const phone = `+1${digits}`;
    try {
      const { error: otpError } = await getSupabase().auth.signInWithOtp({ phone });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      onNext(phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">What's your number?</h1>
        <p className="text-muted-foreground text-sm">
          We use it to sign you in. It is never shown to other members.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="phone">Phone number</Label>
        <div className="flex items-center gap-2">
          <span className="border-input flex h-9 items-center rounded-md border px-3 text-sm">
            +1
          </span>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="(510) 555-0143"
            value={formatUsPhone(digits)}
            onChange={(e) => {
              setDigits(e.target.value.replace(/\D/g, '').slice(0, 10));
            }}
            autoFocus
          />
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" disabled={!canContinue || sending}>
        {sending ? 'Sending code…' : 'Next'}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        By tapping Next you agree to our Terms and Privacy Policy.
      </p>
    </form>
  );
}
