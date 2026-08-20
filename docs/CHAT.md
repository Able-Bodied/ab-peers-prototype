# Chat

How messaging works in this prototype, and why it works that way. PRD §8 is the behaviour spec,
PRD §14 the privacy one, and PRD §16 puts messaging at step 2 of the build order. Read this before
changing anything under `src/routes/messages/`, `src/routes/connect/` or `src/lib/chat*`.

> **This is not the forum.** `docs/CONTEXT.md` says "a forum/chat feature is planned for later" —
> that is the *forum*, which PRD §18 defers in favour of partnering with CareCure rather than
> starting a second SCI forum next to a struggling one. One-to-one messaging is a different thing:
> it is MVP flow 4, the connect action, and the destination every wave leads to.

## The model

Three objects, and the order they happen in.

**A wave** is the one-tap "say hi". It lands in its own inbox, separate from messages, and it is
rate limited. Waving costs almost nothing to send, which is the point — the hard part of this
product is a mentee reaching out at all, three months post-injury, and a blank compose box is where
that stops.

**A conversation** is what a wave turns into. Which wave turns into one, and when, is the one rule
worth memorising:

| Sender → recipient | What a wave does |
| --- | --- |
| Peer → peer | Sits in their wave inbox. **A wave back opens the thread.** |
| Anyone → mentor who is `open` | **Opens the thread immediately.** No mutual match. |
| Anyone → mentor `at capacity` or `paused` | Refused, with the reason. |
| Anyone → somebody who turned off unsolicited contact | Refused. |

The asymmetry is not an oversight. A mentor has already volunteered and been vouched for by an
organisation; making a newly injured person wait for a mentor to wave back adds a step whose only
function is delay. Between two peers there is no such prior consent, so mutual interest is what
opens the thread.

Either side can also **write first instead of waving** — same gates, its own daily cap.

**A message** is anything after that. Both sides can post until somebody blocks.

## Where the rules live

**In the database, on purpose.** `supabase/migrations/20260820140000_chat_messaging.sql` is the
authority: capacity, blocks, the contact opt-out, the rate limits and the wave-to-thread transition
are all enforced there, as RLS policies, security-definer functions and triggers. The client
duplicates several of them (`src/lib/chat-rules.ts`) so a button can refuse instantly and say why,
but where the two disagree the database wins, and its error message is what the member reads —
`chatErrorMessage` passes the sentence through rather than rewriting it.

The reason is not defensiveness for its own sake. Two different screens write these tables — chat's
own composer and Discover's *Say hi* button — and a rule enforced in one client is not enforced at
all. So the contact rules are a `before insert` trigger on `waves`, not a check inside the RPC.

**Reads go through three views**, never the tables: `chat_conversations`, `chat_waves`,
`chat_members`. Each is keyed on `auth.uid()` in its own definition, so there is no "which member
am I asking about" parameter for a client to get wrong.

## Privacy, and what is deliberately a first pass

What is here (PRD §14):

- **Phone and email are never exposed between members.** No view chat reads selects `phone` or
  `birth_date`, and `ChatCounterpart` has no field for them. The cut is made in the database and in
  TypeScript, so neither one alone is load-bearing. The old "reveal contact info" idea is gone; the
  connection *is* the thread.
- **Everything is behind sign-in.** `anon` is revoked explicitly on every table, view and function,
  not merely left ungranted.
- **Blocking is silent and symmetric.** The blocked person is told nothing, their side of the thread
  does not change, and they cannot see that a block exists. Attempting contact returns the same
  sentence as somebody who simply turned contact off — a distinguishable error would be a block
  detector.
- **Declining a wave is silent.** To its sender, a declined wave goes on reading as pending forever.
  "Your wave was declined" is a notification with extra steps, and this population does not need one.
- **Reports are one-way.** A reporter can read their own reports back; nobody else can read any, and
  the subject is never told.
- **Retracting is a soft delete.** The row survives so a reported message still exists to be read,
  and so the other side's thread does not silently reflow around a gap.
- **Rate limits**: 20 waves and 10 new conversations per rolling 24 hours, counted in the database.
  `chat_limits()` returns both the cap and the spend, so the number the UI shows is the number the
  write path enforces.

What is **not** here, and should be before this meets real members:

- **No moderation queue.** Reports land in a table nobody reads. There is no admin surface, no
  triage, no notification to anyone. This is the biggest gap.
- **No abuse detection** beyond the fixed caps — no per-recipient throttle, nothing adaptive, no
  first-contact scoring.
- **No retention or deletion policy.** Messages live forever, and there is no "delete my account and
  my messages" path.
- **No encryption beyond Postgres at rest.** Anybody with database access reads everything. For a
  population whose location plus disability status is identifying on its own (`docs/PII.md`), that
  is a real consideration for production, not a theoretical one.
- **No notification budget or delivery** — nothing tells you a wave arrived unless you open the app.
- **`demo_reply()` must be deleted before production.** It writes a message as the counterpart so a
  seeded demo profile can answer, which is the only way a prototype thread has two sides. It refuses
  unless that counterpart is `is_synthetic`, so it can never post as a real account — but it has no
  business existing in front of real members.

## Peer Bot

`demo_reply()` needs a tester to click it. Peer Bot (`supabase/migrations/20260820150000_peer_bot.sql`)
is the automated version: one synthetic member, `is_bot = true`, listened for by database triggers
rather than by a person. "The server" is Postgres itself — there is no process to keep running, and
it answers whether or not anyone has the app open.

- Waving at it gets an answer immediately, the same way waving at an open mentor does — except Peer
  Bot is `type = 'peer'` (it has not volunteered as a mentor), so it gets its own trigger
  (`chat_bot_wave_back`) that waves back on the human's wave rather than reusing the mentor path.
- The moment a thread with it opens — by a wave, by writing first, however — it sends one greeting,
  once (`chat_bot_greet`, on `conversations` insert).
- After that, every message a human sends into that thread gets an automatic reply
  (`chat_bot_reply`, on `messages` insert): the exact handcycling question gets the AbleBodied
  answer; anything else gets "not available yet" and one of fifty prewritten jokes (`bot_jokes`,
  readable by nobody but the trigger function itself).
- It is also `is_synthetic`, same as the rest of the demo population, but the client hides the
  manual "simulate a reply" control for it specifically — a human tester faking a reply next to a
  counterpart that already replies on its own is confusing, not useful. `demo_reply()` itself still
  works against it at the database level; nothing here narrows what it was already allowed to do.
- `chat_wave_back_opens_thread()` (defined in the chat migration) got one guard narrowed here, from
  "no message in this thread yet" to "no message from this sender yet" — the greeting posts into a
  freshly opened conversation before that guard is reached, and the old, caller-agnostic version of
  it would have silently dropped a human's wave-carried text into a bot conversation. See the
  comment on that function in the migration for the full reasoning.
- It does not show up in Discover (`show_in_browse = false`) — a profile card with a `disability`
  field is not an honest way to present a bot — but it does show up in Connect's search
  (`open_to_messages = true` is what `chat_members` actually keys on).

## Files

| Path | What it is |
| --- | --- |
| `supabase/migrations/20260820140000_chat_messaging.sql` | The schema, the rules and the privacy boundary. Start here. |
| `supabase/migrations/20260820150000_peer_bot.sql` | Peer Bot: the member row, the fifty jokes, and the triggers that make it answer on its own. |
| `supabase/tests/` | RLS tests, run against a real Postgres. See that folder's README. |
| `src/lib/chat-api.ts` | Every Supabase call, and the row-to-domain mapping. Nothing above it names a table. |
| `src/lib/chat-rules.ts` | The pure decisions — contactability, wave outcome, grouping, formatting. Tested without a database. |
| `src/lib/chat.tsx` | `ChatProvider`/`useChat` — one store, realtime, optimistic sends. |
| `src/routes/connect/` | Deciding to make contact: who, and how. |
| `src/routes/messages/` | The waves inbox, the conversation list and the thread. |
| `src/types/domain.ts` | The chat types, mirroring the three views one for one. |

## Sharing `waves` with Discover

`public.waves` is written by two features. Discover owns the *Say hi* button
(`src/lib/waves.tsx`, `20260820130000_waves.sql`) and inserts directly; chat owns everything that
happens next. Their migration records an answer as `waved_back boolean`, chat's as
`status text` — both columns are now real, and triggers reconcile them in both directions, so
waving back on either surface opens the same thread. If you are changing either side:

- the daily cap is **20**, in three places that must agree: their `enforce_wave_rate_limit` trigger,
  chat's `send_wave()`, and `DAILY_WAVE_LIMIT` in their provider;
- the contact rules live in the `waves_contact_allowed` trigger, so they apply to their insert path
  as well as chat's RPC — do not move them back into the function;
- `supabase/tests/02_chat_waves_bridge_test.sql` is what proves the two halves still fit. Run it.

The honest state of this: two features grew the same table in parallel over one weekend, and the
reconciliation is the cost of that. When this moves to `ab-peers`, collapse it to one
representation — `status`, since it can express "declined", which a boolean cannot.
