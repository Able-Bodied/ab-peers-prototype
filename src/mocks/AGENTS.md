# AGENTS.md — src/mocks/

Fixture data for the prototype. **Read docs/PII.md before adding or editing anything here** — it
is not optional, and the rules apply to every value in this folder, not just the obviously
sensitive ones.

## How to extend the fixtures

- `seed.ts` exports `mentors`, `coordinators`, and `organizations`, each typed against
  `@/types/domain`. Add new records by extending these arrays — don't create parallel ad hoc data
  structures elsewhere in the app.
- Keep new mentors/coordinators consistent with the existing ones: fake name, `example.com` email,
  `555` phone number if a phone field is ever added, city-center coordinates from a real US city
  (pick a new one or reuse an existing `Location` constant at the top of the file).
- If a flow needs a new fixture shape (e.g. `Connection` records for the connect/coordinator
  flows), add it as its own exported array in this file, typed against the matching interface in
  `src/types/domain.ts`. Don't invent a shape that doesn't exist in `domain.ts` — add the type
  there first if it's missing, keeping it in sync with what `ab-peers/packages/types` should
  plausibly look like.
- Prefer growing the existing arrays over parameterizing "random" fixture generation — this repo
  is small enough that explicit, readable fixtures are more useful for demos than generated ones,
  and they're much easier to eyeball for PII compliance.

## PII rules, short version (see docs/PII.md for the full version)

- Fake names only, `example.com` emails only, `555` phone numbers only, city-center coordinates
  only.
- Never copy in a real spreadsheet, a real name, or a real precise location — if a task seems to
  need real data, stop and ask Chandler instead of guessing.
