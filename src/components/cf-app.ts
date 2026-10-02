import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { currentPath, navigate, ROUTE_EVENT } from "../lib/router";
import { getSession, onAuthChange } from "../lib/auth";
import type { Session } from "@supabase/supabase-js";

import "./cf-nav";
import "./cf-hero";
import "./cf-how-it-works";
import "./cf-features";
import "./cf-preview";
import "./cf-cta";
import "./cf-footer";
import "./cf-login";
import "./cf-signup";
import "./cf-forgot-password";
import "./cf-reset-password";
import "./cf-welcome";
import "./cf-splash";
import "./cf-soon";

/** Reachable without a session. */
const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/welcome",
  "/docs",
]);

/** Where a signed-in reader lands instead of the sign-in pages. */
export const HOME_ROUTE = "/dashboard";

function projectIdFrom(path: string): string | null {
  const match = /^\/projects\/([^/]+)$/.exec(path);
  return match ? (match[1] ?? null) : null;
}

/**
 * The route outlet, and the single place auth decides what may be shown.
 *
 * Renders into light DOM on purpose: the landing page's in-page anchors
 * (#product, #features) rely on native fragment navigation, which only
 * searches the document tree.
 */
@customElement("cf-app")
export class CfApp extends LitElement {
  @state() private path = currentPath();

  /** undefined until the first session read resolves. */
  @state() private session: Session | null | undefined = undefined;

  private onRoute = () => {
    this.path = currentPath();
  };

  /** Route chunks already fetched. */
  private loadedChunks = new Set<string>();
  private pendingChunks = new Map<string, Promise<unknown>>();

  /**
   * Fetch a route's code on first visit.
   *
   * The dashboard and workspace pull in CodeMirror and the whole project
   * layer. Static imports would put all of that in the landing page's
   * critical path, for visitors who may never sign in.
   */
  private ensureChunk(key: string, load: () => Promise<unknown>): boolean {
    if (this.loadedChunks.has(key)) return true;

    if (!this.pendingChunks.has(key)) {
      this.pendingChunks.set(
        key,
        load().then(() => {
          this.loadedChunks.add(key);
          this.requestUpdate();
        }),
      );
    }
    return false;
  }
  private stopAuthWatch?: () => void;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener(ROUTE_EVENT, this.onRoute);

    getSession().then((session) => {
      if (this.session === undefined) this.session = session;
    });
    this.stopAuthWatch = onAuthChange((session) => {
      this.session = session;
    });
  }

  disconnectedCallback() {
    window.removeEventListener(ROUTE_EVENT, this.onRoute);
    this.stopAuthWatch?.();
    this.stopAuthWatch = undefined;
    super.disconnectedCallback();
  }

  private landing() {
    return html`
      <cf-nav></cf-nav>
      <main>
        <cf-hero id="top"></cf-hero>
        <cf-preview id="product"></cf-preview>
        <cf-how-it-works id="how-it-works"></cf-how-it-works>
        <cf-features id="features"></cf-features>
        <cf-cta></cf-cta>
      </main>
      <cf-footer></cf-footer>
    `;
  }

  render() {
    const path = this.path;
    const projectId = projectIdFrom(path);
    const needsAuth = !PUBLIC_ROUTES.has(path);

    // Hold everything until the session is known. Rendering a protected page
    // first and redirecting a tick later flashes content the reader may not
    // be entitled to see.
    if (needsAuth && this.session === undefined) {
      return html`<cf-splash></cf-splash>`;
    }

    if (needsAuth && !this.session) {
      // Remember the destination so sign-in can return them to it.
      navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
      return html`<cf-splash></cf-splash>`;
    }

    switch (path) {
      case "/":
        return this.landing();
      case "/login":
        return html`<cf-login></cf-login>`;
      case "/signup":
        return html`<cf-signup></cf-signup>`;
      case "/forgot-password":
        return html`<cf-forgot-password></cf-forgot-password>`;
      case "/reset-password":
        return html`<cf-reset-password></cf-reset-password>`;
      case "/welcome":
        return html`<cf-welcome></cf-welcome>`;
      case "/docs":
        return this.ensureChunk("docs", () => import("./cf-docs"))
          ? html`<cf-docs></cf-docs>`
          : html`<cf-splash></cf-splash>`;
      case "/dashboard":
      case "/projects":
        return this.ensureChunk("dashboard", () => import("./cf-dashboard"))
          ? html`<cf-dashboard></cf-dashboard>`
          : html`<cf-splash></cf-splash>`;
      case "/settings":
        return this.ensureChunk("settings", () => import("./cf-settings"))
          ? html`<cf-settings></cf-settings>`
          : html`<cf-splash></cf-splash>`;
    }

    if (projectId) {
      return this.ensureChunk("workspace", () => import("./cf-workspace"))
        ? html`<cf-workspace .projectId=${projectId}></cf-workspace>`
        : html`<cf-splash></cf-splash>`;
    }

    return html`<cf-soon
      heading="Page not found"
      body="That route does not exist."
    ></cf-soon>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-app": CfApp;
  }
}
