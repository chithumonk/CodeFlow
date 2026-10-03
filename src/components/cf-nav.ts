import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { reset } from "../styles/shared";
import { onAuthChange, getSession, signOut, displayNameOf } from "../lib/auth";
import type { Session } from "@supabase/supabase-js";
import "./cf-logo";
import "./cf-theme-toggle";
import "./cf-button";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Docs", href: "/docs" },
];


/**
 * Sticky top bar. It sits transparent over the hero and gains a blurred,
 * bordered background once the page scrolls, so the hero reads as full-bleed
 * without the bar ever losing contrast against content.
 */
@customElement("cf-nav")
export class CfNav extends LitElement {
  @state() private scrolled = false;
  @state() private open = false;

  /** undefined until the session has been read; null means signed out. */
  @state() private session: Session | null | undefined = undefined;

  private stopListening?: () => void;

  private onScroll = () => {
    const next = window.scrollY > 12;
    if (next !== this.scrolled) this.scrolled = next;
  };

  static styles = [
    reset,
    css`
      :host {
        position: sticky;
        top: 0;
        z-index: var(--cf-z-nav);
        display: block;
      }

      header {
        border-bottom: 1px solid transparent;
        transition:
          background var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease),
          backdrop-filter var(--cf-dur) var(--cf-ease);
      }

      header.scrolled {
        background: var(--cf-nav-bg);
        backdrop-filter: blur(14px) saturate(1.4);
        -webkit-backdrop-filter: blur(14px) saturate(1.4);
        border-bottom-color: var(--cf-line);
      }

      .bar {
        display: flex;
        align-items: center;
        gap: 1rem;
        height: 4rem;
        max-width: var(--cf-container);
        margin-inline: auto;
        padding-inline: var(--cf-gutter);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        flex: none;
        border-radius: var(--cf-r-sm);
      }

      nav.links {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        margin-left: 0.75rem;
      }

      nav.links a {
        padding: 0.4375rem 0.75rem;
        border-radius: var(--cf-r-sm);
        font-size: 0.875rem;
        font-weight: 450;
        color: var(--cf-text-dim);
        text-decoration: none;
        transition:
          color var(--cf-dur) var(--cf-ease),
          background var(--cf-dur) var(--cf-ease);
      }

      nav.links a:hover {
        color: var(--cf-text);
        background: var(--cf-hover);
      }

      .spacer {
        flex: 1 1 auto;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: none;
      }




      /* --- Signed-in account chip ---------------------------------------- */
      .account {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.625rem 0.25rem 0.3125rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-full);
        background: var(--cf-surface-2);
        max-width: 14rem;
      }

      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex: none;
        border-radius: 50%;
        background: linear-gradient(
          180deg,
          var(--cf-btn-top),
          var(--cf-btn-bot)
        );
        color: var(--cf-on-accent);
        font-size: 0.6875rem;
        font-weight: 650;
        text-transform: uppercase;
      }

      .account .who {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--cf-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .signout {
        padding: 0.4375rem 0.625rem;
        border: 0;
        border-radius: var(--cf-r-sm);
        background: transparent;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--cf-text-dim);
        cursor: pointer;
        transition: color var(--cf-dur) var(--cf-ease);
      }

      .signout:hover {
        color: var(--cf-text);
      }

      .drawer .account {
        align-self: flex-start;
        margin: 0.75rem 0 0;
      }

      .signin {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--cf-text-dim);
        text-decoration: none;
        padding: 0.4375rem 0.625rem;
        border-radius: var(--cf-r-sm);
        transition: color var(--cf-dur) var(--cf-ease);
      }

      .signin:hover {
        color: var(--cf-text);
      }

      /* --- Mobile ------------------------------------------------------- */
      .burger {
        display: none;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        cursor: pointer;
      }

      .burger svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
      }

      .drawer {
        display: none;
        flex-direction: column;
        padding: 0.5rem var(--cf-gutter) 1.25rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-drawer-bg);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }

      .drawer a {
        padding: 0.75rem 0.25rem;
        font-size: 0.9375rem;
        color: var(--cf-text-dim);
        text-decoration: none;
        border-bottom: 1px solid var(--cf-line);
      }

      .drawer a:hover {
        color: var(--cf-text);
      }

      .drawer cf-button {
        margin-top: 1rem;
      }

      @media (max-width: 820px) {
        nav.links,
        .actions .signin,
        .actions .account,
        .actions .signout,
        .actions cf-button {
          display: none;
        }

        .burger {
          display: inline-flex;
        }

        .drawer.open {
          display: flex;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.onScroll();

    getSession().then((session) => {
      if (this.session === undefined) this.session = session;
    });
    this.stopListening = onAuthChange((session) => {
      this.session = session;
    });
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.onScroll);
    this.stopListening?.();
    this.stopListening = undefined;
    super.disconnectedCallback();
  }

  private get who() {
    return displayNameOf(this.session?.user);
  }

  private get initial() {
    return this.who.trim().charAt(0) || "?";
  }

  private async onSignOut() {
    this.open = false;
    await signOut();
  }

  /**
   * Three states, not two: while the session is still being read we render
   * nothing rather than flashing "Sign In" at someone who is already signed
   * in and then swapping it out a moment later.
   */
  private renderAccount() {
    if (this.session === undefined) return nothing;

    if (!this.session) {
      return html`
        <a class="signin" href="/login">Sign In</a>
        <cf-button href="/signup">Start Coding</cf-button>
      `;
    }

    return html`
      <a class="signin" href="/dashboard">Dashboard</a>
      <span class="account" title=${this.session.user.email ?? ""}>
        <span class="avatar" aria-hidden="true">${this.initial}</span>
        <span class="who">${this.who}</span>
      </span>
      <button class="signout" type="button" @click=${this.onSignOut}>
        Sign out
      </button>
    `;
  }


  render() {
    return html`
      <header class=${classMap({ scrolled: this.scrolled })}>
        <div class="bar">
          <a class="brand" href="#top" aria-label="CodeFlow home">
            <cf-logo></cf-logo>
          </a>

          <nav class="links" aria-label="Main">
            ${LINKS.map((l) => html`<a href=${l.href}>${l.label}</a>`)}
          </nav>

          <span class="spacer"></span>

          <div class="actions">
            <cf-theme-toggle></cf-theme-toggle>
            ${this.renderAccount()}

            <button
              class="burger"
              @click=${() => (this.open = !this.open)}
              aria-expanded=${this.open}
              aria-label="Toggle navigation"
            >
              ${
                this.open
                  ? html`<svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>`
                  : html`<svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M2 5h12M2 11h12" />
                    </svg>`
              }
            </button>
          </div>
        </div>

        <div class=${classMap({ drawer: true, open: this.open })}>
          ${LINKS.map(
            (l) =>
              html`<a href=${l.href} @click=${() => (this.open = false)}
                >${l.label}</a
              >`,
          )}
          ${
            this.session
              ? html`
                  <span class="account">
                    <span class="avatar">${this.initial}</span>
                    <span class="who">${this.who}</span>
                  </span>
                  <cf-button
                    size="lg"
                    variant="secondary"
                    @click=${this.onSignOut}
                  >
                    Sign out
                  </cf-button>
                `
              : html`
                  <a href="/login" @click=${() => (this.open = false)}
                    >Sign In</a
                  >
                  <cf-button href="/signup" size="lg">Create account</cf-button>
                `
          }
        </div>
      </header>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-nav": CfNav;
  }
}
