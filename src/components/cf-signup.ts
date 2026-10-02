import { LitElement, css, html, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { reset } from "../styles/shared";
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validateNewPassword,
  validateDisplayName,
} from "../lib/validate";
import { signUp, getSession, onAuthChange } from "../lib/auth";
import { navigate } from "../lib/router";
import "./cf-auth-shell";
import "./cf-button";
import "./cf-input";
import type { CfInput } from "./cf-input";

interface Errors {
  displayName?: string;
  email?: string;
  password?: string;
}

/** Where to go after signing in: the page they were sent away from, or home. */
function nextDestination(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  // Only same-site paths — an absolute URL here would be an open redirect.
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

@customElement("cf-signup")
export class CfSignup extends LitElement {
  @state() private displayName = "";
  @state() private email = "";
  @state() private password = "";
  @state() private reveal = false;
  @state() private errors: Errors = {};

  /** Validation stays quiet until the first submit attempt. */
  @state() private submitted = false;

  /** Form-level failure from the auth call. */
  @state() private notice = "";

  /** True while the sign-up request is in flight. */
  @state() private busy = false;

  /** Set once the account exists and Supabase wants the email confirmed. */
  @state() private awaitingConfirmation = false;

  @query("#name-field") private nameField?: CfInput;
  @query("#email-field") private emailField?: CfInput;
  @query("#password-field") private passwordField?: CfInput;

  static styles = [
    reset,
    css`
      form {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
      }

      /* Keeps the requirement hint tight under its field rather than sitting
         a full form-gap away from it. */
      .group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      /* --- Password reveal ----------------------------------------------- */
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

      /* --- Requirement hint ----------------------------------------------- */
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

      /* --- Confirmation state --------------------------------------------- */
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

  /**
   * The email confirmation link lands here with a freshly minted session, and
   * a signed-in reader has no business on a sign-in form. Redirect instead of
   * rendering one. Runs on mount and on any later auth change, since
   * detectSessionInUrl consumes the token a tick after the page loads.
   */
  private stopAuthWatch?: () => void;

  connectedCallback() {
    super.connectedCallback();
    getSession().then((session) => {
      if (session) navigate(nextDestination(), { replace: true });
    });
    this.stopAuthWatch = onAuthChange((session) => {
      if (session) navigate(nextDestination(), { replace: true });
    });
  }

  disconnectedCallback() {
    this.stopAuthWatch?.();
    this.stopAuthWatch = undefined;
    super.disconnectedCallback();
  }

  /* --- Validation -------------------------------------------------------- */

  private validate(): Errors {
    return {
      displayName: validateDisplayName(this.displayName),
      email: validateEmail(this.email),
      password: validateNewPassword(this.password),
    };
  }

  private revalidate() {
    if (this.submitted) this.errors = this.validate();
  }

  private async onSubmit(event: Event) {
    event.preventDefault();
    if (this.busy) return;

    this.submitted = true;
    this.notice = "";

    const errors = this.validate();
    this.errors = errors;

    // Focus the first problem in visual order, so the reader lands on it.
    const fields: Array<[keyof Errors, () => CfInput | undefined]> = [
      ["displayName", () => this.nameField],
      ["email", () => this.emailField],
      ["password", () => this.passwordField],
    ];
    const firstBad = fields.find(([key]) => errors[key]);

    if (firstBad) {
      this.updateComplete.then(() => firstBad[1]()?.focusInput());
      return;
    }

    this.busy = true;
    const result = await signUp({
      displayName: this.displayName,
      email: this.email,
      password: this.password,
    });
    this.busy = false;

    if (result.ok) {
      // With email confirmation on (the Supabase default) there is no session
      // yet, so the only honest next step is "go read your email".
      if (result.needsEmailConfirmation) this.awaitingConfirmation = true;
      else navigate(nextDestination());
      return;
    }

    if (result.field !== "form") {
      this.errors = { ...this.errors, [result.field]: result.message };
      const focus = {
        displayName: () => this.nameField,
        email: () => this.emailField,
        password: () => this.passwordField,
      }[result.field];
      this.updateComplete.then(() => focus()?.focusInput());
    } else {
      this.notice = result.message;
    }
  }

  /* --- Rendering --------------------------------------------------------- */

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

  /** Shown instead of the form once the account exists but is unconfirmed. */
  private renderConfirmation() {
    return html`
      <cf-auth-shell
        heading="Check your email"
        alt-text="Wrong address?"
        alt-label="Start over"
        alt-href="/signup"
      >
        <div class="sent">
          <span class="icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m3.8 6.5 8.2 6 8.2-6" />
            </svg>
          </span>
          <p>
            We sent a confirmation link to
            <strong>${this.email.trim()}</strong>. Open it to finish setting up
            your account.
          </p>
          <p class="small">
            Nothing yet? Check your spam folder — the link can take a minute to
            arrive.
          </p>
        </div>
      </cf-auth-shell>
    `;
  }

  render() {
    if (this.awaitingConfirmation) return this.renderConfirmation();

    const longEnough = this.password.length >= MIN_PASSWORD_LENGTH;

    return html`
      <cf-auth-shell
        heading="Create your account"
        subheading="Start seeing your code run in under a minute."
        alt-text="Already have an account?"
        alt-label="Sign in"
        alt-href="/login"
        legal="By creating an account you agree to the CodeFlow Terms and Privacy Policy."
      >
        <form novalidate @submit=${this.onSubmit}>
          <cf-input
            id="name-field"
            name="displayName"
            label="Display name"
            type="text"
            autocomplete="nickname"
            placeholder="Ada Lovelace"
            required
            .value=${this.displayName}
            .error=${this.errors.displayName ?? ""}
            @cf-input=${(e: CustomEvent) => {
              this.displayName = e.detail.value;
              this.revalidate();
            }}
          ></cf-input>

          <cf-input
            id="email-field"
            name="email"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            required
            .value=${this.email}
            .error=${this.errors.email ?? ""}
            @cf-input=${(e: CustomEvent) => {
              this.email = e.detail.value;
              this.revalidate();
            }}
          ></cf-input>

          <div class="group">
            <cf-input
              id="password-field"
              name="password"
              label="Password"
              type=${this.reveal ? "text" : "password"}
              autocomplete="new-password"
              required
              .value=${this.password}
              .error=${this.errors.password ?? ""}
              @cf-input=${(e: CustomEvent) => {
                this.password = e.detail.value;
                this.revalidate();
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

          <cf-button
            class="submit"
            type="submit"
            size="lg"
            full
            ?loading=${this.busy}
          >
            ${this.busy ? "Creating account…" : "Create account"}
          </cf-button>
        </form>
      </cf-auth-shell>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-signup": CfSignup;
  }
}
