/**
 * Shared form validation for the auth pages.
 *
 * Kept in one place so /login, /signup and the coming /forgot-password agree
 * on what a valid email is and what they call it when it is not.
 */

/**
 * Pragmatic email check: one @, something either side, a dot in the domain.
 * Deliberately loose — the authoritative check is whether the server accepts
 * the address, and over-strict patterns reject valid real-world ones.
 */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches the minimum a new password must satisfy at sign-up. */
export const MIN_PASSWORD_LENGTH = 8;

export const DISPLAY_NAME_MAX_LENGTH = 50;

/**
 * A display name is what a person is called, not how they are identified —
 * the email is the unique account key. So this stays permissive: spaces,
 * accents, non-Latin scripts and emoji are all legitimate names, and the only
 * real constraints are that something was entered and it fits in the UI.
 *
 * Deliberately no character allowlist. Restricting to ASCII would reject a
 * large share of real names for no benefit, since nothing here has to be
 * URL-safe or unique.
 */
export function validateDisplayName(value: string): string | undefined {
  const name = value.trim();

  if (!name) return "Enter a display name.";
  if (name.length > DISPLAY_NAME_MAX_LENGTH)
    return `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`;

  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL_RE.test(email))
    return "That does not look like a valid email address.";
  return undefined;
}

/**
 * Sign-in only checks presence. Telling someone their password is "too short"
 * while signing in is both unhelpful and a hint about stored formats.
 */
export function validateCurrentPassword(value: string): string | undefined {
  if (!value) return "Enter your password.";
  return undefined;
}

/** Sign-up enforces the minimum, since this is where the password is chosen. */
export function validateNewPassword(value: string): string | undefined {
  if (!value) return "Choose a password.";
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return undefined;
}
