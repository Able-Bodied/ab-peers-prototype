import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Which organizations the viewer follows, shared across routes so a follow made on the event
 * detail page (src/routes/event/page.tsx) is reflected in the events list's Following tab
 * (src/routes/events/page.tsx) without a reload.
 *
 * There is no Supabase auth session (see src/lib/rsvps.tsx), and unlike RSVPs this is purely a
 * personal list with no aggregate/other-viewer count to reconcile — so it lives in localStorage
 * only, keyed by organization slug, rather than a table.
 */

const FOLLOWED_ORGS_KEY = 'ab-peers:followed-orgs';

interface FollowsContextValue {
  followedSlugs: Set<string>;
  isFollowing: (orgSlug: string) => boolean;
  toggleFollow: (orgSlug: string) => void;
}

const FollowsContext = createContext<FollowsContextValue | null>(null);

/**
 * Storage is best-effort: Safari in private mode throws on write, and losing the followed list
 * just means starting from empty next time, not a broken page.
 */
function storage(): Storage | null {
  const candidate = (globalThis as { localStorage?: Storage }).localStorage;
  return typeof candidate?.getItem === 'function' ? candidate : null;
}

function readInitial(): Set<string> {
  const raw = storage()?.getItem(FOLLOWED_ORGS_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((slug): slug is string => typeof slug === 'string'));
  } catch {
    return new Set();
  }
}

export function FollowsProvider({ children }: { children: ReactNode }) {
  const [followedSlugs, setFollowedSlugs] = useState<Set<string>>(readInitial);

  const toggleFollow = useCallback((orgSlug: string) => {
    setFollowedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(orgSlug)) next.delete(orgSlug);
      else next.add(orgSlug);
      try {
        storage()?.setItem(FOLLOWED_ORGS_KEY, JSON.stringify([...next]));
      } catch {
        // Nothing to do — this viewer just won't be remembered across a reload.
      }
      return next;
    });
  }, []);

  const isFollowing = useCallback((orgSlug: string) => followedSlugs.has(orgSlug), [followedSlugs]);

  const value = useMemo(
    () => ({ followedSlugs, isFollowing, toggleFollow }),
    [followedSlugs, isFollowing, toggleFollow],
  );

  return <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>;
}

export function useFollows(): FollowsContextValue {
  const value = useContext(FollowsContext);
  if (!value) throw new Error('useFollows must be used within a FollowsProvider');
  return value;
}
