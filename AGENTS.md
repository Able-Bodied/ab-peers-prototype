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
