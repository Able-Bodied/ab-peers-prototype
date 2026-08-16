---
description: Interview-first workflow for building a new feature or flow in the prototype.
---

You're about to build something new in `ab-peers-prototype`. Follow this sequence — don't skip
the interview step, even when the request looks unambiguous. Read `AGENTS.md`, `docs/CONTEXT.md`,
and `docs/PII.md` first if you haven't already this session.

## 1. Restate the ask

In your own words, summarize what's being requested: which flow it touches (see the 5 MVP flows
in `docs/CONTEXT.md`), what should change, and what "done" looks like. This is a checkpoint for
you as much as for the person reading it — if you can't restate it cleanly, you don't understand
it yet.

## 2. List ambiguities as questions

Before writing or changing any code, list every genuine ambiguity as an explicit question:

- Unclear scope ("does this replace the existing skeleton or add to it?")
- Unclear data shape (does it need a new field on `Mentor`/`Peer`/etc., or does an existing field
  cover it?)
- Unclear UX (what should happen on error, empty state, mobile?)
- Anything that smells like it might require real data — flag it and point at `docs/PII.md`
  rather than guessing.

If there are truly no ambiguities, say so explicitly rather than skipping the section.

## 3. Wait for answers

Stop and wait for a response before touching any files. Don't start implementing "in the
meantime" on the parts that seem unambiguous — the answers might change the shape of those too.

## 4. Plan

Once you have answers, write a short plan: which files you'll touch or create, and roughly what
changes in each. For anything touching `src/types/domain.ts`, call out explicitly that it should
stay a plausible match for `ab-peers/packages/types` (see docs/CONTEXT.md's "Working model").

## 5. Implement

Build it. Follow the conventions in the nearest `AGENTS.md` (root, then `src/`, then the
directory you're actually working in — the most specific one wins). Add or update tests alongside
any new logic.

## 6. Check and test

Run `pnpm check && pnpm test`. Fix everything it finds — don't weaken tsconfig, disable lint rules
file-wide, or reach for `any`/`@ts-ignore` to make an error disappear.

## 7. Summarize

Summarize the diff: what changed, what you deliberately left as a TODO (and why), and anything
from step 2 that turned out to matter more than expected.
