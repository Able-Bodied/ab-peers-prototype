# Commit messages — ab-peers-prototype

Working tree: `docs/PRD.md`, `docs/screens/events.png`, `docs/screens/mentor-flow.png`
modified; `event-org.png/.html`, `filter-sheet.png/.html`, `events-screen.html`,
`mentor-flow.html` new. Last commit is `fddb07f` (PRD v6).

---

## Option A — one commit (recommended)

    git add docs && git commit -F- <<'MSG'

PRD v7–v9: events tab, connections, and profile completion

Three versions land together — v7 and v8 were only ever in a Downloads copy
and never committed.

Events
- Interested alongside Going. Counts always shown separately; join link and
  attendee roster stay behind Going.
- Add to calendar on both, .ics plus a subscribable feed. Per-user join links
  preferred for anything support-group-shaped.
- Genre / activity / organization / format tags, with activity tags sharing the
  profile interest vocabulary. For-you feed by default, Everything one toggle
  away. Filter sheet doubles as the mute settings screen.
- Not interested asks what to stop showing — this org, this activity, this
  category — rather than why. "Too far / wrong time" split out as logistics
  feedback for the org dashboard.
- Event page: org row with Follow, category chips, who's going, more from this
  org. Access reported by exception rather than as a checklist.

People
- Connections: anybody you have interacted with, a wave or a message. No
  request, no accept step, private list, no public counts. Mentor threads
  excluded by default.
- Organization page, plus the seven places following is offered. Public
  follower counts held back until they clear a threshold.

Profile
- Reframed away from "become a mentor": entry point on Me, two-tier section
  list, and one explicit mentor question that nothing else turns on.
- Craig Q1–Q25 mapped field by field, with what we drop and why. Survey codes
  never appear in the interface.
- In your own words restored as its own screen, with starters and a live card
  preview. Photo gallery, up to six, prompted toward doing things rather than
  portraits. Tips and tricks as a tagged repeatable list, favourite equipment,
  and what you wish you'd known — each accepting photos and video by link.

Screens: events.png and mentor-flow.png rebuilt against the prototype's chrome;
adds filter-sheet.png and event-org.png. HTML source alongside each.
MSG

---

## Option B — two commits

### 1. Mockups

    git add docs/screens && git commit -F- <<'MSG'

docs(screens): rebuild events and profile mockups, add filter and event/org

Rebuilt against the prototype's actual chrome — the old events screen still
showed People/Mentors/Events as top tabs and a bottom bar ending in Waves.

- events.png: Interested/Going, For-you chip, All/Mine segments, not-interested
- filter-sheet.png: feed mode, where, when, format, activities by genre,
  organizations, Hidden with restore
- event-org.png: event page with Follow and who's going, organization page
- mentor-flow.png: eleven screens, bio through to the story questions

HTML source committed alongside each, so the screens regenerate rather than
being redrawn.
MSG

### 2. The PRD

    git add docs/PRD.md && git commit -F- <<'MSG'

PRD v7–v9: events tab, connections, and profile completion

[body as in Option A, minus the trailing Screens paragraph]
MSG
