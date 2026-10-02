import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reset } from "../styles/shared";

/**
 * The app's only button.
 *
 * Renders an <a> when given an `href` and a real <button> otherwise, so a
 * navigation stays a link (middle-clickable, focusable, crawlable) while a
 * form control stays a control that can submit and be disabled.
 */
@customElement("cf-button")
export class CfButton extends LitElement {
  // Both reflect: the visual rules are written as :host([variant=…]) selectors,
  // so the default values have to reach the DOM as attributes to match.
  @property({ type: String, reflect: true })
  variant: "primary" | "secondary" | "ghost" = "primary";

  @property({ type: String, reflect: true })
  size: "md" | "lg" = "md";

  /** Omit to render a <button> instead of a link. */
  @property({ type: String })
  href?: string;

  /** Only meaningful in button mode. */
  @property({ type: String })
  type: "button" | "submit" | "reset" = "button";

  @property({ type: Boolean, reflect: true })
  disabled = false;

  /**
   * Shows a spinner and blocks interaction. Kept separate from `disabled` so
   * the control still reads as "working", not "unavailable".
   */
  @property({ type: Boolean, reflect: true })
  loading = false;

  /** Stretch to the width of the container — used by form submit buttons. */
  @property({ type: Boolean, reflect: true })
  full = false;

  static styles = [
    reset,
    css`
      :host {
        display: inline-flex;
      }

      :host([full]) {
        display: flex;
        width: 100%;
      }

      /* One rule set for both elements: <a> when there is an href, <button>
         otherwise. The button resets the UA styles the anchor never had. */
      .btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.625rem 1.125rem;
        margin: 0;
        border: 1px solid transparent;
        border-radius: var(--cf-r-md);
        background: none;
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 550;
        letter-spacing: -0.008em;
        line-height: 1.2;
        text-align: center;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
        transition:
          background var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease),
          color var(--cf-dur) var(--cf-ease),
          transform var(--cf-dur) var(--cf-ease),
          opacity var(--cf-dur) var(--cf-ease),
          box-shadow var(--cf-dur) var(--cf-ease);
      }

      .btn:active {
        transform: translateY(1px);
      }

      :host([disabled]) .btn {
        opacity: 0.55;
        cursor: not-allowed;
      }

      :host([disabled]) .btn:active {
        transform: none;
      }

      /* Busy, not unavailable: full contrast is kept, only input is blocked. */
      :host([loading]) .btn {
        cursor: progress;
      }

      :host([size="lg"]) .btn {
        padding: 0.8125rem 1.5rem;
        font-size: 0.9375rem;
        border-radius: var(--cf-r-md);
      }

      /* --- primary: the amber execution accent, used sparingly ------------- */
      :host([variant="primary"]) .btn {
        background: linear-gradient(
          180deg,
          var(--cf-btn-top),
          var(--cf-btn-mid) 60%,
          var(--cf-btn-bot)
        );
        color: var(--cf-on-accent);
        box-shadow:
          0 1px 0 var(--cf-btn-gloss) inset,
          0 8px 24px -10px var(--cf-accent-glow);
      }

      :host([variant="primary"]:not([disabled]):not([loading])) .btn:hover {
        box-shadow:
          0 1px 0 var(--cf-btn-gloss) inset,
          0 12px 32px -10px var(--cf-accent-glow);
        filter: brightness(1.06);
      }

      /* --- secondary: hairline surface -------------------------------------- */
      :host([variant="secondary"]) .btn {
        background: var(--cf-surface-2);
        border-color: var(--cf-line-strong);
        color: var(--cf-text);
      }

      :host([variant="secondary"]:not([disabled]):not([loading])) .btn:hover {
        background: var(--cf-surface-3);
        border-color: var(--cf-line-bright);
      }

      /* --- ghost: navbar links ---------------------------------------------- */
      :host([variant="ghost"]) .btn {
        background: transparent;
        color: var(--cf-text-dim);
        padding-inline: 0.75rem;
      }

      :host([variant="ghost"]:not([disabled]):not([loading])) .btn:hover {
        color: var(--cf-text);
        background: var(--cf-hover);
      }

      /* --- loading spinner --------------------------------------------------- */
      .spinner {
        width: 1em;
        height: 1em;
        flex: none;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        opacity: 0.9;
        animation: spin 620ms linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation-duration: 1600ms;
        }
      }

      ::slotted(svg) {
        width: 1em;
        height: 1em;
      }
    `,
  ];

  /**
   * Form association does not cross a shadow boundary: the real <button> lives
   * in this component's shadow root, so the browser will never connect it to a
   * <form> in the parent tree. The host element *is* inside that form, so we
   * drive submit and reset from here instead.
   */
  private onClick() {
    if (this.disabled || this.loading) return;
    if (this.type === "button") return;

    const form = this.closest("form");
    if (!form) return;

    if (this.type === "submit") form.requestSubmit();
    else form.reset();
  }

  private content() {
    return html`${
        this.loading
          ? html`<span class="spinner" aria-hidden="true"></span>`
          : nothing
      }<slot></slot>`;
  }

  render() {
    // Link mode. A disabled link is not a thing in HTML, so the few places
    // that need one should use button mode instead.
    if (this.href !== undefined) {
      return html`<a class="btn" href=${this.href} part="control"
        >${this.content()}</a
      >`;
    }

    return html`<button
      class="btn"
      part="control"
      type=${this.type}
      ?disabled=${this.disabled || this.loading}
      aria-busy=${this.loading ? "true" : "false"}
      @click=${this.onClick}
    >
      ${this.content()}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-button": CfButton;
  }
}
