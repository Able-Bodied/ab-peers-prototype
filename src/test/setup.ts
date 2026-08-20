import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Lets src/lib/supabase.ts import cleanly in every test, including ones that
// never touch onboarding. Tests that actually exercise Supabase calls mock
// '@/lib/supabase' directly rather than relying on this fake project.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// jsdom doesn't implement the Pointer Events APIs Radix's Select uses.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

// This jsdom build exposes `window` but no `localStorage`, which src/lib/rsvps.tsx uses to keep a
// viewer's Interested/Going marks across a reload. An in-memory stand-in lets tests exercise that
// persistence instead of silently taking the "storage unavailable" path on every run.
// The key can be present while the value is undefined (jsdom leaves it that way for an opaque
// origin), so this checks for a usable object rather than for the property.
if (typeof (globalThis as { localStorage?: Storage }).localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

afterEach(() => {
  cleanup();
});
