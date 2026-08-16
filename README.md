# ab-peers-prototype

Hackathon UI for AbleBodied's peer mentor matching tool for the spinal cord injury (SCI)
community. Mock data only — no backend, no auth, no database. See [docs/CONTEXT.md](docs/CONTEXT.md)
for the full picture of what we're building and why.

## Quickstart

```sh
corepack enable
pnpm install
pnpm dev
```

Then open the URL Vite prints (typically http://localhost:5173).

Requires Node 22 (see `.nvmrc`) and pnpm via corepack — no separate pnpm install needed.

## What to build this weekend

The five MVP flows, in priority order, each stubbed out under `src/routes/`:

1. **Onboarding** (`src/routes/onboarding/`) — a short wizard for new peers/mentors.
2. **Mentor Map** (`src/routes/map/`) — a filterable map of mentors and peers.
3. **Profile** (`src/routes/profile/`) — a single peer/mentor's full profile.
4. **Connect** (`src/routes/connect/`) — message or reveal-contact action.
5. **Coordinator Dashboard** (`src/routes/coordinator/`) — spreadsheet upload, roster, PII-gated
   view, last-contact tracking.

Each stub page has a `{/* TODO(team): ... */}` block listing that flow's acceptance criteria —
start there. Pick a flow, run `/add-screen` or `/new-feature` in Claude Code if you want the
guided workflow, or just start editing.

Whatever proves out here gets transplanted into `ab-peers/apps/web` after the weekend, so keep
`src/types/domain.ts` in sync with the shapes described in docs/CONTEXT.md rather than inventing
prototype-only data shapes.

## Commands

| Command       | What it does                                                    |
| ------------- | ------------------------------------------------------------------ |
| `pnpm dev`     | Start the dev server.                                            |
| `pnpm build`   | Type-check and build for production.                             |
| `pnpm test`    | Run the test suite once.                                         |
| `pnpm check`   | Format check + lint + typecheck (what CI runs).                 |
| `pnpm fix`     | Auto-fix formatting and lint issues.                              |

## Read next

- [docs/CONTEXT.md](docs/CONTEXT.md) — mission, personas, MVP flows, what's deliberately deferred.
- [docs/PII.md](docs/PII.md) — data guardrails. Read this before touching `src/mocks/seed.ts`.
- [AGENTS.md](AGENTS.md) — conventions and golden rules for anyone (human or AI) working in this
  repo. Directory-local `AGENTS.md` files override it for their subtree.
