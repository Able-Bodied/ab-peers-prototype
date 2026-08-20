-- ============================================================================
-- waves: the low-cost first contact that Discover is built around
-- ============================================================================
-- A wave is deliberately not a message. PRD §8 makes it the one-tap opener —
-- optionally carrying a topic from an "Ask me about" chip — precisely because
-- the hard part of peer matching is the first move, and a wave costs the sender
-- almost nothing and the recipient almost nothing to ignore. Waving back
-- (§8.2) is what opens a conversation, and that is modelled here as the
-- recipient updating `waved_back` on the row the sender created, not as a
-- second row: one edge per pair, with a direction and a state.
--
-- `unique (from_member_id, to_member_id)` follows from that. Waving at the same
-- person twice is not a second event, it is the same unanswered wave — and
-- without the constraint the surface becomes a way to poke somebody
-- repeatedly. The unique violation is the feature.
--
-- ---------------------------------------------------------------------------
-- RLS: four policies, one per verb, each naming who legitimately does it
-- ---------------------------------------------------------------------------
--   insert  auth.uid() = from_member_id           you can only wave as yourself
--   select  auth.uid() in (from, to)              only the two people involved
--   update  auth.uid() = to_member_id             this is how you wave back
--   delete  auth.uid() = from_member_id           you can withdraw your own wave
--
-- The update policy is the interesting one: the recipient, not the sender, is
-- the only party who may modify the row, because the only field worth changing
-- after the fact is `waved_back` and only the recipient can truthfully set it.
-- The sender's recourse is delete, not update.
--
-- Nothing here is readable by `anon`: RLS is on with no permissive policy for a
-- null `auth.uid()`, so a signed-out caller sees zero rows. PRD §5.1 again —
-- people are behind sign-in.
--
-- Note that the seeded synthetic members (20260820120000) can never appear as
-- `from_member_id` on an inserted row, because no session's `auth.uid()` equals
-- a synthetic id. Waves in the demo always flow from the real signed-in member
-- outward, which is the direction the demo actually shows.
--
-- ---------------------------------------------------------------------------
-- The rate limit
-- ---------------------------------------------------------------------------
-- PRD §8 caps waving at 20 per member per rolling 24 hours. That belongs in the
-- database, not only in the client: the client's own counter is a UX
-- affordance, and the anon/authenticated key can issue inserts directly. A
-- rolling window (`now() - interval '24 hours'`) rather than a calendar day is
-- what the PRD specifies and also the harder thing to game.
--
-- The exception message is written to be shown to a person as-is, because it
-- will be: the client surfaces the Postgres error text when a wave is refused.
-- ============================================================================

create table if not exists public.waves (
  id uuid primary key default gen_random_uuid(),
  from_member_id uuid not null references public.members (id) on delete cascade,
  to_member_id uuid not null references public.members (id) on delete cascade,
  -- Null for a plain wave; set when sent from an "Ask me about" chip (PRD §8.1).
  topic text,
  message text,
  waved_back boolean not null default false,
  created_at timestamptz not null default now(),
  -- One edge per ordered pair. See the note above: a repeat wave is the same
  -- unanswered wave, not a new event.
  unique (from_member_id, to_member_id)
);

-- "Who waved at me, newest first" is the inbox query; the mirror image is
-- "who have I waved at", which the card grid needs in order to render the
-- already-waved state and which the rate-limit trigger counts over.
create index if not exists idx_waves_to_member_created
  on public.waves (to_member_id, created_at desc);
create index if not exists idx_waves_from_member_created
  on public.waves (from_member_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rate limit trigger
-- ---------------------------------------------------------------------------
-- `security definer` so the count is over every wave the sender has actually
-- sent, not merely the ones the current caller's RLS lets them see. As written
-- the select policy would already show a sender their own rows, but relying on
-- a policy to make a limit correct is exactly the coupling that breaks the
-- limit the next time a policy is edited. `search_path` is pinned for the usual
-- reason a definer function must pin it.

create or replace function public.enforce_wave_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_count integer;
begin
  select count(*) into recent_count
  from public.waves
  where from_member_id = new.from_member_id
    and created_at > now() - interval '24 hours';

  if recent_count >= 20 then
    raise exception
      'You have reached the limit of 20 waves in 24 hours. Try again tomorrow.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists waves_rate_limit on public.waves;
create trigger waves_rate_limit
  before insert on public.waves
  for each row execute function public.enforce_wave_rate_limit();

alter table public.waves enable row level security;

drop policy if exists "members can send their own waves" on public.waves;
create policy "members can send their own waves"
  on public.waves for insert
  with check (auth.uid() = from_member_id);

drop policy if exists "members can view waves they sent or received" on public.waves;
create policy "members can view waves they sent or received"
  on public.waves for select
  using (auth.uid() in (from_member_id, to_member_id));

drop policy if exists "recipients can wave back" on public.waves;
create policy "recipients can wave back"
  on public.waves for update
  using (auth.uid() = to_member_id)
  with check (auth.uid() = to_member_id);

drop policy if exists "senders can withdraw their wave" on public.waves;
create policy "senders can withdraw their wave"
  on public.waves for delete
  using (auth.uid() = from_member_id);
