import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reset } from "../styles/shared";

/**
 * The CodeFlow mark: three stacked rails with a pointer travelling down them —
 * a compressed version of the execution-flow idea the product is built on.
 */
@customElement("cf-logo")
export class CfLogo extends LitElement {
  /** Hide the wordmark when only the glyph fits. */
  @property({ type: Boolean, attribute: "glyph-only" })
  glyphOnly = false;

  static styles = [
    reset,
    css`
      :host {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--cf-text);
        user-select: none;
      }

      svg {
        display: block;
        width: 26px;
        height: 26px;
        flex: none;
        overflow: visible;
      }

      .rail {
        stroke: var(--cf-line-bright);
        stroke-width: 2;
        stroke-linecap: round;
      }

      .rail.lit {
        stroke: var(--cf-accent);
      }

      .pointer {
        fill: var(--cf-accent);
        filter: drop-shadow(0 0 5px var(--cf-accent-glow));
      }

      .word {
        font-family: var(--cf-font-sans);
        font-size: 1.0625rem;
        font-weight: 650;
        letter-spacing: -0.026em;
        white-space: nowrap;
      }

      .word b {
        font-weight: 650;
      }

      .word span {
        color: var(--cf-text-dim);
        font-weight: 450;
      }
    `,
  ];

  render() {
    return html`
      <svg viewBox="0 0 26 26" aria-hidden="true">
        <line class="rail lit" x1="3" y1="6" x2="17" y2="6" />
        <line class="rail" x1="3" y1="13" x2="23" y2="13" />
        <line class="rail" x1="3" y1="20" x2="14" y2="20" />
        <circle class="pointer" cx="21" cy="6" r="2.6" />
      </svg>
      ${
        this.glyphOnly
          ? null
          : html`<span class="word"><b>Code</b><span>Flow</span></span>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-logo": CfLogo;
  }
}
