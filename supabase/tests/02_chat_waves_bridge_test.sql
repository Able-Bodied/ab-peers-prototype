-- Does the chat migration adapt to Discover's `waves` table, which is already
-- applied on the shared database? Apply, in this order:
--   00_bare_postgres_stub.sql
--   ../migrations/20260820130000_waves.sql      (Discover's, first — that is the point)
--   ../migrations/20260820140000_chat_messaging.sql
-- then this file. See README.md.

create or replace function pg_temp.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'pass: %', msg;
end $$;

insert into public.members
  (id, type, display_name, phone, birth_date, age_band, disability, duration, city, state,
   open_to_messages, capacity, is_synthetic)
values
  ('11111111-1111-1111-1111-111111111111', 'peer',   'Alma Testwood', '+15555550101', '1985-01-01', '40-49', 'SCI - para', '3 - 10 years', 'Boise',  'Idaho',    true, null,   false),
  ('22222222-2222-2222-2222-222222222222', 'peer',   'Bex Fakeman',   '+15555550102', '1990-01-01', '30-39', 'SCI - quad', '1 - 3 years',  'Reno',   'Nevada',   true, null,   false),
  ('33333333-3333-3333-3333-333333333333', 'mentor', 'Mira Notreal',  '+15555550103', '1975-01-01', '50-59', 'SCI - para', '10+ years',    'Denver', 'Colorado', true, 'open', false);

select pg_temp.ok(
  (select count(*) = 2 from information_schema.columns
   where table_schema = 'public' and table_name = 'waves'
     and column_name in ('waved_back', 'status')),
  'both representations of "was it answered" exist on the shared table');

-- ------------------------------------------------- Discover's path: a direct
-- insert into waves, with no RPC involved at all.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.waves (from_member_id, to_member_id, topic)
values (auth.uid(), '22222222-2222-2222-2222-222222222222', 'Transfers');

select pg_temp.ok(
  (select status = 'pending' and conversation_id is null from public.waves),
  'a peer-to-peer wave inserted directly still waits for an answer');

-- Discover's own "wave back": flipping the boolean, not calling respond_to_wave.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.waves set waved_back = true
where to_member_id = auth.uid();

select pg_temp.ok(
  (select count(*) = 1 from public.chat_conversations),
  'waving back through Discover''s boolean opens a real thread');
select pg_temp.ok(
  (select status = 'accepted' and conversation_id is not null from public.waves),
  'and the wave is reconciled to accepted, with the thread attached');

-- ------------------------------------------------- the mentor asymmetry, via
-- a direct insert rather than send_wave
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.waves (from_member_id, to_member_id, message)
values (auth.uid(), '33333333-3333-3333-3333-333333333333', 'Hoping to ask about flying.');

select pg_temp.ok(
  (select status = 'accepted' and waved_back and conversation_id is not null
   from public.waves where to_member_id = '33333333-3333-3333-3333-333333333333'),
  'a wave at an open mentor opens the thread even when Discover inserts it directly');
select pg_temp.ok(
  (select count(*) = 1 from public.messages m
   join public.waves w on w.conversation_id = m.conversation_id
   where w.to_member_id = '33333333-3333-3333-3333-333333333333'),
  'the note the wave carried became the thread''s first message, exactly once');

-- Their rate-limit trigger is still the one guarding a direct insert.
select pg_temp.ok(
  (select tgname is not null from pg_trigger where tgname = 'waves_rate_limit'),
  'Discover''s rate-limit trigger survives this migration');

-- ------------------------------------------------- the direct path is guarded
-- This is the point of the trigger: the rules must hold on the insert that does
-- not go anywhere near send_wave().
do $$
declare v_err text;
begin
  update public.members set open_to_messages = false
  where id = '22222222-2222-2222-2222-222222222222';
exception when others then null;
end $$;

reset role;
update public.members set open_to_messages = false
where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';

reset role;
insert into public.members (id, display_name, phone, birth_date, age_band, disability, duration, city, state)
values ('77777777-7777-7777-7777-777777777777', 'Rex Outsider', '+15555550107', '1988-01-01', '30-39', 'Amputee', '10+ years', 'Miami', 'Florida');
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';

do $$
begin
  insert into public.waves (from_member_id, to_member_id)
  values (auth.uid(), '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: a direct insert reached somebody who turned contact off';
exception
  when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%not accepting new messages%' then
      raise exception 'FAIL: wrong error on the direct path: %', sqlerrm;
    end if;
    raise notice 'pass: the direct insert path is refused by the same rule the RPC applies';
end $$;

-- Blocking must hold on the direct path too.
reset role;
update public.members set open_to_messages = true
where id = '22222222-2222-2222-2222-222222222222';
insert into public.member_blocks (blocker_id, blocked_id)
values ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777');
set local role authenticated;
set local request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';

do $$
begin
  insert into public.waves (from_member_id, to_member_id)
  values (auth.uid(), '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: a block did not stop a direct wave insert';
exception
  when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'pass: a block stops a wave inserted directly, not just one sent through the RPC';
end $$;

-- A wave that opened a conversation cannot be deleted away.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
begin
  delete from public.waves where from_member_id = auth.uid() and status = 'accepted';
  raise exception 'FAIL: an accepted wave was withdrawn';
exception
  when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%cannot be withdrawn%' then
      raise exception 'FAIL: wrong error withdrawing an accepted wave: %', sqlerrm;
    end if;
    raise notice 'pass: a wave that opened a conversation cannot be withdrawn';
end $$;

select 'BRIDGE TESTS PASSED' as result;
