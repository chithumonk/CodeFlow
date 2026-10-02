import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { reset } from "../styles/shared";
import "./cf-logo";

/**
 * Shown while the session is being resolved, so a protected route never
 * flashes either its content or a sign-in form before we know which is right.
 */
@customElement("cf-splash")
export class CfSplash extends LitElement {
  static styles = [
    reset,
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
      }

      .bar {
        width: 8rem;
        height: 2px;
        border-radius: var(--cf-r-full);
        background: var(--cf-surface-3);
        overflow: hidden;
      }

      .bar i {
        display: block;
        width: 40%;
        height: 100%;
        border-radius: inherit;
        background: var(--cf-accent);
        animation: slide 1.1s var(--cf-ease) infinite;
      }

      @keyframes slide {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(250%);
        }
      }
    `,
  ];

  render() {
    return html`
      <div class="wrap" role="status" aria-label="Loading">
        <cf-logo></cf-logo>
        <span class="bar"><i></i></span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-splash": CfSplash;
  }
}
