import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reset, layout } from "../styles/shared";
import { fetchMe } from "../lib/projects";
import type { Me } from "../lib/projects";
import { signOut } from "../lib/auth";
import { navigate } from "../lib/router";
import "./cf-app-bar";
import "./cf-button";
import "./cf-input";

@customElement("cf-settings")
export class CfSettings extends LitElement {
  @state() private me: Me | null = null;
  @state() private loading = true;
  @state() private error = "";

  static styles = [
    reset,
    layout,
    css`
      :host {
        display: block;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .narrow {
        max-width: 38rem;
        margin-inline: auto;
        padding-block: clamp(2rem, 5vw, 3rem);
      }

      h1 {
        margin: 0 0 0.375rem;
        font-size: clamp(1.5rem, 3vw, 1.75rem);
        line-height: 1.2;
        letter-spacing: -0.026em;
        font-weight: 600;
        color: var(--cf-text);
      }

      .lede {
        margin: 0 0 2rem;
        font-size: 0.9375rem;
        color: var(--cf-text-dim);
      }

      .card {
        padding: 1.375rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-lg);
        background: var(--cf-surface-2);
      }

      .card + .card {
        margin-top: 1rem;
      }

      h2 {
        margin: 0 0 1rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--cf-text);
      }

      dl {
        margin: 0;
        display: grid;
        grid-template-columns: 9rem minmax(0, 1fr);
        gap: 0.75rem 1rem;
        font-size: 0.9375rem;
      }

      dt {
        color: var(--cf-text-muted);
        font-size: 0.875rem;
      }

      dd {
        margin: 0;
        color: var(--cf-text);
        overflow-wrap: anywhere;
      }

      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        background: linear-gradient(
          180deg,
          var(--cf-btn-top),
          var(--cf-btn-bot)
        );
        color: var(--cf-on-accent);
        font-weight: 650;
        text-transform: uppercase;
      }

      .note {
        margin: 1rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.55;
        color: var(--cf-text-muted);
      }

      .danger h2 {
        color: var(--cf-rose);
      }

      .bad {
        padding: 0.75rem 0.875rem;
        border: 1px solid color-mix(in srgb, var(--cf-rose) 40%, transparent);
        border-radius: var(--cf-r-md);
        background: color-mix(in srgb, var(--cf-rose) 10%, transparent);
        font-size: 0.875rem;
        color: var(--cf-text);
      }

      @media (max-width: 520px) {
        dl {
          grid-template-columns: 1fr;
          gap: 0.25rem;
        }
        dt {
          margin-top: 0.5rem;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    this.loading = true;
    try {
      this.me = await fetchMe();
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not load your account.";
    } finally {
      this.loading = false;
    }
  }

  private async onSignOut() {
    await signOut();
    navigate("/");
  }

  render() {
    return html`
      <cf-app-bar heading="Settings"></cf-app-bar>

      <div class="container narrow">
        <h1>Account</h1>
        <p class="lede">Your CodeFlow profile and sign-in details.</p>

        ${
          this.error
            ? html`<p class="bad" role="alert">${this.error}</p>`
            : nothing
        }

        <section class="card">
          <h2>Profile</h2>
          ${
            this.loading
              ? html`<p class="note">Loading…</p>`
              : html`
                  <dl>
                    <dt>Avatar</dt>
                    <dd>
                      <span class="avatar" aria-hidden="true"
                        >${(this.me?.displayName ?? "?").charAt(0)}</span
                      >
                    </dd>

                    <dt>Display name</dt>
                    <dd>${this.me?.displayName ?? "—"}</dd>

                    <dt>Email</dt>
                    <dd>${this.me?.email ?? "—"}</dd>

                    <dt>Member since</dt>
                    <dd>
                      ${
                        this.me?.createdAt
                          ? new Date(this.me.createdAt).toLocaleDateString()
                          : "—"
                      }
                    </dd>
                  </dl>
                  <p class="note">
                    Editing your display name is not wired up yet. Your email is
                    the account identifier and cannot be changed here.
                  </p>
                `
          }
        </section>

        <section class="card">
          <h2>Password</h2>
          <p class="note" style="margin-top:0">
            Passwords are managed through the reset flow, so a new one is only
            ever set from a link sent to your email.
          </p>
          <p style="margin-top:1rem">
            <cf-button href="/forgot-password" variant="secondary">
              Send a reset link
            </cf-button>
          </p>
        </section>

        <section class="card danger">
          <h2>Sign out</h2>
          <p class="note" style="margin-top:0">
            Ends this session on this device. Your projects are unaffected.
          </p>
          <p style="margin-top:1rem">
            <cf-button variant="secondary" @click=${this.onSignOut}>
              Sign out
            </cf-button>
          </p>
        </section>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-settings": CfSettings;
  }
}
