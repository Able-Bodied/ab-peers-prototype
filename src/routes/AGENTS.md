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
  - **Deliberate exception: `messages/` and `connect/`.** Chat runs against the real database
    too, through `@/lib/chat` and `@/lib/chat-api`
    (`supabase/migrations/20260820140000_chat_messaging.sql`). The reason is stronger than
    onboarding's: messaging that does not survive a reload demonstrates nothing about messaging,
    and the parts of chat actually worth proving out — who may contact whom, what a block does,
    what a declined wave tells its sender, whether a mentor at capacity can be reached — only
    exist if something enforces them. A mock layer would be asserting its own answers. Route
    tests mock `@/lib/chat-api`, not the network.
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
4. `connect/` — say hi, or write the first message.
5. `coordinator/` — spreadsheet upload, roster, PII-gated dashboard.
6. `messages/` — the waves inbox and the conversations it opens.

`connect/` and `messages/` are two halves of one feature: `connect/` is the moment somebody
decides to make contact, `messages/` is everything after. Both read `useChat()`; neither holds
chat state of its own. See `docs/CHAT.md` for the model and the privacy rules behind it.

**The connect action no longer reveals contact details.** An earlier draft had it reveal a phone
number or email depending on a privacy setting. PRD §14 settles it the other way — "email and
phone are never exposed between members" — so the connection *is* the message thread. The
database enforces this rather than trusting the UI: no view chat reads selects `phone`.
