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
  validateMessage,
  WAVE_MESSAGE,
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
 * **Both tabs send the same thing: a wave.** "Say hi" sends `WAVE_MESSAGE` and
 * nothing else; "Write a message" sends the same wave carrying your own words and
 * the topic you picked. So the PRD §8 asymmetry holds either way — a peer sees it
 * in their waves inbox and the thread opens when they wave back, an open mentor's
 * thread opens on the spot — and the recipient's inbox can still say what you
 * asked about, because the topic reaches `send_wave` rather than only seeding the
 * box on this screen.
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
 * The picker's own vocabulary: the controlled topics, plus a slot for words of your own.
 *
 * "Other" is not a `Topic` and never reaches the database as one — it is how the picker represents
 * "this message is mine, not a starting sentence", which is a state the list otherwise has no way
 * to show once somebody has typed over an opener.
 */
const OTHER = 'Other';
type ComposeTopic = Topic | typeof OTHER;

/**
 * The list as it is offered. "Other" leads rather than trailing because typing selects it, and a
 * chip that selects itself somewhere down a scrolling list is feedback nobody sees.
 */
const COMPOSE_TOPICS: ComposeTopic[] = [OTHER, ...TOPICS];

/**
 * What picking a topic puts in the box. A topic is a starting sentence, not a
 * finished message — it gets somebody past the empty field and they edit from
 * there, which is the whole point.
 */
function openerFor(topic: Topic): string {
  return `Hi! I was hoping to ask you about ${topic}.`;
}

export function ComposeDialog({ member, onClose }: { member: ChatMember; onClose: () => void }) {
  const { limits, error, dismissError, sendWave } = useChat();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('wave');
  const [topic, setTopic] = useState<ComposeTopic | null>(null);
  const [body, setBody] = useState(WAVE_MESSAGE);
  /**
   * The words the member wrote themselves, parked so that wandering off to another topic and back
   * does not throw them away. Starts as the greeting the box starts with, so "Other" always has
   * something to restore even before anyone types.
   */
  const [otherDraft, setOtherDraft] = useState(WAVE_MESSAGE);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const bodyId = useId();

  const outcome = waveOutcome(member);
  const wavesLeft = wavesRemaining(limits);
  const blockedReason =
    wavesLeft === 0 ? "You have used up today's waves. The allowance resets tomorrow." : null;

  function chooseTopic(next: ComposeTopic): void {
    setTopic(next);
    setBody(next === OTHER ? otherDraft : openerFor(next));
    setProblem(null);
  }

  function editBody(next: string): void {
    setBody(next);
    // Words of your own *are* the "Other" option, so selecting it is the list catching up with
    // what the box already says rather than a second thing to remember to do. Banking the draft on
    // every keystroke is what lets a detour through another topic come back to these words.
    setTopic(OTHER);
    setOtherDraft(next);
    setProblem(null);
  }

  async function submit(): Promise<void> {
    const message = mode === 'wave' ? WAVE_MESSAGE : body.trim();
    if (mode === 'write') {
      const invalid = validateMessage(message, WAVE_MESSAGE_MAX_LENGTH);
      if (invalid) {
        setProblem(invalid);
        return;
      }
    }
    setProblem(null);
    dismissError();
    setBusy(true);
    // "Other" is this screen's word for "no topic", so it stops here rather than being stored as
    // one — `waves.topic` holds the controlled vocabulary or nothing.
    const sentTopic = mode === 'write' && topic !== null && topic !== OTHER ? topic : null;
    const result = await sendWave(member.id, sentTopic, message);
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
              // One tap, so there is nothing to fill in — just what will be sent, and what it will
              // do when it lands.
              <div className="flex flex-col gap-2">
                <p className="bg-secondary text-secondary-foreground rounded-2xl px-4 py-3 text-base font-semibold">
                  {WAVE_MESSAGE}
                </p>
                <p className="text-muted-foreground text-sm">{waveOutcomeLabel(outcome)}</p>
              </div>
            ) : (
              <>
                <fieldset className="min-w-0">
                  <legend className="text-sm font-medium">What is it about?</legend>
                  {/* The controlled vocabulary from src/types/domain.ts, unfiltered:
                      `ChatMember` carries interests but not topics, so there is no
                      per-person shortlist to narrow this to yet. */}
                  <div className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto p-0.5">
                    {COMPOSE_TOPICS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={topic === option}
                        onClick={() => {
                          chooseTopic(option);
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

                <div>
                  <label htmlFor={bodyId} className="text-sm font-medium">
                    Your message
                  </label>
                  <textarea
                    id={bodyId}
                    rows={4}
                    value={body}
                    maxLength={WAVE_MESSAGE_MAX_LENGTH}
                    onChange={(event) => {
                      editBody(event.target.value);
                    }}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  />
                  <p className="text-muted-foreground mt-1 text-xs">
                    {body.trim().length} of {WAVE_MESSAGE_MAX_LENGTH} characters
                  </p>
                </div>
              </>
            )}

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
                className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-[46px] w-full text-base font-bold"
                disabled={busy || blockedReason !== null}
                onClick={() => {
                  void submit();
                }}
              >
                Send
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
