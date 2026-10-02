import { GraphQLError } from "graphql";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, clientForToken } from "../db/supabase.js";
import { logger } from "../logging/logger.js";

export interface AuthedUser {
  id: string;
  email: string | null;
}

export interface GraphQLContext {
  /** null when the request arrived without a usable token. */
  user: AuthedUser | null;
  /** Scoped to the caller; null when unauthenticated. */
  db: SupabaseClient | null;
}

/**
 * Resolve the caller from the Authorization header.
 *
 * The user id comes from Supabase verifying the token's signature — never
 * from anything the client sent in the request body. A client that claims to
 * be someone else simply has no valid token for them.
 */
export async function buildContext(
  authorization: string | undefined,
): Promise<GraphQLContext> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { user: null, db: null };

  const { data, error } = await anonClient.auth.getUser(token);

  if (error || !data.user) {
    // Expected whenever a session expires; not worth an error-level log.
    logger.debug({ reason: error?.message }, "rejected token");
    return { user: null, db: null };
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? null },
    db: clientForToken(token),
  };
}

/** Narrow a context to an authenticated one, or fail the field. */
export function requireAuth(ctx: GraphQLContext): {
  user: AuthedUser;
  db: SupabaseClient;
} {
  if (!ctx.user || !ctx.db) {
    throw new GraphQLError("You must be signed in to do that.", {
      extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
    });
  }
  return { user: ctx.user, db: ctx.db };
}
