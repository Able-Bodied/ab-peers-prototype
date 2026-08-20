-- Behavioural tests for 20260820140000_chat_messaging.sql, run as the real
-- client roles with a real auth.uid(). Assumes a fresh database: apply
-- 00_bare_postgres_stub.sql and then the migration. See README.md.

create or replace function pg_temp.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'pass: %', msg;
end $$;

-- Asserts that a statement raises, and that the message looks like `pattern`.
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
-- Obviously-fake people, per docs/PII.md.
insert into public.members
  (id, type, display_name, phone, birth_date, age_band, disability, duration, city, state,
   open_to_messages, capacity, is_synthetic)
values
  ('11111111-1111-1111-1111-111111111111', 'peer',   'Alma Testwood',  '+15555550101', '1985-01-01', '40-49', 'SCI - para', '3 - 10 years', 'Boise',   'Idaho',      true,  null,          false),
  ('22222222-2222-2222-2222-222222222222', 'peer',   'Bex Fakeman',    '+15555550102', '1990-01-01', '30-39', 'SCI - quad', '1 - 3 years',  'Reno',    'Nevada',     true,  null,          false),
  ('33333333-3333-3333-3333-333333333333', 'mentor', 'Mira Notreal',   '+15555550103', '1975-01-01', '50-59', 'SCI - para', '10+ years',    'Denver',  'Colorado',   true,  'open',        false),
  ('44444444-4444-4444-4444-444444444444', 'mentor', 'Pax Placebo',    '+15555550104', '1970-01-01', '50-59', 'SCI - quad', '10+ years',    'Austin',  'Texas',      true,  'at capacity', false),
  ('55555555-5555-5555-5555-555555555555', 'peer',   'Quill Madeup',   '+15555550105', '1995-01-01', '30-39', 'TBI',        '1 - 3 years',  'Portland','Oregon',     false, null,          false),
  ('66666666-6666-6666-6666-666666666666', 'peer',   'Sim Synthetic',  '+15555550106', '1992-01-01', '30-39', 'SCI - para', '3 - 10 years', 'Tempe',   'Arizona',    true,  null,          true),
  ('77777777-7777-7777-7777-777777777777', 'peer',   'Rex Outsider',   '+15555550107', '1988-01-01', '30-39', 'Amputee',    '10+ years',    'Miami',   'Florida',    true,  null,          false);

-- The migration's backfill ran before these rows existed, so confirm the new
-- default (opt-out, not opt-in) is what a freshly inserted member gets.
insert into public.members
  (id, display_name, phone, birth_date, age_band, disability, duration, city, state)
values
  ('88888888-8888-8888-8888-888888888888', 'Dee Default', '+15555550108', '1991-01-01', '30-39', 'MS', '1 - 3 years', 'Salem', 'Oregon');

select pg_temp.ok(
  (select open_to_messages from public.members where id = '88888888-8888-8888-8888-888888888888'),
  'a new member is reachable by default (unsolicited contact is opt-out)');

-- ------------------------------------------------------- peer to peer wave
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.ok(
  (select count(*) = 1 from public.members),
  'members RLS is untouched: a member still selects exactly their own row');

select send_wave('22222222-2222-2222-2222-222222222222', 'Transfers', 'Hi, mind if I ask about transfers?');

select pg_temp.ok(
  (select status = 'pending' from public.waves where to_member_id = '22222222-2222-2222-2222-222222222222'),
  'peer to peer, a wave sits pending — no thread yet');
select pg_temp.ok(
  (select count(*) = 0 from public.conversations),
  'peer to peer, a wave opens no conversation');
select pg_temp.ok(
  (select direction = 'outbox' from public.chat_waves where to_member_id = '22222222-2222-2222-2222-222222222222'),
  'the sender sees their wave in the outbox');

select pg_temp.raises(
  $$ select send_wave('22222222-2222-2222-2222-222222222222') $$,
  '%already waved%',
  'a second wave at the same person is refused');

-- Bex answers.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok(
  (select direction = 'inbox' and counterpart_name = 'Alma Testwood' and topic = 'Transfers'
   from public.chat_waves),
  'the wave lands in the recipient inbox with its topic and sender');

select respond_to_wave((select id from public.waves), true);

select pg_temp.ok((select count(*) = 1 from public.chat_conversations),
  'waving back opens the thread');
select pg_temp.ok(
  (select last_message_body = 'Hi, mind if I ask about transfers?' and last_message_sender_id = '11111111-1111-1111-1111-111111111111'
   from public.chat_conversations),
  'a wave that carried a sentence becomes the first message');
select pg_temp.ok((select unread_count = 1 from public.chat_conversations),
  'that first message is unread for the person who accepted');
select pg_temp.ok((select kind = 'peer' from public.chat_conversations),
  'a peer-to-peer thread is kind=peer');

-- Reading it clears the count.
-- clock_timestamp(), not now(): the whole suite runs in one transaction, so
-- now() is frozen at its start and would sit *before* the message just written.
update public.conversation_members set last_read_at = clock_timestamp() where member_id = auth.uid();
select pg_temp.ok((select unread_count = 0 from public.chat_conversations),
  'moving the read cursor clears the unread count');

-- ------------------------------------------------------- messaging in-thread
insert into public.messages (conversation_id, sender_id, body)
values ((select id from public.conversations), auth.uid(), 'Of course — ask away.');

select pg_temp.ok((select count(*) = 2 from public.messages), 'a participant can post to the thread');
select pg_temp.ok(
  (select c.last_message_at = (select max(m.created_at) from public.messages m where m.conversation_id = c.id)
   from public.conversations c),
  'posting bumps last_message_at to the newest message, so the inbox sorts correctly');

select pg_temp.raises(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ((select id from public.conversations), '11111111-1111-1111-1111-111111111111', 'not me') $$,
  '%row-level security%',
  'a participant cannot post as the other participant');

select pg_temp.raises(
  $$ update public.messages set body = 'tampered' where sender_id = auth.uid() $$,
  '%permission denied%',
  'the column grant stops a message body being edited after the fact');

update public.messages set deleted_at = now() where sender_id = auth.uid();
select pg_temp.ok(true, 'a sender can retract (soft delete) their own message');

-- ------------------------------------------------------- outsiders
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select pg_temp.ok((select count(*) = 0 from public.messages),
  'a non-participant reads none of the thread''s messages');
select pg_temp.ok((select count(*) = 0 from public.conversations),
  'a non-participant does not see the conversation exists');
select pg_temp.ok((select count(*) = 0 from public.chat_conversations),
  'the inbox view shows a non-participant nothing');
select pg_temp.raises(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ((select id from public.conversations where true limit 1), auth.uid(), 'hello?') $$,
  '%',
  'a non-participant cannot post into somebody else''s thread');

-- ------------------------------------------------------- mentors & capacity
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select send_wave('33333333-3333-3333-3333-333333333333', 'Travel & flying', null);

select pg_temp.ok(
  (select status = 'accepted' and conversation_id is not null
   from public.waves where to_member_id = '33333333-3333-3333-3333-333333333333'),
  'a wave at an open mentor opens the thread immediately — no mutual match');
select pg_temp.ok(
  (select kind = 'mentor' from public.conversations
   where id = (select conversation_id from public.waves where to_member_id = '33333333-3333-3333-3333-333333333333')),
  'a thread with a mentor in it is kind=mentor');

select pg_temp.raises(
  $$ select send_wave('44444444-4444-4444-4444-444444444444') $$,
  '%at capacity%',
  'a mentor at capacity takes no new conversations');
select pg_temp.raises(
  $$ select start_conversation('44444444-4444-4444-4444-444444444444', 'please') $$,
  '%at capacity%',
  'capacity is enforced on the message-first path too, not just on waves');

select pg_temp.raises(
  $$ select send_wave('55555555-5555-5555-5555-555555555555') $$,
  '%not accepting new messages%',
  'somebody who turned off unsolicited contact cannot be waved at');

select pg_temp.raises(
  $$ select send_wave('11111111-1111-1111-1111-111111111111') $$,
  '%yourself%',
  'you cannot wave at yourself');

-- -------------------------------------------------------- message first
select start_conversation('66666666-6666-6666-6666-666666666666', 'Hi! Saw you handcycle too.');
select pg_temp.ok(
  (select count(*) = 1 from public.chat_conversations where counterpart_id = '66666666-6666-6666-6666-666666666666'),
  'you can write first without waving');

-- The prototype-only reply hatch, so a demo thread has two sides.
select demo_reply(
  (select id from public.chat_conversations where counterpart_id = '66666666-6666-6666-6666-666666666666'),
  'I do! Mostly Tempe canal paths.');
select pg_temp.ok(
  (select last_message_sender_id = '66666666-6666-6666-6666-666666666666'
   from public.chat_conversations where counterpart_id = '66666666-6666-6666-6666-666666666666'),
  'demo_reply posts as the synthetic counterpart');
select pg_temp.raises(
  $$ select demo_reply((select id from public.chat_conversations where counterpart_id = '22222222-2222-2222-2222-222222222222'), 'nope') $$,
  '%synthetic%',
  'demo_reply refuses to post as a real member''s account');

-- -------------------------------------------------------- declining is silent
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select send_wave('11111111-1111-1111-1111-111111111111', null, 'hi');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select respond_to_wave(
  (select id from public.waves where from_member_id = '77777777-7777-7777-7777-777777777777'), false);
select pg_temp.ok(
  (select count(*) = 0 from public.chat_waves where counterpart_id = '77777777-7777-7777-7777-777777777777'),
  'a declined wave leaves the recipient''s inbox');

set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select pg_temp.ok(
  (select status = 'pending' from public.chat_waves where counterpart_id = '11111111-1111-1111-1111-111111111111'),
  'the sender is never told it was declined — it still reads pending');
select pg_temp.raises(
  $$ select send_wave('11111111-1111-1111-1111-111111111111') $$,
  '%not accepting new messages%',
  'and they cannot immediately wave again');

-- -------------------------------------------------------- blocking
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select block_member('11111111-1111-1111-1111-111111111111');
select pg_temp.ok((select archived from public.chat_conversations), 'blocking archives the thread on the blocker''s side');
select pg_temp.ok((select blocked from public.chat_conversations), 'and the thread reports itself as blocked');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok(
  (select not archived from public.chat_conversations where counterpart_id = '22222222-2222-2222-2222-222222222222'),
  'blocking is silent: nothing changes on the blocked person''s side of the thread');
select pg_temp.raises(
  $$ insert into public.messages (conversation_id, sender_id, body)
     values ((select id from public.chat_conversations where counterpart_id = '22222222-2222-2222-2222-222222222222'), auth.uid(), 'hello?') $$,
  '%row-level security%',
  'but their messages no longer land');
select pg_temp.ok(
  (select count(*) = 0 from public.member_blocks),
  'and they cannot see that a block exists');

-- -------------------------------------------------------- rate limiting
-- Fixture rows go in as the owner; the stub members table has no insert policy.
reset role;
do $$
declare i int; v_id uuid;
begin
  for i in 1..21 loop
    v_id := ('99999999-9999-9999-9999-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.members (id, display_name, phone, birth_date, age_band, disability, duration, city, state)
    values (v_id, 'Filler ' || i, '+1555555' || lpad(i::text, 4, '0'), '1990-01-01', '30-39', 'SCI - para', '10+ years', 'Reno', 'Nevada');
  end loop;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
do $$
declare i int; v_id uuid;
begin
  for i in 1..20 loop
    v_id := ('99999999-9999-9999-9999-' || lpad(i::text, 12, '0'))::uuid;
    perform send_wave(v_id);
  end loop;
end $$;

select pg_temp.ok((select (chat_limits()->>'wavesSentToday')::int = 20),
  'chat_limits counts the waves sent in the last 24 hours');
select pg_temp.ok((select (chat_limits()->>'waveDailyLimit')::int = 20),
  'the cap the UI shows comes from the database, not a client constant');
select pg_temp.raises(
  $$ select send_wave('99999999-9999-9999-9999-000000000021') $$,
  '%limit of 20 waves%',
  'the twenty-first wave in a day is refused');

-- -------------------------------------------------------- what anon can reach
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.raises($$ select count(*) from public.messages $$, '%permission denied%', 'anon cannot read messages');
select pg_temp.raises($$ select count(*) from public.conversations $$, '%permission denied%', 'anon cannot read conversations');
select pg_temp.raises($$ select count(*) from public.chat_conversations $$, '%permission denied%', 'anon cannot read the inbox view');
select pg_temp.raises($$ select count(*) from public.chat_members $$, '%permission denied%', 'anon cannot read the member view');
select pg_temp.raises($$ select count(*) from public.waves $$, '%permission denied%', 'anon cannot read waves');
select pg_temp.raises($$ select send_wave('11111111-1111-1111-1111-111111111111') $$, '%permission denied%', 'anon cannot wave');

-- -------------------------------------------------------- what the views expose
reset role;
select pg_temp.ok(
  (select count(*) = 0 from information_schema.columns
   where table_schema = 'public' and table_name in ('chat_members', 'chat_conversations', 'chat_waves')
     and column_name in ('phone', 'birth_date')),
  'no chat view exposes phone or birth_date');

select pg_temp.ok(
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'members'
     and policyname not like '%own row%'),
  'the chat migration added no new policy to public.members');

select 'ALL TESTS PASSED' as result;
