-- ============================================================================
-- Flag events whose scraped copy contains an email or phone number
-- ============================================================================
-- Organizer contact details (an email or phone in the description) are public
-- information — the organizer put them in a public calendar listing — so
-- docs/PII.md's ban on real personal data doesn't block storing them verbatim.
-- That's a policy call, though, and policies get revisited. This flag marks
-- which rows the call actually applies to, so a future tightening doesn't
-- require re-scanning every description to find them again.
-- ============================================================================

alter table public.events add column if not exists needs_pii_review boolean not null default false;

comment on column public.events.needs_pii_review is
  'True when description/description_html contains an email address or phone number carried over verbatim from the organizer''s public listing. Set at ingest time (jobs/event-ingest/ingest.js) and backfilled here for rows scraped before this column existed.';

create index if not exists idx_events_needs_pii_review
  on public.events (needs_pii_review)
  where needs_pii_review;

update public.events
set needs_pii_review = true
where needs_pii_review = false
  and (
    coalesce(description, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    or coalesce(description_html, '') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    or coalesce(description, '') ~ '\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}'
    or coalesce(description_html, '') ~ '\(?[0-9]{3}\)?[-. ][0-9]{3}[-. ][0-9]{4}'
  );
