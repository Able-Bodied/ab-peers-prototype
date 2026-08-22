import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useChat } from '@/lib/chat';
import { initials, locationLabel, relativeTime } from '@/lib/chat-rules';
import type { ChatWave } from '@/types/domain';

/**
 * Waves, kept in their own inbox rather than folded in as empty conversations.
 *
 * A wave is a question — "will you talk to me?" — and a conversation is the
 * answer. Mixing them puts a decision the viewer has not made yet in the same
 * list as the ones they have, and it makes an unanswered wave look like a thread
 * that has gone quiet. The separation is the product rule (PRD §8), not a
 * layout preference.
 *
 * **Nothing here ever tells a sender they were turned down.** The `chat_waves`
 * view reports an outbound wave as 'pending' whether it is unanswered or
 * declined, precisely so that saying no costs nothing and is never a message of
 * its own. Copy in the outbox has to hold that line too: "waiting to hear back"
 * is true in both cases, and is the only thing this component is entitled to say.
 */

interface WaveInboxProps {
  waves: ChatWave[];
  onOpenConversation: (conversationId: string) => void;
}

export function WaveInbox({ waves, onOpenConversation }: WaveInboxProps) {
  const { respondToWave } = useChat();
  // Which wave has an answer in flight, so its two buttons can't both be
  // pressed while the first is still being written.
  const [answering, setAnswering] = useState<string | null>(null);

  const inbound = waves.filter((wave) => wave.direction === 'inbox' && wave.status === 'pending');
  // Answered inbound waves are deliberately absent: an accepted one is now a
  // thread in Messages, and one the viewer declined is a decision they already
  // made and should not have to keep re-reading.
  const outbound = waves.filter((wave) => wave.direction === 'outbox');

  async function answer(wave: ChatWave, accept: boolean) {
    setAnswering(wave.id);
    const { ok, conversationId } = await respondToWave(wave.id, accept);
    setAnswering(null);
    // A call that failed is not a decline, and the two must not look alike: a
    // decline is a decision the viewer made and the wave leaves the inbox on the
    // next refresh, while a failure leaves the wave exactly where it was, with
    // the reason in the page's error banner and the buttons live to try again.
    if (!ok) return;
    // Only an accepted wave has a thread to open. Declining succeeds with no
    // conversation id precisely because saying no starts nothing.
    if (accept && conversationId) onOpenConversation(conversationId);
  }

  if (inbound.length === 0 && outbound.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-base font-bold">No waves yet</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-sm">
          A wave is a low-stakes hello. When someone sends you one it lands here, and you decide
          whether it turns into a conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {inbound.length > 0 && (
        <section aria-labelledby="waves-inbound">
          <h2 id="waves-inbound" className="mb-2 text-sm font-bold">
            Waves for you
          </h2>
          <ul className="flex flex-col gap-3">
            {inbound.map((wave) => (
              <li key={wave.id} className="bg-card rounded-2xl border p-4">
                <WaveHeader wave={wave} />

                {wave.topic && (
                  <p className="mt-2 text-[13px] font-semibold">Asked about: {wave.topic}</p>
                )}
                {wave.message && (
                  <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                    {wave.message}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-xl font-bold"
                    disabled={answering === wave.id}
                    aria-label={`Wave back at ${wave.counterpart.displayName}`}
                    onClick={() => {
                      void answer(wave, true);
                    }}
                  >
                    Wave back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 flex-1 rounded-xl font-bold"
                    disabled={answering === wave.id}
                    aria-label={`Not now for ${wave.counterpart.displayName}`}
                    onClick={() => {
                      void answer(wave, false);
                    }}
                  >
                    Not now
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outbound.length > 0 && (
        <section aria-labelledby="waves-outbound">
          <h2 id="waves-outbound" className="mb-2 text-sm font-bold">
            Waves you sent
          </h2>
          <ul className="flex flex-col gap-3">
            {outbound.map((wave) => (
              <li key={wave.id} className="bg-card rounded-2xl border p-4">
                <WaveHeader wave={wave} />

                {wave.topic && (
                  <p className="mt-2 text-[13px] font-semibold">You asked about: {wave.topic}</p>
                )}

                <div className="mt-3">
                  {/* Anything that is not an opened thread reads the same way, because
                      that is genuinely all the sender is told — see the file header. */}
                  {wave.status === 'accepted' && wave.conversationId ? (
                    <>
                      <p className="text-[13px] font-semibold">They&rsquo;ve waved back</p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-2 min-h-11 rounded-xl font-bold"
                        aria-label={`Open chat with ${wave.counterpart.displayName}`}
                        onClick={() => {
                          if (wave.conversationId) onOpenConversation(wave.conversationId);
                        }}
                      >
                        Open chat
                      </Button>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-[13px]">Waiting to hear back</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function WaveHeader({ wave }: { wave: ChatWave }) {
  const { counterpart } = wave;

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-11 shrink-0">
        {counterpart.photoUrl && (
          <AvatarImage src={counterpart.photoUrl} alt="" className="object-cover object-top" />
        )}
        <AvatarFallback className="bg-secondary text-primary text-sm font-bold">
          {initials(counterpart.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <span className="truncate">{counterpart.displayName}</span>
          {counterpart.type === 'mentor' && (
            <span className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
              Mentor
            </span>
          )}
          {counterpart.isBot && (
            <span className="bg-accent text-accent-foreground shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold">
              Bot
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          {locationLabel(counterpart)} · {relativeTime(wave.createdAt)}
        </p>
      </div>
    </div>
  );
}
