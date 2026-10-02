import { LitElement, css, html, svg, unsafeCSS, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { SNIPPET, TRACE, FLOW_NODES } from "../data/trace";
import type { FlowNodeId } from "../data/trace";
import { tokenize, highlightStyles } from "../lib/highlight";
import { reset } from "../styles/shared";

/** Milliseconds each frame is held during playback. */
const STEP_MS = 950;
/** Longer beat on the final frame so the result is readable before the loop. */
const HOLD_MS = 2400;

/* --- Flow graph geometry, in viewBox units -------------------------------- */
const FLOW_W = 650;
const FLOW_H = 84;
const NODE_Y = 38;
const NODE_H = 34;

const NODE_GEOM: Record<FlowNodeId, { x: number; w: number }> = {
  call: { x: 6, w: 86 },
  init: { x: 124, w: 86 },
  loop: { x: 242, w: 112 },
  body: { x: 386, w: 132 },
  return: { x: 550, w: 92 },
};

/** Forward edges, drawn as straight arrows through the 32-unit gaps. */
const EDGES: Array<{ from: FlowNodeId; to: FlowNodeId }> = [
  { from: "call", to: "init" },
  { from: "init", to: "loop" },
  { from: "loop", to: "body" },
  { from: "loop", to: "return" },
];

/**
 * A step transition names the two frames it sits between, but the graph edge it
 * lights is not always the same pair: leaving the loop body for the return goes
 * back through the loop header first, and the graph should show that.
 */
const EDGE_ALIAS: Record<string, string> = {
  "body-return": "loop-return",
};

/**
 * The product surface, driven by {@link TRACE}.
 *
 * The component is a pure function of `index` — every panel reads the same
 * frame — which is what will let a real trace from the backend drop straight
 * in: only the source of the array changes.
 */
@customElement("cf-trace-player")
export class CfTracePlayer extends LitElement {
  @state() private index = 0;
  @state() private playing = false;

  private timer?: number;
  private visible = false;
  private reduced = false;
  private observer?: IntersectionObserver;
  private onVisibility = () => this.sync();

  static styles = [
    reset,
    css`
      :host {
        display: block;
        container-type: inline-size;
      }

      /* --- Frame ------------------------------------------------------- */
      .frame {
        position: relative;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-xl);
        background: linear-gradient(
          180deg,
          var(--cf-surface-2),
          var(--cf-bg-raised) 70%
        );
        box-shadow: var(--cf-shadow-lg);
        overflow: hidden;
      }

      .frame::before {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent,
          var(--cf-gloss) 50%,
          transparent
        );
        pointer-events: none;
      }

      /* --- Window chrome ----------------------------------------------- */
      .chrome {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.6875rem 0.875rem;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .dots {
        display: flex;
        gap: 0.4375rem;
        flex: none;
      }

      .dots i {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cf-track);
      }

      .tab {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        padding: 0.1875rem 0.625rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface);
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-dim);
      }

      .tab b {
        color: var(--cf-yellow);
        font-weight: 600;
        font-size: 0.6875rem;
      }

      .status {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
        flex: none;
      }

      .status i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--cf-text-faint);
      }

      .status.live i {
        background: var(--cf-accent);
        box-shadow: 0 0 0 3px var(--cf-accent-soft);
        animation: pulse 1.6s var(--cf-ease) infinite;
      }

      .status.live {
        color: var(--cf-accent);
      }

      @keyframes pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 var(--cf-accent-soft);
        }
        50% {
          box-shadow: 0 0 0 5px transparent;
        }
      }

      /* --- Stage: code + rail ------------------------------------------ */
      .stage {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 232px;
      }

      /* --- Code pane --------------------------------------------------- */
      .code {
        margin: 0;
        padding: 0.875rem 0;
        list-style: none;
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
        line-height: 1.7;
        overflow-x: auto;
        min-width: 0;
      }

      .line {
        display: flex;
        align-items: baseline;
        gap: 0.875rem;
        padding-inline: 0.875rem 1rem;
        border-left: 2px solid transparent;
        white-space: pre;
        transition:
          background var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease);
      }

      .line .num {
        flex: none;
        width: 1.5rem;
        text-align: right;
        color: var(--cf-text-faint);
        font-size: 0.75rem;
        user-select: none;
        transition: color var(--cf-dur) var(--cf-ease);
      }

      .line .src {
        flex: none;
      }

      .line.on {
        background: linear-gradient(
          90deg,
          var(--cf-accent-soft),
          transparent 85%
        );
        border-left-color: var(--cf-accent);
      }

      .line.on .num {
        color: var(--cf-accent);
      }

      /* Inline value readout, the way a debugger annotates a live line. */
      .inline {
        flex: none;
        margin-left: 1.25rem;
        padding: 0.0625rem 0.5rem;
        border: 1px solid var(--cf-accent-line);
        border-radius: var(--cf-r-full);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
        font-size: 0.6875rem;
        letter-spacing: 0.01em;
        animation: annotate 320ms var(--cf-ease-out) both;
      }

      @keyframes annotate {
        from {
          opacity: 0;
          transform: translateX(-6px);
        }
      }

      /* --- Right rail -------------------------------------------------- */
      .rail {
        display: flex;
        flex-direction: column;
        border-left: 1px solid var(--cf-line);
        min-width: 0;
      }

      .panel {
        padding: 0.75rem 0.875rem;
        min-width: 0;
      }

      .panel + .panel {
        border-top: 1px solid var(--cf-line);
      }

      .panel h4 {
        margin: 0 0 0.625rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      .vars,
      .stack {
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
        100% {
          background: transparent;
          border-color: transparent;
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

      .empty {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-faint);
        font-style: italic;
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

      /* --- Flow graph -------------------------------------------------- */
      .flow {
        padding: 0.875rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
      }

      .flow h4 {
        margin: 0 0 0.375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      .flow svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
      }

      .n-box {
        fill: var(--cf-surface-2);
        stroke: var(--cf-line-strong);
        stroke-width: 1;
        transition:
          fill var(--cf-dur) var(--cf-ease),
          stroke var(--cf-dur) var(--cf-ease);
      }

      .n-label {
        font-family: var(--cf-font-mono);
        font-size: 11px;
        fill: var(--cf-text-muted);
        transition: fill var(--cf-dur) var(--cf-ease);
      }

      .n.on .n-box {
        fill: var(--cf-accent-soft);
        stroke: var(--cf-accent);
      }

      .n.on .n-label {
        fill: var(--cf-accent-hot);
      }

      .n.done .n-box {
        stroke: var(--cf-line-bright);
      }

      .n.done .n-label {
        fill: var(--cf-text-dim);
      }

      .edge {
        stroke: var(--cf-line-strong);
        stroke-width: 1.25;
        fill: none;
        transition: stroke var(--cf-dur) var(--cf-ease);
      }

      .edge.on {
        stroke: var(--cf-accent);
      }

      .arc-label {
        font-family: var(--cf-font-mono);
        font-size: 10px;
        fill: var(--cf-text-muted);
        transition: fill var(--cf-dur) var(--cf-ease);
      }

      .arc-label.on {
        fill: var(--cf-accent);
      }

      .arc-bg {
        fill: var(--cf-bg-raised);
      }

      /* --- Controls ---------------------------------------------------- */
      .controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.625rem 0.875rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-strong);
      }

      .btns {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex: none;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        cursor: pointer;
        transition:
          background var(--cf-dur) var(--cf-ease),
          color var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease);
      }

      button:hover {
        background: var(--cf-surface-3);
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      button.main {
        background: var(--cf-accent-soft);
        border-color: var(--cf-accent-line);
        color: var(--cf-accent-hot);
      }

      button.main:hover {
        background: var(--cf-accent-soft-2);
      }

      button svg {
        width: 13px;
        height: 13px;
        fill: currentColor;
      }

      /* Timeline: one segment per frame, so it doubles as a scrubber. */
      .timeline {
        display: flex;
        gap: 2px;
        flex: 1 1 auto;
        min-width: 0;
      }

      .seg {
        flex: 1 1 0;
        min-width: 0;
        width: auto;
        height: 18px;
        padding: 0;
        border: 0;
        border-radius: 2px;
        background: var(--cf-track);
        cursor: pointer;
        transition: background 180ms var(--cf-ease);
      }

      .seg:hover {
        background: var(--cf-track-hover);
      }

      .seg.past {
        background: var(--cf-accent-deep);
      }

      .seg.now {
        background: var(--cf-accent-hot);
        box-shadow: 0 0 10px var(--cf-accent-glow);
      }

      .counter {
        flex: none;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .counter b {
        color: var(--cf-text);
        font-weight: 500;
      }

      /* --- Caption ----------------------------------------------------- */
      .caption {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        padding: 0.6875rem 0.875rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-strong);
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--cf-text-dim);
      }

      .caption::before {
        content: "▸";
        color: var(--cf-accent);
        line-height: 1.5;
      }

      .caption .ret {
        margin-left: 0.375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-green);
      }

      /* --- Narrow layout ----------------------------------------------- */
      @container (max-width: 680px) {
        .stage {
          grid-template-columns: 1fr;
        }

        .rail {
          border-left: 0;
          border-top: 1px solid var(--cf-line);
          flex-direction: row;
        }

        .panel {
          flex: 1 1 50%;
        }

        .panel + .panel {
          border-top: 0;
          border-left: 1px solid var(--cf-line);
        }
      }

      @container (max-width: 460px) {
        .rail {
          flex-direction: column;
        }

        .panel + .panel {
          border-left: 0;
          border-top: 1px solid var(--cf-line);
        }

        .counter {
          display: none;
        }
      }
    `,
    css`
      ${unsafeCSS(highlightStyles)}
    `,
  ];

  /* --- Lifecycle --------------------------------------------------------- */

  connectedCallback() {
    super.connectedCallback();
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.playing = !this.reduced;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) this.visible = entry.isIntersecting;
        this.sync();
      },
      { threshold: 0.2 },
    );
    this.observer.observe(this);

    document.addEventListener("visibilitychange", this.onVisibility);
  }

  disconnectedCallback() {
    this.clearTimer();
    this.observer?.disconnect();
    this.observer = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    super.disconnectedCallback();
  }

  /* --- Playback ---------------------------------------------------------- */

  private clearTimer() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Reconcile the timer with the current playing / visible / hidden state. */
  private sync() {
    this.clearTimer();
    if (!this.playing || !this.visible || document.hidden) return;

    const last = this.index === TRACE.length - 1;
    this.timer = window.setTimeout(
      () => {
        this.index = last ? 0 : this.index + 1;
        this.sync();
      },
      last ? HOLD_MS : STEP_MS,
    );
  }

  private toggle() {
    this.playing = !this.playing;
    this.sync();
  }

  /** Any manual move hands control to the reader, so playback stops. */
  private seek(to: number) {
    this.index = (to + TRACE.length) % TRACE.length;
    this.playing = false;
    this.sync();
  }

  /* --- Rendering --------------------------------------------------------- */

  private renderLine(src: string, lineNo: number, activeLine: number) {
    const on = lineNo === activeLine;
    const step = TRACE[this.index];

    return html`
      <li class=${classMap({ line: true, on })}>
        <span class="num">${lineNo}</span>
        <span class="src"
          >${tokenize(src).map(
            (t) => html`<span class="tok-${t.kind}">${t.text}</span>`,
          )}</span
        >
        ${
          on && step.inline
            ? html`<span class="inline mono">${step.inline}</span>`
            : nothing
        }
      </li>
    `;
  }

  private renderFlow() {
    const step = TRACE[this.index];
    const prev = this.index > 0 ? TRACE[this.index - 1] : undefined;
    const order = FLOW_NODES.map((n) => n.id);
    const activeAt = order.indexOf(step.node);

    // The single active edge is whichever one we just traversed.
    const traversed = prev ? `${prev.node}-${step.node}` : "";
    const activeEdge = EDGE_ALIAS[traversed] ?? traversed;
    const backActive = activeEdge === "body-loop";

    const arcX1 = NODE_GEOM.body.x + NODE_GEOM.body.w / 2;
    const arcX2 = NODE_GEOM.loop.x + NODE_GEOM.loop.w / 2;
    const arcMid = (arcX1 + arcX2) / 2;

    return html`
      <svg
        viewBox="0 0 ${FLOW_W} ${FLOW_H}"
        role="img"
        aria-label="Execution flow: call, init, loop, body, return"
      >
        <defs>
          <marker
            id="cf-tip"
            viewBox="0 0 8 8"
            refX="8"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="var(--cf-line-bright)" />
          </marker>
          <marker
            id="cf-tip-on"
            viewBox="0 0 8 8"
            refX="8"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" fill="var(--cf-accent)" />
          </marker>
        </defs>

        ${EDGES.map((e) => {
          const from = NODE_GEOM[e.from];
          const to = NODE_GEOM[e.to];
          const on = activeEdge === `${e.from}-${e.to}`;
          const y = NODE_Y + NODE_H / 2;
          return svg`<line
            class="edge ${on ? "on" : ""}"
            x1=${from.x + from.w + 4} y1=${y}
            x2=${to.x - 6} y2=${y}
            marker-end=${on ? "url(#cf-tip-on)" : "url(#cf-tip)"} />`;
        })}

        <path
          class="edge ${backActive ? "on" : ""}"
          d="M ${arcX1} ${NODE_Y - 2} C ${arcX1} 6, ${arcX2} 6, ${arcX2} ${NODE_Y - 8}"
          marker-end=${backActive ? "url(#cf-tip-on)" : "url(#cf-tip)"}
        />
        ${
          step.iteration === undefined
            ? nothing
            : svg`
            <rect class="arc-bg" x=${arcMid - 13} y="7" width="26" height="14" rx="4" />
            <text class="arc-label ${backActive ? "on" : ""}"
                  x=${arcMid} y="14" text-anchor="middle" dominant-baseline="middle"
            >×${step.iteration}</text>`
        }
        ${FLOW_NODES.map((n, i) => {
          const g = NODE_GEOM[n.id];
          const on = n.id === step.node;
          const done = !on && i < activeAt;
          return svg`<g class="n ${on ? "on" : done ? "done" : ""}">
            <rect class="n-box" x=${g.x} y=${NODE_Y} width=${g.w}
                  height=${NODE_H} rx="8" />
            <text class="n-label" x=${g.x + g.w / 2} y=${NODE_Y + NODE_H / 2}
                  text-anchor="middle" dominant-baseline="middle"
            >${n.label}</text>
          </g>`;
        })}
      </svg>
    `;
  }

  render() {
    const step = TRACE[this.index];
    const stack = [...step.stack].reverse();

    return html`
      <div class="frame">
        <div class="chrome">
          <div class="dots"><i></i><i></i><i></i></div>
          <span class="tab"><b>JS</b> sum.js</span>
          <span class=${classMap({ status: true, live: this.playing })}>
            <i></i>${this.playing ? "tracing" : "paused"}
          </span>
        </div>

        <div class="stage">
          <ol class="code">
            ${SNIPPET.map((src, i) => this.renderLine(src, i + 1, step.line))}
          </ol>

          <aside class="rail">
            <section class="panel">
              <h4>Variables</h4>
              ${
                step.vars.length === 0
                  ? html`<p class="empty">no scope</p>`
                  : html`<ul class="vars">
                      ${repeat(
                        step.vars,
                        (v) => v.name,
                        (v) => html`
                          <li
                            class=${classMap({ var: true, flash: !!v.changed })}
                          >
                            <span class="k">${v.name}</span>
                            <span class="v">${v.value}</span>
                          </li>
                        `,
                      )}
                    </ul>`
              }
            </section>

            <section class="panel">
              <h4>Call stack</h4>
              <ol class="stack">
                ${stack.map(
                  (frame, i) => html`
                    <li class=${classMap({ top: i === 0 })}>
                      <span class="depth">${stack.length - i - 1}</span>
                      <span>${frame}</span>
                    </li>
                  `,
                )}
              </ol>
            </section>
          </aside>
        </div>

        <div class="flow">
          <h4>Execution flow</h4>
          ${this.renderFlow()}
        </div>

        <div class="controls">
          <div class="btns">
            <button
              @click=${() => this.seek(this.index - 1)}
              title="Previous step"
              aria-label="Previous step"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M12 2.5v11L4.5 8z" />
                <rect x="2.5" y="2.5" width="1.6" height="11" rx="0.6" />
              </svg>
            </button>
            <button
              class="main"
              @click=${this.toggle}
              title=${this.playing ? "Pause" : "Play"}
              aria-label=${this.playing ? "Pause" : "Play"}
            >
              ${
                this.playing
                  ? html`<svg viewBox="0 0 16 16" aria-hidden="true">
                      <rect x="3.5" y="2.5" width="3.4" height="11" rx="0.8" />
                      <rect x="9.1" y="2.5" width="3.4" height="11" rx="0.8" />
                    </svg>`
                  : html`<svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 2.5l9 5.5-9 5.5z" />
                    </svg>`
              }
            </button>
            <button
              @click=${() => this.seek(this.index + 1)}
              title="Next step"
              aria-label="Next step"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 2.5v11L11.5 8z" />
                <rect x="11.9" y="2.5" width="1.6" height="11" rx="0.6" />
              </svg>
            </button>
          </div>

          <div class="timeline" role="group" aria-label="Execution timeline">
            ${TRACE.map(
              (_, i) => html`
                <button
                  class=${classMap({
                    seg: true,
                    past: i < this.index,
                    now: i === this.index,
                  })}
                  @click=${() => this.seek(i)}
                  title=${`Step ${i + 1}`}
                  aria-label=${`Go to step ${i + 1}`}
                ></button>
              `,
            )}
          </div>

          <span class="counter">
            <b>${String(this.index + 1).padStart(2, "0")}</b> / ${TRACE.length}
          </span>
        </div>

        <p class="caption" aria-live="polite">
          <span
            >${step.caption}${
              step.returned
                ? html`<span class="ret">⇒ ${step.returned}</span>`
                : nothing
            }</span
          >
        </p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-trace-player": CfTracePlayer;
  }
}
