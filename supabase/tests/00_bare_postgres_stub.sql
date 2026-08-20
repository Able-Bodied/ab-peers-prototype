-- Minimal stand-in for the parts of a Supabase database that the chat
-- migration leans on, so the migration can be applied and exercised in a bare
-- postgres container with no Supabase stack running. See README.md in this
-- folder for how to run it.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema if not exists auth;

-- The real auth.uid() reads a JWT claim out of the request GUC. This reads a
-- GUC too, so `set local request.jwt.claim.sub` behaves the same way.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- public.members as the two migrations before this one leave it: the onboarding
-- subset (20260817203100) with own-row-only RLS, and no auth.users FK
-- (20260820100000 drops it). The columns the chat migration adds itself are
-- deliberately absent here, to prove it really does add them.
create table public.members (
  id uuid primary key,
  type text not null default 'peer' check (type in ('peer', 'mentor')),
  display_name text not null,
  phone text not null,
  birth_date date not null,
  age_band text not null,
  disability text not null,
  level text,
  duration text not null,
  duration_answered_on date not null default current_date,
  city text not null,
  state text not null,
  interests text[] not null default '{}',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.members enable row level security;

create policy "members can select own row"
  on public.members for select
  using (auth.uid() = id);

grant select, insert, update on public.members to authenticated;
