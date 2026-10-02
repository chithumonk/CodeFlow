import { supabase } from "./supabase";

/**
 * A small GraphQL client.
 *
 * Apollo Client is a large dependency for what this app does: a handful of
 * queries, no normalized cache, no subscriptions. A fetch wrapper that
 * attaches the session token is the whole requirement.
 */

const ENDPOINT =
  (import.meta.env.VITE_GRAPHQL_URL as string | undefined) ??
  "http://localhost:4000/";

export class GraphQLRequestError extends Error {
  readonly code: string;
  /** Present for validation failures, so a form can point at the field. */
  readonly field?: string;

  constructor(message: string, code: string, field?: string) {
    super(message);
    this.name = "GraphQLRequestError";
    this.code = code;
    this.field = field;
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; field?: string };
  }>;
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  // The API derives the user from this token; it is the only thing that
  // establishes identity.
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new GraphQLRequestError(
      "Could not reach the CodeFlow API. Is the server running?",
      "NETWORK",
    );
  }

  let body: GraphQLResponse<T>;
  try {
    body = (await response.json()) as GraphQLResponse<T>;
  } catch {
    throw new GraphQLRequestError(
      `The API returned an unexpected response (${response.status}).`,
      "BAD_RESPONSE",
    );
  }

  const error = body.errors?.[0];
  if (error) {
    throw new GraphQLRequestError(
      error.message,
      error.extensions?.code ?? "UNKNOWN",
      error.extensions?.field,
    );
  }

  if (!body.data) {
    throw new GraphQLRequestError("The API returned no data.", "NO_DATA");
  }

  return body.data;
}

/** True when the failure means "sign in again". */
export function isUnauthenticated(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError && error.code === "UNAUTHENTICATED"
  );
}
