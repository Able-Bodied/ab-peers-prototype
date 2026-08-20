# AGENTS.md — ab-peers-prototype

Read docs/CONTEXT.md before building anything. Read docs/PII.md before touching data. Both are
binding.

## What this repo is

This is the hackathon UI for AbleBodied's peer mentor matching tool. It exists to let the
prototype team iterate on UX flow fast, using mock data only — there is no backend, no auth, and
no database here, and there shouldn't be. Optimize for how quickly a flow can be tried, shown to
someone, and reworked, not for architectural correctness; that's the job of the `ab-peers`
monorepo, where Chandler is building the real auth/DB/API foundation in parallel. Whatever UI
proves out here over the hackathon weekend gets transplanted into `ab-peers/apps/web`, so keep
`src/types/domain.ts` aligned with `ab-peers/packages/types` and keep components reasonably
self-contained — but don't let that slow down iteration speed, which is this repo's entire reason
to exist.

## Golden rules

1. Plan before you code. For multi-file changes, state the plan first.
2. Small, focused commits with imperative messages ("Add mentor map filter sidebar").
3. Run `pnpm check` (format+lint+typecheck) and `pnpm test` before declaring anything done. CI
   enforces both.
4. Never weaken tsconfig strictness, disable lint rules file-wide, or add `any`/`@ts-ignore` to
   make errors go away. Fix the type.
5. No real personal data, ever (docs/PII.md).
6. Directory-local AGENTS.md files override this file for their subtree. Read the nearest one.

## Commands

| Command          | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------- |
| `pnpm dev`        | Start the Vite dev server with hot reload.                               |
| `pnpm build`       | Type-check (`tsc -b`) and produce a production build in `dist/`.         |
| `pnpm test`        | Run the Vitest suite once (CI mode).                                     |
| `pnpm test:watch`  | Run Vitest in watch mode while developing.                               |
| `pnpm check`       | `biome ci` + `eslint --max-warnings 0` + `tsc -b --noEmit`. Run before declaring anything done. |
| `pnpm fix`         | `biome check --write` + `eslint --fix`. Auto-fixes what it safely can.   |
| `pnpm preview`     | Serve the production build locally, for a final look before a demo.      |

## Running the dev server from a worktree

`preview_start` with a `name` resolves `.claude/launch.json` against the main repo root, not the
worktree you're actually in — even if you drop a `launch.json` inside the worktree's own
`.claude/`, it's ignored. Calling it by name from a worktree silently starts (or reuses) the
**main** branch's server, which then also eats the default port, and you end up verifying the
wrong branch. This has bitten multiple worktree sessions.

To preview a worktree, don't use `name` — start the server yourself and open it by URL instead:

```bash
cd .claude/worktrees/<worktree-name>
./node_modules/.bin/vite --port <unique-port> --strictPort
```

Run that via Bash with `run_in_background: true`. Notes on getting the port right, since this has
gone wrong in more than one way:

- **Don't run it as `pnpm dev -- --port <n> --strictPort`.** The extra `--` sometimes reaches vite
  literally (visible in the background task's own echoed command line, e.g. `$ vite -- --port
  5175 ...`), which makes vite ignore the flags that follow and fall back to its default port —
  silently landing you on 5173 (or bumped to whatever's next free) instead of the port you asked
  for. Call the local `vite` binary directly with the flags, as above, to sidestep pnpm's arg
  forwarding entirely.
- **Always pass `--strictPort`.** Without it, vite silently bumps to the next free port when your
  chosen one is taken, instead of failing — so the port you *asked for* and the port it's actually
  *listening on* can silently diverge.
- **Before opening the browser, verify the port yourself — don't trust the requested port or the
  tool's own summary.** Read the background task's output file (or grep its logs) for the actual
  `Local: http://localhost:PORT` line vite printed, and cross-check with
  `lsof -iTCP:<port> -sTCP:LISTEN -n -P` that the PID holding it is the one you just spawned (its
  `COMMAND`/args should point at the worktree's own `node_modules`). Only then call `preview_start`
  with `{ "url": "http://localhost:<that-port>" }` — never `{ "name": ... }`. Opening a port
  without checking risks silently attaching to an unrelated, already-running server (yours from an
  earlier attempt, another worktree's, or main's) and testing the wrong code.
- Pick a port no other active worktree is already using — check `lsof -iTCP -sTCP:LISTEN -n -P` up
  front if unsure.

## Test login, for agents

Discover, Profile, and other signed-in routes gate on a real Supabase auth session (phone + OTP
via `signInWithOtp`/`verifyOtp`) — there's no local mock for that part. Clicking through the phone
number and 6-digit code screens every time you want to check a signed-in flow is slow, so
`/dev-login` runs those same two Supabase calls programmatically instead of through the wizard UI.
It is unlisted (not in `App.tsx`'s sidebar `flows`) but not a bypass: a wrong phone or code fails
exactly the way it would in the UI, because it's the same credential check.

The hosted project this repo's `.env.local` points at has a fixed test user for this: phone
`1111111111`, code `111111`. To land signed in on any route:

```
/dev-login?phone=1111111111&code=111111&next=/discover
```

`next` defaults to `/discover` if omitted. See `src/routes/dev-login/page.tsx`.

## Conventions

- TypeScript strict; no default exports except route components (`src/routes/*/page.tsx`); named
  exports elsewhere.
- Tests colocated: `foo.ts` → `foo.test.ts` (or `foo.test.tsx` for components). Every new module
  with logic gets a test. UI: Testing Library, test behavior not markup — assert on what a user
  can see or do, not on class names or DOM structure.
- Domain vocabulary: Peer, Mentor, Coordinator, Organization — use these names exactly (see
  `src/types/domain.ts`). Don't invent synonyms ("user", "member", "provider") for these concepts.
- Every route lives in `src/routes/<flow>/page.tsx` and renders from mock data
  (`src/mocks/seed.ts`) — no `fetch`, no network calls, no simulated latency unless a specific
  flow is explicitly testing a loading state.
- shadcn/ui primitives live in `src/components/ui/` and are treated as generated/vendored code —
  don't hand-edit their internals unless you're deliberately customizing the design system for
  everyone; add composite, app-specific components alongside them in `src/components/`.
