/**
 * Theme preference: what the reader chose.
 * "system" defers to the OS, and is the default.
 */
export type ThemePref = "system" | "light" | "dark";

/** Theme actually in effect once "system" has been resolved. */
export type ResolvedTheme = "light" | "dark";

/** Also read by the inline pre-paint script in index.html — keep in sync. */
export const STORAGE_KEY = "codeflow-theme";

/** Fired on window whenever the preference or the resolved theme changes. */
export const THEME_EVENT = "cf-theme-change";

export interface ThemeChangeDetail {
  pref: ThemePref;
  resolved: ResolvedTheme;
}

const lightQuery = () => matchMedia("(prefers-color-scheme: light)");

/**
 * Storage can throw outright in private modes and locked-down embeds, so every
 * access is guarded — a missing preference is simply "system".
 */
export function readPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* no storage available; fall through to the default */
  }
  return "system";
}

export function resolvePref(pref: ThemePref): ResolvedTheme {
  if (pref !== "system") return pref;
  return lightQuery().matches ? "light" : "dark";
}

/**
 * Stamp the resolved theme onto <html>. Every colour token keys off this one
 * attribute, so this is the only place the DOM learns about the theme.
 */
function apply(pref: ThemePref): ResolvedTheme {
  const resolved = resolvePref(pref);
  document.documentElement.setAttribute("data-theme", resolved);

  // Keep the browser UI (address bar, form controls) in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--cf-bg")
      .trim();
    if (bg) meta.setAttribute("content", bg);
  }

  return resolved;
}

function announce(pref: ThemePref, resolved: ResolvedTheme) {
  window.dispatchEvent(
    new CustomEvent<ThemeChangeDetail>(THEME_EVENT, {
      detail: { pref, resolved },
    }),
  );
}

export function setPref(pref: ThemePref) {
  try {
    // "system" is the absence of a choice, so it clears the key rather than
    // storing a third value — a later change to the OS setting then applies.
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* preference simply will not persist */
  }
  announce(pref, apply(pref));
}

/**
 * Re-apply on boot (the inline script already set the attribute; this keeps
 * the meta colour and listeners consistent) and follow the OS from then on.
 */
export function initTheme() {
  const pref = readPref();
  apply(pref);

  lightQuery().addEventListener("change", () => {
    // Only track the OS while the reader has not made an explicit choice.
    if (readPref() === "system") announce("system", apply("system"));
  });
}
