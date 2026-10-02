import { supabase, isSupabaseConfigured } from "./supabase";
import type { AuthError, Session, User } from "@supabase/supabase-js";

/**
 * The auth boundary for the whole app.
 *
 * Pages never touch the Supabase client directly — they call these functions
 * and render the result. That keeps error-message wording in one place and
 * means swapping the provider later touches this file and nothing else.
 */

/** Which field an error belongs against, so the form can point at it. */
export type ErrorField = "displayName" | "email" | "password" | "form";

export type AuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; message: string; field: ErrorField };

const NOT_CONFIGURED: AuthResult = {
  ok: false,
  field: "form",
  message:
    "Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.",
};

/**
 * Supabase surfaces provider and database errors verbatim. They are accurate
 * but written for developers, so they are translated here into something a
 * person reading a sign-in form can act on. Anything unrecognised falls
 * through to the original text rather than a vague "something went wrong" —
 * an unexpected but specific message beats a generic one.
 */
function describe(error: AuthError): { message: string; field: ErrorField } {
  const code = error.code ?? "";
  const raw = error.message.toLowerCase();

  if (error.status === 429 || code === "over_request_rate_limit") {
    return {
      field: "form",
      message: "Too many attempts. Wait a minute and try again.",
    };
  }

  if (code === "invalid_credentials" || raw.includes("invalid login")) {
    return {
      field: "form",
      // Deliberately does not say which half was wrong — that would reveal
      // whether an account exists for the address.
      message: "That email and password do not match an account.",
    };
  }

  if (code === "email_not_confirmed" || raw.includes("email not confirmed")) {
    return {
      field: "form",
      message:
        "Confirm your email address before signing in — check your inbox for the link.",
    };
  }

  if (code === "user_already_exists" || raw.includes("already registered")) {
    return {
      field: "email",
      message: "An account with this email already exists.",
    };
  }

  if (code === "weak_password" || raw.includes("password should be")) {
    return { field: "password", message: error.message };
  }

  if (code === "validation_failed" && raw.includes("email")) {
    return { field: "email", message: "That email address was rejected." };
  }

  // A fetch failure has no status, and means the request never landed.
  if (!error.status) {
    return {
      field: "form",
      message: "Could not reach the server. Check your connection and retry.",
    };
  }

  return { field: "form", message: error.message };
}

function fail(error: AuthError): AuthResult {
  const { message, field } = describe(error);
  return { ok: false, message, field };
}

/* --- Sign up ------------------------------------------------------------ */

export async function signUp(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      // Stored on auth.users.raw_user_meta_data; a trigger copies it into
      // public.profiles (see supabase/migrations).
      data: { display_name: input.displayName.trim() },
      emailRedirectTo: `${window.location.origin}/welcome`,
    },
  });

  if (error) return fail(error);

  // With email confirmation enabled, Supabase returns a user but no session.
  const needsEmailConfirmation = !data.session;
  return { ok: true, needsEmailConfirmation };
}

/* --- Sign in ------------------------------------------------------------ */

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  return error ? fail(error) : { ok: true };
}

/* --- Password reset ----------------------------------------------------- */

/**
 * Asks Supabase to email a recovery link.
 *
 * Supabase intentionally reports success for addresses that have no account,
 * and this function preserves that: the caller must show the same
 * confirmation either way, or the page becomes a way to discover which
 * addresses are registered. Only transport and rate-limit failures surface.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  return error ? fail(error) : { ok: true };
}

/** Sets a new password for the recovery session the reset link established. */
export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.updateUser({ password });
  return error ? fail(error) : { ok: true };
}

/* --- Session ------------------------------------------------------------ */

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * What to call this person in the UI.
 *
 * Reads the display name captured at sign-up. It lives on the user's metadata
 * as well as in public.profiles, and the metadata copy arrives with the
 * session — so the navbar can name someone without a database round-trip.
 */
export function displayNameOf(user: User | null | undefined): string {
  if (!user) return "";

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.display_name === "string" ? meta.display_name : "";
  if (name.trim()) return name.trim();

  // Accounts created before the field existed, or straight in the dashboard.
  return user.email?.split("@")[0] ?? "Account";
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
export function onAuthChange(
  fn: (session: Session | null) => void,
): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    fn(session),
  );
  return () => data.subscription.unsubscribe();
}

export { isSupabaseConfigured };
