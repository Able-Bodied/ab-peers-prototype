-- ============================================================================
-- Organizations: a default timezone for AI-interpreted time strings
-- ============================================================================
-- The AI verification pass (jobs/event-ingest/prompts/ai-verify-events.md) can
-- pull a start/end time out of an event's description when the scraper found
-- none ("Time: 4:00-5:30", "every Friday at 3pm"). That copy rarely states a
-- timezone. Rather than guess or hardcode Pacific everywhere, each org carries
-- the timezone its events default to, and the prompt resolves any
-- timezone-less time string against it.
--
-- Every org this prototype knows about is California-based, so the column
-- default already covers NorCal SCI without an explicit row update -- it is
-- set explicitly below anyway, so the value is discoverable by reading data
-- instead of by knowing the default.
-- ============================================================================

alter table public.organizations
  add column if not exists default_timezone text not null default 'America/Los_Angeles';

update public.organizations
set default_timezone = 'America/Los_Angeles'
where slug = 'norcal-sci';
