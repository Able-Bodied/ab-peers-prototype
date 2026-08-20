-- ============================================================================
-- event_rsvps: real Interested/Going tallies, replacing the invented counts in
-- src/routes/events/event-mocks.ts
-- ============================================================================
-- There is no Supabase auth session in this prototype (see docs/CONTEXT.md), so a
-- viewer's identity is a random id the client mints into localStorage the first
-- time it needs one (src/lib/rsvps.tsx). That id is not an account and not PII —
-- it identifies a browser, not a person — so there is nothing here worth
-- restricting by identity even if RLS could check one, which it can't without a
-- real session. That's why, unlike every other table in this schema, the anon
-- key is allowed to write here: an anonymous public RSVP is the entire feature.
--
-- TODO(team): once auth lands, add a `member_id` column, backfill it from
-- whatever the client can still associate, and tighten these policies to
-- `using (member_id = auth.uid())`.
-- ============================================================================

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Client-generated, not a foreign key to anything — see note above.
  viewer_id text not null,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One RSVP per viewer per event; changing your mind is an update, not a new row.
  unique (event_id, viewer_id)
);

create index if not exists idx_event_rsvps_event_id on public.event_rsvps (event_id);

alter table public.event_rsvps enable row level security;

drop policy if exists "anyone can view rsvps" on public.event_rsvps;
create policy "anyone can view rsvps"
  on public.event_rsvps for select
  using (true);

drop policy if exists "anyone can rsvp" on public.event_rsvps;
create policy "anyone can rsvp"
  on public.event_rsvps for insert
  with check (true);

drop policy if exists "anyone can change their rsvp" on public.event_rsvps;
create policy "anyone can change their rsvp"
  on public.event_rsvps for update
  using (true)
  with check (true);

drop policy if exists "anyone can remove their rsvp" on public.event_rsvps;
create policy "anyone can remove their rsvp"
  on public.event_rsvps for delete
  using (true);
