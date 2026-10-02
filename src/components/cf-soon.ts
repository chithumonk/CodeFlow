import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reset } from "../styles/shared";
import "./cf-logo";
import "./cf-button";

/**
 * Placeholder for routes that are linked but not built yet (/signup,
 * /forgot-password) and for anything unrecognised.
 *
 * Without this, following one of those links would leave the reader on a blank
 * page with no way back — worse than an honest "not here yet".
 */
@customElement("cf-soon")
export class CfSoon extends LitElement {
  @property({ type: String }) heading = "Not here yet";
  @property({ type: String }) body = "";

  static styles = [
    reset,
    css`
      :host {
        display: block;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: inherit;
        padding: 3rem var(--cf-gutter);
        text-align: center;
      }

      cf-logo {
        margin-bottom: 0.5rem;
      }

      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
        letter-spacing: -0.024em;
        font-weight: 600;
        color: var(--cf-text);
      }

      p {
        margin: 0;
        max-width: 34ch;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.625rem;
        margin-top: 0.75rem;
      }
    `,
  ];

  render() {
    return html`
      <div class="wrap">
        <a href="/" aria-label="CodeFlow home"><cf-logo></cf-logo></a>
        <h1>${this.heading}</h1>
        ${this.body ? html`<p>${this.body}</p>` : null}
        <div class="actions">
          <cf-button href="/login" variant="secondary"
            >Back to sign in</cf-button
          >
          <cf-button href="/">Go to homepage</cf-button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-soon": CfSoon;
  }
}
