# AGENTS.md — src/routes/

One folder per flow. Each folder holds a `page.tsx` that default-exports the route component —
this is the one place in the app where a default export is correct (see root AGENTS.md
conventions).

## Rules for every route

- **`page.tsx` default-exports the route component.** `App.tsx` imports it as the default and
  wires it to a path.
- **Every route renders from mock data.** Import fixtures from `@/mocks/seed` and render them
  directly, or derive local component state from them. No `fetch`, no `axios`, no simulated
  network layer — this repo has no backend, and pretending otherwise adds friction without adding
  signal about the real UX.
  - **Deliberate exception: `onboarding/`.** Chandler, who was building the real auth/DB/API
    foundation in `ab-peers`, is no longer on the project (health reasons). The phone/verify steps
    and the final profile submit in `onboarding/` call a real hosted Supabase project
    (`@/lib/supabase`) for phone-auth OTP, the `members` table, and photo storage — see
    `supabase/migrations/`. Every other step, and every other route in this folder, still follows
    the mock-data-only rule above. Tests mock `@/lib/supabase` rather than hitting the network.
- **Every stub route carries a `{/* TODO(team): ... */}` block** listing the acceptance criteria
  for that flow, sourced from docs/CONTEXT.md. Keep it updated as the flow evolves — when an item
  is actually implemented, check it off or delete it rather than leaving stale TODOs.
- **One paragraph at the top of the page** describing what this flow is and why it exists, drawn
  from docs/CONTEXT.md. This keeps the page legible to someone who opens it cold, without having
  to cross-reference the docs.
- If a flow grows enough sub-components to be unwieldy in one file, split them into the same
  folder (e.g. `routes/map/filter-sidebar.tsx`) rather than promoting them to `src/components/` —
  they only get promoted once a second route needs them.

## The 5 flows (priority order, from docs/CONTEXT.md)

1. `onboarding/` — wizard for new peers/mentors.
2. `map/` — filterable mentor/peer map.
3. `profile/` — single peer/mentor profile, reached from a map pin.
4. `connect/` — message or reveal-contact action.
5. `coordinator/` — spreadsheet upload, roster, PII-gated dashboard.
