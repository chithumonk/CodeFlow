import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { reset } from "../styles/shared";
import { summarize } from "../lib/summarize";
import type { Trace } from "../execution/trace";

/**
 * What this run did, in at most ten lines.
 *
 * Read entirely off the trace — see `summarize` for why that, rather than the
 * source, is the honest basis. The component only lays the lines out; it
 * decides nothing about their content, so what the reader sees here can be
 * tested without a browser.
 */
@customElement("cf-summary")
export class CfSummary extends LitElement {
  @property({ attribute: false }) trace: Trace | null = null;

  static styles = [
    reset,
    css`
      :host {
        display: block;
        min-height: 0;
        overflow-y: auto;
      }

      ol {
        margin: 0;
        padding: 0.25rem 0.875rem 0.75rem;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.3125rem;
      }

      li {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.55;
        color: var(--cf-text-dim);
      }

      /* A marker per line rather than a bullet glyph, so the kind can colour it. */
      li .dot {
        flex: none;
        width: 5px;
        height: 5px;
        margin-top: 0.4375rem;
        border-radius: 50%;
        background: var(--cf-line-bright);
      }

      /* The problem is the headline: what this code was for. */
      li.problem {
        color: var(--cf-text);
        font-size: 0.9375rem;
        font-weight: 500;
        line-height: 1.4;
      }

      /* The input and output that prove it, in the editor's own typeface. */
      li.evidence {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      /* A tie is a prompt to try a better example, not a failure. */
      li.ambiguous {
        color: var(--cf-yellow);
      }

      li.ambiguous .dot {
        background: var(--cf-yellow);
      }

      li.shape {
        color: var(--cf-text);
        font-size: 0.875rem;
      }

      li.problem .dot,
      li.shape .dot,
      li.returned .dot {
        background: var(--cf-accent);
      }

      /* Behavioural detail: present, but below the headline. */
      li.steps {
        color: var(--cf-text-faint);
        font-size: 0.75rem;
      }

      li.output {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      li.error {
        color: var(--cf-rose);
      }

      li.error .dot {
        background: var(--cf-rose);
      }

      li.unreached {
        color: var(--cf-text-muted);
      }

      .empty {
        margin: 0;
        padding: 0.25rem 0.875rem 0.75rem;
        font-size: 0.8125rem;
        color: var(--cf-text-faint);
      }
    `,
  ];

  render() {
    const lines = this.trace ? summarize(this.trace) : [];

    if (lines.length === 0) {
      return html`<p class="empty">
        Run a traceable file and this will say what it did.
      </p>`;
    }

    return html`
      <ol>
        ${repeat(
          lines,
          (l) => `${l.kind}:${l.text}`,
          (l) => html`
            <li class=${l.kind}>
              <span class="dot"></span>
              <span>${l.text}</span>
            </li>
          `,
        )}
      </ol>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-summary": CfSummary;
  }
}
