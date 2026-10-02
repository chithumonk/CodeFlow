import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

/**
 * A Supabase client scoped to one caller.
 *
 * Every query runs with the caller's own JWT attached, so PostgreSQL's
 * row-level security evaluates `auth.uid()` as that user. The service-role
 * key is deliberately never used here — with it, a single missing `where`
 * clause in a resolver would expose every user's data. This way the database
 * refuses the query regardless of what the resolver asks for.
 */
export function clientForToken(accessToken: string): SupabaseClient {
  return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Anonymous client, used only to verify a token's authenticity. */
export const anonClient: SupabaseClient = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
