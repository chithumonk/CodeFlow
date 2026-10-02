import { LitElement, css, html, nothing } from "lit";
import { customElement, state, query } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { validateCurrentPassword, validateEmail } from "../lib/validate";
import { signIn, getSession, onAuthChange } from "../lib/auth";
import { navigate } from "../lib/router";
import "./cf-auth-shell";
import "./cf-button";
import "./cf-input";
import type { CfInput } from "./cf-input";

interface Errors {
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

@customElement("cf-login")
export class CfLogin extends LitElement {
  @state() private email = "";
  @state() private password = "";
  @state() private reveal = false;
  @state() private errors: Errors = {};

  /**
   * Validation only nags after the first submit attempt — warning about an
   * incomplete email while it is still being typed is just noise.
   */
  @state() private submitted = false;

  /** Form-level failure from the auth call. */
  @state() private notice = "";

  /** True while the sign-in request is in flight. */
  @state() private busy = false;

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

      /* --- Forgot-password link, aligned with the password label --------- */
      .forgot {
        font-size: 0.8125rem;
        font-weight: 450;
        color: var(--cf-text-muted);
        text-decoration: none;
        border-radius: var(--cf-r-sm);
        transition: color var(--cf-dur) var(--cf-ease);
      }

      .forgot:hover {
        color: var(--cf-accent);
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

      /* --- Form-level message -------------------------------------------- */
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
      email: validateEmail(this.email),
      password: validateCurrentPassword(this.password),
    };
  }

  /** Re-check as the reader types, but only once they have tried to submit. */
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

    if (errors.email || errors.password) {
      // Send focus to the first problem so keyboard and screen-reader users
      // land on it rather than hunting for the message.
      this.updateComplete.then(() => {
        if (errors.email) this.emailField?.focusInput();
        else this.passwordField?.focusInput();
      });
      return;
    }

    this.busy = true;
    const result = await signIn({ email: this.email, password: this.password });
    this.busy = false;

    if (result.ok) {
      navigate(nextDestination());
      return;
    }

    if (result.field === "email" || result.field === "password") {
      this.errors = { ...this.errors, [result.field]: result.message };
      this.updateComplete.then(() =>
        result.field === "email"
          ? this.emailField?.focusInput()
          : this.passwordField?.focusInput(),
      );
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

  render() {
    return html`
      <cf-auth-shell
        heading="Welcome back"
        subheading="Sign in to continue to CodeFlow."
        alt-text="Don't have an account?"
        alt-label="Create account"
        alt-href="/signup"
        legal="By signing in you agree to the CodeFlow Terms and Privacy Policy."
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
            .error=${this.errors.email ?? ""}
            @cf-input=${(e: CustomEvent) => {
              this.email = e.detail.value;
              this.revalidate();
            }}
          ></cf-input>

          <cf-input
            id="password-field"
            name="password"
            label="Password"
            type=${this.reveal ? "text" : "password"}
            autocomplete="current-password"
            required
            .value=${this.password}
            .error=${this.errors.password ?? ""}
            @cf-input=${(e: CustomEvent) => {
              this.password = e.detail.value;
              this.revalidate();
            }}
          >
            <a class="forgot" slot="label-end" href="/forgot-password"
              >Forgot password?</a
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
            ${this.busy ? "Signing in…" : "Sign In"}
          </cf-button>
        </form>
      </cf-auth-shell>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-login": CfLogin;
  }
}
