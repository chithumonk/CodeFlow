import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, created from build-time environment variables.
 *
 * Both values are safe to ship in the bundle: the anon key is a public
 * identifier, and every table it can reach is gated by row-level security.
 * The service-role key must never appear in this directory.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * False when the project has not been pointed at a Supabase instance yet.
 * The auth pages check this so a missing .env produces a clear message
 * instead of a runtime crash on first click.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // Keep the session in localStorage and refresh it in the background,
        // so a reload does not sign the reader out.
        persistSession: true,
        autoRefreshToken: true,
        // The password-reset link comes back as a URL fragment that the
        // client needs to consume to establish the recovery session.
        detectSessionInUrl: true,
      },
    })
  : null;
