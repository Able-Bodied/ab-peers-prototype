# Work plan — ab-peers-prototype

How four people build this in a weekend without standing on each other.

---

## 0. Decisions to make before the first commit

The repo scaffold and PRD v5 describe different products. Pick one, write it in the README, move on.

| Question | Recommendation |
|---|---|
| Map or Events tab? | **Events.** The map was cut two revisions ago. Events is the only content we can publish without anyone's consent, and it's what makes the app non-empty in a thin state. |
| Coordinator dashboard in scope? | **No.** Build step 6 in the PRD. Cut it this weekend. |
| Connect = reveal contact? | **No.** Say hi (wave) plus tappable "Ask me about" openers. Contact details are never exposed between members. |
| Auth? | **Fake it.** A mock session object, no real auth. But build the app *as if* everything is behind sign-in, so §5.1 still holds when a backend arrives. |
| shadcn? | Keep it, but restyle to the design tokens. Don't ship default shadcn look. |

**Resulting flow list** — five route folders, replacing the ones in the README:

```
src/routes/onboarding/    9 screens, ends with a Peer profile
src/routes/peers/         browse + filters (was "map")
src/routes/mentors/       browse + filters, mentor card variant
src/routes/events/        list, detail, RSVP, virtual join
src/routes/profile/       view someone, view/edit yourself
```

Waves inbox lives inside `profile/` for now — it's one list.

---

## 1. The one thing that blocks everyone

`src/types/domain.ts` and `src/mocks/seed.ts`.

**One person writes both and merges them in the first hour.** Nobody starts UI until that PR is in `main`. Four people building against an unfixed shape is the single most reliable way to lose a hackathon day.

Contents:

- Every domain type: `Peer`, `Mentor`, `Event`, `Org`, `Wave`, `Session`
- The enums: disability types, levels, duration buckets, equipment, interests, topics, grants, capacity
- Seed data: ~65 synthetic people, ~10 events, ~18 orgs
- Selector helpers everyone will otherwise write four times: `filterPeople()`, `sharedInterests()`, `isNewlyInjured()`

**Rules once it's merged:**

- Additive changes only. Adding a field is fine, renaming one is a Slack message first.
- Nobody hardcodes a person or event in a component. It comes from the mock layer.
- Synthetic data only — no real names, photos, or contact details. See `docs/PII.md`.

---

## 2. Ownership — two people

With two of you, route folders still work as the boundary; there are just fewer of them each.

| Owner | Owns |
|---|---|
| **A** | `types/domain.ts`, `mocks/*`, design tokens, app shell, shared `components/ui/*`, then `routes/peers/` + `routes/mentors/` |
| **B** | `routes/onboarding/`, then `routes/profile/` (wave + Ask me about), then `routes/events/` |

**A goes first and unblocks B.** Types, seed and the app shell before anything else; B can start
onboarding as soon as `domain.ts` lands, because onboarding writes types rather than reading seed.

**Cut list for two people.** Better to ship four flows well than six badly:

| Keep | Cut or fake |
|---|---|
| Onboarding, Peers, Mentors, Profile, wave, Ask me about | Events list — fake it with three static cards if the demo needs the tab to exist |
| Filter bar (state + disability) | Filter sheet with the other six filters |
| Own profile view | Profile editing |
| Initials tiles | Photo upload |

If time opens up, add back in this order: events list, filter sheet, photo upload.

**The rule still holds:** say so before editing a file outside your folder.

## 3. Branches and PRs

```
main                    always green, always deployable
feat/onboarding         one branch per flow, one owner
feat/peers-browse
feat/events
fix/<thing>             small, anyone
```

- Branch from `main`, PR back to `main`. No long-lived develop branch for a weekend.
- **Small PRs, merged often.** A PR that sits for four hours is a merge conflict growing in the dark.
- `pnpm check` must pass before you open the PR. CI runs it anyway; don't make CI find it.
- Self-merge is fine for your own folder. Anything touching `types/`, `mocks/` or `components/ui/` gets one review.
- Squash merge, so `main` history reads as one commit per flow.

**Preview deploys.** Point Vercel or Netlify at the repo so every PR gets a URL. On a hackathon this is worth more than any test — people can look at each other's work on a phone without pulling a branch.

---

## 4. GitHub Project

One board, five columns: **Backlog · Ready · In progress · In review · Done**.

Labels: `flow:onboarding` `flow:peers` `flow:mentors` `flow:events` `flow:profile` `type:contract` `type:ui` `good-first-task` `blocked`.

### Issues to create

Paste these in. Each is one PR. Owners are A and B per §2.

**#1 · Domain types and mock seed** · `type:contract` · A · **blocks everything**
Define every domain type in `src/types/domain.ts`. Populate `src/mocks/seed.ts` with ~65 synthetic people, ~10 events, ~18 orgs. Add `filterPeople()`, `sharedInterests()`, `isNewlyInjured()`. Synthetic data only.
*Done when:* `pnpm check` passes and another route can import a typed list of mentors.

**#2 · Design tokens** · `type:ui` · A
Port the CSS variables from the design language doc into the global stylesheet. Restyle shadcn defaults to match. Focus ring 3px clay, borders 2px, tap targets 46px minimum.
*Done when:* a button, chip, card and input match the design language page.

**#3 · App shell** · `type:ui` · A
Tab bar (Peers / Mentors / Events), bottom nav, header with logo, mock session provider, route wiring.
*Done when:* all three tabs render an empty state and swipe between them.

**#4 · Onboarding: welcome → verification** · `flow:onboarding` · B
Welcome, phone, code. Any 10 digits, any 6 digits. No real SMS.

**#5 · Onboarding: name, birthday, age gate** · `flow:onboarding` · B
Birthday screen computes age. Under 18 routes to the block screen with the youth-programme copy. Ask the birthday *before* stating the rule.
*Done when:* entering a 2012 birthday blocks and cannot be retried by editing the field.

**#6 · Onboarding: disability, duration, equipment** · `flow:onboarding` · B
Type chips, conditional level select, duration dropdown, "what you use" multi-select.

**#7 · Onboarding: location, photo, interests** · `flow:onboarding` · B
Geolocation button with state/city always visible beneath it. Photo optional and skippable with no visible penalty. Interests last and optional.
*Done when:* skipping the photo produces an initials tile and no nag state anywhere.

**#8 · Peers browse** · `flow:peers` · A
Card list with large photo, name, disability and level, city, what they use, shared-interest line.
*Done when:* a state with three people looks deliberate, not empty.

**#9 · Filter bar and filter sheet** · `flow:peers` · A
State and disability on the bar; equipment, org, level, duration, languages, topics behind Filters. Virtual events ignore the state filter.

**#10 · Mentors browse** · `flow:mentors` · A
Same list, mentor card variant: time since injury, org badge, capacity badge. Newly-injured users land here by default.

**#11 · Events list** · `flow:events` · B
Date block, title, org, place and time, who's going, virtual and recurring badges.

**#12 · Event detail, RSVP, virtual join** · `flow:events` · B
Join link hidden until RSVP. One-tap Join on the event page after RSVP. Access notes section.

**#13 · Profile view** · `flow:profile` · B
Someone else's profile: photo, bio, Ask me about, interests, details, org badge.

**#14 · Say hi and Ask me about** · `flow:profile` · B
Wave button with the asymmetric rule (mentor open → thread opens; peer → needs a wave back). Tappable topic chips that compose "I have a question about X", editable before sending.
*Done when:* tapping a topic produces a different, better message than a bare wave.

**#15 · Your profile and edit** · `flow:profile` · B
Own profile with editable bio and interests.

**#16 · PWA shell** · `type:ui` · anyone, last
Manifest, icons from the logo pack, service worker, installable. Standalone display mode.

---

## 5. Rough clock

| Time | A | B |
|---|---|---|
| First hour | #1 types + seed, merged | Read the PRD and the prototype; sketch onboarding screens |
| Hour 1–3 | #2 tokens, #3 shell | #4–#5 welcome through age gate |
| Rest of day 1 | #8 Peers browse, #9 filter bar | #6–#7 disability, location, photo |
| Day 2 morning | #10 Mentors browse | #13 profile view, #14 wave + Ask me about |
| Day 2 midday | #11 events (static is fine) | #16 PWA shell |
| Day 2 afternoon | Freeze. Both on integration, polish and demo rehearsal. | |

**Freeze means freeze.** The last hours go to the demo, not to one more feature. Every hackathon team that loses does it by shipping instead of practising.

---

## 6. Things to keep off the repo

- Real mentor data from Craig or NorCal. Not consented for this app, and a public repo is where personal data goes to leak. `docs/PII.md` already says this — it applies to seed data too.
- API keys of any kind. There is no backend this weekend; there is nothing to key.
- Real photographs of real people, including from the NorCal site. Initials tiles or licensed stock only.

---

## 7. What to do with the prototype

There's a working single-file prototype (`peerconnect-app.html`) with all nine onboarding screens,
the three tabs, filters, profiles and waves, running against the same synthetic data. It is not
the codebase — it is the reference. When a spec question comes up mid-build, open it rather than
re-deciding.
