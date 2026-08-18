-- Onboarding wizard: members table + photo storage bucket.
-- Mirrors the fields collected by src/routes/onboarding/ (a subset of the
-- full Member shape in src/types/domain.ts — richer profile fields like bio,
-- grants, and affiliations are filled in later, outside this wizard).

create table if not exists public.members (
  id uuid primary key references auth.users (id) on delete cascade,
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

create policy "members can insert own row"
  on public.members for insert
  with check (auth.uid() = id);

create policy "members can update own row"
  on public.members for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');

create policy "members can upload their own photo"
  on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "members can replace their own photo"
  on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
