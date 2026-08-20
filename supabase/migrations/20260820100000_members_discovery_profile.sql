-- ============================================================================
-- members: the rest of the profile the Discover surface browses on
-- ============================================================================
-- 20260817203100_onboarding_members.sql created `members` as exactly what the
-- onboarding wizard collects, and said out loud that the richer profile fields
-- ("bio, grants, and affiliations") get filled in later, outside that wizard.
-- This is later. Every column below is part of `Member` in src/types/domain.ts
-- and is read by the Discover card, the detail sheet, or a browse filter
-- (PRD §5, §7.1, §8.1) — nothing speculative is added here.
--
-- All columns are added with `if not exists` and are either nullable or
-- defaulted, so existing onboarded rows stay valid without a backfill pass on
-- every field. The two that would otherwise render wrong for those existing
-- rows — `show_in_browse` and `avatar_color` — are backfilled explicitly at the
-- bottom.
--
-- ---------------------------------------------------------------------------
-- Why the auth.users foreign key goes away
-- ---------------------------------------------------------------------------
-- Discover is only a real surface with a populated deck behind it: an empty
-- browse grid demos nothing and hides every layout and filter bug. The demo
-- population is the vetted synthetic set in src/mocks/seed.ts (docs/PII.md —
-- fake names, reserved +1555 phone numbers, city-center coordinates), and those
-- rows have no auth account, so `members_id_fkey` would reject all of them.
--
-- Dropping the FK does not widen who can write. Ownership of a members row is
-- and remains enforced by RLS: the policies from the original migration are all
-- `auth.uid() = id`, and a synthetic row whose id is not any auth user's id can
-- never satisfy that for anyone. The synthetic rows are readable through the
-- browse view (next migration) and writable by nobody.
--
-- The honest cost: `on delete cascade` from `auth.users` is gone with the
-- constraint. Deleting an auth user now leaves an orphaned `members` row rather
-- than cleaning it up. At prototype scale, with a handful of real accounts and
-- no account-deletion flow, that is acceptable. It is also precisely the thing
-- to restore when this schema moves into `ab-peers`: put the FK back, and seed
-- demo members there behind a separate table or a real auth user per row.
-- ============================================================================

alter table public.members drop constraint if exists members_id_fkey;

alter table public.members add column if not exists completeness text
  check (completeness in ('Complete', 'Incomplete', 'Do not know'));
alter table public.members add column if not exists years_since int;
alter table public.members add column if not exists relationship text not null default 'Self';
alter table public.members add column if not exists equipment text[] not null default '{}';
alter table public.members add column if not exists equipment_detail text;
alter table public.members add column if not exists sports_equipment text[] not null default '{}';
alter table public.members add column if not exists will_advise_on_equipment boolean not null default false;
alter table public.members add column if not exists grants text[] not null default '{}';
alter table public.members add column if not exists will_help_with_grants boolean not null default false;
alter table public.members add column if not exists languages text[] not null default '{English}';
alter table public.members add column if not exists topics text[] not null default '{}';
alter table public.members add column if not exists bio text not null default '';
alter table public.members add column if not exists employment text;
alter table public.members add column if not exists living text;
-- Org slugs, matching public.organizations.slug — not uuids, so a seeded member
-- can name an org that has not been created yet without ordering the inserts.
alter table public.members add column if not exists affiliations text[] not null default '{}';
-- Org slug. Non-null is what makes someone a verified Mentor rather than an
-- experienced peer (src/types/domain.ts, PRD §5).
alter table public.members add column if not exists verified_by text;
alter table public.members add column if not exists open_to_messages boolean not null default false;
alter table public.members add column if not exists capacity text
  check (capacity in ('open', 'at capacity', 'paused'));
-- Opt out of appearing in browse without losing the ability to browse or wave.
alter table public.members add column if not exists show_in_browse boolean not null default true;
alter table public.members add column if not exists photo_alt text;
alter table public.members add column if not exists avatar_color text not null default '#2E5C8A';
-- Marks the seeded demo population, so it can be identified, refreshed, or
-- deleted wholesale without guessing from the data.
alter table public.members add column if not exists is_synthetic boolean not null default false;

-- ---------------------------------------------------------------------------
-- Indexes the browse query actually uses
-- ---------------------------------------------------------------------------
-- The client fetches the whole browsable set once and filters in memory at this
-- scale, but the three equality filters that will move server-side first are
-- type (the peers/mentors segment), state, and disability. `topics` and
-- `interests` are array-containment filters ("Ask me about" chips and shared
-- interests), which need GIN, not btree.

create index if not exists idx_members_type on public.members (type);
create index if not exists idx_members_state on public.members (state);
create index if not exists idx_members_disability on public.members (disability);
create index if not exists idx_members_topics on public.members using gin (topics);
create index if not exists idx_members_interests on public.members using gin (interests);

-- ---------------------------------------------------------------------------
-- Backfill the two fields existing rows would otherwise render wrong with
-- ---------------------------------------------------------------------------
-- Adding a not-null defaulted column already writes the default into every
-- existing row, so `show_in_browse` is true everywhere the moment the column
-- lands; the statement below is stated explicitly anyway so the intent for
-- already-onboarded members ("you are browsable unless you opt out") is
-- recorded in the migration rather than inferred from a default.
--
-- `avatar_color` needs more than the default: a deck of photo-less members all
-- sharing one blue tile is unreadable. Each pre-existing row gets a stable
-- colour derived from its own id, so it is deterministic and survives a re-run.

update public.members set show_in_browse = true where is_synthetic = false;

update public.members
set avatar_color = (
  array['#2E5C8A', '#4A4E8C', '#0E6B5C', '#7A4B2A', '#5B3A6E', '#1F6F8B', '#8A4A5C', '#3F6B2E']
)[(('x' || substr(md5(id::text), 1, 7))::bit(28)::int % 8) + 1]
where avatar_color = '#2E5C8A' and is_synthetic = false;
