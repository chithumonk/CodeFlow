import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { getSession, onAuthChange, displayNameOf } from "../lib/auth";
import { readAuthCallback, describeCallbackError } from "../lib/launch-url";
import type { Session } from "@supabase/supabase-js";
import "./cf-auth-shell";
import "./cf-button";

/**
 * Where the confirmation email lands.
 *
 * Previously this pointed straight at /login, which meant a confirmed reader
 * either saw a sign-in form they no longer needed or got bounced to the
 * homepage with no acknowledgement that anything had happened. This gives the
 * click somewhere to arrive — and, when the link has expired, a way back
 * rather than a dead end.
 */
@customElement("cf-welcome")
export class CfWelcome extends LitElement {
  /** undefined while the session is still being resolved. */
  @state() private session: Session | null | undefined = undefined;

  private readonly callback = readAuthCallback();
  private stopListening?: () => void;
  private settle?: number;

  static styles = [
    reset,
    css`
      .state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.875rem;
      }

      .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        flex: none;
        border-radius: 50%;
        border: 1px solid var(--cf-accent-line);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
      }

      .icon.bad {
        border-color: color-mix(in srgb, var(--cf-rose) 40%, transparent);
        background: color-mix(in srgb, var(--cf-rose) 10%, transparent);
        color: var(--cf-rose);
      }

      .icon svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      p {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
      }

      strong {
        color: var(--cf-text);
        font-weight: 550;
        overflow-wrap: anywhere;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        margin-top: 0.25rem;
      }

      .spinner {
        width: 22px;
        height: 22px;
        border: 2px solid var(--cf-line-bright);
        border-top-color: var(--cf-accent);
        border-radius: 50%;
        animation: spin 700ms linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();

    // A failed link never produces a session, so stop waiting immediately.
    if (describeCallbackError(this.callback)) {
      this.session = null;
      return;
    }

    getSession().then((session) => {
      if (session) this.session = session;
    });
    this.stopListening = onAuthChange((session) => {
      if (session) this.session = session;
    });

    // detectSessionInUrl runs asynchronously; give it a beat before deciding
    // nothing arrived, rather than flashing the wrong state.
    this.settle = window.setTimeout(() => {
      if (this.session === undefined) this.session = null;
    }, 2500);
  }

  disconnectedCallback() {
    this.stopListening?.();
    this.stopListening = undefined;
    if (this.settle !== undefined) clearTimeout(this.settle);
    super.disconnectedCallback();
  }

  private tick() {
    return html`<span class="icon">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    </span>`;
  }

  private cross() {
    return html`<span class="icon bad">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 7l10 10M17 7 7 17" />
      </svg>
    </span>`;
  }

  render() {
    const failure = describeCallbackError(this.callback);

    // --- The link was expired, reused, or rejected -----------------------
    if (failure) {
      return html`
        <cf-auth-shell heading="That link didn't work">
          <div class="state">
            ${this.cross()}
            <p>${failure}</p>
            <div class="actions">
              <cf-button href="/signup" size="lg" full>
                Create a new account
              </cf-button>
              <cf-button href="/login" variant="secondary" size="lg" full>
                Back to sign in
              </cf-button>
            </div>
          </div>
        </cf-auth-shell>
      `;
    }

    // --- Still resolving --------------------------------------------------
    if (this.session === undefined) {
      return html`
        <cf-auth-shell heading="Confirming your email">
          <div class="state">
            <span class="spinner" role="status" aria-label="Loading"></span>
          </div>
        </cf-auth-shell>
      `;
    }

    // --- Confirmed and signed in -----------------------------------------
    if (this.session) {
      const name = displayNameOf(this.session.user);
      return html`
        <cf-auth-shell heading="You're all set">
          <div class="state">
            ${this.tick()}
            <p>
              Your email is confirmed and you're signed
              in${name ? html` as <strong>${name}</strong>` : nothing}.
            </p>
            <div class="actions">
              <cf-button href="/dashboard" size="lg" full
                >Go to CodeFlow</cf-button
              >
            </div>
          </div>
        </cf-auth-shell>
      `;
    }

    // --- Landed here without a link --------------------------------------
    return html`
      <cf-auth-shell heading="Nothing to confirm">
        <div class="state">
          <p>
            This page is where the confirmation link in your email lands. Open
            that link, or sign in if your account is already set up.
          </p>
          <div class="actions">
            <cf-button href="/login" size="lg" full>Go to sign in</cf-button>
            <cf-button href="/" variant="secondary" size="lg" full>
              Back to homepage
            </cf-button>
          </div>
        </div>
      </cf-auth-shell>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-welcome": CfWelcome;
  }
}
