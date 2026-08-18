import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Constructed lazily, on first call, not at module load. Importing this file
 * must never throw — App.tsx pulls in every route eagerly, so a throw here
 * would blank the entire app, not just the onboarding flow.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your project values.',
    );
  }

  client = createClient(url, anonKey);
  return client;
}
