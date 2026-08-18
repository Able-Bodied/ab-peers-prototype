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

afterEach(() => {
  cleanup();
});
