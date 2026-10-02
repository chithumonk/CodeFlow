import { LitElement, css, html, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { validateEmail } from "../lib/validate";
import { requestPasswordReset } from "../lib/auth";
import "./cf-auth-shell";
import "./cf-button";
import "./cf-input";
import type { CfInput } from "./cf-input";

@customElement("cf-forgot-password")
export class CfForgotPassword extends LitElement {
  @state() private email = "";
  @state() private error = "";

  /** Validation stays quiet until the first submit attempt. */
  @state() private submitted = false;

  /** Form-level failure from the auth call. */
  @state() private notice = "";

  @state() private busy = false;

  /** Set once the request went through, whatever the address turned out to be. */
  @state() private sent = false;

  @query("#email-field") private emailField?: CfInput;

  static styles = [
    reset,
    css`
      form {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
      }

      /* --- Form-level message --------------------------------------------- */
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

      /* --- Sent state ------------------------------------------------------ */
      .sent {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.75rem;
      }

      .sent .icon {
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

      .sent .icon svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .sent p {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
      }

      .sent strong {
        color: var(--cf-text);
        font-weight: 550;
        overflow-wrap: anywhere;
      }

      .sent .small {
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }

      .submit {
        margin-top: 0.125rem;
      }
    `,
  ];

  private async onSubmit(event: Event) {
    event.preventDefault();
    if (this.busy) return;

    this.submitted = true;
    this.notice = "";

    const error = validateEmail(this.email);
    this.error = error ?? "";

    if (error) {
      this.updateComplete.then(() => this.emailField?.focusInput());
      return;
    }

    this.busy = true;
    const result = await requestPasswordReset(this.email);
    this.busy = false;

    // The confirmation is deliberately identical whether or not an account
    // exists for this address — anything else turns the page into a way to
    // discover who is registered. Only transport and rate-limit failures
    // surface as errors.
    if (result.ok) this.sent = true;
    else this.notice = result.message;
  }

  private renderSent() {
    return html`
      <cf-auth-shell
        heading="Check your email"
        alt-text="Remembered your password?"
        alt-label="Sign in"
        alt-href="/login"
      >
        <div class="sent">
          <span class="icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m3.8 6.5 8.2 6 8.2-6" />
            </svg>
          </span>
          <p>
            If an account exists for <strong>${this.email.trim()}</strong>, a
            link to set a new password is on its way.
          </p>
          <p class="small">
            The link expires in an hour. Check your spam folder if it does not
            arrive.
          </p>
        </div>
      </cf-auth-shell>
    `;
  }

  render() {
    if (this.sent) return this.renderSent();

    return html`
      <cf-auth-shell
        heading="Reset your password"
        subheading="Enter the email for your account and we'll send you a link to set a new password."
        alt-text="Remembered your password?"
        alt-label="Sign in"
        alt-href="/login"
      >
        <form novalidate @submit=${this.onSubmit}>
          <cf-input
            id="email-field"
            name="email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
            .value=${this.email}
            .error=${this.error}
            @cf-input=${(e: CustomEvent) => {
              this.email = e.detail.value;
              if (this.submitted) this.error = validateEmail(this.email) ?? "";
            }}
          ></cf-input>

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

          <cf-button
            class="submit"
            type="submit"
            size="lg"
            full
            ?loading=${this.busy}
          >
            ${this.busy ? "Sending…" : "Send reset link"}
          </cf-button>
        </form>
      </cf-auth-shell>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-forgot-password": CfForgotPassword;
  }
}
