import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChat } from '@/lib/chat';
import {
  newConversationsRemaining,
  validateMessage,
  WAVE_MESSAGE_MAX_LENGTH,
  waveOutcome,
  waveOutcomeLabel,
  wavesRemaining,
} from '@/lib/chat-rules';
import { cn } from '@/lib/utils';
import { ErrorBanner } from '@/routes/connect/error-banner';
import type { ChatMember, Topic } from '@/types/domain';
import { TOPICS } from '@/types/domain';

/**
 * The compose panel: the two ways one member reaches another.
 *
 * **Why waving is the default and writing is the other tab.** Composing a first
 * message to a stranger who shares your injury is the single hardest thing this
 * app asks anyone to do, and a blank box is where most people stop. A wave costs
 * one tap and says the only thing that has to be said first — I would like to
 * talk to you. Writing first is still here for people who already know what they
 * want to ask; it is just not the thing you have to do.
 *
 * **Why there is no "reveal contact info".** The old stub offered to hand over a
 * mentor's phone number once they accepted. That is gone on purpose and is not
 * coming back: a member's phone and email are never shown to another member
 * (PRD §14, docs/PII.md), in the client and in the views alike — `ChatCounterpart`
 * has no `phone` field to render even if this screen wanted one. The connection
 * between two members *is* the thread.
 */

type Mode = 'wave' | 'write';

/**
 * What picking a topic puts in the box. A topic is a starting sentence, not a
 * finished message — it gets somebody past the empty field and they edit from
 * there, which is the whole point.
 */
function openerFor(topic: Topic): string {
  return `Hi! I was hoping to ask you about ${topic}.`;
}

export function ComposeDialog({ member, onClose }: { member: ChatMember; onClose: () => void }) {
  const { limits, error, dismissError, sendWave, startConversation } = useChat();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('wave');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [body, setBody] = useState('');
  /** The opener we last wrote into the box, so a second topic tap can replace it without eating typed words. */
  const [prefill, setPrefill] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const bodyId = useId();

  const outcome = waveOutcome(member);
  const wavesLeft = wavesRemaining(limits);
  const conversationsLeft = newConversationsRemaining(limits);
  const blockedReason =
    mode === 'wave'
      ? wavesLeft === 0
        ? "You have used up today's waves. The allowance resets tomorrow."
        : null
      : conversationsLeft === 0
        ? "You have started as many conversations as today's allowance covers. It resets tomorrow."
        : null;

  const maxLength = mode === 'wave' ? WAVE_MESSAGE_MAX_LENGTH : undefined;

  function chooseTopic(next: Topic | null): void {
    setTopic(next);
    const opener = next === null ? '' : openerFor(next);
    // Only ever overwrite an empty box or an opener nobody has touched.
    if (body.trim() === '' || body === prefill) {
      setBody(opener);
      setPrefill(opener);
    }
  }

  async function submitWave(): Promise<void> {
    const note = body.trim();
    const invalid = note === '' ? null : validateMessage(note, WAVE_MESSAGE_MAX_LENGTH);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    dismissError();
    setBusy(true);
    const result = await sendWave(member.id, topic, note === '' ? null : note);
    setBusy(false);
    // Refused. `error` already carries the database's own sentence and the
    // banner above renders it, so there is nothing to confirm and nothing to add.
    if (!result.ok) return;
    if (result.conversationId !== null) {
      // The open-mentor case: there is a thread now, so land in it.
      void navigate(`/messages/${result.conversationId}`);
      return;
    }
    setSent(true);
  }

  async function submitMessage(): Promise<void> {
    const invalid = validateMessage(body);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    dismissError();
    setBusy(true);
    try {
      const conversationId = await startConversation(member.id, body.trim());
      void navigate(`/messages/${conversationId}`);
    } catch {
      // The provider has already put the database's own sentence in `error`;
      // the banner above renders it. Nothing useful to add here.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Your hello is on its way' : `Say hi to ${member.displayName}`}
          </DialogTitle>
          <DialogDescription>
            {sent ? waveOutcomeLabel('awaits-reply') : 'One tap is enough. Words are optional.'}
          </DialogDescription>
        </DialogHeader>

        {error !== null ? <ErrorBanner message={error} onDismiss={dismissError} /> : null}

        {sent ? (
          <DialogFooter>
            <Button type="button" className="min-h-[46px] w-full" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        ) : (
          <>
            <fieldset className="flex min-w-0 gap-2">
              <legend className="sr-only">How to make contact</legend>
              {(['wave', 'write'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => {
                    setMode(option);
                    setProblem(null);
                  }}
                  className={cn(
                    'min-h-[46px] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    mode === option
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {option === 'wave' ? 'Say hi' : 'Write a message'}
                </button>
              ))}
            </fieldset>

            {mode === 'wave' ? (
              <p className="bg-muted/60 rounded-md px-3 py-2 text-sm">
                {waveOutcomeLabel(outcome)}
              </p>
            ) : null}

            <div>
              <fieldset className="min-w-0">
                <legend className="text-sm font-medium">
                  What is it about? <span className="text-muted-foreground">(optional)</span>
                </legend>
                {/* The controlled vocabulary from src/types/domain.ts, unfiltered:
                    `ChatMember` carries interests but not topics, so there is no
                    per-person shortlist to narrow this to yet. */}
                <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto p-0.5">
                  {TOPICS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={topic === option}
                      onClick={() => {
                        chooseTopic(topic === option ? null : option);
                      }}
                      className={cn(
                        'rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                        topic === option
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
              {mode === 'write' && topic !== null ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  A topic only starts the sentence for you here — a written message carries your
                  words, not a label.
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={bodyId} className="text-sm font-medium">
                {mode === 'wave' ? 'Add a note (optional)' : 'Your message'}
              </label>
              <textarea
                id={bodyId}
                rows={4}
                value={body}
                maxLength={maxLength}
                onChange={(event) => {
                  setBody(event.target.value);
                  setProblem(null);
                }}
                placeholder={
                  mode === 'wave' ? 'Nice to find someone nearby…' : "Hi! I'm hoping to ask about…"
                }
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              />
              {mode === 'wave' ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {body.trim().length} of {WAVE_MESSAGE_MAX_LENGTH} characters
                </p>
              ) : null}
            </div>

            {problem !== null ? (
              <p role="alert" className="text-destructive text-sm">
                {problem}
              </p>
            ) : null}
            {blockedReason !== null ? (
              <p role="status" className="bg-muted/60 rounded-md px-3 py-2 text-sm">
                {blockedReason}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                className="min-h-[46px] w-full"
                disabled={busy || blockedReason !== null}
                onClick={() => {
                  void (mode === 'wave' ? submitWave() : submitMessage());
                }}
              >
                {mode === 'wave' ? 'Send hello' : 'Send message'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
