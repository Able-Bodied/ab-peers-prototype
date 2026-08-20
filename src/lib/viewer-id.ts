/**
 * The anonymous browser identity shared by every "this viewer" feature that needs one —
 * RSVPs (src/lib/rsvps.tsx) and dismissals (src/lib/dismissals.tsx) both write rows keyed by
 * this id, so they have to agree on where it comes from and mint the exact same one, not two
 * ids that happen to look alike.
 *
 * There is no Supabase auth session in this prototype (see docs/CONTEXT.md), so this is a
 * random id the client mints into localStorage the first time it's needed — a browser
 * identity, not an account.
 */

const VIEWER_ID_KEY = 'ab-peers:viewer-id';

/**
 * Storage is best-effort: Safari in private mode throws on write, and losing the viewer id just
 * means a fresh one gets minted next time, not a broken page.
 */
function storage(): Storage | null {
  // The DOM types promise localStorage always exists, but it does not: a jsdom document on an
  // opaque origin leaves it undefined, and privacy modes can too. Checking for a usable object
  // rather than trusting the type keeps this from throwing on load.
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return typeof candidate?.getItem === 'function' ? candidate : null;
}

export function getOrCreateViewerId(): string {
  const store = storage();
  const existing = store?.getItem(VIEWER_ID_KEY);
  if (existing) return existing;

  const fresh = crypto.randomUUID();
  try {
    store?.setItem(VIEWER_ID_KEY, fresh);
  } catch {
    // Nothing to do — this viewer just won't be remembered across a reload.
  }
  return fresh;
}
