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

`03` needs `20260820100000_members_discovery_profile.sql` (from the main branch's
`supabase/migrations/`, not this branch's) applied first, for the member columns Peer Bot's row
uses:

```bash
docker run -d --name ab-sqltest -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
sleep 4
docker cp supabase/tests/00_bare_postgres_stub.sql ab-sqltest:/tmp/
docker cp /path/to/main/supabase/migrations/20260820100000_members_discovery_profile.sql ab-sqltest:/tmp/
docker cp supabase/migrations/20260820140000_chat_messaging.sql ab-sqltest:/tmp/
docker cp supabase/migrations/20260820150000_peer_bot.sql ab-sqltest:/tmp/
docker cp supabase/tests/03_peer_bot_test.sql ab-sqltest:/tmp/
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/00_bare_postgres_stub.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/20260820100000_members_discovery_profile.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/20260820140000_chat_messaging.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/20260820150000_peer_bot.sql
docker exec ab-sqltest psql -U postgres -q -v ON_ERROR_STOP=1 --single-transaction -f /tmp/03_peer_bot_test.sql
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
| `03_peer_bot_test.sql` | `20260820150000_peer_bot.sql`: waving at Peer Bot opens the thread and gets a greeting, a message carried by that wave still lands (the guard fix), the handcycling question gets the AbleBodied answer, anything else gets one of the fifty jokes, and `bot_jokes` is unreadable by any client role. |

Run `02` and `03` on a container where Discover's migrations
(`20260820100000_members_discovery_profile.sql`, and for `02` also
`20260820130000_waves.sql`) were applied *before* the chat one — that is how the shared database
actually looks, and `03` needs the columns `20260820100000` adds (`show_in_browse`, `photo_alt`,
and the rest) to insert Peer Bot's row at all.

## Why these are worth keeping

Both of the real bugs found while building chat were found here and nowhere else: a wave's opening
note being posted twice when two triggers each thought they owned it, and the contact rules being
skipped entirely on the insert path that does not go through the RPC. Neither is visible from the
client, and neither would have failed a test that mocked the database.
