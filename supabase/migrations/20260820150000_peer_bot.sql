-- ============================================================================
-- Peer Bot: an always-on synthetic member that answers waves and messages
-- ============================================================================
-- The manual "simulate a reply" control (`demo_reply()`, in the chat
-- migration) needs a tester to click it — it proves a thread can have two
-- sides, but it does not run on its own. Peer Bot is the automated version:
-- a single synthetic member, listened for by database triggers rather than a
-- person, so it answers a wave or a message the moment the row lands, with no
-- client open and no process to keep running. "The server" here is Postgres
-- itself — the triggers below ARE the listener.
--
-- Like every other row in `public.members`, Peer Bot has no `auth.users`
-- account behind it (that foreign key was dropped in
-- 20260820100000_members_discovery_profile.sql) and every `members` RLS
-- policy still reads `auth.uid() = id`, so it is readable through the chat
-- views and writable by nobody. It is `is_synthetic` for the same reason the
-- Discover demo population is, plus a new `is_bot` flag: `is_synthetic` alone
-- would also make it eligible for the manual `demo_reply()` control, and
-- showing a human tester a "simulate a reply" box next to a counterpart that
-- already replies on its own is just confusing — see the client-side check
-- next to `DemoReplyControl` in `src/routes/messages/thread-view.tsx`.
--
-- `demo_reply()` itself is untouched: it still refuses to post as anyone who
-- is not `is_synthetic`, so nothing here widens what a tester can fake.
-- ============================================================================

alter table public.members add column if not exists is_bot boolean not null default false;

comment on column public.members.is_bot is
  'A synthetic member with automated triggers behind it (Peer Bot), not just seed data a tester can fake replies for.';

-- ----------------------------------------------------------------------------
-- 1. The member row
-- ----------------------------------------------------------------------------
-- Id is `uuid_generate_v5(NAMESPACE_URL, 'ab-peers:member:peer_bot')` (computed
-- once, pasted as a literal below, same approach 20260820120000's generator
-- used for the other 65 seed rows) — stable across re-runs, and the same value
-- every environment gets, so a migration, a test fixture and a support ticket
-- can all say "peer bot" and mean the same id.
--
-- `type = 'peer'`: Peer Bot is not a volunteered, org-vouched mentor, so it
-- does not get the mentor-open instant-thread path (`chat_wave_opens_thread`
-- checks `type = 'mentor'`) — it gets its own instant-open path below instead,
-- scoped to `is_bot` rather than to type. `show_in_browse = false` keeps it out
-- of the Discover deck (a profile card with a `disability` field and an
-- `age_band` badge is not an honest way to present a bot); `open_to_messages =
-- true` is what actually matters, since that is what makes `chat_members` list
-- it in Connect's search, which is how a member finds it to say hello.
insert into public.members (
  id, type, display_name, phone, photo_url, photo_alt, avatar_color, city, state,
  disability, level, completeness, duration, duration_answered_on, years_since,
  birth_date, age_band, relationship, equipment, equipment_detail, sports_equipment,
  will_advise_on_equipment, grants, will_help_with_grants, languages, interests, topics,
  bio, employment, living, affiliations, verified_by, open_to_messages, capacity,
  show_in_browse, is_synthetic, is_bot
) values (
  '345c503b-3f8f-5a79-9ad6-ed8f982bec3a'::uuid,
  'peer',
  'Peer Bot',
  '+15555550999',
  null,
  null,
  '#2E5C8A',
  'On the app',
  'California',
  'Other',
  null,
  null,
  '10+ years',
  '2026-08-20'::date,
  null,
  '2000-01-01'::date,
  '20-29',
  'Self',
  '{}'::text[],
  null,
  '{}'::text[],
  false,
  '{}'::text[],
  false,
  array['English']::text[],
  '{}'::text[],
  '{}'::text[],
  'Automated. Answers waves and messages right away — ask about events or disability resources.',
  null,
  null,
  '{}'::text[],
  null,
  true,
  null,
  false,
  true,
  true
)
on conflict (id) do nothing;

create or replace function public.peer_bot_id()
returns uuid
language sql
immutable
as $$
  select '345c503b-3f8f-5a79-9ad6-ed8f982bec3a'::uuid;
$$;

-- ----------------------------------------------------------------------------
-- 2. Fifty jokes
-- ----------------------------------------------------------------------------
-- Only the security-definer trigger function below reads this table — it runs
-- as the function's owner, which is why no role needs a grant on it (see the
-- grants section). Nothing lighthearted keyed to disability, injury or
-- accidents: the fallback reply fires on literally anything a member types
-- while this bot is otherwise not available yet, so a joke that reads badly
-- against "I just broke my neck" is not a risk worth taking for a laugh.
create table if not exists public.bot_jokes (
  id serial primary key,
  joke text not null unique
);

alter table public.bot_jokes enable row level security;

insert into public.bot_jokes (joke) values
  ('Why don''t scientists trust atoms? Because they make up everything.'),
  ('I told my computer I needed a break. It froze immediately.'),
  ('Why did the scarecrow win an award? He was outstanding in his field.'),
  ('I used to be a baker. I just couldn''t make enough dough.'),
  ('What do you call fake spaghetti? An impasta.'),
  ('Why don''t eggs tell each other jokes? They''d crack each other up.'),
  ('I''m reading a book about anti-gravity. It''s impossible to put down.'),
  ('What do you call a bear with no teeth? A gummy bear.'),
  ('What do you call cheese that isn''t yours? Nacho cheese.'),
  ('Why can''t you give Elsa a balloon? She''ll let it go.'),
  ('I''m on a seafood diet. I see food and I eat it.'),
  ('What did the ocean say to the beach? Nothing, it just waved.'),
  ('Why did the coffee file a police report? It got mugged.'),
  ('How do you organize a space party? You planet.'),
  ('Why did the math book look sad? It had too many problems.'),
  ('I would tell you a chemistry joke, but I know I wouldn''t get a reaction.'),
  ('What''s orange and sounds like a parrot? A carrot.'),
  ('Why don''t skeletons fight each other? They don''t have the guts.'),
  ('I used to hate facial hair. Then it grew on me.'),
  ('What do you call a factory that makes okay products? A satisfactory.'),
  ('What do you call a can opener that doesn''t work? A can''t opener.'),
  ('I tried to catch some fog earlier. I mist.'),
  ('Why did the cookie go to the doctor? It was feeling crumbly.'),
  ('What do you call cheese by itself? Provolone.'),
  ('I asked my dog what''s two minus two. He said nothing.'),
  ('Why can''t you trust a pillow? It''s always full of fluff.'),
  ('What do you call a sleeping dinosaur? A dino-snore.'),
  ('I used to play piano by ear. Now I use my hands.'),
  ('Why did the tomato turn red? It saw the salad dressing.'),
  ('What did one wall say to the other? I''ll meet you at the corner.'),
  ('Why did the picture go to jail? It was framed.'),
  ('What do you call a belt made of watches? A waist of time.'),
  ('I stayed up all night wondering where the sun went. Then it dawned on me.'),
  ('What do you call a very small valentine? A valen-tiny.'),
  ('Why did the stadium get hot after the game? All the fans left.'),
  ('What do you call a boomerang that doesn''t come back? A stick.'),
  ('Why did the gym close down? It just didn''t work out.'),
  ('What do you call a pig that does karate? A pork chop.'),
  ('I turned down a job at the calendar factory. I just couldn''t take another day.'),
  ('Why did the student eat his homework? The teacher said it was a piece of cake.'),
  ('What do you call an alligator in a vest? An investigator.'),
  ('I told a joke about a roof once. It went over everyone''s head.'),
  ('Why did the music teacher need a ladder? To reach the high notes.'),
  ('What do you call a lazy kangaroo? A pouch potato.'),
  ('What do you call a dinosaur with a huge vocabulary? A thesaurus.'),
  ('Why do bees have sticky hair? Because they use honeycombs.'),
  ('What do you call a fish with no eyes? A fsh.'),
  ('I only know twenty-five letters of the alphabet. I don''t know why.'),
  ('What''s a computer''s favorite snack? Microchips.'),
  ('Why was the broom late? It swept in.')
on conflict (joke) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Behaviour
-- ----------------------------------------------------------------------------

/**
 * "They should be able to reply to waves." Peer to peer, a wave normally sits
 * pending until the recipient waves back by hand — Peer Bot has no hand, so
 * this does the waving back for it, the instant a wave naming it as the
 * recipient lands. Setting `waved_back = true` (rather than opening the thread
 * here directly) hands off to the existing `waves_waved_back_opens_thread`
 * trigger below, so there is exactly one place that knows how a peer-to-peer
 * thread opens, whether the other side is a human or this bot.
 */
create or replace function public.chat_bot_wave_back()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' or new.to_member_id <> public.peer_bot_id() then
    return new;
  end if;

  update public.waves set waved_back = true where id = new.id;

  return new;
end;
$$;

drop trigger if exists waves_bot_auto_wave_back on public.waves;
create trigger waves_bot_auto_wave_back
  after insert on public.waves
  for each row execute function public.chat_bot_wave_back();

/**
 * `chat_wave_back_opens_thread()` (20260820140000) skips re-posting the wave's
 * note if the thread already has a message in it — a guard against the insert
 * path and the wave-back path both posting the same sentence. Peer Bot's
 * greeting (below) also posts into a freshly opened conversation, and it does
 * so *inside* `chat_open_conversation()`, which this function calls before it
 * reaches that guard. Left as `not exists (select 1 from messages ...)`, the
 * greeting would satisfy the guard first and the human's own wave text would
 * be silently dropped. Scoping the check to "nothing from this sender yet"
 * keeps the original guard's intent — do not post the wave's note twice — and
 * also happens to be the more precise version of it: the previous version was
 * caller-agnostic where only its two possible callers (each posting on behalf
 * of a different sender) made that safe.
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
     and not exists (
       select 1 from public.messages
       where conversation_id = v_conversation and sender_id = new.from_member_id
     ) then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation, new.from_member_id, btrim(new.message));
  end if;

  return new;
end;
$$;

/**
 * "Then the first message reply should explain..." — fires once, the moment a
 * conversation naming Peer Bot as either side is created, regardless of which
 * of the three paths opened it (mentor-style open, wave-back, or writing
 * first): `conversations` gets exactly one row per member pair
 * (`chat_open_conversation`'s own `select ... if found then return` makes
 * re-opening a no-op), so this is a proper "first contact" hook rather than
 * something that has to be told not to repeat itself.
 */
create or replace function public.chat_bot_greet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_low <> public.peer_bot_id() and new.member_high <> public.peer_bot_id() then
    return new;
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (
    new.id,
    public.peer_bot_id(),
    'Hi, I''m Peer Bot. I can help answer questions — ask me to find events or share '
    || 'disability-related knowledge. Try asking me, "Where can I try handcycling?"'
  );

  return new;
end;
$$;

drop trigger if exists conversations_bot_greeting on public.conversations;
create trigger conversations_bot_greeting
  after insert on public.conversations
  for each row execute function public.chat_bot_greet();

/**
 * The two canned responses. Fires on every message posted into a conversation
 * Peer Bot is part of, except the ones Peer Bot itself just sent — without
 * that guard this replies to its own greeting and to its own canned reply, and
 * neither of those ever stops. The match on rule 1 is case-insensitive and
 * trimmed rather than a byte-for-byte comparison: "exactly" is about the
 * question being asked, not about whether somebody capitalized it or left a
 * trailing space, and a bot that only understands one exact capitalization of
 * one sentence is not a very convincing bot.
 */
create or replace function public.chat_bot_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_joke text;
  v_body text;
begin
  if new.sender_id = public.peer_bot_id() then
    return new;
  end if;

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = new.conversation_id and member_id = public.peer_bot_id()
  ) then
    return new;
  end if;

  if lower(btrim(new.body)) = lower('Where can I try handcycling?') then
    v_body := 'You can try handcycling with AbleBodied! Visit https://ablebodied.org/ for more details.';
  else
    select joke into v_joke from public.bot_jokes order by random() limit 1;
    v_body := 'Sorry, this bot isn''t available yet, check back later! For now, I hope you enjoy this joke: '
      || coalesce(v_joke, 'Why did the bot cross the road? It hadn''t learned that joke yet.');
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (new.conversation_id, public.peer_bot_id(), v_body);

  return new;
end;
$$;

drop trigger if exists messages_bot_reply on public.messages;
create trigger messages_bot_reply
  after insert on public.messages
  for each row execute function public.chat_bot_reply();

-- ----------------------------------------------------------------------------
-- 4. Views — add `is_bot` alongside `is_synthetic`
-- ----------------------------------------------------------------------------
-- Same three views as 20260820140000, redeclared whole (its own convention,
-- not a new one): Postgres allows `create or replace view` to append columns
-- but not to reorder them, and repeating the full `select` list here is the
-- same amount of work either way and stays readable next to the original.

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
  m.is_synthetic,
  m.is_bot
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
  om.is_bot as counterpart_is_bot,
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
  order by m.created_at desc, m.id desc
  limit 1
) lm on true;

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
  other.is_synthetic as counterpart_is_synthetic,
  other.is_bot as counterpart_is_bot
from public.waves w
join public.members other
  on other.id = case when w.to_member_id = auth.uid() then w.from_member_id else w.to_member_id end
where (w.to_member_id = auth.uid() or w.from_member_id = auth.uid())
  and not (w.to_member_id = auth.uid() and w.status = 'declined')
  and not (w.to_member_id = auth.uid() and public.chat_is_blocked(auth.uid(), w.from_member_id));

-- ----------------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------------
-- Views are re-created above, which resets their grants, so these need
-- restating even though they are unchanged from 20260820140000.
revoke all on public.chat_members from anon, public;
revoke all on public.chat_conversations from anon, public;
revoke all on public.chat_waves from anon, public;
grant select on public.chat_members to authenticated;
grant select on public.chat_conversations to authenticated;
grant select on public.chat_waves to authenticated;

-- `bot_jokes` is read only by chat_bot_reply(), which runs as the function's
-- owner and so needs no grant of its own — see the file header. No role,
-- including `authenticated`, gets one, and RLS with zero policies means even
-- the owner's own client role would see no rows through PostgREST if it ever
-- were granted one by mistake.
revoke all on public.bot_jokes from anon, public, authenticated;

-- `peer_bot_id()` is called from inside the trigger functions below, which run
-- as their own owner regardless of grants. Nothing in the client calls it
-- either, but unlike those trigger functions it is a constant with no data or
-- side effect behind it — the same category as `chat_kind_for` and friends
-- below, which get a grant only because something other than a client button
-- needs to invoke them. Here that something is `supabase/tests/`.
revoke all on function public.peer_bot_id() from public, anon;
revoke all on function public.chat_bot_wave_back() from public, anon, authenticated;
revoke all on function public.chat_bot_greet() from public, anon, authenticated;
revoke all on function public.chat_bot_reply() from public, anon, authenticated;
grant execute on function public.peer_bot_id() to authenticated;
