import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { reset } from "../styles/shared";
import "./cf-button";

/**
 * A confirmation dialog built on the native <dialog> element.
 *
 * Using the platform element rather than a div means focus trapping, Escape
 * to dismiss, inertness of the page behind, and the top-layer stacking all
 * come for free and correctly — none of which is easy to reimplement.
 *
 * @fires cf-confirm
 * @fires cf-cancel
 */
@customElement("cf-dialog")
export class CfDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: String }) heading = "";
  @property({ type: String, attribute: "confirm-label" }) confirmLabel =
    "Confirm";
  @property({ type: String, attribute: "cancel-label" }) cancelLabel = "Cancel";
  /** Styles the confirm action as destructive. */
  @property({ type: Boolean }) destructive = false;

  @query("dialog") private dialog?: HTMLDialogElement;

  static styles = [
    reset,
    css`
      dialog {
        width: min(28rem, calc(100vw - 2rem));
        padding: 0;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-lg);
        background: var(--cf-surface-2);
        color: var(--cf-text);
        box-shadow: var(--cf-shadow-lg);
      }

      dialog::backdrop {
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(2px);
      }

      .inner {
        padding: 1.375rem;
      }

      h2 {
        margin: 0 0 0.625rem;
        font-size: 1.0625rem;
        font-weight: 600;
        letter-spacing: -0.014em;
        color: var(--cf-text);
      }

      .content {
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
      }

      .content ::slotted(p) {
        margin: 0;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1.375rem;
      }

      /* Destructive confirm: red, so the consequence is legible before the
         click rather than after it. */
      .danger::part(control) {
        background: var(--cf-rose);
        color: #fff;
        box-shadow: none;
      }

      .danger::part(control):hover {
        filter: brightness(1.08);
      }
    `,
  ];

  updated() {
    const dialog = this.dialog;
    if (!dialog) return;

    if (this.open && !dialog.open) dialog.showModal();
    else if (!this.open && dialog.open) dialog.close();
  }

  private cancel() {
    this.dispatchEvent(new CustomEvent("cf-cancel", { bubbles: true }));
  }

  private confirm() {
    this.dispatchEvent(new CustomEvent("cf-confirm", { bubbles: true }));
  }

  render() {
    return html`
      <dialog
        aria-labelledby="dialog-heading"
        @close=${this.cancel}
        @cancel=${this.cancel}
        @click=${(e: MouseEvent) => {
          // Clicking the backdrop targets the dialog itself.
          if (e.target === this.dialog) this.cancel();
        }}
      >
        <div class="inner">
          <h2 id="dialog-heading">${this.heading}</h2>
          <div class="content"><slot></slot></div>
          <div class="actions">
            <cf-button variant="secondary" @click=${this.cancel}>
              ${this.cancelLabel}
            </cf-button>
            <cf-button
              class=${this.destructive ? "danger" : ""}
              @click=${this.confirm}
            >
              ${this.confirmLabel}
            </cf-button>
          </div>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-dialog": CfDialog;
  }
}
