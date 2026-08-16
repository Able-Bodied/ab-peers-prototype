# AGENTS.md — src/

Conventions for everything under `src/`. Read the root `AGENTS.md` first; this narrows it down for
application code specifically.

## Layout

- `App.tsx` — the router shell and nav sidebar. It lists the 5 MVP flows (see docs/CONTEXT.md) and
  renders whichever route is active. Keep it thin: layout and routing only, no flow-specific logic.
- `main.tsx` — the React entry point. Rarely needs to change.
- `routes/` — one folder per flow, each with a `page.tsx`. See `src/routes/AGENTS.md`.
- `components/` — shared UI. See `src/components/AGENTS.md`.
- `mocks/` — fixture data. See `src/mocks/AGENTS.md`.
- `types/domain.ts` — the shared domain vocabulary (Peer, Mentor, Coordinator, Organization,
  Connection, …). This mirrors `ab-peers/packages/types` — don't add prototype-only fields here;
  see docs/CONTEXT.md's "Working model" section for why.
- `lib/utils.ts` — small, dependency-free helpers (currently just `cn()` for Tailwind class
  merging). Keep this file boring; if a helper needs its own tests and has real logic, it can
  still live here, but consider whether it belongs in `mocks/` or a route instead.
- `test/` — Vitest setup (`setup.ts`) and the example smoke test. New tests are colocated with the
  code they test, not added here.

## Components

- Prefer function components with named exports. The only files that default-export are
  `routes/*/page.tsx`.
- Keep components small and focused on one piece of UI. If a component needs its own state
  machine or nontrivial logic, pull that logic into a plain function (and test it) rather than
  burying it in JSX.
- Reach for the shadcn primitives in `components/ui/` before writing new markup from scratch —
  Button, Card, Input, Select, Dialog, Form, Label, Badge, Avatar, Tabs are already wired up.

## Styling

- Tailwind v4 utility classes directly in JSX. `src/index.css` is the Tailwind entry point and
  shadcn theme (CSS variables) — don't add new global CSS files.
- Use `cn()` from `@/lib/utils` whenever a className is conditional or composed from props; don't
  hand-roll string concatenation for classes.
- Don't introduce a second styling system (CSS modules, styled-components, etc.) — Tailwind +
  shadcn is the one approach for this repo.

## Hooks

- There's no custom `hooks/` directory yet. If a flow needs a reusable hook, colocate it next to
  its first caller (e.g. `routes/map/use-mentor-filters.ts`) with a test, and only promote it to a
  shared `src/hooks/` once a second flow needs it.
