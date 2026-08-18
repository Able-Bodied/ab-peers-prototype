import { afterEach, describe, expect, it, vi } from 'vitest';

// Regression test for a real bug: src/lib/supabase.ts used to construct the
// client — and throw on missing env vars — at module load time. Because
// App.tsx eagerly imports every route including onboarding's phone/verify
// steps, that throw blanked the entire app before React ever rendered, not
// just the onboarding flow. getSupabase() must stay lazy: importing this
// module should never throw, only calling it should.
describe('getSupabase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not throw when imported, even with no env vars set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    await expect(import('@/lib/supabase')).resolves.toBeDefined();
  });

  it('throws a clear error only when actually called without config', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { getSupabase } = await import('@/lib/supabase');
    expect(() => getSupabase()).toThrow(/Missing VITE_SUPABASE_URL/);
  });

  it('returns a client when config is present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    const { getSupabase } = await import('@/lib/supabase');
    expect(getSupabase()).toBeDefined();
  });
});
