import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { readTheme, toggleTheme, THEME_EVENT } from "../lib/theme";
import type { Theme } from "../lib/theme";

const LABEL: Record<Theme, string> = {
  light: "Light theme",
  dark: "Dark theme",
};

/**
 * One button that flips between dark and light.
 *
 * Two states, so the icon can simply name the mode you are in — sun or moon —
 * and the label says what pressing it will do. With only two modes the press
 * is its own undo, which is why this needs no menu.
 */
@customElement("cf-theme-toggle")
export class CfThemeToggle extends LitElement {
  @state() private theme: Theme = "dark";

  private onExternalChange = () => {
    this.theme = readTheme();
  };

  static styles = [
    reset,
    css`
      :host {
        display: inline-flex;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: var(--cf-r-sm);
        background: transparent;
        color: var(--cf-text-dim);
        cursor: pointer;
        transition:
          color var(--cf-dur) var(--cf-ease),
          background var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease);
      }

      button:hover {
        color: var(--cf-text);
        background: var(--cf-hover);
      }

      svg {
        width: 17px;
        height: 17px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* A small rotation on swap makes the state change legible without
         drawing attention to a control most readers will use once. */
      svg {
        animation: swap 320ms var(--cf-ease-out);
      }

      @keyframes swap {
        from {
          opacity: 0;
          transform: rotate(-35deg) scale(0.8);
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.theme = readTheme();
    window.addEventListener(THEME_EVENT, this.onExternalChange);
  }

  disconnectedCallback() {
    window.removeEventListener(THEME_EVENT, this.onExternalChange);
    super.disconnectedCallback();
  }

  private flip() {
    this.theme = toggleTheme();
  }

  private icon() {
    if (this.theme === "light") {
      return html`<svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.6" />
        <path
          d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.4 4.4l1.3 1.3M14.3 14.3l1.3 1.3M15.6 4.4l-1.3 1.3M5.7 14.3l-1.3 1.3"
        />
      </svg>`;
    }
    return html`<svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
    </svg>`;
  }

  render() {
    const next: Theme = this.theme === "dark" ? "light" : "dark";
    return html`
      <button
        @click=${this.flip}
        aria-pressed=${this.theme === "dark"}
        title=${`${LABEL[this.theme]} — switch to ${LABEL[next].toLowerCase()}`}
        aria-label=${`${LABEL[this.theme]}. Activate to switch to ${LABEL[
          next
        ].toLowerCase()}.`}
      >
        ${this.icon()}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-theme-toggle": CfThemeToggle;
  }
}
