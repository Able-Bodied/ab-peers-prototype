-- ============================================================================
-- AI enrichment: tag taxonomy, event format, registration deadline, clean copy
-- ============================================================================
-- Destination schema for the AI verification pass described in
-- jobs/event-ingest/prompts/ai-verify-events.md. That pass reads events with
-- needs_ai_verification = true (set by jobs/event-ingest/ingest.js) and writes
-- back the four things it derives from the scraped copy:
--
--   1. a registration deadline, when the description states one
--   2. whether the event is in person, online, or hybrid
--   3. tags drawn from a stored hierarchical taxonomy
--   4. a cleaned description with the "Register HERE" style call to action
--      removed, so the CTA does not compete with the app's own RSVP button
--
-- WHY THE CLEANED COPY LIVES IN ITS OWN COLUMNS
-- ingest.js compares the scraped `description`/`description_html` against the
-- row on file to decide whether an event changed (DIFF_TEXT_FIELDS). If the AI
-- pass overwrote those columns in place, every subsequent ingest would see a
-- diff against the source feed, re-flag the event, and the upsert would clobber
-- the cleaned text with the raw scrape again -- an endless re-verification loop
-- that never converges. Keeping the scraped columns pristine and writing the
-- edited copy alongside them means the diff stays meaningful and the AI output
-- survives the next ingest. Readers should prefer `*_clean` and fall back to
-- the scraped column when it is null.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Events columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists registration_deadline timestamptz,
  add column if not exists description_clean text,
  add column if not exists description_html_clean text,
  add column if not exists ai_verified_at timestamptz;

-- Nullable on purpose: null means "not yet determined", which is different from
-- any of the three real answers. The AI pass leaves it null rather than guessing
-- when the copy genuinely does not say.
alter table public.events
  add column if not exists event_format text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_event_format_check'
  ) then
    alter table public.events
      add constraint events_event_format_check
      check (event_format in ('in_person', 'online', 'hybrid'));
  end if;
end $$;

-- Partial index: the feed filters on format, and the null (undetermined) rows
-- are not worth indexing.
create index if not exists idx_events_event_format
  on public.events (event_format)
  where event_format is not null;

create index if not exists idx_events_registration_deadline
  on public.events (registration_deadline)
  where registration_deadline is not null;

-- ---------------------------------------------------------------------------
-- Tag taxonomy
-- ---------------------------------------------------------------------------
-- Self-referential so the hierarchy is data, not schema: adding a tag or a
-- whole new category is an INSERT, with no migration and no code change. Today
-- the tree is two deep (category -> tag); nothing here assumes it stays that
-- way.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tags(id) on delete cascade,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tags_parent_id on public.tags (parent_id);

-- Join table rather than an array column on events: an array cannot carry a
-- foreign key, so a typo would silently invent a tag that no taxonomy row backs.
create table if not exists public.event_tags (
  event_id uuid not null references public.events(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  -- Who applied it, so a later human correction can be told apart from the
  -- AI's guess and survive a re-run.
  source text not null default 'ai' check (source in ('ai', 'human', 'scraper')),
  created_at timestamptz not null default now(),
  primary key (event_id, tag_id)
);

create index if not exists idx_event_tags_tag_id on public.event_tags (tag_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same posture as 20260818070000: public read, no anon write. The AI pass is a
-- trusted server-side process and must use the service_role key.

alter table public.tags enable row level security;
alter table public.event_tags enable row level security;

drop policy if exists "anyone can view tags" on public.tags;
create policy "anyone can view tags"
  on public.tags for select
  using (true);

drop policy if exists "anyone can view event tags" on public.event_tags;
create policy "anyone can view event tags"
  on public.event_tags for select
  using (true);

-- ---------------------------------------------------------------------------
-- Seed the taxonomy
-- ---------------------------------------------------------------------------
-- Mirrors ACTIVITIES_BY_GENRE in src/routes/events/event-mocks.ts, which is the
-- taxonomy the filter sheet in docs/screens/filter-sheet.png already shows. The
-- UI and the database now agree on one list; event-mocks.ts is the thing that
-- goes away, not this.
-- Runs as the table owner, so it bypasses RLS. Idempotent on slug.

insert into public.tags (slug, name, parent_id) values
  ('sports-recreation', 'Sports & recreation', null),
  ('support-groups',    'Support & groups',    null),
  ('skills-services',   'Skills & services',   null),
  ('social-travel',     'Social & travel',     null),
  ('advocacy',          'Advocacy',            null)
on conflict (slug) do nothing;

insert into public.tags (slug, name, parent_id)
select child.slug, child.name, parent.id
from (values
  ('handcycling',       'Handcycling',       'sports-recreation'),
  ('wheelchair-rugby',  'Wheelchair rugby',  'sports-recreation'),
  ('monoskiing',        'Monoskiing',        'sports-recreation'),
  ('adaptive-climbing', 'Adaptive climbing', 'sports-recreation'),
  ('kayaking',          'Kayaking',          'sports-recreation'),
  ('hiking-trails',     'Hiking & trails',   'sports-recreation'),
  ('peer-support-group','Peer support group','support-groups'),
  ('mens-group',        'Men''s group',      'support-groups'),
  ('caregiver-group',   'Caregiver group',   'support-groups'),
  ('newly-injured',     'Newly injured',     'support-groups'),
  ('driving-lessons',   'Driving lessons',   'skills-services'),
  ('equipment-clinics', 'Equipment clinics', 'skills-services'),
  ('benefits-advice',   'Benefits advice',   'skills-services'),
  ('travel',            'Travel',            'social-travel'),
  ('social-meetup',     'Social meetup',     'social-travel'),
  ('food-drink',        'Food & drink',      'social-travel'),
  ('policy-access',     'Policy & access',   'advocacy'),
  ('fundraising',       'Fundraising',       'advocacy')
) as child(slug, name, parent_slug)
join public.tags as parent on parent.slug = child.parent_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
--
-- ADDING A TAG LATER
--   insert into public.tags (slug, name, parent_id)
--   select 'sailing', 'Sailing', id from public.tags where slug = 'sports-recreation';
--
-- READING AN EVENT'S TAGS WITH THEIR CATEGORY
--   select e.title, t.name as tag, p.name as category
--   from public.events e
--   join public.event_tags et on et.event_id = e.id
--   join public.tags t on t.id = et.tag_id
--   left join public.tags p on p.id = t.parent_id
--   where e.id = '...';
--
-- The AI pass never invents taxonomy rows. Tags it proposes that are not
-- already in this table are reported for a human to approve and insert, so the
-- taxonomy cannot drift into near-duplicates ("Handcycle" vs "Handcycling").
-- ============================================================================
