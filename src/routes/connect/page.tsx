import { ArrowLeft } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChat } from '@/lib/chat';
import { sortConnectMembers } from '@/lib/chat-rules';
import { useSession } from '@/lib/session';
import { ComposeDialog } from '@/routes/connect/compose-dialog';
import { ErrorBanner } from '@/routes/connect/error-banner';
import { MemberRow } from '@/routes/connect/member-row';
import type { ChatMember } from '@/types/domain';

/**
 * Connect — the moment a browsing member decides to contact somebody.
 *
 * This is the list of people the viewer may reach, and the two ways to reach
 * them: a wave ("say hi"), which needs no words, or a first message, which does.
 * Between two peers a wave is an invitation — it waits in their hellos and only
 * opens a thread if they wave back. To a mentor who is open it opens the thread
 * outright, because a mentor has already volunteered to hear from people and
 * making them accept a second time asks a stranger to knock twice. Mentors who
 * are at capacity or paused, and anyone who has turned off unsolicited contact,
 * are shown with the reason rather than hidden, so nobody sends into a wall.
 */
export default function ConnectPage() {
  const { member: viewer, loading: sessionLoading } = useSession();
  const { members, loading, error, dismissError, conversationWith } = useChat();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ChatMember | null>(null);
  const searchId = useId();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Pinned after the search rather than before it: a name that was typed out in
    // full should find the person it names, not a bot sitting above them.
    if (needle === '') return sortConnectMembers(members);
    return sortConnectMembers(
      members.filter((candidate) => candidate.displayName.toLowerCase().includes(needle)),
    );
  }, [members, query]);

  if (!viewer && !sessionLoading) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold">Connect</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Reaching out lives behind sign-in. Who you may contact, and what you have already said to
          them, are only answerable for a specific person — so this screen needs to know who you
          are.
        </p>
        <Button asChild className="mt-4 min-h-[46px]">
          <Link to="/onboarding">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl pb-8">
      <header className="-mx-4 mb-4 flex items-center gap-2 border-b px-4 py-3 md:-mx-8 md:px-8">
        <Button
          asChild
          type="button"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label="Back to messages"
        >
          <Link to="/messages">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <h1 className="flex-1 text-lg font-bold">Connect</h1>
      </header>

      {/* The banner is hidden while the compose panel is open, because the panel
          renders the same error over its own overlay — one error, one place to
          read it, wherever the member is actually looking. */}
      {error !== null && selected === null ? (
        <ErrorBanner message={error} onDismiss={dismissError} />
      ) : null}

      <div className="mt-4">
        <label htmlFor={searchId} className="text-sm font-medium">
          Search by name
        </label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Start typing a name"
          className="mt-1 min-h-[46px]"
        />
      </div>

      {loading && members.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">Loading people…</p>
      ) : null}

      {!loading && matches.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          {members.length === 0 ? 'There is nobody to show yet.' : 'Nobody here goes by that name.'}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {matches.map((candidate) => (
          <MemberRow
            key={candidate.id}
            member={candidate}
            conversationId={conversationWith(candidate.id)?.id ?? null}
            onSelect={() => {
              setSelected(candidate);
            }}
          />
        ))}
      </ul>

      {/* Keyed on the member so switching people starts from a clean panel
          rather than inheriting the last person's half-written note. */}
      {selected !== null ? (
        <ComposeDialog
          key={selected.id}
          member={selected}
          onClose={() => {
            setSelected(null);
          }}
        />
      ) : null}

      {/* TODO(team): Connect action — what is still not built
        - [x] Say hi (wave) as the primary action, with the peer/mentor asymmetry stated before sending
        - [x] Mentor capacity and "not accepting messages" shown as a reason, not a dead button
        - [x] Daily wave and new-conversation allowances, from the database
        - [x] Write-first path, validated against the same limit the messages table enforces
        - [x] Existing thread offers "Open conversation" instead of a second hello
        - [~] "Reveal contact info" deleted rather than wired up — a member's phone and email are
              never shown to another member (PRD §14, docs/PII.md). Deliberately not a TODO.
        - [ ] Reach this screen from a profile with that person preselected, rather than by search
        - [ ] Filter the topic list to the topics this mentor actually offers, once `chat_members`
              carries them (it has `interests` but no `topics` today)
        - [ ] Show waves already sent, so somebody does not wave twice at the same person
        - [ ] Block and report, from the row rather than only from inside a thread
      */}
    </div>
  );
}
