import { LitElement, css, html, svg, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { reset } from "../styles/shared";
import type { TraceFrame } from "../execution/trace";
import type { FlowNodeId } from "../execution/events";

/**
 * Variables, call stack and control-flow for one trace frame.
 *
 * A pure view: everything it draws comes from the frame it is handed, which
 * is what lets the reader scrub backwards and see a true earlier state
 * rather than a replayed approximation.
 */

const FLOW: Array<{ id: FlowNodeId; label: string }> = [
  { id: "call", label: "call" },
  { id: "init", label: "init" },
  { id: "loop", label: "loop" },
  { id: "body", label: "body" },
  { id: "return", label: "return" },
];

@customElement("cf-trace-panels")
export class CfTracePanels extends LitElement {
  @property({ attribute: false }) frame: TraceFrame | null = null;

  static styles = [
    reset,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
      }

      section {
        padding: 0.75rem 0.875rem;
        min-width: 0;
      }

      section + section {
        border-top: 1px solid var(--cf-line);
      }

      h4 {
        margin: 0 0 0.625rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      .var {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        padding: 0.1875rem 0.4375rem;
        border-radius: var(--cf-r-sm);
        border: 1px solid transparent;
      }

      .var .k {
        color: var(--cf-blue);
        flex: none;
      }

      .var .v {
        margin-left: auto;
        color: var(--cf-text);
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .var.flash {
        animation: flash 700ms var(--cf-ease-out);
      }

      @keyframes flash {
        0% {
          background: var(--cf-accent-soft);
          border-color: var(--cf-accent-line);
        }
      }

      .var.flash .v {
        animation: flash-text 700ms var(--cf-ease-out);
      }

      @keyframes flash-text {
        0%,
        40% {
          color: var(--cf-accent-hot);
        }
      }

      .stack li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.1875rem 0.4375rem;
        border-radius: var(--cf-r-sm);
        color: var(--cf-text-muted);
      }

      .stack li .depth {
        font-size: 0.625rem;
        color: var(--cf-text-faint);
      }

      .stack li.top {
        background: var(--cf-surface-3);
        color: var(--cf-text);
      }

      .stack li.top .depth {
        color: var(--cf-accent);
      }

      .empty {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-faint);
        font-style: italic;
      }

      /* --- Flow ----------------------------------------------------------- */
      svg {
        display: block;
        width: 100%;
        height: 104px;
      }

      .n-box {
        fill: var(--cf-inset);
        stroke: var(--cf-line-strong);
        stroke-width: 1;
        transition:
          fill var(--cf-dur) var(--cf-ease),
          stroke var(--cf-dur) var(--cf-ease);
      }

      .n-label {
        font-family: var(--cf-font-mono);
        font-size: 10px;
        fill: var(--cf-text-muted);
      }

      .n.on .n-box {
        fill: var(--cf-accent-soft);
        stroke: var(--cf-accent);
      }

      .n.on .n-label {
        fill: var(--cf-accent-hot);
      }

      .edge {
        stroke: var(--cf-line-strong);
        stroke-width: 1.25;
        fill: none;
      }

      .badge {
        font-family: var(--cf-font-mono);
        font-size: 10px;
        fill: var(--cf-accent);
      }
    `,
  ];

  /** Vertical flow rail — fits the narrow right rail better than a row. */
  private flow() {
    const active = this.frame?.node;
    const iteration = this.frame?.iteration;

    return html`
      <svg
        viewBox="0 0 180 104"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label=${`Execution flow, currently at ${active ?? "idle"}`}
      >
        ${FLOW.map((node, i) => {
          const x = 6 + i * 34;
          const on = node.id === active;
          return svg`
            ${
              i > 0
                ? svg`<line class="edge" x1=${x - 6} y1="52" x2=${x} y2="52" />`
                : nothing
            }
            <g class=${`n ${on ? "on" : ""}`}>
              <rect class="n-box" x=${x} y="38" width="28" height="28" rx="7" />
              <text class="n-label" x=${x + 14} y="53"
                    text-anchor="middle" dominant-baseline="middle"
              >${node.label.slice(0, 4)}</text>
            </g>`;
        })}
        ${
          iteration
            ? svg`<text class="badge" x="90" y="22" text-anchor="middle"
            >loop ×${iteration}</text>`
            : nothing
        }
      </svg>
    `;
  }

  render() {
    const frame = this.frame;
    const stack = frame ? [...frame.stack].reverse() : [];

    return html`
      <section>
        <h4>Variables</h4>
        ${
          !frame || frame.vars.length === 0
            ? html`<p class="empty">no scope</p>`
            : html`<ul>
                ${repeat(
                  frame.vars,
                  (v) => v.name,
                  (v) => html`
                    <li class=${classMap({ var: true, flash: !!v.changed })}>
                      <span class="k">${v.name}</span>
                      <span class="v" title=${v.value}>${v.value}</span>
                    </li>
                  `,
                )}
              </ul>`
        }
      </section>

      <section>
        <h4>Call stack</h4>
        ${
          stack.length === 0
            ? html`<p class="empty">not running</p>`
            : html`<ol class="stack">
                ${stack.map(
                  (name, i) => html`
                    <li class=${classMap({ top: i === 0 })}>
                      <span class="depth">${stack.length - i - 1}</span>
                      <span>${name}</span>
                    </li>
                  `,
                )}
              </ol>`
        }
      </section>

      <section>
        <h4>Execution flow</h4>
        ${this.flow()}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-trace-panels": CfTracePanels;
  }
}
