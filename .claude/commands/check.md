---
description: Run format/lint/typecheck/tests and fix what's found.
---

Run the full local quality gate and fix anything it turns up:

1. `pnpm fix` — auto-fixes formatting and safe lint issues (`biome check --write` +
   `eslint --fix`).
2. `pnpm check` — `biome ci` + `eslint --max-warnings 0` + `tsc -b --noEmit`. This is the strict,
   non-mutating version of step 1; it's what CI runs.
3. `pnpm test` — the Vitest suite.

Fix whatever step 2 or step 3 surfaces that step 1 couldn't auto-fix. Rules of engagement:

- Never weaken `tsconfig.json`/`tsconfig.app.json` strictness to make a type error go away — fix
  the actual type.
- Never disable an ESLint or Biome rule file-wide (or repo-wide) to silence a warning — fix the
  code, or if the rule is genuinely wrong for one specific line, use the narrowest possible
  inline suppression with a comment explaining why.
- Never add `any` or `@ts-ignore`/`@ts-expect-error` as a way to move past an error without
  understanding it.
- If a test fails because the code's behavior genuinely changed on purpose, update the test to
  match the new intended behavior — don't delete or skip it.

Report back with a short summary: what was auto-fixed, what needed a manual fix and why, and
confirmation that `pnpm check` and `pnpm test` both pass clean.
