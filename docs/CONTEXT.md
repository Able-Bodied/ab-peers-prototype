# Context

Distilled from the kickoff transcript (2026-08-15). Read this before building anything in this
repo — it is the shared understanding of what we're building and why.

## Mission

AbleBodied ([ablebodied.org](https://ablebodied.org)) is building a peer mentor matching tool for
the spinal cord injury (SCI) community. This is **not** a general disability forum. The scope is
narrow and intentional: SCI, including quadriplegic and paraplegic injuries, and both complete and
incomplete injuries. A forum/chat feature is planned for later, inside the walled garden once
accounts exist. Badging (for example, a "Craig-certified" mentor designation) is also deferred —
neither belongs in the MVP.

## Why a matching tool, and not a forum

Existing peer-support forums are fading. CareCure, the best-known SCI community forum, has around
20,000 registered members but only about 50 monthly visitors today — it's a ghost town relative to
its membership count. The lesson from that isn't "forums don't work," it's that **mentee
acquisition, not mentor acquisition, is the real chicken-and-egg problem.** Mentors are relatively
easy to recruit and can sit dormant in the system until they're matched with someone. Mentees are
the hard part: they need to actually show up and ask for help, usually right after an injury, when
they're least equipped to go searching.

The strategy that breaks this: build the tool that hospital-based coordinators — the Eric-at-Craig-
Hospital and Robert-at-Santa-Clara-Valley-Medical-Center archetypes — actually need for their daily
work, and their existing mentee pipeline comes bundled with them. Coordinators already talk to
newly injured patients constantly; give them a tool that makes matching those patients to mentors
easier than what they do today (spreadsheets, memory, hallway conversations), and the mentee
acquisition problem solves itself as a side effect.

## Personas

**Mentee.** Someone newly injured, or someone who's been living with an injury for years and wants
a peer connection. Finds a mentor either by browsing a filterable map themselves or through a
coordinator's introduction. Onboarding needs to be simple: disability info, location, and the
basics — nothing that feels like paperwork.

**Mentor.** Easy to recruit relative to mentees, and fine to sit dormant in the system until
they're matched with someone. Becoming a mentor (as opposed to just being a peer/mentee) requires
an invite and training — this is coordinator-gated, not self-serve. Once approved, a mentor fills
out a richer profile survey than a mentee does: mentoring topics, affiliations, capacity, and so
on.

**Coordinator.** The Eric/Robert archetype: a hospital or clinic staff member who already runs peer
mentoring informally. Uploads a mentor spreadsheet, and — unlike anyone else in the system — sees
full PII on the people they've uploaded by default. Filters and matches mentees to mentors, sends
introductions, and tracks when each mentor was last in touch with someone (last-touchpoint
tracking), which is the kind of bookkeeping that currently lives in someone's head or a stray
spreadsheet.

## MVP flows, in priority order

1. **Onboarding wizard.** A short, CareCure-style sequence of questions plus a location typeahead.
   Minimal friction — this is often filled out by someone in a difficult moment.
2. **Filterable mentor/peer map.** Filters include disability type, mentor vs. peer, and interests.
   This is the primary discovery surface for a self-directed mentee.
3. **Profile page.** Where a map pin or search result lands. Full details on one person, and the
   message/connect action lives here too.
4. **Connect action.** Either sending a message or revealing contact info directly, depending on
   that person's privacy settings.
5. **Coordinator dashboard.** Spreadsheet upload turns into structured mentor/peer entities. PII is
   visible only to the coordinator who uploaded the record. Includes last-contact tracking so a
   coordinator can see who's overdue for a check-in.

## Future / explicitly deferred

These are real, on the roadmap, and explicitly **not** part of the MVP:

- A Discourse-based forum with shared SSO against wiki.ablebodied.org.
- An events map and organization feeds.
- Mentor badging (e.g. "Craig-certified").
- Classifieds.
- Vacation/equipment exchange.
- AI-assisted matching.

Don't build toward these yet. If a task seems to require one of them, flag it rather than
quietly scoping it in.

## Working model

The prototype team (this repo) iterates on UX flow with mock data only, optimizing for speed of
iteration over correctness of plumbing. Chandler builds the real authentication, database, and API
foundation in `ab-peers` in parallel. After the hackathon weekend, whichever UI flows prove out get
transplanted into `ab-peers/apps/web`, swapping the mock data layer for the real API client.

To keep that transplant cheap, **keep this repo's domain types (`src/types/domain.ts`) aligned
with `ab-peers/packages/types`.** If a flow needs a new field, add it in a way that could plausibly
exist in the real schema — don't invent prototype-only shapes that would need to be redesigned
later.
