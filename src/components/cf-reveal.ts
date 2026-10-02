import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { reset } from "../styles/shared";

/**
 * Fades and lifts its content in once, the first time it scrolls into view.
 *
 * Wrapping this in a component rather than sprinkling observers through every
 * section keeps the reveal behaviour — including the reduced-motion opt-out and
 * observer teardown — in exactly one place.
 */
@customElement("cf-reveal")
export class CfReveal extends LitElement {
  /** Stagger index; each step adds 70ms to the delay. */
  @property({ type: Number })
  delay = 0;

  @state()
  private shown = false;

  private observer?: IntersectionObserver;

  static styles = [
    reset,
    css`
      :host {
        display: block;
        opacity: 0;
        transform: translateY(14px);
        transition:
          opacity 700ms var(--cf-ease-out),
          transform 700ms var(--cf-ease-out);
        transition-delay: var(--cf-reveal-delay, 0ms);
      }

      :host([data-shown]) {
        opacity: 1;
        transform: none;
      }

      @media (prefers-reduced-motion: reduce) {
        :host {
          opacity: 1;
          transform: none;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    this.style.setProperty("--cf-reveal-delay", `${this.delay * 70}ms`);

    // No observer needed when the user has asked for less motion.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.reveal();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.reveal();
            this.observer?.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = undefined;
    super.disconnectedCallback();
  }

  private reveal() {
    this.shown = true;
    this.toggleAttribute("data-shown", true);
  }

  render() {
    // `shown` participates so Lit re-renders when the attribute flips.
    return html`<slot data-state=${this.shown ? "shown" : "hidden"}></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-reveal": CfReveal;
  }
}
