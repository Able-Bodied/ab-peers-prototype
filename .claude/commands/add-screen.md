---
description: Recipe for adding a new screen/route to the prototype.
---

Stack-specific recipe for adding a new screen. If this is really a *new feature* rather than a
small additive screen, use `/new-feature` instead — this command assumes the scope is already
clear.

## Steps

1. **Create the route folder.** `src/routes/<flow-name>/page.tsx`, default-exporting the route
   component (see `src/routes/AGENTS.md`).
2. **Wire it into `App.tsx`.** Add a `<Route path="/<flow-name>" element={<FlowPage />} />` and, if
   it's one of the 5 MVP flows, add it to the `flows` array that drives the sidebar nav.
3. **Write the one-paragraph description.** Pull it from `docs/CONTEXT.md` — every stub page opens
   with a paragraph explaining what the flow is and why it exists, not just what's on screen.
4. **Build the skeleton from shadcn primitives.** Reach for what's already in
   `src/components/ui/` (Button, Card, Input, Select, Dialog, Form, Label, Badge, Avatar, Tabs)
   before writing new markup. Render seed data from `@/mocks/seed` wherever it makes the skeleton
   more concrete — an empty skeleton is much harder to react to than one with realistic-looking
   (obviously fake) data in it.
5. **Add the `TODO(team)` block.** A `{/* TODO(team): ... */}` comment listing the acceptance
   criteria for this flow, sourced from `docs/CONTEXT.md`.
6. **No network calls.** Everything renders from mock data. If the screen needs to react to user
   input, use local component state — there's no backend to call.
7. **Add a test.** At minimum, a smoke test that the heading renders and, if there's meaningful
   interaction (a filter, a dialog, a form), a behavior test for that. Testing Library, behavior
   not markup — see the root `AGENTS.md` conventions.
8. **Run `pnpm check && pnpm test`** before considering the screen done.

## Map screens specifically

There's no map library pre-wired on purpose — it's an open team decision. `src/routes/map/page.tsx`
uses a placeholder `<div>` where the map should go; its TODO block calls out Leaflet + OpenStreetMap
tiles or MapLibre GL as the two key-free options (no API key to manage mid-hackathon). If you're
the one making that call, update the TODO to reflect the decision once it's made.
