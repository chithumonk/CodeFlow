import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { reset } from "../styles/shared";

/**
 * A labelled text field with an error slot.
 *
 * Auth screens are mostly this component repeated, so the label/description/
 * error wiring — the part that is easy to get subtly wrong for screen readers
 * — lives here once rather than in each form.
 */
@customElement("cf-input")
export class CfInput extends LitElement {
  /** Used for the input id and the label's `for`; must be unique in the form. */
  @property({ type: String }) name = "";
  @property({ type: String }) label = "";
  @property({ type: String }) type = "text";
  @property({ type: String }) value = "";
  @property({ type: String }) placeholder = "";
  @property({ type: String }) autocomplete = "";
  @property({ type: Boolean }) required = false;

  /** Non-empty renders the message and puts the field in its invalid state. */
  @property({ type: String }) error = "";

  @query("input") private input!: HTMLInputElement;

  static styles = [
    reset,
    css`
      :host {
        display: block;
      }

      .row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.4375rem;
      }

      label {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--cf-text);
        letter-spacing: -0.003em;
      }

      .field {
        position: relative;
        display: flex;
        align-items: center;
      }

      input {
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-md);
        background: var(--cf-bg-raised);
        color: var(--cf-text);
        font-family: inherit;
        font-size: 0.9375rem;
        line-height: 1.4;
        -webkit-appearance: none;
        appearance: none;
        transition:
          border-color var(--cf-dur) var(--cf-ease),
          box-shadow var(--cf-dur) var(--cf-ease),
          background var(--cf-dur) var(--cf-ease);
      }

      /* Room for the trailing control (the password reveal) when one is slotted. */
      :host([data-has-affix]) input {
        padding-right: 2.75rem;
      }

      input::placeholder {
        color: var(--cf-text-faint);
      }

      input:hover {
        border-color: var(--cf-line-bright);
      }

      input:focus {
        outline: none;
        border-color: var(--cf-accent);
        box-shadow: 0 0 0 3px var(--cf-accent-soft);
      }

      :host([data-invalid]) input {
        border-color: var(--cf-rose);
      }

      :host([data-invalid]) input:focus {
        box-shadow: 0 0 0 3px
          color-mix(in srgb, var(--cf-rose) 18%, transparent);
      }

      .affix {
        position: absolute;
        right: 0.3125rem;
        display: flex;
        align-items: center;
      }

      .error {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-top: 0.4375rem;
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--cf-rose);
      }

      .error svg {
        width: 14px;
        height: 14px;
        flex: none;
        fill: currentColor;
      }
    `,
  ];

  /** Let the parent form focus the first field that failed validation. */
  focusInput() {
    this.input?.focus();
  }

  private get isName() {
    return this.autocomplete === "nickname" || this.autocomplete === "name";
  }

  /**
   * An email is typed verbatim, so the mobile keyboard must not capitalise
   * it. A person's name is the opposite case — capitalising each word is
   * usually what they want.
   */
  private get autocapitalizeMode() {
    if (this.type === "email") return "none";
    if (this.isName) return "words";
    return undefined;
  }

  /** Neither an address nor a name should be underlined as a misspelling. */
  private get allowSpellcheck() {
    return !(this.type === "email" || this.isName);
  }

  private onInput(event: Event) {
    this.value = (event.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent("cf-input", {
        detail: { name: this.name, value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Implicit submission ("press Enter in a field") relies on the input being
   * associated with the form — which never happens across a shadow boundary,
   * so the browser sees a form with no controls and does nothing. The host is
   * inside the form, so we submit from here.
   */
  private onKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.isComposing) return;

    const form = this.closest("form");
    if (!form) return;

    event.preventDefault();
    form.requestSubmit();
  }

  private onSlotChange(event: Event) {
    const slot = event.target as HTMLSlotElement;
    this.toggleAttribute("data-has-affix", slot.assignedNodes().length > 0);
  }

  // Reflected as an attribute rather than set in render(), so the host styling
  // hook updates without mutating the element mid-render.
  willUpdate() {
    this.toggleAttribute("data-invalid", this.error.length > 0);
  }

  render() {
    const errorId = `${this.name}-error`;
    const invalid = this.error.length > 0;

    return html`
      <div class="row">
        <label for=${this.name}>${this.label}</label>
        <slot name="label-end"></slot>
      </div>

      <div class="field">
        <input
          id=${this.name}
          name=${this.name}
          type=${this.type}
          .value=${this.value}
          placeholder=${this.placeholder || nothing}
          autocomplete=${this.autocomplete || nothing}
          autocapitalize=${this.autocapitalizeMode ?? nothing}
          spellcheck=${this.allowSpellcheck ? nothing : "false"}
          ?required=${this.required}
          aria-invalid=${invalid ? "true" : "false"}
          aria-describedby=${invalid ? errorId : nothing}
          @input=${this.onInput}
          @keydown=${this.onKeydown}
        />
        <span class="affix">
          <slot name="affix" @slotchange=${this.onSlotChange}></slot>
        </span>
      </div>

      ${
        invalid
          ? html`<p class="error" id=${errorId}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.75.75 0 0 0-.75.75v2.8a.75.75 0 0 0 1.5 0v-2.8A.75.75 0 0 0 8 5.7Zm0 5.3a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"
                />
              </svg>
              ${this.error}
            </p>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-input": CfInput;
  }
}
