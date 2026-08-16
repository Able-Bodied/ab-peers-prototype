# PII Guardrails

These rules are binding for every human and every AI agent working in this repo — read this
before touching any data, mock or otherwise. Every AGENTS.md in this repo references this file;
this is the one place the rules are spelled out in full.

## The hard rule

**Never commit real member or mentor data, anywhere, ever.** Eric's Craig Hospital spreadsheet —
and any derivative of it, anonymized or not — must never enter this repo, the `ab-peers` repo, a
commit, an issue, a pull request, or the context window of any AI agent working on either repo.
This holds even for "just testing something locally" — if a task seems to call for the real
spreadsheet, don't reach for it.

Anonymized-but-derived copies (e.g., "the same rows with names replaced") also stay out of both
repos until a vetted, explicit process exists for handling that kind of data safely. Right now,
that process doesn't exist, so the answer is always no.

## What mock data has to look like

Every fixture in this repo (see `src/mocks/seed.ts`) must be **obviously fake** on inspection:

- **Names** come from a fixed, intentionally fake-sounding name list — not names that could
  plausibly be a real person pulled from a real roster.
- **Emails** use the `example.com` domain, never anything that could resolve to a real inbox.
- **Phone numbers**, if a fixture ever needs one, use the reserved `555` exchange
  (e.g. `(555) 555-0100`) — never a number that could route to a real line.
- **Coordinates** are city-center granularity only — never street-level precision, never anything
  that could be reverse-geocoded to an actual residence or clinic address. See `Location` in
  `src/types/domain.ts`.

If you're adding a new mock record and you're not sure whether a value is "obviously fake enough,"
it isn't — go more obviously fake, not less.

## Why this matters beyond "don't leak data"

Location and disability status, together, are unusually sensitive — that combination can identify
someone and reveal a protected health condition at the same time. Anything that's genuinely
user-identifying belongs behind real authentication in the production product (`ab-peers`), full
stop. The prototype's entire job is to prove out UX flows; it never needs real data to do that, and
building the habit of reaching for real data "just to see how it looks" is exactly the habit this
document exists to prevent.

## If you're not sure

If a task seems to require real data — a real spreadsheet, a real name, a real location more
precise than a city — **stop and ask Chandler** before proceeding. This applies equally to human
contributors and to AI agents; an agent that hits this situation should surface it explicitly
rather than guessing or working around it.
