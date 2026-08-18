-- Lets a member delete their own row, so the onboarding wizard can be
-- re-run end to end during dev/testing without needing a second phone
-- number. Storage objects under the deleted member's folder are left in
-- place (cheap to ignore for a prototype; the `photos` bucket has no
-- per-row cleanup trigger).

create policy "members can delete own row"
  on public.members for delete
  using (auth.uid() = id);
