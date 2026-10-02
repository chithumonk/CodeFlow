import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { getSession, onAuthChange, signOut, displayNameOf } from "../lib/auth";
import { navigate } from "../lib/router";
import type { Session } from "@supabase/supabase-js";
import "./cf-logo";
import "./cf-theme-toggle";

/**
 * The header for signed-in pages.
 *
 * Distinct from cf-nav, which is the marketing bar: this one has no section
 * anchors, carries the account menu, and is not sticky over a hero.
 */
@customElement("cf-app-bar")
export class CfAppBar extends LitElement {
  /** Rendered between the logo and the account menu. */
  @property({ type: String }) heading = "";

  @state() private session: Session | null | undefined = undefined;
  @state() private menuOpen = false;

  private stopListening?: () => void;
  private onDocClick = (event: MouseEvent) => {
    if (!event.composedPath().includes(this)) this.menuOpen = false;
  };

  static styles = [
    reset,
    css`
      :host {
        display: block;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-bg);
      }

      .bar {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        height: 3.5rem;
        padding-inline: var(--cf-gutter);
      }

      .brand {
        display: inline-flex;
        text-decoration: none;
        border-radius: var(--cf-r-sm);
        flex: none;
      }

      .heading {
        font-size: 0.9375rem;
        font-weight: 550;
        color: var(--cf-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .divider {
        width: 1px;
        height: 1.25rem;
        background: var(--cf-line-strong);
        flex: none;
      }

      .slot {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
        flex: 1 1 auto;
      }

      .right {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex: none;
      }

      /* --- Account menu --------------------------------------------------- */
      .account {
        position: relative;
      }

      .trigger {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0.5rem 0.25rem 0.3125rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-full);
        background: var(--cf-surface-2);
        font-family: inherit;
        cursor: pointer;
        max-width: 12rem;
      }

      .trigger:hover {
        border-color: var(--cf-line-strong);
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

      .who {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--cf-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .menu {
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        z-index: 40;
        min-width: 13rem;
        padding: 0.3125rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-md);
        background: var(--cf-surface-2);
        box-shadow: var(--cf-shadow-lg);
      }

      .menu .email {
        padding: 0.5rem 0.625rem;
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        border-bottom: 1px solid var(--cf-line);
        margin-bottom: 0.3125rem;
        overflow-wrap: anywhere;
      }

      .menu a,
      .menu button {
        display: block;
        width: 100%;
        padding: 0.5rem 0.625rem;
        border: 0;
        border-radius: var(--cf-r-sm);
        background: transparent;
        font-family: inherit;
        font-size: 0.875rem;
        text-align: left;
        color: var(--cf-text-dim);
        text-decoration: none;
        cursor: pointer;
      }

      .menu a:hover,
      .menu button:hover {
        background: var(--cf-hover);
        color: var(--cf-text);
      }

      @media (max-width: 620px) {
        .who {
          display: none;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    getSession().then((s) => {
      if (this.session === undefined) this.session = s;
    });
    this.stopListening = onAuthChange((s) => (this.session = s));
    document.addEventListener("click", this.onDocClick);
  }

  disconnectedCallback() {
    this.stopListening?.();
    this.stopListening = undefined;
    document.removeEventListener("click", this.onDocClick);
    super.disconnectedCallback();
  }

  private async onSignOut() {
    this.menuOpen = false;
    await signOut();
    navigate("/");
  }

  render() {
    const who = displayNameOf(this.session?.user);

    return html`
      <div class="bar">
        <a class="brand" href="/dashboard" aria-label="CodeFlow dashboard">
          <cf-logo></cf-logo>
        </a>

        ${
          this.heading
            ? html`<span class="divider"></span>
                <span class="heading">${this.heading}</span>`
            : nothing
        }

        <div class="slot"><slot></slot></div>

        <div class="right">
          <cf-theme-toggle></cf-theme-toggle>

          <div class="account">
            <button
              class="trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded=${this.menuOpen}
              @click=${() => (this.menuOpen = !this.menuOpen)}
            >
              <span class="avatar" aria-hidden="true"
                >${who.charAt(0) || "?"}</span
              >
              <span class="who">${who}</span>
            </button>

            ${
              this.menuOpen
                ? html`
                    <div class="menu" role="menu">
                      <p class="email">${this.session?.user.email ?? ""}</p>
                      <a href="/dashboard" role="menuitem">Dashboard</a>
                      <a href="/settings" role="menuitem">Settings</a>
                      <button
                        type="button"
                        role="menuitem"
                        @click=${this.onSignOut}
                      >
                        Sign out
                      </button>
                    </div>
                  `
                : nothing
            }
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-app-bar": CfAppBar;
  }
}
