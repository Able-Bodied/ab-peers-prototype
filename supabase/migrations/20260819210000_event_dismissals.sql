-- ============================================================================
-- event_dismissals: which events a viewer marked "Not interested" (the X on the
-- events list card, src/routes/events/event-list-card.tsx), so the choice survives
-- a reload instead of resetting to an in-memory Set every time the feed remounts.
-- ============================================================================
-- Same anonymous-viewer model as event_rsvps (see
-- supabase/migrations/20260819110000_event_rsvps.sql): no Supabase auth session yet,
-- so `viewer_id` is the same client-minted id from localStorage, not an account.
-- Purely a personal list — there is no aggregate/other-viewer count to reconcile,
-- so unlike event_rsvps there is no `status` column: a row's existence is the whole
-- fact, and undoing "Not interested" is a delete, not an update.
--
-- TODO(team): once auth lands, add a `member_id` column, backfill it, and tighten
-- these policies to `using (member_id = auth.uid())`, same as event_rsvps.
-- ============================================================================

create table if not exists public.event_dismissals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  -- Client-generated, not a foreign key to anything — see note above.
  viewer_id text not null,
  created_at timestamptz not null default now(),
  -- One dismissal per viewer per event; marking Not interested twice is a no-op.
  unique (event_id, viewer_id)
);

create index if not exists idx_event_dismissals_viewer_id on public.event_dismissals (viewer_id);

alter table public.event_dismissals enable row level security;

drop policy if exists "anyone can view dismissals" on public.event_dismissals;
create policy "anyone can view dismissals"
  on public.event_dismissals for select
  using (true);

drop policy if exists "anyone can dismiss an event" on public.event_dismissals;
create policy "anyone can dismiss an event"
  on public.event_dismissals for insert
  with check (true);

drop policy if exists "anyone can undo their dismissal" on public.event_dismissals;
create policy "anyone can undo their dismissal"
  on public.event_dismissals for delete
  using (true);
