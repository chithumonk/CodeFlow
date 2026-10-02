import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reset } from "../styles/shared";
import "./cf-logo";
import "./cf-theme-toggle";

/**
 * The frame every auth page sits in: theme control, centred wordmark, the
 * card, and the two lines beneath it.
 *
 * The form itself is slotted, so each page owns only its own fields and
 * validation. The alternate action is passed as properties rather than
 * slotted markup — ::slotted() cannot reach a link nested inside a slotted
 * wrapper, so passing the parts keeps the styling here where it belongs.
 */
@customElement("cf-auth-shell")
export class CfAuthShell extends LitElement {
  @property({ type: String }) heading = "";
  @property({ type: String }) subheading = "";

  /** Lead-in text for the alternate action, e.g. "Don't have an account?" */
  @property({ type: String, attribute: "alt-text" }) altText = "";
  @property({ type: String, attribute: "alt-label" }) altLabel = "";
  @property({ type: String, attribute: "alt-href" }) altHref = "";

  @property({ type: String }) legal = "";

  static styles = [
    reset,
    css`
      :host {
        display: block;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .page {
        display: flex;
        flex-direction: column;
        min-height: inherit;
      }

      /* Theme control only — the wordmark belongs with the card below. */
      .top {
        display: flex;
        justify-content: flex-end;
        padding: 1.25rem var(--cf-gutter);
      }

      main {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem var(--cf-gutter) clamp(3rem, 8vh, 5rem);
      }

      .column {
        width: 100%;
        max-width: 25.5rem;
      }

      .brand {
        display: flex;
        justify-content: center;
        margin-bottom: 1.75rem;
        text-decoration: none;
        border-radius: var(--cf-r-sm);
      }

      .card {
        padding: clamp(1.5rem, 5vw, 2rem);
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-lg);
        background: var(--cf-surface-2);
        box-shadow: var(--cf-shadow-md);
      }

      .head {
        margin-bottom: 1.625rem;
      }

      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
        letter-spacing: -0.026em;
        font-weight: 600;
        color: var(--cf-text);
      }

      .head p {
        margin: 0.4375rem 0 0;
        font-size: 0.9375rem;
        line-height: 1.55;
        color: var(--cf-text-dim);
      }

      .alt {
        margin: 1.75rem 0 0;
        text-align: center;
        font-size: 0.875rem;
        color: var(--cf-text-muted);
      }

      .alt a {
        color: var(--cf-text);
        font-weight: 500;
        text-decoration: none;
        border-bottom: 1px solid var(--cf-line-bright);
        padding-bottom: 1px;
        transition:
          color var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease);
      }

      .alt a:hover {
        color: var(--cf-accent);
        border-bottom-color: var(--cf-accent);
      }

      .legal {
        margin: 2.5rem 0 0;
        text-align: center;
        font-size: 0.75rem;
        line-height: 1.55;
        color: var(--cf-text-faint);
      }

      @media (max-width: 480px) {
        main {
          align-items: flex-start;
          padding-top: 0.5rem;
        }
      }
    `,
  ];

  render() {
    return html`
      <div class="page">
        <header class="top">
          <cf-theme-toggle></cf-theme-toggle>
        </header>

        <main>
          <div class="column">
            <a class="brand" href="/" aria-label="CodeFlow home">
              <cf-logo></cf-logo>
            </a>

            <div class="card">
              <div class="head">
                <h1>${this.heading}</h1>
                ${this.subheading ? html`<p>${this.subheading}</p>` : nothing}
              </div>
              <slot></slot>
            </div>

            ${
              this.altLabel
                ? html`<p class="alt">
                    ${this.altText} <a href=${this.altHref}>${this.altLabel}</a>
                  </p>`
                : nothing
            }
            ${this.legal ? html`<p class="legal">${this.legal}</p>` : nothing}
          </div>
        </main>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-auth-shell": CfAuthShell;
  }
}
