import { LitElement, css, html, unsafeCSS, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout, typography } from "../styles/shared";
import { tokenize, highlightStyles } from "../lib/highlight";
import "./cf-reveal";

const SOURCE: string[] = [
  "const memo = new Map();",
  "",
  "function fib(n) {",
  "  if (n < 2) return n;",
  "  if (memo.has(n)) return memo.get(n);",
  "",
  "  const result = fib(n - 1) + fib(n - 2);",
  "  memo.set(n, result);",
  "",
  "  return result;",
  "}",
  "",
  "fib(8);",
];

/** Line-level annotations, keyed by 1-based line number. */
const ANNOTATIONS: Record<number, string> = {
  4: "n = 5 → false",
  5: "miss",
  7: "fib(4) + fib(3)",
};

const ACTIVE_LINE = 7;

const VARS = [
  { k: "n", v: "5", hot: false },
  { k: "memo", v: "Map(3)", hot: false },
  { k: "result", v: "undefined", hot: true },
];

const STACK = ["fib(5)", "fib(6)", "fib(7)", "fib(8)", "global"];

const OUTPUT = [
  { kind: "log", text: "computing fib(5)" },
  { kind: "log", text: "cache hit: 4" },
  { kind: "ret", text: "→ 21" },
];

interface FileNode {
  name: string;
  kind: "dir" | "file";
  open?: boolean;
  active?: boolean;
  depth?: number;
}

const FILES: FileNode[] = [
  { name: "src", kind: "dir", open: true },
  { name: "fib.js", kind: "file", active: true, depth: 1 },
  { name: "utils.js", kind: "file", depth: 1 },
  { name: "shapes.py", kind: "file", depth: 1 },
  { name: "tests", kind: "dir", open: false },
];

/**
 * A still of the full CodeFlow workspace.
 *
 * The hero shows the trace moving; this section shows the shape of the app
 * around it — explorer, tabs, scope rail, console and timeline — so the reader
 * can picture where they would actually be working.
 */
@customElement("cf-preview")
export class CfPreview extends LitElement {
  static styles = [
    reset,
    layout,
    typography,
    css`
      ${unsafeCSS(highlightStyles)}
    `,
    css`
      .head {
        max-width: 40rem;
        margin-bottom: 3.25rem;
      }

      /* --- Frame -------------------------------------------------------- */
      .ide {
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-xl);
        background: var(--cf-bg-raised);
        box-shadow: var(--cf-shadow-lg);
        overflow: hidden;
        container-type: inline-size;
      }

      .titlebar {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.625rem 0.875rem;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset-strong);
      }

      .dots {
        display: flex;
        gap: 0.4375rem;
      }

      .dots i {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--cf-track);
      }

      .titlebar .name {
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      .titlebar .right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.1875rem 0.5625rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-full);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-dim);
      }

      .pill.go {
        border-color: var(--cf-accent-line);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
      }

      .pill svg {
        width: 9px;
        height: 9px;
        fill: currentColor;
      }

      /* --- Body grid ---------------------------------------------------- */
      .body {
        display: grid;
        grid-template-columns: 44px 168px minmax(0, 1fr) 216px;
        min-height: 20rem;
      }

      /* --- Activity bar ------------------------------------------------- */
      .activity {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.625rem 0;
        border-right: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .activity span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--cf-r-sm);
        color: var(--cf-text-faint);
      }

      .activity span.on {
        color: var(--cf-accent);
        background: var(--cf-accent-soft);
      }

      .activity svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* --- Explorer ----------------------------------------------------- */
      .explorer {
        padding: 0.75rem 0.5rem;
        border-right: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
        min-width: 0;
      }

      .panel-title {
        margin: 0 0 0.5rem 0.375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      .tree {
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.75rem;
      }

      .tree li {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.1875rem 0.375rem;
        border-radius: var(--cf-r-sm);
        color: var(--cf-text-muted);
        white-space: nowrap;
      }

      .tree li.dir {
        color: var(--cf-text-dim);
      }

      .tree li.active {
        background: var(--cf-surface-3);
        color: var(--cf-text);
      }

      .tree li.d1 {
        padding-left: 1.25rem;
      }

      .tree .chev {
        font-size: 0.5625rem;
        color: var(--cf-text-faint);
      }

      .tree .ext {
        margin-left: auto;
        font-family: var(--cf-font-mono);
        font-size: 0.5625rem;
        color: var(--cf-text-faint);
      }

      /* --- Editor ------------------------------------------------------- */
      .editor {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .tabs {
        display: flex;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .tabs .tab {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        padding: 0.5rem 0.875rem;
        border-right: 1px solid var(--cf-line);
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        white-space: nowrap;
      }

      .tabs .tab.on {
        background: var(--cf-surface);
        color: var(--cf-text);
        box-shadow: inset 0 -1px 0 var(--cf-accent);
      }

      .tabs .tab .x {
        color: var(--cf-text-faint);
        font-size: 0.6875rem;
      }

      .code {
        margin: 0;
        padding: 0.75rem 0;
        list-style: none;
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
        line-height: 1.75;
        overflow-x: auto;
        flex: 1 1 auto;
      }

      .code li {
        display: flex;
        align-items: baseline;
        gap: 0.875rem;
        padding-inline: 0.75rem 1rem;
        border-left: 2px solid transparent;
        white-space: pre;
      }

      .code .num {
        flex: none;
        width: 1.5rem;
        text-align: right;
        font-size: 0.75rem;
        color: var(--cf-text-faint);
        user-select: none;
      }

      .code li.on {
        background: linear-gradient(
          90deg,
          var(--cf-accent-soft),
          transparent 90%
        );
        border-left-color: var(--cf-accent);
      }

      .code li.on .num {
        color: var(--cf-accent);
      }

      .code .src {
        flex: none;
      }

      /* Dim, right-floated annotations — the CodeFlow equivalent of the
         inline values a debugger paints at the end of a line. */
      .ann {
        flex: none;
        margin-left: 1.5rem;
        font-size: 0.6875rem;
        color: var(--cf-text-faint);
        white-space: nowrap;
      }

      .code li.on .ann {
        padding: 0.0625rem 0.5rem;
        border: 1px solid var(--cf-accent-line);
        border-radius: var(--cf-r-full);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
      }

      /* --- Right rail --------------------------------------------------- */
      .rail {
        display: flex;
        flex-direction: column;
        border-left: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
        min-width: 0;
      }

      .rail section {
        padding: 0.75rem;
        min-width: 0;
      }

      .rail section + section {
        border-top: 1px solid var(--cf-line);
      }

      .rows {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.1875rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      .rows li {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        padding: 0.125rem 0.375rem;
        border-radius: var(--cf-r-sm);
        border: 1px solid transparent;
        color: var(--cf-text-muted);
      }

      .rows li .k {
        color: var(--cf-blue);
      }

      .rows li .v {
        margin-left: auto;
        color: var(--cf-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rows li.hot {
        border-color: var(--cf-accent-line);
        background: var(--cf-accent-soft);
      }

      .rows li.hot .v {
        color: var(--cf-accent-hot);
      }

      .rows li.top {
        background: var(--cf-surface-3);
        color: var(--cf-text);
      }

      .rows li .depth {
        font-size: 0.625rem;
        color: var(--cf-text-faint);
      }

      .rows li.top .depth {
        color: var(--cf-accent);
      }

      .more {
        margin: 0.375rem 0 0 0.375rem;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-faint);
      }

      .out li {
        color: var(--cf-text-dim);
      }

      .out li.ret {
        color: var(--cf-green);
      }

      .out li::before {
        content: "›";
        color: var(--cf-text-faint);
      }

      .out li.ret::before {
        content: "";
      }

      /* --- Timeline footer ---------------------------------------------- */
      .timeline {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.6875rem 0.875rem;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-strong);
      }

      .timeline .label {
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
        flex: none;
      }

      .track {
        position: relative;
        flex: 1 1 auto;
        height: 6px;
        min-width: 0;
        border-radius: var(--cf-r-full);
        background: var(--cf-track);
        overflow: visible;
      }

      .track i {
        position: absolute;
        inset: 0 60% 0 0;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cf-accent-deep),
          var(--cf-accent)
        );
      }

      .track b {
        position: absolute;
        top: 50%;
        left: 40%;
        width: 12px;
        height: 12px;
        margin: -6px 0 0 -6px;
        border-radius: 50%;
        background: var(--cf-accent-hot);
        box-shadow: 0 0 0 3px var(--cf-accent-glow);
      }

      .timeline .meta {
        flex: none;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
        font-variant-numeric: tabular-nums;
      }

      .timeline .meta b {
        color: var(--cf-text);
        font-weight: 500;
      }

      /* --- Callouts beneath the frame ----------------------------------- */
      .callouts {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
        margin-top: 2rem;
      }

      .callout {
        padding-top: 1rem;
        border-top: 1px solid var(--cf-line);
      }

      .callout h4 {
        margin: 0 0 0.375rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--cf-text);
      }

      .callout p {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.6;
        color: var(--cf-text-muted);
      }

      @media (max-width: 760px) {
        .callouts {
          grid-template-columns: 1fr;
          gap: 0.5rem;
        }
      }

      /* --- Narrow: shed chrome, keep the editor ------------------------- */
      @container (max-width: 900px) {
        .body {
          grid-template-columns: 44px minmax(0, 1fr) 200px;
        }
        .explorer {
          display: none;
        }
      }

      @container (max-width: 680px) {
        .body {
          grid-template-columns: minmax(0, 1fr);
        }
        .activity {
          display: none;
        }
        .rail {
          border-left: 0;
          border-top: 1px solid var(--cf-line);
        }
      }
    `,
  ];

  private icon(paths: string) {
    return html`<svg viewBox="0 0 20 20" aria-hidden="true">
      <path d=${paths} />
    </svg>`;
  }

  private renderActivity() {
    const icons = [
      { d: "M3 4h5l2 2h7v10H3z", on: true, label: "Explorer" },
      {
        d: "M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12.5 12.5 17 17",
        on: false,
        label: "Search",
      },
      { d: "M4 6h7M4 10h12M4 14h5M13 6h3M13 14h3", on: false, label: "Flow" },
      {
        d: "M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM10 3v2M10 15v2M3 10h2M15 10h2",
        on: false,
        label: "Settings",
      },
    ];
    return html`
      <div class="activity" role="tablist" aria-label="Workspace">
        ${icons.map(
          (i) =>
            html`<span
              class=${i.on ? "on" : ""}
              role="tab"
              aria-selected=${i.on}
              title=${i.label}
              >${this.icon(i.d)}</span
            >`,
        )}
      </div>
    `;
  }

  private renderCode() {
    return html`
      <ol class="code">
        ${SOURCE.map((src, i) => {
          const n = i + 1;
          const on = n === ACTIVE_LINE;
          const ann = ANNOTATIONS[n];
          return html`
            <li class=${on ? "on" : ""}>
              <span class="num">${n}</span>
              <span class="src"
                >${tokenize(src).map(
                  (t) => html`<span class="tok-${t.kind}">${t.text}</span>`,
                )}</span
              >
              ${ann ? html`<span class="ann">${ann}</span>` : nothing}
            </li>
          `;
        })}
      </ol>
    `;
  }

  render() {
    const visibleStack = STACK.slice(0, 4);

    return html`
      <section class="section">
        <div class="container">
          <cf-reveal>
            <div class="head">
              <p class="eyebrow">Product</p>
              <h2 class="title">A workspace built around the trace.</h2>
              <p class="lede">
                Editor, scope, stack, console and timeline in one view — laid
                out so the answer to "what just happened?" is never more than a
                glance away.
              </p>
            </div>
          </cf-reveal>

          <cf-reveal .delay=${1}>
            <div class="ide">
              <div class="titlebar">
                <div class="dots"><i></i><i></i><i></i></div>
                <span class="name">fib.js — CodeFlow</span>
                <div class="right">
                  <span class="pill go">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 2.5l9 5.5-9 5.5z" />
                    </svg>
                    Run
                  </span>
                  <span class="pill">Share</span>
                </div>
              </div>

              <div class="body">
                ${this.renderActivity()}

                <div class="explorer">
                  <p class="panel-title">Explorer</p>
                  <ul class="tree">
                    ${FILES.map(
                      (f) => html`
                        <li
                          class=${[
                            f.kind,
                            f.active ? "active" : "",
                            f.depth === 1 ? "d1" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          ${
                            f.kind === "dir"
                              ? html`<span class="chev"
                                  >${f.open ? "▾" : "▸"}</span
                                >`
                              : nothing
                          }
                          <span>${f.name}</span>
                          ${
                            f.kind === "file"
                              ? html`<span class="ext"
                                  >${f.name.split(".").pop()}</span
                                >`
                              : nothing
                          }
                        </li>
                      `,
                    )}
                  </ul>
                </div>

                <div class="editor">
                  <div class="tabs">
                    <span class="tab on">fib.js <span class="x">×</span></span>
                    <span class="tab">utils.js</span>
                  </div>
                  ${this.renderCode()}
                </div>

                <aside class="rail">
                  <section>
                    <p class="panel-title">Variables</p>
                    <ul class="rows">
                      ${VARS.map(
                        (v) => html`
                          <li class=${v.hot ? "hot" : ""}>
                            <span class="k">${v.k}</span>
                            <span class="v">${v.v}</span>
                          </li>
                        `,
                      )}
                    </ul>
                  </section>

                  <section>
                    <p class="panel-title">Call stack</p>
                    <ul class="rows">
                      ${visibleStack.map(
                        (f, i) => html`
                          <li class=${i === 0 ? "top" : ""}>
                            <span class="depth">${STACK.length - i - 1}</span>
                            <span>${f}</span>
                          </li>
                        `,
                      )}
                    </ul>
                    <p class="more">
                      +${STACK.length - visibleStack.length} more
                    </p>
                  </section>

                  <section>
                    <p class="panel-title">Output</p>
                    <ul class="rows out">
                      ${OUTPUT.map(
                        (o) => html`<li class=${o.kind}>${o.text}</li>`,
                      )}
                    </ul>
                  </section>
                </aside>
              </div>

              <div class="timeline">
                <span class="label">Timeline</span>
                <span class="track"><i></i><b></b></span>
                <span class="meta"> step <b>24</b> / 61 · <b>1.4</b>ms </span>
              </div>
            </div>
          </cf-reveal>

          <div class="callouts">
            <cf-reveal .delay=${2}>
              <div class="callout">
                <h4>Inline values</h4>
                <p>
                  Each executed line is annotated with what it actually
                  evaluated to on this run.
                </p>
              </div>
            </cf-reveal>
            <cf-reveal .delay=${3}>
              <div class="callout">
                <h4>Live scope</h4>
                <p>
                  Variables and the call stack update as you move, with the
                  frame you are in pinned to the top.
                </p>
              </div>
            </cf-reveal>
            <cf-reveal .delay=${4}>
              <div class="callout">
                <h4>Scrubbable trace</h4>
                <p>
                  The whole run is recorded. Drag the timeline to any moment and
                  the workspace follows.
                </p>
              </div>
            </cf-reveal>
          </div>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-preview": CfPreview;
  }
}
