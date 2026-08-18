import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSupabase } from '@/lib/supabase';

const CODE_LENGTH = 6;

export function VerifyStep({ phone, onNext }: { phone: string; onNext: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const code = digits.join('');

  function setDigitAt(index: number, value: string) {
    const clean = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    if (clean && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    if (code.length !== CODE_LENGTH) return;
    setVerifying(true);
    setError(null);
    try {
      const { error: verifyError } = await getSupabase().auth.verifyOtp({
        phone,
        token: code,
        type: 'sms',
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError(null);
    try {
      const { error: resendError } = await getSupabase().auth.signInWithOtp({ phone });
      if (resendError) {
        setError(resendError.message);
        return;
      }
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Enter your code</h1>
        <p className="text-muted-foreground text-sm">We sent a 6-digit code to {phone}.</p>
      </div>

      <div className="flex justify-between gap-2">
        {digits.map((digit, index) => (
          <Input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length code boxes, order never changes
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={digit}
            onChange={(e) => {
              setDigitAt(index, e.target.value);
            }}
            onKeyDown={(e) => {
              handleKeyDown(index, e);
            }}
            inputMode="numeric"
            maxLength={1}
            className="border-primary h-14 w-12 border-2 text-center text-lg"
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          void handleResend();
        }}
        className="text-primary text-left text-sm font-medium"
      >
        {resent ? 'Code resent' : "Didn't get it? Resend"}
      </button>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        onClick={() => {
          void handleVerify();
        }}
        disabled={code.length !== CODE_LENGTH || verifying}
      >
        {verifying ? 'Verifying…' : 'Next'}
      </Button>
    </div>
  );
}
