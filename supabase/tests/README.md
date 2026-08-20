# SQL tests

Row level security is the only thing standing between one member's messages and everybody else's,
and it is the part of this repo that Vitest cannot reach: a test that mocks `@/lib/supabase` proves
the client asked the right question, not that the database would have refused the wrong one. These
run the real policies, as the real roles, with a real `auth.uid()`.

They are not wired into `pnpm test` — they need Docker, and the hackathon's CI does not have it.
Run them by hand after touching anything in a migration that grants, revokes, or writes a policy.

## Running them

```bash
docker run -d --name ab-sqltest -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
sleep 4
docker cp supabase/tests/00_bare_postgres_stub.sql ab-sqltest:/tmp/
docker cp supabase/migrations/20260820140000_chat_messaging.sql ab-sqltest:/tmp/
docker cp supabase/tests/01_chat_rls_test.sql ab-sqltest:/tmp/
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/00_bare_postgres_stub.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/20260820140000_chat_messaging.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 --single-transaction -f /tmp/01_chat_rls_test.sql
docker rm -f ab-sqltest
```

The last line prints `ALL TESTS PASSED`, or stops at the first failed assertion with the sentence
describing what should have been true. Each file assumes a **fresh** database — the fixtures use
fixed ids, so a second run against the same container fails on the primary key rather than on
anything real.

## The files

| File | What it covers |
| --- | --- |
| `00_bare_postgres_stub.sql` | The parts of a Supabase database the migration leans on — the `anon`/`authenticated` roles, an `auth.uid()` that reads the same GUC the real one does, and `public.members` as the migrations before chat leave it. Lets the whole thing run on a stock `postgres:17` image with no Supabase stack. |
| `01_chat_rls_test.sql` | Chat against a database where it created the `waves` table itself: waving, waving back, the mentor asymmetry, capacity, blocking, silent declines, rate limits, what a non-participant can reach, what `anon` can reach, and that no chat view exposes a phone number. |
| `02_chat_waves_bridge_test.sql` | Chat against a database where Discover's `20260820130000_waves.sql` got there first — which is how the shared database actually looks. Covers the two-way reconciliation between their `waved_back` boolean and chat's `status`, and proves the contact rules hold on the insert path that never calls `send_wave()`. |

Run `02` on a container where Discover's waves migration was applied *before* the chat one; that
ordering is the point of the file.

## Why these are worth keeping

Both of the real bugs found while building chat were found here and nowhere else: a wave's opening
note being posted twice when two triggers each thought they owned it, and the contact rules being
skipped entirely on the insert path that does not go through the RPC. Neither is visible from the
client, and neither would have failed a test that mocked the database.
