-- ============================================================================
-- Seed AI enrichment for the events already in the dev database
-- ============================================================================
-- The 125 ingested events resolve to just 18 distinct titles (the rest are
-- recurrences), so the enrichment is keyed by title and applies to every
-- occurrence. Derived by reading each description once, following the rules in
-- jobs/event-ingest/prompts/ai-verify-events.md.
--
-- SCOPE: this sets event_format, registration_url and tags -- the fields the
-- events UI filters and the Going dialog hand-off need. It deliberately does
-- NOT set description_clean/description_html_clean, and deliberately does NOT
-- clear needs_ai_verification: the CTA-removal half of the pass still has to
-- run, and the cleaned copy would mean committing organizers' names, phone
-- numbers and email addresses into this repo, which docs/PII.md is there to
-- prevent. Cleaned copy belongs in the database, written at runtime by the
-- pass, not in version control.
--
-- Anything a future ingest re-scrapes stays authoritative: registration_url is
-- only filled where the feed left it null.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Two taxonomy rows the seeded vocabulary did not cover
-- ---------------------------------------------------------------------------
-- Flagged as proposed_tags by the verification dry run rather than invented at
-- write time, per the "AI never creates taxonomy rows" rule in the prompt.
--   adaptive-fitness: 36 recurrences of a wheelchair fitness class, which is
--     not kayaking/climbing/handcycling and had nowhere to sit.
--   health-education: a clinician-led webinar; not peer support, and not one
--     of the practical skills-services leaves either.

insert into public.tags (slug, name, parent_id)
select v.slug, v.name, p.id
from (values
  ('adaptive-fitness', 'Adaptive fitness', 'sports-recreation'),
  ('health-education', 'Health education', 'skills-services')
) as v(slug, name, parent_slug)
join public.tags p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Format and recovered registration links
-- ---------------------------------------------------------------------------
-- Format evidence is the copy, never an empty location: several of these are
-- in-person events whose venue the scraper simply did not capture (the UC Davis
-- and Sacramento meetups name a cafeteria and a meeting room in the body while
-- events.location is '').
--
-- Santa Cruz is the one hybrid -- its copy says "In Person or Zoom".
--
-- Registration URLs are the links that a "Register HERE" style call to action
-- pointed at. Two events are deliberately left null despite having a prominent
-- HERE link: the wheelchair repair clinic and the adaptive cycling day both
-- link to Google Maps, not to registration, and treating those as sign-up links
-- would send people to a map instead.

update public.events e
set
  event_format = m.event_format,
  registration_url = coalesce(e.registration_url, m.registration_url)
from (values
  ('Caregiver MeetUp', 'online', 'https://us02web.zoom.us/meeting/register/tZcodu-vqDMvH9O_weiWFihFQwcqMwplaWYL'),
  ('The Lionheart Community’s Weekly Wednesdays', 'online', 'https://us02web.zoom.us/j/2964236376'),
  ('Staying Driven Wheelchair Fitness', 'online', 'https://r20.rs6.net/tn.jsp?f=001vTguE2wu5IvhWIfYmNEXWWxf7_Y_iXNamaNYfEC2Roio5bk56LRXMdj5-3XnlfylsPYwJq80OnCo9AD7Gg629yRqaLK8zHdtt70UXkD9o0cJSkxNXku4IOKEnHSqVOHBNbyL2nh02bOD5cEAh9ACXfk88xRZmKJ8i8BxYg2gzBOnGC3dQRrW6vm78Dp6HqLoEuvguqplg1IKJiFF9jJJaHX2RWXjhBM_3JHqotbHDDyN6fpEOcYBgPwRRi_-OKRKMAwBk6IOtoH22QXRrHoAdg==&c=E31VQLpcGlxU3O73Nmc5gr9TWYBgggwJvsU7yqYVqXfZP65zMxNg6A==&ch=iCjWLjsh3vR_Zc4mOCFLJDEU3L59icaSBc6T_7HQWzDHi5o7lPP1uQ=='),
  ('NorCal SCI’s Friday Happy Hour', 'online', 'https://us02web.zoom.us/j/86004299187'),
  ('Men’s Virtual Support Group', 'online', 'https://us02web.zoom.us/j/82252399896?pwd=O2Cs0MIZaHKhnIUBKY4bBgxKgGhU19.1'),
  ('Wheel Good Motherhood', 'online', 'https://bit.ly/3Svsfbr'),
  ('Sexuality & Relationships - Webinar with Dr. Meghan Ash', 'online', 'https://us02web.zoom.us/meeting/register/WWhX_XPwRj6f8gHjyM8quQ'),
  ('Sonoma-Marin SCI Support Group', 'online', 'https://us06web.zoom.us/j/86204072654?pwd=KGjDlyl8XCcasn0SwCS4aaLVyVJYcM.1'),
  ('Inspire 2026', 'online', null),
  ('Santa Cruz Wheelchair Support Group', 'hybrid', null),
  ('San Luis Obispo Support Group', 'in_person', null),
  ('Meet Up, UC Davis Rehab Hospital', 'in_person', null),
  ('Meet Up, Sacramento Rehab Hospital', 'in_person', null),
  ('Meet Up, Sutter Rehabilitation Institute, Roseville', 'in_person', null),
  ('Free Monthly Wheelchair Repair Clinic', 'in_person', null),
  ('Kayaking and Lunch in Sausalito', 'in_person', null),
  ('Adaptive Cycling & Lunch with NorCal SCI & BORP', 'in_person', null),
  ('SCVMC Anniversary Party', 'in_person', null)
) as m(title, event_format, registration_url)
where e.title = m.title;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
-- source = 'ai', so a later human correction can be told apart and survives a
-- re-run of the pass.

insert into public.event_tags (event_id, tag_id, source)
select e.id, t.id, 'ai'
from public.events e
join (values
  ('Caregiver MeetUp', 'caregiver-group'),
  ('Caregiver MeetUp', 'social-meetup'),
  ('The Lionheart Community’s Weekly Wednesdays', 'peer-support-group'),
  ('Staying Driven Wheelchair Fitness', 'adaptive-fitness'),
  ('NorCal SCI’s Friday Happy Hour', 'peer-support-group'),
  ('NorCal SCI’s Friday Happy Hour', 'social-meetup'),
  ('Men’s Virtual Support Group', 'mens-group'),
  ('Men’s Virtual Support Group', 'peer-support-group'),
  ('Wheel Good Motherhood', 'peer-support-group'),
  ('Sexuality & Relationships - Webinar with Dr. Meghan Ash', 'health-education'),
  ('Sonoma-Marin SCI Support Group', 'peer-support-group'),
  ('Santa Cruz Wheelchair Support Group', 'peer-support-group'),
  ('San Luis Obispo Support Group', 'peer-support-group'),
  ('San Luis Obispo Support Group', 'food-drink'),
  ('Meet Up, UC Davis Rehab Hospital', 'peer-support-group'),
  ('Meet Up, UC Davis Rehab Hospital', 'social-meetup'),
  ('Meet Up, Sacramento Rehab Hospital', 'peer-support-group'),
  ('Meet Up, Sacramento Rehab Hospital', 'food-drink'),
  ('Meet Up, Sutter Rehabilitation Institute, Roseville', 'peer-support-group'),
  ('Free Monthly Wheelchair Repair Clinic', 'equipment-clinics'),
  ('Kayaking and Lunch in Sausalito', 'kayaking'),
  ('Kayaking and Lunch in Sausalito', 'food-drink'),
  ('Adaptive Cycling & Lunch with NorCal SCI & BORP', 'handcycling'),
  ('Adaptive Cycling & Lunch with NorCal SCI & BORP', 'food-drink'),
  ('SCVMC Anniversary Party', 'social-meetup'),
  ('SCVMC Anniversary Party', 'food-drink'),
  ('Inspire 2026', 'social-meetup')
) as m(title, slug) on m.title = e.title
join public.tags t on t.slug = m.slug
on conflict (event_id, tag_id) do nothing;
