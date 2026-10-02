import { LitElement, css, html, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "../lib/validate";
import { onAuthChange, getSession, updatePassword } from "../lib/auth";
import "./cf-auth-shell";
import "./cf-button";
import "./cf-input";
import type { CfInput } from "./cf-input";

/**
 * Where the emailed reset link lands.
 *
 * Supabase puts a recovery token in the URL fragment; the client exchanges it
 * for a short-lived session automatically (detectSessionInUrl). Until that
 * has happened there is nothing to update, so the page waits rather than
 * showing a form that cannot work.
 */
@customElement("cf-reset-password")
export class CfResetPassword extends LitElement {
  @state() private password = "";
  @state() private reveal = false;
  @state() private error = "";
  @state() private submitted = false;
  @state() private notice = "";
  @state() private busy = false;
  @state() private done = false;

  /** null while the recovery session is still being established. */
  @state() private hasSession: boolean | null = null;

  @query("#password-field") private passwordField?: CfInput;

  private stopListening?: () => void;

  static styles = [
    reset,
    css`
      form {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .reveal {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: 0;
        border-radius: var(--cf-r-sm);
        background: transparent;
        color: var(--cf-text-muted);
        cursor: pointer;
        transition:
          color var(--cf-dur) var(--cf-ease),
          background var(--cf-dur) var(--cf-ease);
      }

      .reveal:hover {
        color: var(--cf-text);
        background: var(--cf-hover);
      }

      .reveal svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .req {
        display: flex;
        align-items: center;
        gap: 0.4375rem;
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--cf-text-muted);
        transition: color var(--cf-dur) var(--cf-ease);
      }

      .req.met {
        color: var(--cf-green);
      }

      .req .mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        flex: none;
      }

      .req .mark svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .req .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.55;
      }

      .notice {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.6875rem 0.8125rem;
        border: 1px solid color-mix(in srgb, var(--cf-rose) 40%, transparent);
        border-radius: var(--cf-r-md);
        background: color-mix(in srgb, var(--cf-rose) 10%, transparent);
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--cf-text);
      }

      .notice svg {
        width: 15px;
        height: 15px;
        flex: none;
        margin-top: 0.0625rem;
        fill: var(--cf-rose);
      }

      .state {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.75rem;
      }

      .state p {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
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

      .icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        border: 1px solid var(--cf-accent-line);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
      }

      .icon svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();

    // The token may already be consumed, or may land a tick later.
    getSession().then((session) => {
      if (this.hasSession === null) this.hasSession = Boolean(session);
    });
    this.stopListening = onAuthChange((session) => {
      this.hasSession = Boolean(session);
    });
  }

  disconnectedCallback() {
    this.stopListening?.();
    this.stopListening = undefined;
    super.disconnectedCallback();
  }

  private async onSubmit(event: Event) {
    event.preventDefault();
    if (this.busy) return;

    this.submitted = true;
    this.notice = "";

    const error = validateNewPassword(this.password);
    this.error = error ?? "";

    if (error) {
      this.updateComplete.then(() => this.passwordField?.focusInput());
      return;
    }

    this.busy = true;
    const result = await updatePassword(this.password);
    this.busy = false;

    if (result.ok) this.done = true;
    else if (result.field === "password") this.error = result.message;
    else this.notice = result.message;
  }

  private eyeIcon() {
    return this.reveal
      ? html`<svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 10s2.8-4.5 7-4.5 7 4.5 7 4.5-2.8 4.5-7 4.5S3 10 3 10Z" />
          <circle cx="10" cy="10" r="2.1" />
          <path d="m3.5 16.5 13-13" />
        </svg>`
      : html`<svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 10s2.8-4.5 7-4.5 7 4.5 7 4.5-2.8 4.5-7 4.5S3 10 3 10Z" />
          <circle cx="10" cy="10" r="2.1" />
        </svg>`;
  }

  render() {
    if (this.done) {
      return html`
        <cf-auth-shell heading="Password updated">
          <div class="state">
            <span class="icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p>Your password has been changed. You can sign in with it now.</p>
            <cf-button href="/login" size="lg" full>Go to sign in</cf-button>
          </div>
        </cf-auth-shell>
      `;
    }

    if (this.hasSession === null) {
      return html`
        <cf-auth-shell heading="Checking your link">
          <div class="state">
            <span class="spinner" role="status" aria-label="Loading"></span>
          </div>
        </cf-auth-shell>
      `;
    }

    if (!this.hasSession) {
      return html`
        <cf-auth-shell
          heading="This link has expired"
          alt-text="Need another?"
          alt-label="Request a new link"
          alt-href="/forgot-password"
        >
          <div class="state">
            <p>
              Reset links can only be used once, and expire after an hour. Ask
              for a fresh one and it will work.
            </p>
            <cf-button href="/forgot-password" size="lg" full>
              Request a new link
            </cf-button>
          </div>
        </cf-auth-shell>
      `;
    }

    const longEnough = this.password.length >= MIN_PASSWORD_LENGTH;

    return html`
      <cf-auth-shell
        heading="Set a new password"
        subheading="Choose a password you have not used on CodeFlow before."
      >
        <form novalidate @submit=${this.onSubmit}>
          <div class="group">
            <cf-input
              id="password-field"
              name="password"
              label="New password"
              type=${this.reveal ? "text" : "password"}
              autocomplete="new-password"
              required
              .value=${this.password}
              .error=${this.error}
              @cf-input=${(e: CustomEvent) => {
                this.password = e.detail.value;
                if (this.submitted)
                  this.error = validateNewPassword(this.password) ?? "";
              }}
            >
              <button
                class="reveal"
                slot="affix"
                type="button"
                aria-pressed=${this.reveal ? "true" : "false"}
                aria-label=${this.reveal ? "Hide password" : "Show password"}
                title=${this.reveal ? "Hide password" : "Show password"}
                @click=${() => (this.reveal = !this.reveal)}
              >
                ${this.eyeIcon()}
              </button>
            </cf-input>

            <p class=${longEnough ? "req met" : "req"}>
              <span class="mark">
                ${
                  longEnough
                    ? html`<svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="m3 8.5 3.2 3.2L13 5" />
                      </svg>`
                    : html`<span class="dot"></span>`
                }
              </span>
              At least ${MIN_PASSWORD_LENGTH} characters
            </p>
          </div>

          ${
            this.notice
              ? html`<p class="notice" role="alert">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4Zm1 8.1H7V7h2v5.1Z"
                    />
                  </svg>
                  ${this.notice}
                </p>`
              : nothing
          }

          <cf-button type="submit" size="lg" full ?loading=${this.busy}>
            ${this.busy ? "Saving…" : "Set new password"}
          </cf-button>
        </form>
      </cf-auth-shell>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-reset-password": CfResetPassword;
  }
}
