import { LitElement, css, html, svg, nothing } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout, typography, surface } from "../styles/shared";
import "./cf-reveal";

interface Feature {
  title: string;
  body: string;
  /** Which inline diagram to draw in the tile's visual slot. */
  art: "steps" | "vars" | "stack" | "flow";
  /** Tiles marked wide take two columns on the desktop grid. */
  wide?: boolean;
}

const FEATURES: Feature[] = [
  {
    title: "Step-by-step execution",
    body: "Move forward and backward through your program one statement at a time. The active line is always highlighted, so you never lose your place.",
    art: "steps",
    wide: true,
  },
  {
    title: "Variable tracking",
    body: "Every value in scope, updated as it changes — and highlighted the moment it does.",
    art: "vars",
  },
  {
    title: "Call stack",
    body: "See which function you are inside and how you got there, frame by frame.",
    art: "stack",
  },
  {
    title: "Execution flow",
    body: "A live diagram of the path your program actually took — including every branch it skipped and every loop it went around.",
    art: "flow",
    wide: true,
  },
];

/**
 * Feature tiles. Each one carries a small diagram drawn in SVG or CSS rather
 * than a stock icon, because the features are all about seeing something.
 */
@customElement("cf-features")
export class CfFeatures extends LitElement {
  static styles = [
    reset,
    layout,
    typography,
    surface,
    css`
      .head {
        max-width: 40rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
        margin-top: 3.5rem;
      }

      cf-reveal.wide {
        grid-column: span 2;
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }

        cf-reveal.wide {
          grid-column: auto;
        }
      }

      cf-reveal {
        display: flex;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        padding: 1.5rem;
        transition:
          border-color var(--cf-dur) var(--cf-ease),
          transform var(--cf-dur) var(--cf-ease);
      }

      .card:hover {
        border-color: var(--cf-line-strong);
        transform: translateY(-2px);
      }

      .card p.body {
        max-width: 44ch;
      }

      /* Pushed to the bottom so diagrams line up across a row of tiles. */
      .art {
        margin-top: auto;
        padding-top: 1.5rem;
        border-top: 1px solid var(--cf-line);
      }

      /* Every diagram shares a 96-unit-tall viewBox. Fixing the rendered height
         and letting preserveAspectRatio letterbox horizontally keeps them at
         their natural scale whether the tile is one column wide or two. */
      .art svg {
        display: block;
        width: 100%;
        height: 120px;
      }

      /* --- Shared diagram primitives ------------------------------------ */
      .box {
        fill: var(--cf-inset-strong);
        stroke: var(--cf-line);
        stroke-width: 1;
      }

      .box.on {
        fill: var(--cf-accent-soft);
        stroke: var(--cf-accent-line);
      }

      .bar {
        fill: var(--cf-track);
      }

      .bar.on {
        fill: var(--cf-accent);
      }

      text {
        font-family: var(--cf-font-mono);
        font-size: 10px;
        fill: var(--cf-text-muted);
      }

      text.on {
        fill: var(--cf-accent-hot);
      }

      text.val {
        fill: var(--cf-text-dim);
      }

      .link {
        stroke: var(--cf-line-strong);
        stroke-width: 1.25;
        fill: none;
      }

      .link.on {
        stroke: var(--cf-accent);
      }

      .caret {
        fill: var(--cf-accent);
      }

      .pane {
        fill: var(--cf-inset);
        stroke: var(--cf-line);
        stroke-width: 1;
      }
    `,
  ];

  /* --- Tile diagrams ------------------------------------------------------ */

  /** Stacked code lines with the active one lit and a gutter pointer. */
  private artSteps() {
    const widths = [120, 168, 96, 190, 144, 78];
    const active = 3;
    return html`
      <svg
        viewBox="0 0 320 96"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Lines of code stepping"
      >
        <!-- Pane backdrop, so the full-width active-line highlight reads as a
             code pane edge rather than a bar that stops for no reason. -->
        <rect class="pane" x="0" y="0" width="320" height="96" rx="6" />
        ${widths.map((w, i) => {
          const y = 6 + i * 15;
          const on = i === active;
          return svg`
            ${
              on
                ? svg`<rect class="box on" x="0" y=${y - 3} width="320"
                        height="14" rx="3" />
                      <path class="caret" d=${`M4 ${y + 1} l5 3 -5 3 z`} />`
                : nothing
            }
            <rect class=${`bar ${on ? "on" : ""}`} x="16" y=${y + 2}
                  width=${w} height="4" rx="2" />
          `;
        })}
      </svg>
    `;
  }

  /** A scope table with one row mid-change. */
  private artVars() {
    const rows = [
      { k: "index", v: "2", on: false },
      { k: "total", v: "10", on: true },
      { k: "done", v: "false", on: false },
    ];
    return html`
      <svg
        viewBox="0 0 260 96"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Variables in scope"
      >
        ${rows.map((r, i) => {
          const y = 8 + i * 28;
          return svg`
            <rect class=${`box ${r.on ? "on" : ""}`} x="0" y=${y} width="260"
                  height="22" rx="5" />
            <text x="10" y=${y + 15} class=${r.on ? "on" : ""}>${r.k}</text>
            <text x="250" y=${y + 15} text-anchor="end" class="val"
            >${r.v}</text>
          `;
        })}
      </svg>
    `;
  }

  /** Nested frames, innermost on top. */
  private artStack() {
    const frames = [
      { name: "parse()", on: true },
      { name: "load()", on: false },
      { name: "main()", on: false },
    ];
    return html`
      <svg
        viewBox="0 0 260 96"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Call stack frames"
      >
        ${frames.map((f, i) => {
          const y = 8 + i * 28;
          const inset = i * 12;
          return svg`
            <rect class=${`box ${f.on ? "on" : ""}`} x=${inset} y=${y}
                  width=${260 - inset} height="22" rx="5" />
            <text x=${inset + 10} y=${y + 15} class=${f.on ? "on" : ""}
            >${f.name}</text>
          `;
        })}
      </svg>
    `;
  }

  /** A branch with the taken path lit and the skipped path dimmed. */
  private artFlow() {
    return html`
      <svg
        viewBox="0 0 320 96"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-label="Branching execution flow"
      >
        <rect class="box on" x="4" y="36" width="72" height="24" rx="6" />
        <text class="on" x="40" y="51" text-anchor="middle">if</text>

        <path class="link on" d="M76 48 h22 q8 0 8 -8 v-14 q0 -8 8 -8 h18" />
        <path class="link" d="M76 48 h22 q8 0 8 8 v14 q0 8 8 8 h18" />

        <rect class="box on" x="132" y="6" width="84" height="24" rx="6" />
        <text class="on" x="174" y="21" text-anchor="middle">then</text>

        <rect class="box" x="132" y="66" width="84" height="24" rx="6" />
        <text x="174" y="81" text-anchor="middle">else</text>

        <path class="link on" d="M216 18 h18 q8 0 8 8 v14 q0 8 8 8 h14" />
        <path class="link" d="M216 78 h18 q8 0 8 -8 v-14 q0 -8 8 -8 h14" />

        <rect class="box on" x="264" y="36" width="52" height="24" rx="6" />
        <text class="on" x="290" y="51" text-anchor="middle">next</text>
      </svg>
    `;
  }

  private art(kind: Feature["art"]) {
    switch (kind) {
      case "steps":
        return this.artSteps();
      case "vars":
        return this.artVars();
      case "stack":
        return this.artStack();
      case "flow":
        return this.artFlow();
    }
  }

  render() {
    return html`
      <section class="section">
        <div class="container">
          <cf-reveal>
            <div class="head">
              <p class="eyebrow">Features</p>
              <h2 class="title">Everything you need to follow the logic.</h2>
              <p class="lede">
                Four views onto the same trace. Read them together and the
                behaviour of a program stops being a guess.
              </p>
            </div>
          </cf-reveal>

          <div class="grid">
            ${FEATURES.map(
              (f, i) => html`
                <cf-reveal class=${f.wide ? "wide" : ""} .delay=${(i % 3) + 1}>
                  <article class="card">
                    <h3>${f.title}</h3>
                    <p class="body">${f.body}</p>
                    <div class="art">${this.art(f.art)}</div>
                  </article>
                </cf-reveal>
              `,
            )}
          </div>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-features": CfFeatures;
  }
}
