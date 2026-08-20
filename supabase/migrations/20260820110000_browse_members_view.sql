-- ============================================================================
-- browse_members: the one and only projection through which a member is
-- visible to anybody other than themselves
-- ============================================================================
-- `public.members` keeps the strict own-row-only RLS it was created with
-- (`auth.uid() = id` on select). That is deliberate and it stays: a direct
-- `select * from members` can never return another person's row, so it can
-- never leak a phone number, no matter what the client asks for.
--
-- Discover obviously needs to show other people. Rather than loosening the
-- table's select policy — which would put `phone` and `birth_date` one
-- `select *` away from any client — the whole browse surface reads this view,
-- and this view does not select those two columns at all. `BrowseMember` in
-- src/types/domain.ts makes the same cut in TypeScript; this makes it again in
-- the database, so neither one alone is load-bearing. PRD §6: the phone number
-- is sign-in identity and is never shown to members; PRD §6.2: birth date
-- exists only for the under-18 gate and every UI surface reads `age_band`.
--
-- ---------------------------------------------------------------------------
-- Why this view is intentionally SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- It is created without `security_invoker = true`, i.e. with the Postgres
-- default, so it executes with the privileges of its owner and the underlying
-- `members` RLS is NOT re-applied per caller. That is the entire point: with
-- `security_invoker = true` the view would inherit own-row-only RLS and every
-- member would browse a deck containing exactly themselves.
--
-- The safety here comes from the view's definition, not from RLS on the table
-- underneath it: the column list excludes the two sensitive columns, the
-- `where` clause honours each member's own `show_in_browse` opt-out, and access
-- is granted only to the `authenticated` role. There is no filter a caller can
-- pass that widens any of those.
--
-- Supabase's database linter WILL flag this view with `security_definer_view`.
-- That warning is expected and is being accepted knowingly, not overlooked —
-- do not "fix" it by adding `security_invoker = true`, which silently empties
-- the Discover deck rather than erroring.
--
-- ---------------------------------------------------------------------------
-- Who can read it
-- ---------------------------------------------------------------------------
-- `authenticated` only. PRD §5.1 draws the line here: events are public and sit
-- in front of sign-in, people do not. `anon` and `public` are revoked
-- explicitly rather than merely not granted, because a security-definer view is
-- exactly the object where an inherited or default grant would be a real leak.
-- ============================================================================

drop view if exists public.browse_members;

create view public.browse_members as
select
  id,
  type,
  display_name,
  photo_url,
  photo_alt,
  avatar_color,
  city,
  state,
  disability,
  level,
  completeness,
  duration,
  duration_answered_on,
  years_since,
  age_band,
  relationship,
  equipment,
  equipment_detail,
  sports_equipment,
  will_advise_on_equipment,
  grants,
  will_help_with_grants,
  languages,
  interests,
  topics,
  bio,
  employment,
  living,
  affiliations,
  verified_by,
  open_to_messages,
  capacity,
  show_in_browse,
  is_synthetic,
  created_at,
  updated_at
from public.members
where show_in_browse;

revoke all on public.browse_members from anon;
revoke all on public.browse_members from public;

grant select on public.browse_members to authenticated;
