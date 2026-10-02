/**
 * A minimal history-API router.
 *
 * CodeFlow is one app with a handful of top-level pages, so this stays
 * deliberately small: a normalised current path, a way to navigate, and a
 * document-level click handler so ordinary `<a href="/login">` markup does
 * client-side navigation without every component knowing the router exists.
 */

export const ROUTE_EVENT = "cf-route-change";

export interface RouteChangeDetail {
  path: string;
}

/** Collapse trailing slashes so "/login/" and "/login" are the same route. */
function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function currentPath(): string {
  return normalize(window.location.pathname);
}

function emit() {
  window.dispatchEvent(
    new CustomEvent<RouteChangeDetail>(ROUTE_EVENT, {
      detail: { path: currentPath() },
    }),
  );
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = normalize(to);
  if (target === currentPath()) return;

  if (options.replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);

  // A route change is a new page, so it starts at the top — matching what a
  // full page load would have done. "instant" overrides the document's
  // scroll-behavior: smooth, which is meant for in-page anchors, not routes.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  emit();
}

/**
 * Find the anchor a click actually landed on.
 *
 * `event.target` is retargeted to the shadow host once an event crosses a
 * shadow boundary, so a link inside a component would otherwise be invisible
 * here. The composed path still contains the real element.
 */
function anchorFrom(event: MouseEvent): HTMLAnchorElement | undefined {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement) return node;
  }
  return undefined;
}

function onClick(event: MouseEvent) {
  // Leave modified clicks alone: they mean "open in a new tab/window".
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const anchor = anchorFrom(event);
  if (!anchor || anchor.hasAttribute("download")) return;
  if (anchor.target && anchor.target !== "_self") return;

  const href = anchor.getAttribute("href");
  // Only root-relative paths are routes. Hash links keep their native
  // in-page scrolling, and anything else (http:, mailto:) leaves the app.
  if (!href || !href.startsWith("/")) return;

  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return;

  event.preventDefault();
  navigate(url.pathname);
}

export function initRouter() {
  window.addEventListener("popstate", emit);
  document.addEventListener("click", onClick);
}
