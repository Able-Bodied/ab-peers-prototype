# AGENTS.md — src/components/

Generated shadcn primitives live in `ui/`; composite, app-specific components live beside them in
this folder.

## `ui/`

These files (`button.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `form.tsx`,
`label.tsx`, `badge.tsx`, `avatar.tsx`, `tabs.tsx`) are shadcn/ui source — treat them as
vendored/generated code, not hand-authored app code:

- Don't add app-specific logic to a `ui/` component. If a screen needs a variant a primitive
  doesn't support, either use the primitive's existing variant props (most have a `cva`-based
  `variant`/`size` API) or wrap it in a composite component in `src/components/` instead of
  editing the primitive.
- If you do need to add a new shadcn primitive, prefer `pnpm dlx shadcn@latest add <name>` first.
  If the CLI can't reach the network or fights you, hand-write it from the standard shadcn source
  for consistency with what's already here (same style: Radix primitive + `cva` + `cn()`).
- ESLint's type-aware rules are intentionally not applied to this folder (see `eslint.config.js`)
  since it's vendored code — Biome's formatting and correctness checks still apply.

## Everything else in `components/`

Composite components — things assembled from `ui/` primitives plus app logic — live directly in
this folder (not in a further subfolder, unless a component grows a natural family, e.g.
`mentor-card/`). A composite component gets promoted here once a second route needs it; until
then, keep it colocated with the route that uses it (see `src/routes/AGENTS.md`).
