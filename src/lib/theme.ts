/**
 * Theme: two modes, dark and light.
 *
 * There is deliberately no "follow the system" mode. A third, invisible state
 * made the toggle unpredictable — the same button press produced a different
 * result depending on an OS setting the reader could not see from here — and
 * it meant the page could change theme on its own while being read. The
 * preference is now exactly what the reader last chose.
 */
export type Theme = "light" | "dark";

/** Used until the reader chooses. Also the fallback in index.html — keep in sync. */
export const DEFAULT_THEME: Theme = "dark";

/** Also read by the inline pre-paint script in index.html — keep in sync. */
export const STORAGE_KEY = "codeflow-theme";

/** Fired on window whenever the theme changes. */
export const THEME_EVENT = "cf-theme-change";

export interface ThemeChangeDetail {
  theme: Theme;
}

/**
 * Storage can throw outright in private modes and locked-down embeds, so every
 * access is guarded — an unreadable preference is simply the default.
 */
export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* no storage available; fall through to the default */
  }
  return DEFAULT_THEME;
}

/**
 * Stamp the theme onto <html>. Every colour token keys off this one
 * attribute, so this is the only place the DOM learns about the theme.
 */
function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);

  // Keep the browser UI (address bar, form controls) in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--cf-bg")
      .trim();
    if (bg) meta.setAttribute("content", bg);
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* preference simply will not persist */
  }
  apply(theme);
  window.dispatchEvent(
    new CustomEvent<ThemeChangeDetail>(THEME_EVENT, { detail: { theme } }),
  );
}

/** Flip to the other mode and return it. */
export function toggleTheme(): Theme {
  const next: Theme = readTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/**
 * Re-apply on boot.
 *
 * The inline script in index.html has already set the attribute to avoid a
 * flash of the wrong theme; this keeps the meta colour consistent once the
 * tokens are actually loaded.
 */
export function initTheme() {
  apply(readTheme());
}
