-- Profile editor: fields for the post-onboarding "Your profile" hub
-- (src/routes/profile/edit/). Most of these already exist on the TS `Member`
-- shape in src/types/domain.ts but were never migrated to the real table —
-- onboarding only ever wrote its own subset of columns.
--
-- Written idempotent (IF NOT EXISTS / DROP ... IF EXISTS then CREATE)
-- because this project's remote migration history has drifted before —
-- some migrations landed on the hosted DB without ever being committed to
-- git — so a clean re-run here can't assume it's starting from a blank
-- slate.

alter table public.members
  add column if not exists bio text,
  add column if not exists mentor_interest boolean not null default false,
  add column if not exists completeness text
    check (completeness in ('Complete', 'Incomplete', 'Do not know')),
  add column if not exists injury_mechanism text
    check (injury_mechanism in ('Vehicle', 'Sport', 'Fall', 'Medical', 'Other')),
  add column if not exists independence text
    check (independence in ('Completely independent', 'Some help', 'Full-time care')),
  add column if not exists relationship_status text
    check (relationship_status in ('Single', 'Partnered', 'Married', 'Prefer not to say')),
  add column if not exists children text
    check (children in ('No', 'Yes, pre-injury', 'Yes, post-injury')),
  add column if not exists employment text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists topics text[] not null default '{}',
  add column if not exists life_now_visible boolean not null default false;

-- Additional photos beyond the single onboarding `photo_url` — "doing things
-- you enjoy" shots, not a second profile photo. v1: no reorder, no per-photo
-- visibility, no interest auto-tagging (see docs/screens/mentor-flow.html for
-- the fuller design this is a deliberately smaller slice of).
create table if not exists public.member_photos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  url text not null,
  alt text,
  created_at timestamptz not null default now()
);

alter table public.member_photos enable row level security;

drop policy if exists "members can select own photos" on public.member_photos;
create policy "members can select own photos"
  on public.member_photos for select
  using (auth.uid() = member_id);

drop policy if exists "members can insert own photos" on public.member_photos;
create policy "members can insert own photos"
  on public.member_photos for insert
  with check (auth.uid() = member_id);

drop policy if exists "members can delete own photos" on public.member_photos;
create policy "members can delete own photos"
  on public.member_photos for delete
  using (auth.uid() = member_id);

-- Gallery uploads live under <uid>/gallery/... in the existing `photos`
-- bucket — its storage policies (from 20260817203100_onboarding_members.sql)
-- already only check that the first path segment is the caller's own uid,
-- so no new storage policy is needed for the extra path segment.
