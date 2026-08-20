-- Behavioural tests for 20260820150000_peer_bot.sql, run as the real client
-- roles with a real auth.uid(). Assumes a fresh database: apply
-- 00_bare_postgres_stub.sql, then 20260820140000_chat_messaging.sql, then
-- 20260820150000_peer_bot.sql. See README.md.

create or replace function pg_temp.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'pass: %', msg;
end $$;

create or replace function pg_temp.raises(stmt text, pattern text, msg text) returns void
language plpgsql as $$
declare v_err text;
begin
  begin
    execute stmt;
    raise exception 'FAIL: % (expected an error, none raised)', msg;
  exception
    when others then
      v_err := sqlerrm;
      if v_err like 'FAIL:%' then raise; end if;
      if v_err not like pattern then
        raise exception 'FAIL: % (wrong error: %)', msg, v_err;
      end if;
      raise notice 'pass: % [%]', msg, v_err;
  end;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into public.members
  (id, type, display_name, phone, birth_date, age_band, disability, duration, city, state,
   open_to_messages, capacity, is_synthetic)
values
  ('11111111-1111-1111-1111-111111111111', 'peer', 'Alma Testwood', '+15555550101', '1985-01-01', '40-49', 'SCI - para', '3 - 10 years', 'Boise', 'Idaho', true, null, false),
  ('22222222-2222-2222-2222-222222222222', 'peer', 'Bex Fakeman',   '+15555550102', '1990-01-01', '30-39', 'SCI - quad', '1 - 3 years',  'Reno',  'Nevada', true, null, false);

select pg_temp.ok(
  (select is_bot and is_synthetic and open_to_messages and not show_in_browse
   from public.members where id = public.peer_bot_id()),
  'Peer Bot is bot + synthetic, reachable in Connect, absent from Discover');

-- --------------------------------------------------------------- waving at it
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select send_wave(public.peer_bot_id(), 'Adaptive sports', 'Where can I try handcycling?');

select pg_temp.ok(
  (select status = 'accepted' from public.waves where to_member_id = public.peer_bot_id()),
  'waving at Peer Bot is answered immediately, same as an open mentor');
select pg_temp.ok(
  (select count(*) = 1 from public.conversations
   where member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')),
  'exactly one thread opens between the two of them');
select pg_temp.ok(
  (select kind = 'peer' from public.chat_conversations where counterpart_id = public.peer_bot_id()),
  'a thread with Peer Bot is kind=peer, not kind=mentor — it is not pretending to be a volunteer');

select pg_temp.ok(
  (select m.body from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and m.sender_id = public.peer_bot_id()
   order by m.created_at, m.id limit 1)
  like 'Hi, I''m Peer Bot.%',
  'Peer Bot greets first, before anything else it says');

select pg_temp.ok(
  (select count(*) from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and m.sender_id = '11111111-1111-1111-1111-111111111111') = 1,
  'the wave''s carried text still lands as the human''s message — the greeting does not swallow it (this is the guard fix)');

select pg_temp.ok(
  (select body = 'You can try handcycling with AbleBodied! Visit https://ablebodied.org/ for more details.'
   from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and m.sender_id = public.peer_bot_id()
   order by m.created_at desc, m.id desc limit 1),
  'the exact handcycling question gets the AbleBodied answer, not a joke');

select pg_temp.ok(
  (select count(*) from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')) = 3,
  'the thread holds exactly the greeting, the question, and the answer — nothing doubled');

-- ------------------------------------------------ anything else gets a joke
insert into public.messages (conversation_id, sender_id, body)
values (
  (select id from public.conversations
   where member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')),
  '11111111-1111-1111-1111-111111111111',
  'What''s the weather like today?'
);

select pg_temp.ok(
  (select body like 'Sorry, this bot isn''t available yet, check back later! For now, I hope you enjoy this joke: %'
   from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
     and m.sender_id = public.peer_bot_id()
   order by m.created_at desc, m.id desc limit 1),
  'anything else gets the "not available yet" line and a joke');

-- bot_jokes has no grant to `authenticated` at all (see the grants section of
-- the migration) — only chat_bot_reply() reads it, as its own owner. Checking
-- what the joke actually was needs the same access that function has, not the
-- access a signed-in member has.
reset role;
select pg_temp.ok(
  (select exists (
     select 1 from public.bot_jokes j
     where j.joke = substring(
       (select body from public.messages m
          join public.conversations c on c.id = m.conversation_id
        where c.member_low = least(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
          and c.member_high = greatest(public.peer_bot_id(), '11111111-1111-1111-1111-111111111111')
          and m.sender_id = public.peer_bot_id()
        order by m.created_at desc, m.id desc limit 1)
       from length('Sorry, this bot isn''t available yet, check back later! For now, I hope you enjoy this joke: ') + 1
     )
   )),
  'the joke told is one of the fifty prewritten ones, not made up on the spot');

-- The question was case-different and had extra whitespace — "exactly" still
-- matches it, because a bot that only understands one exact capitalization of
-- one sentence is not very convincing.
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select start_conversation(public.peer_bot_id(), '  where CAN i try HANDCYCLING?  ');

select pg_temp.ok(
  (select body = 'You can try handcycling with AbleBodied! Visit https://ablebodied.org/ for more details.'
   from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '22222222-2222-2222-2222-222222222222')
     and c.member_high = greatest(public.peer_bot_id(), '22222222-2222-2222-2222-222222222222')
     and m.sender_id = public.peer_bot_id()
   order by m.created_at desc, m.id desc limit 1),
  'the match is trimmed and case-insensitive, so a real typed question still hits it');

select pg_temp.ok(
  (select count(*) from public.messages m
     join public.conversations c on c.id = m.conversation_id
   where c.member_low = least(public.peer_bot_id(), '22222222-2222-2222-2222-222222222222')
     and c.member_high = greatest(public.peer_bot_id(), '22222222-2222-2222-2222-222222222222')) = 3,
  'writing first also greets, then answers — the greeting is not wave-only');

-- --------------------------------------------------- who else reaches the jokes
-- Nobody — not even a signed-in member. Only chat_bot_reply() reads this
-- table, running as its own owner, which is why no grant to `authenticated`
-- exists at all.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.raises(
  $$ select count(*) from public.bot_jokes $$,
  '%permission denied%',
  'a signed-in member cannot read the joke list directly');

reset role;
set local role anon;

select pg_temp.raises(
  $$ select count(*) from public.bot_jokes $$,
  '%permission denied%',
  'anon cannot read the joke list');

select 'ALL TESTS PASSED' as result;
