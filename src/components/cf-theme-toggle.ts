import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reset } from "../styles/shared";
import { readPref, setPref, THEME_EVENT } from "../lib/theme";
import type { ThemePref } from "../lib/theme";

/** The cycle order, so the button is predictable: system → light → dark. */
const ORDER: ThemePref[] = ["system", "light", "dark"];

const LABEL: Record<ThemePref, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

/**
 * One button that cycles the theme preference.
 *
 * A cycling control needs the current state to be readable at a glance, so the
 * icon names the mode you are in — monitor, sun, moon — and the accessible
 * label spells out both that and what pressing it will do.
 */
@customElement("cf-theme-toggle")
export class CfThemeToggle extends LitElement {
  @state() private pref: ThemePref = "system";

  private onExternalChange = () => {
    this.pref = readPref();
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
    this.pref = readPref();
    window.addEventListener(THEME_EVENT, this.onExternalChange);
  }

  disconnectedCallback() {
    window.removeEventListener(THEME_EVENT, this.onExternalChange);
    super.disconnectedCallback();
  }

  private cycle() {
    const next = ORDER[(ORDER.indexOf(this.pref) + 1) % ORDER.length];
    this.pref = next;
    setPref(next);
  }

  private icon() {
    switch (this.pref) {
      case "light":
        return html`<svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.6" />
          <path
            d="M10 2v1.8M10 16.2V18M2 10h1.8M16.2 10H18M4.4 4.4l1.3 1.3M14.3 14.3l1.3 1.3M15.6 4.4l-1.3 1.3M5.7 14.3l-1.3 1.3"
          />
        </svg>`;
      case "dark":
        return html`<svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" />
        </svg>`;
      default:
        return html`<svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.5" y="3.5" width="15" height="10" rx="2" />
          <path d="M7 16.5h6M10 13.5v3" />
        </svg>`;
    }
  }

  render() {
    const next = ORDER[(ORDER.indexOf(this.pref) + 1) % ORDER.length];
    return html`
      <button
        @click=${this.cycle}
        title=${`${LABEL[this.pref]} — switch to ${LABEL[next].toLowerCase()}`}
        aria-label=${`${LABEL[this.pref]}. Activate to switch to ${LABEL[
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
