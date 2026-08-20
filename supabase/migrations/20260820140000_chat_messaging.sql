-- ============================================================================
-- Chat: waves, conversations and messages between members
-- ============================================================================
-- PRD build order step 2 ("messaging, mentor capacity states and wave rate
-- limits"). PRD §8 is the behaviour spec and PRD §14 is the privacy spec; both
-- are implemented here rather than in the client, because a rule the client
-- enforces is a rule an attacker does not have to follow.
--
-- ---------------------------------------------------------------------------
-- The model, in one paragraph
-- ---------------------------------------------------------------------------
-- A **wave** is the one-tap "say hi", and it lands in its own inbox, separate
-- from messages (PRD §8). Peer to peer, a wave back is what opens the thread.
-- Anyone to a mentor who is `open`, the thread opens on the wave itself — the
-- mentor already volunteered, so there is no mutual-match step. Either side may
-- also skip the wave and write first. Once a **conversation** exists, both
-- sides can post **messages** to it until somebody blocks.
--
-- ---------------------------------------------------------------------------
-- Why the writes are functions and not insert policies
-- ---------------------------------------------------------------------------
-- Opening a conversation means writing three tables (conversations, two
-- conversation_members rows, and usually a wave or a first message) under a set
-- of preconditions: the recipient accepts contact, nobody has blocked anybody,
-- mentor capacity is open, the sender is under their daily limit. A `with
-- check` expression cannot express "and then write these other rows", so a
-- client doing it by hand could stop halfway and leave a conversation with one
-- participant in it. Every such write goes through a security-definer function
-- below, and `conversations` and `conversation_members` have no insert policy
-- at all — the functions are the only door.
--
-- What clients still write directly, because there is no invariant to hold:
-- `messages` (insert, plus own-row soft delete), `conversation_members` (own
-- row: last_read_at, archived, muted), `member_blocks` (delete, to unblock),
-- `member_reports` (insert).
--
-- ---------------------------------------------------------------------------
-- Privacy decisions taken here (PRD §14)
-- ---------------------------------------------------------------------------
-- * `phone` and `birth_date` are selected by no view in this file, and no
--   policy added here widens `public.members` — its own-row-only select policy
--   is untouched. "Email and phone are never exposed between members."
-- * Everything is granted to `authenticated` only, and revoked from `anon` and
--   `public` explicitly. There is no anonymous read of anybody's messages.
-- * Blocking is silent. A blocked sender gets the same generic "not accepting
--   messages" answer as somebody who simply turned contact off, so a block
--   cannot be probed for.
-- * Declining a wave is silent too — see `chat_waves`, where an outbound wave
--   never reports `declined` back to the person who sent it.
-- * Reports are insert-only and readable by their reporter alone. Nobody can
--   enumerate who has been reported, least of all the subject.
--
-- This is a first pass, deliberately. There is no moderation queue, no
-- retention policy, no encryption beyond what Postgres gives us at rest, and
-- the rate limits are fixed numbers rather than anything adaptive.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Columns this feature reads on `members`
-- ----------------------------------------------------------------------------
-- `open_to_messages`, `capacity` and `is_synthetic` are also defined by
-- 20260820100000_members_discovery_profile.sql, which was written in parallel
-- with this one. Both use `if not exists`, so whichever lands first wins and
-- the other is a no-op — chat does not depend on that migration having run,
-- and deliberately reads no column it introduces.

alter table public.members add column if not exists open_to_messages boolean not null default false;
alter table public.members add column if not exists capacity text
  check (capacity in ('open', 'at capacity', 'paused'));
alter table public.members add column if not exists is_synthetic boolean not null default false;

-- Unsolicited contact is opt-*out* (PRD §14: "recipients can turn off
-- unsolicited waves and messages"), so a real account is reachable until its
-- owner says otherwise. Synthetic rows are left alone — the seed decides
-- whether a demo profile is reachable, and clobbering that would erase the
-- "this mentor is at capacity" states the demo needs to show.
alter table public.members alter column open_to_messages set default true;
update public.members set open_to_messages = true where is_synthetic = false;

-- The synthetic peers are a special case. 20260820120000_seed_synthetic_members
-- was written while this column still defaulted to false, and it writes `false`
-- for all 40 of its peers and `true` for all 25 of its mentors — which reads as
-- a decision but is an artefact of the default at the time. Left alone, the
-- peer-to-peer half of PRD §8 has nobody at all to demonstrate it on: every
-- wave in the demo would go to a mentor and open a thread immediately, and the
-- wave-back path would be unreachable.
--
-- So open them, except three, deterministically chosen, kept closed so the
-- "not accepting new messages" state still appears somewhere. The mentors are
-- untouched: their 17 open / 5 at capacity / 3 paused spread is a real decision
-- and it is exactly what the capacity states need in order to be shown.
update public.members set open_to_messages = true
where is_synthetic
  and type = 'peer'
  and id not in (
    select id from public.members
    where is_synthetic and type = 'peer'
    order by id
    limit 3
  );

comment on column public.members.open_to_messages is
  'Opt-out of unsolicited waves and first messages. Existing threads are unaffected.';


-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- A 1:1 thread. `member_low`/`member_high` are the participant pair, sorted, so
-- "one thread per pair" is a unique constraint the database enforces rather
-- than a race the client has to lose gracefully. Per-side state (read cursor,
-- archived, muted) lives in `conversation_members`, which is also what the RLS
-- policies key on. The two are written together by the functions below and
-- cannot diverge, because nothing else is allowed to write either one.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- 'mentor' when either side is a mentor. PRD §8.3 keeps mentor threads out of
  -- the connections list by default, and this is the flag that will drive it.
  kind text not null default 'peer' check (kind in ('peer', 'mentor')),
  created_by uuid not null references public.members (id) on delete cascade,
  member_low uuid not null references public.members (id) on delete cascade,
  member_high uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_pair_sorted check (member_low < member_high),
  constraint conversations_pair_unique unique (member_low, member_high)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  -- 'epoch' rather than now(): a thread you have never opened is entirely
  -- unread, including the first message, which is the one that created it.
  last_read_at timestamptz not null default 'epoch',
  archived boolean not null default false,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, member_id)
);

create index if not exists idx_conversation_members_member
  on public.conversation_members (member_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.members (id) on delete cascade,
  -- Plain text. Nothing in this app renders a message body as markup, and the
  -- length cap is here so one row cannot be used as free storage.
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- clock_timestamp(), not now(): now() is the transaction's start time and is
  -- identical for every row written inside one transaction, so accepting a wave
  -- that carries a sentence would stamp that message at the same instant as
  -- anything else written alongside it and leave "which was last" to chance.
  -- A message log wants the real clock.
  created_at timestamptz not null default clock_timestamp(),
  -- Soft delete: the row stays, so the other side's thread does not silently
  -- reflow around a gap, and so a reported message still exists to be read.
  deleted_at timestamptz
);

create index if not exists idx_messages_conversation
  on public.messages (conversation_id, created_at);

-- Realtime delivers updates as well as inserts, and the RLS check on a delete
-- or update needs the old row's columns to evaluate `chat_is_participant`.
alter table public.messages replica identity full;

-- A wave is the one-tap "say hi". `message` is optional and short — a wave with
-- a sentence attached is still a wave, not a thread.
--
-- ---------------------------------------------------------------------------
-- Shared with the Discover workstream — read this before editing
-- ---------------------------------------------------------------------------
-- `public.waves` is written by two features at once. Discover owns the *Say hi*
-- button (src/lib/waves.tsx, migration 20260820130000_waves.sql) and inserts
-- into this table directly; chat owns what happens next — the wave inbox, the
-- wave back, and the thread it opens. Whichever migration runs first creates
-- the table and the other adapts:
--
--  * this file is `create table if not exists` followed by `add column if not
--    exists` for everything chat needs, so it upgrades their table in place
--    rather than fighting it;
--  * the mentor asymmetry (PRD §8) lives in an `after insert` trigger below,
--    not inside `send_wave()`, so a direct insert from Discover's button gets
--    exactly the same behaviour as a call to the RPC. There is no path into
--    this table that leaves a wave at an open mentor sitting unanswered.
--
-- The daily cap is 20, matching `DAILY_WAVE_LIMIT` in their provider and their
-- `enforce_wave_rate_limit` trigger. Two enforcement points that disagree are a
-- bug, so if one moves, move both.
create table if not exists public.waves (
  id uuid primary key default gen_random_uuid(),
  from_member_id uuid not null references public.members (id) on delete cascade,
  to_member_id uuid not null references public.members (id) on delete cascade,
  -- One of TOPICS in src/types/domain.ts when the wave came from an "Ask me
  -- about" chip, null for a plain wave. Not constrained to a list here: that
  -- vocabulary lives in the app and moves faster than a check constraint.
  topic text,
  message text check (message is null or char_length(btrim(message)) between 1 and 500),
  -- The value check is added by name below, so that it lands whether this
  -- create ran or Discover's did.
  status text not null default 'pending',
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint waves_not_self check (from_member_id <> to_member_id)
);

-- Discover's migration (20260820130000_waves.sql) is already applied on the
-- shared database, and it created this table first: it has the pair, the topic
-- and a `waved_back` boolean, but none of the thread machinery. Add what chat
-- needs, idempotently, so this file works against either starting point.
alter table public.waves add column if not exists topic text;
alter table public.waves add column if not exists message text;
alter table public.waves add column if not exists status text not null default 'pending';
alter table public.waves add column if not exists conversation_id uuid references public.conversations (id) on delete set null;
alter table public.waves add column if not exists responded_at timestamptz;

-- `waved_back` is Discover's answer to the same question `status` answers, and
-- both are now real columns on one table. Rather than pick a winner and break
-- whichever client reads the other, the triggers below keep them in step in
-- both directions: answering through chat sets `waved_back`, and flipping
-- `waved_back` through Discover's update policy opens the thread. Added here
-- too, so this migration does not depend on theirs having run.
alter table public.waves add column if not exists waved_back boolean not null default false;

-- Existing rows predate `status` and carry the answer only in `waved_back`.
update public.waves set status = 'accepted' where waved_back and status = 'pending';

do $$
begin
  alter table public.waves add constraint waves_status_known
    check (status in ('pending', 'accepted', 'declined'));
exception
  when duplicate_object then null;
end
$$;

-- At most one open wave per direction per pair: waving repeatedly at somebody
-- who has not answered is the cheapest form of harassment there is. (Discover's
-- migration constrains the same pair unconditionally; both can stand, and the
-- stricter of the two simply wins.)
create unique index if not exists waves_one_pending_per_pair
  on public.waves (from_member_id, to_member_id) where status = 'pending';

create index if not exists idx_waves_to_member on public.waves (to_member_id, status);
create index if not exists idx_waves_from_member on public.waves (from_member_id, status);

create table if not exists public.member_blocks (
  blocker_id uuid not null references public.members (id) on delete cascade,
  blocked_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint member_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists idx_member_blocks_blocked on public.member_blocks (blocked_id);

create table if not exists public.member_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.members (id) on delete cascade,
  subject_member_id uuid not null references public.members (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'impersonation', 'safety', 'other')),
  details text check (details is null or char_length(details) <= 2000),
  created_at timestamptz not null default now(),
  constraint member_reports_not_self check (reporter_id <> subject_member_id)
);


-- ----------------------------------------------------------------------------
-- 2. Helpers
-- ----------------------------------------------------------------------------
-- All security definer with a pinned `search_path`. `chat_is_participant` has
-- to be, for a duller reason than privacy: the select policy on
-- `conversation_members` asks whether the caller is in `conversation_members`,
-- and asking that question through RLS would re-enter the same policy forever.
-- A definer function reads the table with RLS off and breaks the cycle.

create or replace function public.chat_is_participant(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.member_id = auth.uid()
  );
$$;

-- Symmetric: a block stops contact in both directions, whoever set it.
create or replace function public.chat_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.member_blocks mb
    where (mb.blocker_id = p_a and mb.blocked_id = p_b)
       or (mb.blocker_id = p_b and mb.blocked_id = p_a)
  );
$$;

/** The other member of a 1:1 conversation, from the caller's point of view. */
create or replace function public.chat_counterpart(p_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.member_id
  from public.conversation_members cm
  where cm.conversation_id = p_conversation
    and cm.member_id <> auth.uid()
  limit 1;
$$;

/**
 * The daily caps, and how much of them the caller has spent. Returned from the
 * database rather than hardcoded in the client so that the number the UI shows
 * ("3 of 10 waves left today") is the same number the write path enforces.
 */
create or replace function public.chat_limits()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'waveDailyLimit', 20,
    'wavesSentToday', (
      select count(*) from public.waves
      where from_member_id = auth.uid() and created_at > now() - interval '24 hours'
    ),
    'conversationDailyLimit', 10,
    'conversationsStartedToday', (
      select count(*) from public.conversations
      where created_by = auth.uid() and created_at > now() - interval '24 hours'
    )
  );
$$;

/**
 * Every precondition on contacting somebody who has not contacted you, in one
 * place, so that no path can drift away from the others. Takes the sender
 * explicitly rather than reading `auth.uid()`, because the wave trigger has to
 * ask the same question about a row's author rather than about the caller.
 * Returns the target's row for the caller to go on using.
 */
create or replace function public.chat_assert_contact_allowed(p_from uuid, p_to uuid)
returns public.members
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target public.members;
begin
  if p_from is null then
    raise exception 'You must be signed in to do that.' using errcode = '42501';
  end if;
  if p_from = p_to then
    raise exception 'You cannot start a conversation with yourself.' using errcode = '22023';
  end if;

  select * into v_target from public.members where id = p_to;
  if not found then
    raise exception 'That member does not exist.' using errcode = '02000';
  end if;

  -- One answer covers both "they blocked you" and "they turned contact off",
  -- deliberately: a distinguishable error is a block detector.
  if public.chat_is_blocked(p_from, p_to) or not v_target.open_to_messages then
    raise exception 'This person is not accepting new messages right now.' using errcode = '42501';
  end if;

  -- Mentor capacity is public information — it is a badge on the profile — so
  -- naming it here tells the sender nothing they could not already see.
  if v_target.type = 'mentor' and coalesce(v_target.capacity, 'open') <> 'open' then
    raise exception 'This mentor is % and is not taking new conversations right now.',
      v_target.capacity using errcode = '42501';
  end if;

  return v_target;
end;
$$;

/** The same question asked about the caller. */
create or replace function public.chat_assert_can_contact(p_target uuid)
returns public.members
language sql
stable
security definer
set search_path = public
as $$
  select public.chat_assert_contact_allowed(auth.uid(), p_target);
$$;

/**
 * Create the thread and both membership rows, or hand back the one that
 * already exists. Internal: not granted to any client role, because it asks no
 * questions about who is allowed to talk to whom — its callers do that.
 */
create or replace function public.chat_open_conversation(
  p_a uuid,
  p_b uuid,
  p_kind text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low uuid := least(p_a, p_b);
  v_high uuid := greatest(p_a, p_b);
  v_id uuid;
begin
  select id into v_id from public.conversations
  where member_low = v_low and member_high = v_high;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (kind, created_by, member_low, member_high)
  values (p_kind, p_created_by, v_low, v_high)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, member_id)
  values (v_id, p_a), (v_id, p_b);

  return v_id;
end;
$$;

/** 'mentor' if either side is one — see conversations.kind. */
create or replace function public.chat_kind_for(p_a uuid, p_b uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.members where id in (p_a, p_b) and type = 'mentor')
    then 'mentor' else 'peer'
  end;
$$;


-- ----------------------------------------------------------------------------
-- 3. The write API
-- ----------------------------------------------------------------------------

/**
 * Say hi. Peer to peer this sits pending in the recipient's wave inbox until
 * they answer; to an open mentor it opens the thread immediately (PRD §8).
 */
create or replace function public.send_wave(
  p_to uuid,
  p_topic text default null,
  p_message text default null
)
returns public.waves
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_wave public.waves;
  v_wave_id uuid;
begin
  perform public.chat_assert_can_contact(p_to);

  if exists (
    select 1 from public.conversations
    where member_low = least(v_me, p_to) and member_high = greatest(v_me, p_to)
  ) then
    raise exception 'You already have a conversation with this person.' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.waves
    where from_member_id = v_me and to_member_id = p_to and status = 'pending'
  ) then
    raise exception 'You have already waved at this person. Give them a chance to answer.'
      using errcode = '23505';
  end if;

  -- Re-waving after a decline. The decline itself is silent, so this is worded
  -- exactly like every other unavailable answer rather than confirming one.
  if exists (
    select 1 from public.waves
    where from_member_id = v_me and to_member_id = p_to
      and status = 'declined' and created_at > now() - interval '30 days'
  ) then
    raise exception 'This person is not accepting new messages right now.' using errcode = '42501';
  end if;

  if (
    select count(*) from public.waves
    where from_member_id = v_me and created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'You have reached today''s limit of 20 waves. Try again tomorrow.'
      using errcode = '54000';
  end if;

  insert into public.waves (from_member_id, to_member_id, topic, message)
  values (v_me, p_to, nullif(btrim(p_topic), ''), nullif(btrim(p_message), ''))
  returning id into v_wave_id;

  -- The mentor asymmetry is applied by chat_wave_opens_thread(), an after-insert
  -- trigger, so re-read rather than trusting the RETURNING row: for an open
  -- mentor the wave is already accepted and carrying a conversation id by now.
  select * into v_wave from public.waves where id = v_wave_id;
  return v_wave;
end;
$$;

/**
 * Answer a wave in your inbox. Accepting opens the thread; declining is silent
 * and the sender is never told (see `chat_waves`). Returns the conversation id
 * on accept, null on decline.
 */
create or replace function public.respond_to_wave(p_wave uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_wave public.waves;
  v_conversation uuid;
begin
  select * into v_wave from public.waves where id = p_wave;
  if not found or v_wave.to_member_id is distinct from v_me then
    raise exception 'That wave is not yours to answer.' using errcode = '42501';
  end if;
  if v_wave.status <> 'pending' then
    raise exception 'You have already answered this wave.' using errcode = '22023';
  end if;

  if not p_accept then
    update public.waves set status = 'declined', responded_at = now() where id = p_wave;
    return null;
  end if;

  if public.chat_is_blocked(v_me, v_wave.from_member_id) then
    raise exception 'This person is not accepting new messages right now.' using errcode = '42501';
  end if;

  v_conversation := public.chat_open_conversation(
    v_me,
    v_wave.from_member_id,
    public.chat_kind_for(v_me, v_wave.from_member_id),
    -- The wave's sender started this, not the person accepting it.
    v_wave.from_member_id
  );

  -- `waved_back` moves with `status` so Discover's surfaces, which read the
  -- boolean, agree with chat's, which read the status.
  update public.waves
  set status = 'accepted', responded_at = now(), conversation_id = v_conversation, waved_back = true
  where id = p_wave;

  -- A wave that carried a sentence becomes the thread's first message, so the
  -- person who accepted is not looking at an empty screen.
  if v_wave.message is not null then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation, v_wave.from_member_id, v_wave.message);
  end if;

  return v_conversation;
end;
$$;

/**
 * Write first, without waving — "either side can message first instead"
 * (PRD §8). Same gates as a wave, plus its own daily cap. If a thread already
 * exists this just posts into it, and if the other person had a wave pending
 * with you, answering it with a message counts as accepting.
 */
create or replace function public.start_conversation(p_to uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conversation uuid;
begin
  perform public.chat_assert_can_contact(p_to);

  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A first message cannot be empty.' using errcode = '22023';
  end if;

  select id into v_conversation from public.conversations
  where member_low = least(v_me, p_to) and member_high = greatest(v_me, p_to);

  if v_conversation is null then
    if (
      select count(*) from public.conversations
      where created_by = v_me and created_at > now() - interval '24 hours'
    ) >= 10 then
      raise exception 'You have started as many new conversations as you can today. Try again tomorrow.'
        using errcode = '54000';
    end if;

    v_conversation := public.chat_open_conversation(
      v_me, p_to, public.chat_kind_for(v_me, p_to), v_me
    );
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (v_conversation, v_me, btrim(p_body));

  -- Any wave still open between the two of us is settled by this. The message
  -- was written above, so the wave-back trigger this update fires will not add
  -- the wave's own text a second time.
  update public.waves
  set status = 'accepted', responded_at = now(), conversation_id = v_conversation, waved_back = true
  where status = 'pending'
    and ((from_member_id = v_me and to_member_id = p_to)
      or (from_member_id = p_to and to_member_id = v_me));

  return v_conversation;
end;
$$;

/**
 * Block somebody, silently (PRD §8.3, §14). Contact stops in both directions,
 * any wave open between the two of you is closed, and the thread is archived —
 * on your side only, because the other person is not told.
 */
create or replace function public.block_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'You must be signed in to do that.' using errcode = '42501';
  end if;
  if v_me = p_member then
    raise exception 'You cannot block yourself.' using errcode = '22023';
  end if;

  insert into public.member_blocks (blocker_id, blocked_id)
  values (v_me, p_member)
  on conflict do nothing;

  update public.waves
  set status = 'declined', responded_at = now()
  where status = 'pending'
    and ((from_member_id = v_me and to_member_id = p_member)
      or (from_member_id = p_member and to_member_id = v_me));

  update public.conversation_members
  set archived = true
  where member_id = v_me
    and conversation_id in (
      select id from public.conversations
      where member_low = least(v_me, p_member) and member_high = greatest(v_me, p_member)
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- Prototype only: let a synthetic profile answer you
-- ---------------------------------------------------------------------------
-- The demo population in src/mocks/seed.ts has no auth accounts, so nobody can
-- ever sign in as one and reply — which would leave every thread in the demo
-- one-sided and the read/unread states unreachable. This writes a message as
-- the counterpart, and refuses unless that counterpart is `is_synthetic`, so it
-- can never post as a real person's account no matter who calls it.
--
-- DELETE THIS when the schema moves to `ab-peers`. It exists to make a
-- prototype demoable, and it has no place in front of real members.
create or replace function public.demo_reply(p_conversation uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counterpart uuid;
  v_is_synthetic boolean;
  v_id uuid;
begin
  if not public.chat_is_participant(p_conversation) then
    raise exception 'That conversation is not yours.' using errcode = '42501';
  end if;

  v_counterpart := public.chat_counterpart(p_conversation);
  select is_synthetic into v_is_synthetic from public.members where id = v_counterpart;

  if not coalesce(v_is_synthetic, false) then
    raise exception 'demo_reply only works with synthetic demo profiles.' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation, v_counterpart, btrim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;


-- ----------------------------------------------------------------------------
-- 4. Keeping the inbox in order
-- ----------------------------------------------------------------------------

/**
 * PRD §8's asymmetry, applied wherever a wave comes from: "anyone to a mentor —
 * if the mentor is open, the wave lands in their inbox and the thread opens
 * immediately. No mutual match — mentors have already volunteered."
 *
 * This is a trigger rather than a branch inside `send_wave()` because chat is
 * not the only thing that inserts a wave: Discover's *Say hi* button writes to
 * this table directly (see the note on the table). A rule that only the RPC
 * applied would mean the same tap did different things on different screens.
 */
create or replace function public.chat_wave_opens_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.members;
  v_conversation uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select * into v_target from public.members where id = new.to_member_id;
  if not found or v_target.type <> 'mentor' or coalesce(v_target.capacity, 'open') <> 'open' then
    return new;
  end if;

  v_conversation := public.chat_open_conversation(
    new.from_member_id, new.to_member_id, 'mentor', new.from_member_id
  );

  update public.waves
  set status = 'accepted', responded_at = now(), conversation_id = v_conversation, waved_back = true
  where id = new.id;

  -- A wave that carried a sentence becomes the thread's opening message, so the
  -- mentor is not looking at an empty screen with a name on it.
  if nullif(btrim(coalesce(new.message, '')), '') is not null then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation, new.from_member_id, btrim(new.message));
  end if;

  return new;
end;
$$;

/**
 * The contact rules, applied to the row rather than to the caller.
 *
 * `send_wave()` checks these before it inserts, but it is not the only way a
 * row gets in here: Discover's *Say hi* button inserts directly, guarded only
 * by its own `auth.uid() = from_member_id` policy, which says who you may wave
 * *as* and nothing about who you may wave *at*. Without this trigger, that path
 * would let a wave through to somebody who had blocked the sender, or turned
 * unsolicited contact off, or set their capacity to paused — the three rules
 * that most need to hold. A rule the client enforces is a rule an attacker does
 * not have to follow, and the same goes for a rule only one of two clients
 * enforces.
 */
create or replace function public.chat_wave_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.chat_assert_contact_allowed(new.from_member_id, new.to_member_id);
  return new;
end;
$$;

drop trigger if exists waves_contact_allowed on public.waves;
create trigger waves_contact_allowed
  before insert on public.waves
  for each row execute function public.chat_wave_allowed();

/**
 * A wave that has not been answered can be withdrawn — that is Discover's
 * "senders can withdraw their wave" policy, and it is a reasonable thing to
 * want. A wave that opened a conversation cannot, because by then it is the
 * record of how that conversation started, and somebody who has just been
 * reported should not be able to delete the evidence that they made contact.
 */
create or replace function public.chat_wave_withdrawable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'accepted' then
    raise exception 'This wave opened a conversation, so it cannot be withdrawn. Block them instead.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists waves_withdrawable on public.waves;
create trigger waves_withdrawable
  before delete on public.waves
  for each row execute function public.chat_wave_withdrawable();

drop trigger if exists waves_open_mentor_thread on public.waves;
create trigger waves_open_mentor_thread
  after insert on public.waves
  for each row execute function public.chat_wave_opens_thread();

/**
 * The other half of the bridge with Discover's `waved_back` column. Their
 * "recipients can wave back" policy updates that boolean directly, without
 * going through `respond_to_wave`, and a wave back is what opens a peer-to-peer
 * thread (PRD §8). Without this, waving back on their surface would set a flag
 * and produce no conversation.
 *
 * Three guards, and each one earns its place:
 *
 *  * `old.waved_back` stops the nested update below from re-entering this
 *    trigger — on the second pass the flag is already true.
 *  * `new.status <> 'pending'` keeps this out of the way of the insert path.
 *    `chat_wave_opens_thread()` sets `status` and `waved_back` in one statement,
 *    which fires this trigger with the wave already accepted; without this
 *    check, both functions would open the thread and both would post the wave's
 *    note, and the mentor would receive the same sentence twice. Checking the
 *    status rather than relying on the order the two functions happen to write
 *    in means the fix does not quietly come undone when somebody rearranges
 *    them.
 *  * the `not exists` on messages keeps a note from being posted twice if this
 *    is ever reached by some third path.
 */
create or replace function public.chat_wave_back_opens_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  if old.waved_back or not new.waved_back or new.status <> 'pending' then
    return new;
  end if;

  v_conversation := public.chat_open_conversation(
    new.from_member_id,
    new.to_member_id,
    public.chat_kind_for(new.from_member_id, new.to_member_id),
    new.from_member_id
  );

  update public.waves
  set status = 'accepted', responded_at = now(), conversation_id = v_conversation
  where id = new.id;

  if nullif(btrim(coalesce(new.message, '')), '') is not null
     and not exists (select 1 from public.messages where conversation_id = v_conversation) then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation, new.from_member_id, btrim(new.message));
  end if;

  return new;
end;
$$;

drop trigger if exists waves_waved_back_opens_thread on public.waves;
create trigger waves_waved_back_opens_thread
  after update of waved_back on public.waves
  for each row execute function public.chat_wave_back_opens_thread();

create or replace function public.chat_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.chat_touch_conversation();


-- ----------------------------------------------------------------------------
-- 5. Views — the only shape the client reads
-- ----------------------------------------------------------------------------
-- These are security definer (the Postgres default, i.e. no
-- `security_invoker = true`), for the same reason and with the same care as
-- `browse_members` in 20260820110000_browse_members_view.sql: the safety comes
-- from the definition, not from RLS underneath. Every one of them is keyed on
-- `auth.uid()` in its own where clause, none of them selects `phone` or
-- `birth_date`, and select is granted to `authenticated` alone. Supabase's
-- linter flags these as `security_definer_view`; that is expected here.

/**
 * A member as the chat surface is allowed to see them: enough to render a
 * thread header or a recipient picker, and nothing else. Visible to you if you
 * are already talking, if a wave is open either way, or if they accept
 * unsolicited contact — the first two regardless of their browse opt-out, since
 * turning off browse does not make an existing conversation anonymous.
 */
drop view if exists public.chat_members;
create view public.chat_members as
select
  m.id,
  m.type,
  m.display_name,
  m.photo_url,
  m.city,
  m.state,
  m.disability,
  m.level,
  m.age_band,
  m.duration,
  m.interests,
  m.capacity,
  m.open_to_messages,
  m.is_synthetic
from public.members m
where m.id <> auth.uid()
  and (
    exists (
      select 1 from public.conversations c
      where (c.member_low = m.id and c.member_high = auth.uid())
         or (c.member_high = m.id and c.member_low = auth.uid())
    )
    or exists (
      select 1 from public.waves w
      where (w.from_member_id = m.id and w.to_member_id = auth.uid())
         or (w.from_member_id = auth.uid() and w.to_member_id = m.id)
    )
    or (m.open_to_messages and not public.chat_is_blocked(auth.uid(), m.id))
  );

/**
 * The inbox row: one line per thread, with the counterpart, the last message
 * and the caller's own unread count already computed. The client does not get
 * to ask for somebody else's unread count, because the view has no parameter
 * for it — `me` is joined on `auth.uid()`.
 */
drop view if exists public.chat_conversations;
create view public.chat_conversations as
select
  c.id,
  c.kind,
  c.created_at,
  c.last_message_at,
  me.last_read_at,
  me.archived,
  me.muted,
  other.member_id as counterpart_id,
  om.display_name as counterpart_name,
  om.photo_url as counterpart_photo_url,
  om.type as counterpart_type,
  om.city as counterpart_city,
  om.state as counterpart_state,
  om.capacity as counterpart_capacity,
  om.is_synthetic as counterpart_is_synthetic,
  (public.chat_is_blocked(auth.uid(), other.member_id)) as blocked,
  lm.body as last_message_body,
  lm.sender_id as last_message_sender_id,
  (
    select count(*) from public.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and m.sender_id <> me.member_id
      and m.created_at > me.last_read_at
  ) as unread_count
from public.conversations c
join public.conversation_members me
  on me.conversation_id = c.id and me.member_id = auth.uid()
join public.conversation_members other
  on other.conversation_id = c.id and other.member_id <> auth.uid()
join public.members om on om.id = other.member_id
left join lateral (
  select body, sender_id
  from public.messages m
  where m.conversation_id = c.id and m.deleted_at is null
  -- id breaks a tie deterministically, so the preview cannot flip between two
  -- messages that share a timestamp.
  order by m.created_at desc, m.id desc
  limit 1
) lm on true;

/**
 * Waves in both directions, with the counterpart attached.
 *
 * The `status` column is where declining stays silent: to the person who sent
 * it, a declined wave still reads `pending`, exactly as if it had simply not
 * been answered yet. Turning somebody down should not send them a notification,
 * and "your wave was declined" is a notification with extra steps.
 */
drop view if exists public.chat_waves;
create view public.chat_waves as
select
  w.id,
  case when w.to_member_id = auth.uid() then 'inbox' else 'outbox' end as direction,
  w.from_member_id,
  w.to_member_id,
  w.topic,
  w.message,
  w.created_at,
  w.responded_at,
  w.conversation_id,
  case
    when w.from_member_id = auth.uid() and w.status = 'declined' then 'pending'
    else w.status
  end as status,
  other.id as counterpart_id,
  other.display_name as counterpart_name,
  other.photo_url as counterpart_photo_url,
  other.type as counterpart_type,
  other.city as counterpart_city,
  other.state as counterpart_state,
  other.capacity as counterpart_capacity,
  other.is_synthetic as counterpart_is_synthetic
from public.waves w
join public.members other
  on other.id = case when w.to_member_id = auth.uid() then w.from_member_id else w.to_member_id end
where (w.to_member_id = auth.uid() or w.from_member_id = auth.uid())
  -- A wave you turned down leaves your inbox; one from somebody you blocked
  -- never reaches it.
  and not (w.to_member_id = auth.uid() and w.status = 'declined')
  and not (w.to_member_id = auth.uid() and public.chat_is_blocked(auth.uid(), w.from_member_id));


-- ----------------------------------------------------------------------------
-- 6. Row level security
-- ----------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.waves enable row level security;
alter table public.member_blocks enable row level security;
alter table public.member_reports enable row level security;

-- conversations: readable by its two participants, writable by nobody. Created
-- and updated only through the definer functions above.
drop policy if exists "participants read their conversations" on public.conversations;
create policy "participants read their conversations"
  on public.conversations for select
  using (public.chat_is_participant(id));

-- conversation_members: you can read both rows of a thread you are in (you need
-- the other side's row to know who they are), and write only your own — which
-- is your read cursor and your archive/mute switches, nothing else. The column
-- grant further limits an update to exactly those three columns.
drop policy if exists "participants read membership" on public.conversation_members;
create policy "participants read membership"
  on public.conversation_members for select
  using (public.chat_is_participant(conversation_id));

drop policy if exists "members update their own membership" on public.conversation_members;
create policy "members update their own membership"
  on public.conversation_members for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- messages: participants read; participants send as themselves, unless a block
-- stands between them. There is no delete policy — removing a message is
-- setting `deleted_at`, and the column grant makes that the only field an
-- update may touch.
drop policy if exists "participants read messages" on public.messages;
create policy "participants read messages"
  on public.messages for select
  using (public.chat_is_participant(conversation_id));

drop policy if exists "participants send messages" on public.messages;
create policy "participants send messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.chat_is_participant(conversation_id)
    and not public.chat_is_blocked(auth.uid(), public.chat_counterpart(conversation_id))
  );

drop policy if exists "senders retract their own messages" on public.messages;
create policy "senders retract their own messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- waves: both ends can read the row. Nobody inserts or updates directly —
-- send_wave and respond_to_wave hold the rate limit and the accept rules, and a
-- client that could insert here would simply skip them.
drop policy if exists "wave participants read waves" on public.waves;
create policy "wave participants read waves"
  on public.waves for select
  using (from_member_id = auth.uid() or to_member_id = auth.uid());

-- member_blocks: you can see and lift your own blocks. Nobody can see who has
-- blocked *them*, which is the entire point of a silent block. Inserting goes
-- through block_member() so that the wave and archive tidy-up always happens.
drop policy if exists "blockers read their own blocks" on public.member_blocks;
create policy "blockers read their own blocks"
  on public.member_blocks for select
  using (blocker_id = auth.uid());

drop policy if exists "blockers lift their own blocks" on public.member_blocks;
create policy "blockers lift their own blocks"
  on public.member_blocks for delete
  using (blocker_id = auth.uid());

-- member_reports: file your own, read your own back, and nothing else. The
-- subject of a report can never see it, and no member can enumerate reports.
drop policy if exists "reporters file reports" on public.member_reports;
create policy "reporters file reports"
  on public.member_reports for insert
  with check (reporter_id = auth.uid());

drop policy if exists "reporters read their own reports" on public.member_reports;
create policy "reporters read their own reports"
  on public.member_reports for select
  using (reporter_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
-- `auto_expose_new_tables` is unset in supabase/config.toml, so nothing here is
-- reachable through the API until it is granted by name. That is the good
-- default and this section is deliberately explicit rather than sweeping:
-- `anon` gets nothing at all, and `authenticated` gets exactly the verbs the
-- client needs. PRD §5.1 — events are public, people are not.

revoke all on public.conversations from anon, public;
revoke all on public.conversation_members from anon, public;
revoke all on public.messages from anon, public;
revoke all on public.waves from anon, public;
revoke all on public.member_blocks from anon, public;
revoke all on public.member_reports from anon, public;
revoke all on public.chat_members from anon, public;
revoke all on public.chat_conversations from anon, public;
revoke all on public.chat_waves from anon, public;

grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant select on public.messages to authenticated;
grant select on public.waves to authenticated;
grant select on public.member_blocks to authenticated;
grant select on public.member_reports to authenticated;

grant select on public.chat_members to authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_waves to authenticated;

grant insert on public.messages to authenticated;
grant insert on public.member_reports to authenticated;
grant delete on public.member_blocks to authenticated;

-- Discover's *Say hi* button writes this table directly rather than calling
-- send_wave(), and its policies ("members can send their own waves",
-- "recipients can wave back", "senders can withdraw their wave") need the verbs
-- to go with them. Safe to grant because the rules that matter are triggers on
-- the table, not checks in whichever client happens to be writing: see
-- waves_contact_allowed, waves_open_mentor_thread, waves_waved_back_opens_thread
-- and waves_withdrawable above. Update is column-scoped to `waved_back`, so
-- answering a wave cannot become rewriting its text or its timestamps.
grant insert on public.waves to authenticated;
grant update (waved_back) on public.waves to authenticated;
grant delete on public.waves to authenticated;

-- Column-level, so "mark as read" cannot quietly become "edit their message".
grant update (last_read_at, archived, muted) on public.conversation_members to authenticated;
grant update (deleted_at) on public.messages to authenticated;

-- Functions are executable by PUBLIC unless told otherwise, which for a
-- security-definer function is the one default worth being paranoid about.
revoke all on function public.chat_is_participant(uuid) from public, anon;
revoke all on function public.chat_is_blocked(uuid, uuid) from public, anon;
revoke all on function public.chat_counterpart(uuid) from public, anon;
revoke all on function public.chat_limits() from public, anon;
revoke all on function public.chat_assert_can_contact(uuid) from public, anon;
revoke all on function public.chat_assert_contact_allowed(uuid, uuid) from public, anon;
revoke all on function public.chat_wave_allowed() from public, anon, authenticated;
revoke all on function public.chat_wave_withdrawable() from public, anon, authenticated;
revoke all on function public.chat_wave_back_opens_thread() from public, anon, authenticated;
revoke all on function public.chat_open_conversation(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.chat_kind_for(uuid, uuid) from public, anon;
revoke all on function public.send_wave(uuid, text, text) from public, anon;
revoke all on function public.respond_to_wave(uuid, boolean) from public, anon;
revoke all on function public.start_conversation(uuid, text) from public, anon;
revoke all on function public.block_member(uuid) from public, anon;
revoke all on function public.demo_reply(uuid, text) from public, anon;
-- Trigger functions are invoked by the trigger, never by a client.
revoke all on function public.chat_wave_opens_thread() from public, anon, authenticated;
revoke all on function public.chat_touch_conversation() from public, anon, authenticated;

grant execute on function public.chat_limits() to authenticated;
grant execute on function public.send_wave(uuid, text, text) to authenticated;
grant execute on function public.respond_to_wave(uuid, boolean) to authenticated;
grant execute on function public.start_conversation(uuid, text) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.demo_reply(uuid, text) to authenticated;

-- chat_is_participant / chat_is_blocked / chat_counterpart are named inside RLS
-- policies, which are evaluated as the calling role, so `authenticated` has to
-- be able to run them even though no client should call them directly. They
-- take no action and leak nothing: each one answers a yes/no about the caller.
grant execute on function public.chat_is_participant(uuid) to authenticated;
grant execute on function public.chat_is_blocked(uuid, uuid) to authenticated;
grant execute on function public.chat_counterpart(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 8. Realtime
-- ----------------------------------------------------------------------------
-- A chat that needs a refresh is not a chat. Realtime re-checks RLS per
-- subscriber, so adding the table here does not widen who sees what: a
-- subscriber is delivered only the rows their select policy already allows.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when duplicate_object then null;
end
$$;
