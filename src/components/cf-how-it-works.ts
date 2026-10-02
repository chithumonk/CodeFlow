import { LitElement, css, html, unsafeCSS } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout, typography, surface } from "../styles/shared";
import { tokenize, highlightStyles } from "../lib/highlight";
import "./cf-reveal";

/**
 * The three-beat explanation of the product. Each step carries a small, honest
 * illustration of that stage rather than a generic icon — the reader should be
 * able to tell what the step does without reading the copy.
 */
@customElement("cf-how-it-works")
export class CfHowItWorks extends LitElement {
  static styles = [
    reset,
    layout,
    typography,
    surface,
    css`
      ${unsafeCSS(highlightStyles)}
    `,
    css`
      .head {
        max-width: 42rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.5rem;
        margin-top: 3.5rem;
      }

      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
          gap: 1rem;
        }
      }

      .step {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* Numbered rule across the top ties the three steps into a sequence. */
      .rule {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding-bottom: 1.25rem;
      }

      .n {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.625rem;
        height: 1.625rem;
        flex: none;
        border: 1px solid var(--cf-accent-line);
        border-radius: 50%;
        background: var(--cf-accent-soft);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-accent-hot);
      }

      .rule::after {
        content: "";
        flex: 1 1 auto;
        height: 1px;
        background: linear-gradient(90deg, var(--cf-line-strong), transparent);
      }

      .card {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        padding: 1.375rem;
      }

      .card h3 {
        margin-bottom: 0.5rem;
      }

      /* --- Shared mini-visual shell ------------------------------------- */
      .vis {
        margin-top: auto;
        padding-top: 1.5rem;
      }

      .mini {
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-md);
        background: var(--cf-inset-strong);
        padding: 0.75rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        line-height: 1.7;
        min-height: 6.5rem;
      }

      /* --- 1. Write ------------------------------------------------------ */
      .mini.write {
        overflow: hidden;
      }

      /* Indentation is preserved by the .tok-plain whitespace tokens, so the
         line box itself can collapse the template's own formatting. */
      .mini.write .cl {
        min-height: 1.7em;
      }

      .caret {
        display: inline-block;
        width: 1px;
        height: 1.05em;
        margin-left: 1px;
        vertical-align: text-bottom;
        background: var(--cf-accent);
        animation: blink 1.1s steps(1) infinite;
      }

      @keyframes blink {
        50% {
          opacity: 0;
        }
      }

      /* --- 2. Run -------------------------------------------------------- */
      .mini.run {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        justify-content: center;
      }

      .tick {
        display: flex;
        align-items: center;
        gap: 0.625rem;
      }

      .tick .bar {
        flex: 1 1 auto;
        height: 5px;
        border-radius: var(--cf-r-full);
        background: var(--cf-track);
        overflow: hidden;
      }

      .tick .bar i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--cf-accent-deep),
          var(--cf-accent-hot)
        );
        animation: fill 2.6s var(--cf-ease) infinite;
      }

      .tick:nth-child(2) .bar i {
        animation-delay: 0.25s;
      }
      .tick:nth-child(3) .bar i {
        animation-delay: 0.5s;
      }

      @keyframes fill {
        0% {
          width: 0;
        }
        45%,
        100% {
          width: 100%;
        }
      }

      .tick label {
        flex: none;
        width: 3.25rem;
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
      }

      /* --- 3. Understand ------------------------------------------------- */
      .mini.understand {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        justify-content: center;
      }

      .row {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        padding: 0.1875rem 0.5rem;
        border-radius: var(--cf-r-sm);
        border: 1px solid transparent;
      }

      .row.hot {
        border-color: var(--cf-accent-line);
        background: var(--cf-accent-soft);
      }

      .row .k {
        color: var(--cf-blue);
      }

      .row .v {
        margin-left: auto;
        color: var(--cf-text);
      }

      .row.hot .v {
        color: var(--cf-accent-hot);
      }

      .row .arrow {
        color: var(--cf-text-faint);
        font-size: 0.6875rem;
      }
    `,
  ];

  private code(line: string) {
    return tokenize(line).map(
      (t) => html`<span class="tok-${t.kind}">${t.text}</span>`,
    );
  }

  render() {
    return html`
      <section class="section">
        <div class="container">
          <cf-reveal>
            <div class="head">
              <p class="eyebrow">How it works</p>
              <h2 class="title">Three steps from code to clarity.</h2>
              <p class="lede">
                No breakpoints to place, no print statements to delete. Write
                something, press run, and read the whole story of what happened.
              </p>
            </div>
          </cf-reveal>

          <div class="grid">
            <cf-reveal .delay=${1}>
              <div class="step">
                <div class="rule"><span class="n">1</span></div>
                <div class="card">
                  <h3>Write</h3>
                  <p class="body">
                    Type straight into the editor — real syntax highlighting,
                    real autocomplete, nothing to install or configure first.
                  </p>
                  <div class="vis">
                    <div class="mini write">
                      <div class="cl">
                        ${this.code("function greet(name) {")}
                      </div>
                      <div class="cl">
                        ${this.code("  return `hi ${name}`;")}
                      </div>
                      <div class="cl">
                        ${this.code("}")}<span class="caret"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </cf-reveal>

            <cf-reveal .delay=${2}>
              <div class="step">
                <div class="rule"><span class="n">2</span></div>
                <div class="card">
                  <h3>Run</h3>
                  <p class="body">
                    CodeFlow executes your program and records every step it
                    takes, building a complete trace you can move through.
                  </p>
                  <div class="vis">
                    <div class="mini run">
                      <div class="tick">
                        <label>parse</label>
                        <span class="bar"><i></i></span>
                      </div>
                      <div class="tick">
                        <label>execute</label>
                        <span class="bar"><i></i></span>
                      </div>
                      <div class="tick">
                        <label>trace</label>
                        <span class="bar"><i></i></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </cf-reveal>

            <cf-reveal .delay=${3}>
              <div class="step">
                <div class="rule"><span class="n">3</span></div>
                <div class="card">
                  <h3>Understand</h3>
                  <p class="body">
                    Scrub back and forth through the trace. Watch values change,
                    follow the call stack, and see the path your code actually
                    took.
                  </p>
                  <div class="vis">
                    <div class="mini understand">
                      <div class="row">
                        <span class="k">name</span>
                        <span class="v">"ada"</span>
                      </div>
                      <div class="row hot">
                        <span class="k">total</span>
                        <span class="arrow">6 →</span>
                        <span class="v">10</span>
                      </div>
                      <div class="row">
                        <span class="k">items</span>
                        <span class="v">Array(4)</span>
                      </div>
                    </div>
                  </div>
                </div>
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
    "cf-how-it-works": CfHowItWorks;
  }
}
