import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { reset } from "../styles/shared";
import { consoleUpTo } from "../execution/trace";
import type { Trace } from "../execution/trace";
import type { ControllerState } from "../execution/controller";
import type { FlowNodeId } from "../execution/events";
import "./cf-button";
import "./cf-data-view";
import "./cf-summary";

/**
 * Full-screen playback of a trace.
 *
 * The workspace shows the same facts in a 250px rail, which is enough to
 * follow along while editing but far too small to watch. This is the
 * watching view: one screen, nothing else on it, and every change animated
 * so the eye can follow where execution went rather than diffing two
 * stills.
 *
 * It owns no execution state. The trace, the current step and the status all
 * arrive as properties, and every control raises an event — the workspace
 * stays the single place that drives the ExecutionController.
 */

const FLOW: Array<{ id: FlowNodeId; label: string }> = [
  { id: "call", label: "call" },
  { id: "init", label: "init" },
  { id: "loop", label: "loop" },
  { id: "body", label: "body" },
  { id: "return", label: "return" },
];

/** Multipliers offered on the speed control, slowest first. */
const SPEEDS = [0.5, 1, 2, 4];

/** Pixel height of one code line. Kept in sync with the .code line-height. */
const LINE_HEIGHT = 26;

@customElement("cf-visualizer")
export class CfVisualizer extends LitElement {
  @property({ attribute: false }) trace: Trace | null = null;
  @property({ attribute: false }) exec: ControllerState | null = null;
  /** Source of the file the trace describes, for the code pane. */
  @property({ type: String }) source = "";
  @property({ type: String }) fileName = "";
  /** Current playback multiplier, owned by the workspace. */
  @property({ type: Number }) speed = 1;

  /** Set once the active line has been scrolled into view at least once. */
  @state() private ready = false;

  static styles = [
    reset,
    css`
      :host {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        background: var(--cf-bg);
        color: var(--cf-text);
      }

      /* --- Chrome ----------------------------------------------------------- */
      .top {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 1rem;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset);
        flex: none;
      }

      .title {
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
        color: var(--cf-text);
      }

      .sub {
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      .top .spacer {
        flex: 1 1 auto;
      }

      .close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 32px;
        padding: 0 0.75rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        font-family: inherit;
        font-size: 0.75rem;
        cursor: pointer;
      }

      .close:hover {
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      /* --- Layout ----------------------------------------------------------- */
      .body {
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        min-height: 0;
      }

      .left,
      .right {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }

      .right {
        border-left: 1px solid var(--cf-line);
      }

      .pane {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-bottom: 1px solid var(--cf-line);
      }

      .pane:last-child {
        border-bottom: 0;
      }

      /* At most ten short lines, so it takes what it needs and no more. */
      .summary-pane {
        flex: none;
        max-height: 40%;
      }

      .pane > h2 {
        margin: 0;
        padding: 0.5rem 0.875rem 0.375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
        flex: none;
      }

      .empty {
        margin: 0;
        padding: 0 0.875rem 0.75rem;
        font-size: 0.8125rem;
        color: var(--cf-text-faint);
      }

      /* --- Code ------------------------------------------------------------- */
      .code-pane {
        flex: 1 1 auto;
      }

      .code-scroll {
        flex: 1 1 auto;
        overflow: auto;
        padding: 0.5rem 0;
        position: relative;
      }

      .code {
        position: relative;
        margin: 0;
        font-family: var(--cf-font-mono);
        font-size: 0.875rem;
        line-height: ${LINE_HEIGHT}px;
      }

      /*
       * The travelling highlight. Transforming one element rather than
       * restyling a different line each step is what makes the marker slide
       * between lines instead of blinking from one to the next.
       */
      .cursor {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: ${LINE_HEIGHT}px;
        background: color-mix(in srgb, var(--cf-accent) 16%, transparent);
        border-left: 3px solid var(--cf-accent);
        transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      }

      .row {
        display: flex;
        gap: 0.875rem;
        padding: 0 0.875rem;
        position: relative;
        white-space: pre;
      }

      .ln {
        width: 2.5ch;
        text-align: right;
        color: var(--cf-text-faint);
        flex: none;
        user-select: none;
      }

      .row.on .ln {
        color: var(--cf-accent);
      }

      .src {
        color: var(--cf-text-dim);
        transition: color 0.2s ease;
      }

      .row.on .src {
        color: var(--cf-text);
      }

      .inline {
        margin-left: 1rem;
        padding: 0 0.4375rem;
        border-radius: var(--cf-r-sm);
        background: color-mix(in srgb, var(--cf-accent) 22%, transparent);
        color: var(--cf-text);
        font-size: 0.75rem;
        animation: pop 0.3s ease;
      }

      /* --- Caption ---------------------------------------------------------- */
      .caption {
        flex: none;
        display: flex;
        align-items: center;
        gap: 0.625rem;
        min-height: 3rem;
        padding: 0.625rem 0.875rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
        font-size: 0.875rem;
        line-height: 1.5;
      }

      .caption .pin {
        flex: none;
        padding: 0.125rem 0.4375rem;
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
      }

      /* Re-keyed every step, so the text animates in on each change. */
      .caption .words {
        animation: slide-in 0.28s ease;
      }

      /* --- Flow ------------------------------------------------------------- */
      .flow {
        flex: none;
        padding: 0.25rem 0.875rem 0.75rem;
      }

      .flow svg {
        width: 100%;
        height: 72px;
      }

      .edge {
        stroke: var(--cf-line);
        stroke-width: 2;
      }

      .edge.lit {
        stroke: var(--cf-accent);
      }

      .n-box {
        fill: var(--cf-surface-2);
        stroke: var(--cf-line);
        transition:
          fill 0.25s ease,
          stroke 0.25s ease;
      }

      .n-label {
        fill: var(--cf-text-muted);
        font-family: var(--cf-font-mono);
        font-size: 10px;
        transition: fill 0.25s ease;
      }

      .n.on .n-box {
        fill: color-mix(in srgb, var(--cf-accent) 24%, transparent);
        stroke: var(--cf-accent);
      }

      .n.on .n-label {
        fill: var(--cf-text);
      }

      .halo {
        fill: none;
        stroke: var(--cf-accent);
        transform-box: fill-box;
        transform-origin: center;
        animation: halo 1.4s ease-out infinite;
      }

      /* --- Variables -------------------------------------------------------- */
      .vars {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 0 0.875rem 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .var {
        display: flex;
        align-items: baseline;
        gap: 0.625rem;
        padding: 0.4375rem 0.625rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
      }

      /* The flash is the whole point: it says which value this step wrote. */
      .var.changed {
        animation: flash 0.6s ease;
      }

      .var .k {
        color: var(--cf-text-muted);
      }

      .var .v {
        margin-left: auto;
        color: var(--cf-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* --- Stack ------------------------------------------------------------ */
      .stack {
        flex: none;
        max-height: 9rem;
        overflow-y: auto;
        margin: 0;
        padding: 0 0.875rem 0.75rem;
        list-style: none;
        display: flex;
        flex-direction: column-reverse;
        gap: 0.25rem;
      }

      .stack li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3125rem 0.625rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-inset-soft);
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        animation: push 0.26s ease;
      }

      .stack li .depth {
        color: var(--cf-text-faint);
      }

      .stack li:last-child {
        border-color: var(--cf-accent);
        color: var(--cf-text);
      }

      /* --- Console ---------------------------------------------------------- */
      .out {
        flex: 1 1 auto;
        overflow-y: auto;
        margin: 0;
        padding: 0 0.875rem 0.75rem;
        list-style: none;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        line-height: 1.7;
      }

      .out li {
        animation: slide-in 0.24s ease;
      }

      .out li.warn {
        color: var(--cf-yellow);
      }

      .out li.error {
        color: var(--cf-rose);
      }

      /* --- Transport -------------------------------------------------------- */
      .transport {
        flex: none;
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.625rem 1rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .transport button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 36px;
        padding: 0 0.75rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        font-family: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
      }

      .transport button:hover:not(:disabled) {
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      .transport button:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .transport button.primary {
        border-color: var(--cf-accent);
        color: var(--cf-text);
      }

      .scrub {
        flex: 1 1 auto;
        min-width: 0;
        accent-color: var(--cf-accent);
      }

      .count {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        min-width: 7ch;
        text-align: right;
      }

      .speeds {
        display: flex;
        gap: 0.25rem;
      }

      .speeds button {
        min-width: 40px;
        padding: 0 0.5rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      .speeds button[aria-pressed="true"] {
        border-color: var(--cf-accent);
        color: var(--cf-text);
      }

      /* --- Motion ----------------------------------------------------------- */
      @keyframes flash {
        0% {
          background: color-mix(in srgb, var(--cf-accent) 40%, transparent);
          transform: translateX(3px);
        }
        100% {
          background: var(--cf-surface-2);
          transform: translateX(0);
        }
      }

      @keyframes pop {
        0% {
          opacity: 0;
          transform: scale(0.85);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes slide-in {
        0% {
          opacity: 0;
          transform: translateY(4px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes push {
        0% {
          opacity: 0;
          transform: translateX(-10px);
        }
        100% {
          opacity: 1;
          transform: translateX(0);
        }
      }

      @keyframes halo {
        0% {
          opacity: 0.7;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(1.7);
        }
      }

      /*
       * Motion here is explanatory, not decorative, so reduced-motion keeps
       * the state changes and drops only the travel and the pulsing.
       */
      @media (prefers-reduced-motion: reduce) {
        .cursor,
        .src {
          transition: none;
        }
        .caption .words,
        .out li,
        .stack li,
        .inline,
        .var.changed {
          animation: none;
        }
        .halo {
          display: none;
        }
      }

      /* --- Narrow ----------------------------------------------------------- */
      @media (max-width: 880px) {
        .body {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
        }
        .right {
          border-left: 0;
          border-top: 1px solid var(--cf-line);
        }
        .transport {
          flex-wrap: wrap;
        }
        .scrub {
          order: 10;
          flex-basis: 100%;
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKey);
    super.disconnectedCallback();
  }

  /** Transport shortcuts, so watching does not need the mouse. */
  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.emit("cf-close");
    else if (event.key === " ") {
      event.preventDefault();
      this.emit(this.playing ? "cf-pause" : "cf-play");
    } else if (event.key === "ArrowRight") this.emit("cf-step-forward");
    else if (event.key === "ArrowLeft") this.emit("cf-step-back");
    else return;
  };

  updated() {
    this.keepCursorVisible();
  }

  /**
   * Scroll so the active line stays in view.
   *
   * Centred rather than merely visible: at speed the line travels several
   * rows a second, and scrolling only at the edges makes it jump across the
   * pane instead of drifting through the middle of it.
   */
  private keepCursorVisible() {
    const scroller = this.renderRoot.querySelector(".code-scroll");
    if (!scroller) return;

    const index = Math.max(this.line - 1, 0);
    const target =
      index * LINE_HEIGHT - scroller.clientHeight / 2 + LINE_HEIGHT / 2;
    const top = Math.max(0, target);

    // The first paint jumps; later ones glide. Smooth-scrolling into place on
    // open would animate from the top of the file for no reason.
    scroller.scrollTo({ top, behavior: this.ready ? "smooth" : "auto" });
    if (!this.ready) this.ready = true;
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  private get step() {
    return Math.max(this.exec?.step ?? -1, 0);
  }

  private get total() {
    return this.trace?.frames.length ?? 0;
  }

  private get frame() {
    return this.trace?.frames[this.step] ?? null;
  }

  private get line() {
    return this.frame?.line ?? 0;
  }

  private get playing() {
    return this.exec?.status === "running";
  }

  private renderCode() {
    const lines = this.source.split("\n");
    const active = this.line;

    return html`
      <div class="pane code-pane">
        <!-- The top bar already names the file; this labels the pane. -->
        <h2>Code</h2>
        <div class="code-scroll">
          <div class="code">
            <div
              class="cursor"
              style=${styleMap({
                transform: `translateY(${Math.max(active - 1, 0) * LINE_HEIGHT}px)`,
                opacity: active > 0 ? "1" : "0",
              })}
            ></div>
            ${lines.map((text, i) => {
              const on = i + 1 === active;
              return html`
                <div class=${classMap({ row: true, on })}>
                  <span class="ln">${i + 1}</span>
                  <span class="src">${text || " "}</span>
                  ${
                    on && this.frame?.inline
                      ? html`<span class="inline">${this.frame.inline}</span>`
                      : nothing
                  }
                </div>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  private renderCaption() {
    const frame = this.frame;
    if (!frame) return nothing;

    return html`
      <div class="caption">
        <span class="pin">line ${frame.line}</span>
        ${
          frame.iteration
            ? html`<span class="pin">loop ×${frame.iteration}</span>`
            : nothing
        }
        <!-- Keyed on the step so Lit rebuilds it and the animation replays. -->
        ${repeat(
          [this.step],
          (s) => s,
          () => html`<span class="words">${frame.caption}</span>`,
        )}
      </div>
    `;
  }

  private renderFlow() {
    const active = this.frame?.node;
    const activeIndex = FLOW.findIndex((n) => n.id === active);
    const gap = 100 / FLOW.length;

    return html`
      <div class="flow">
        <svg
          viewBox="0 0 500 72"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label=${`Execution flow, currently at ${active ?? "idle"}`}
        >
          ${FLOW.map((node, i) => {
            const x = 20 + i * ((500 - 90) / (FLOW.length - 1));
            const on = i === activeIndex;
            return svg`
              ${
                i > 0
                  ? svg`<line
                      class=${`edge ${i <= activeIndex ? "lit" : ""}`}
                      x1=${x - (500 - 90) / (FLOW.length - 1) + 70}
                      y1="36" x2=${x} y2="36"
                    />`
                  : nothing
              }
              <g class=${`n ${on ? "on" : ""}`}>
                ${
                  on
                    ? svg`<rect class="halo" x=${x} y="18" width="70" height="36" rx="10" />`
                    : nothing
                }
                <rect class="n-box" x=${x} y="18" width="70" height="36" rx="10" />
                <text class="n-label" x=${x + 35} y="36"
                      text-anchor="middle" dominant-baseline="middle"
                >${node.label}</text>
              </g>`;
          })}
          ${gap ? nothing : nothing}
        </svg>
      </div>
    `;
  }

  private renderVars() {
    const frame = this.frame;

    return html`
      <div class="pane">
        <h2>Data</h2>
        <div class="vars">
          <cf-data-view
            .vars=${frame?.vars ?? []}
            .iteration=${frame?.iteration}
          ></cf-data-view>
        </div>
      </div>
    `;
  }

  private renderStack() {
    const stack = this.frame?.stack ?? [];

    return html`
      <div class="pane">
        <h2>Call stack</h2>
        ${
          stack.length === 0
            ? html`<p class="empty">Not running.</p>`
            : html`<ol class="stack">
                ${repeat(
                  stack,
                  (name, i) => `${i}:${name}`,
                  (name, i) => html`
                    <li>
                      <span class="depth">${stack.length - i - 1}</span>
                      <span>${name}</span>
                    </li>
                  `,
                )}
              </ol>`
        }
      </div>
    `;
  }

  private renderConsole() {
    const lines = this.trace ? consoleUpTo(this.trace, this.step) : [];

    return html`
      <div class="pane">
        <h2>Console</h2>
        ${
          lines.length === 0
            ? html`<p class="empty">No output yet.</p>`
            : html`<ol class="out" aria-live="polite">
                ${repeat(
                  lines,
                  (_l, i) => i,
                  (l) => html`<li class=${l.level}>${l.text}</li>`,
                )}
              </ol>`
        }
      </div>
    `;
  }

  private renderTransport() {
    const atEnd = this.step >= this.total - 1;

    return html`
      <div class="transport">
        <button
          type="button"
          class="primary"
          @click=${() => this.emit(this.playing ? "cf-pause" : "cf-play")}
          aria-label=${this.playing ? "Pause" : "Play"}
        >
          ${this.playing ? "Pause" : atEnd ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          @click=${() => this.emit("cf-step-back")}
          ?disabled=${this.step <= 0}
          aria-label="Previous step"
        >
          ◀
        </button>
        <button
          type="button"
          @click=${() => this.emit("cf-step-forward")}
          ?disabled=${atEnd}
          aria-label="Next step"
        >
          ▶
        </button>

        <input
          class="scrub"
          type="range"
          min="0"
          max=${Math.max(this.total - 1, 0)}
          .value=${String(this.step)}
          aria-label="Timeline"
          @input=${(e: Event) =>
            this.emit("cf-seek", {
              step: Number((e.target as HTMLInputElement).value),
            })}
        />

        <span class="count">${this.step + 1} / ${this.total}</span>

        <div class="speeds" role="group" aria-label="Playback speed">
          ${SPEEDS.map(
            (s) => html`
              <button
                type="button"
                aria-pressed=${this.speed === s}
                @click=${() => this.emit("cf-speed", { speed: s })}
              >
                ${s}×
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="top">
        <span class="title">${this.fileName}</span>
        <span class="sub">
          ${this.total > 0 ? `${this.total} steps` : "no trace"}
        </span>
        <span class="spacer"></span>
        <button class="close" type="button" @click=${() => this.emit("cf-close")}>
          Close · Esc
        </button>
      </div>

      <div class="body">
        <div class="left">
          ${this.renderCode()} ${this.renderCaption()} ${this.renderFlow()}
        </div>
        <div class="right">
          <div class="pane summary-pane">
            <h2>Summary</h2>
            <cf-summary .trace=${this.trace}></cf-summary>
          </div>
          ${this.renderVars()} ${this.renderStack()} ${this.renderConsole()}
        </div>
      </div>

      ${this.renderTransport()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-visualizer": CfVisualizer;
  }
}
