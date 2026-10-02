/**
 * The URL the page was opened with, captured in index.html before any module
 * executes.
 *
 * This exists because Supabase's auth client strips the hash while it
 * initialises — the access token on a good link, `error=…` on an expired or
 * already-used one. By the time a component mounts, the evidence of how the
 * reader arrived is gone, so it is stashed up front.
 */

interface LaunchUrl {
  hash: string;
  search: string;
}

declare global {
  interface Window {
    __cfLaunchUrl?: LaunchUrl;
  }
}

export interface AuthCallback {
  /** e.g. "access_denied" */
  error?: string;
  /** e.g. "otp_expired" — more specific than `error`. */
  errorCode?: string;
  /** Human-readable text from the provider. */
  description?: string;
  /** True when the link carried a session. */
  hasToken: boolean;
}

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Read auth callback parameters. Supabase puts them in the fragment for the
 * implicit flow and in the query string for PKCE, so both are checked.
 */
export function readAuthCallback(): AuthCallback {
  const snapshot = window.__cfLaunchUrl ?? {
    hash: window.location.hash,
    search: window.location.search,
  };

  const fromHash = new URLSearchParams(snapshot.hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(snapshot.search);
  const pick = (key: string) =>
    fromHash.get(key) ?? fromQuery.get(key) ?? undefined;

  const raw = pick("error_description");

  return {
    error: pick("error"),
    errorCode: pick("error_code"),
    // Providers send these plus-encoded and lowercase; make it a sentence.
    description: raw ? sentenceCase(raw.replace(/\+/g, " ")) : undefined,
    hasToken: Boolean(pick("access_token") || pick("code")),
  };
}

/** A message worth showing for a failed callback, if this one failed. */
export function describeCallbackError(cb: AuthCallback): string | undefined {
  if (!cb.error && !cb.errorCode) return undefined;

  if (cb.errorCode === "otp_expired") {
    return "That link has expired. Links are valid for a limited time and can only be used once.";
  }
  if (cb.error === "access_denied") {
    return cb.description ?? "That link is no longer valid.";
  }

  return cb.description ?? "That link could not be used.";
}
