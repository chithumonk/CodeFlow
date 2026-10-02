import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { reset } from "../styles/shared";
import type { Trace } from "../execution/trace";

/**
 * The whole run, written out in order.
 *
 * The caption under the controls says what is happening right now; this says
 * what happened, start to finish. Reading a program's behaviour as a list is
 * often faster than stepping through it, and it makes shapes visible that a
 * single frame cannot show — recursion descending and unwinding, a loop
 * repeating, a branch never taken.
 *
 * Rows are indented by call depth, so nesting reads at a glance.
 *
 * @fires cf-seek {detail:{step:number}}
 */

/**
 * Beyond this many steps, render a window around the current one instead of
 * the whole trace. Tens of thousands of rows would freeze the page, and
 * nobody reads them all anyway.
 */
const FULL_RENDER_LIMIT = 800;
const WINDOW_RADIUS = 200;

@customElement("cf-transcript")
export class CfTranscript extends LitElement {
  @property({ attribute: false }) trace: Trace | null = null;
  @property({ type: Number }) step = -1;
  /** The program being traced, so each row can show the line it ran. */
  @property({ type: String }) source = "";

  @query(".row.current") private currentRow?: HTMLElement;

  private lastScrolledTo = -1;

  static styles = [
    reset,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
      }

      .scroll {
        flex: 1 1 auto;
        overflow-y: auto;
        min-height: 0;
        padding: 0.25rem 0;
      }

      ol {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .row {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        width: 100%;
        padding: 0.1875rem 0.875rem;
        border: 0;
        border-left: 2px solid transparent;
        background: transparent;
        font-family: inherit;
        font-size: 0.8125rem;
        line-height: 1.5;
        text-align: left;
        color: var(--cf-text-dim);
        cursor: pointer;
      }

      .row:hover {
        background: var(--cf-hover);
      }

      .row.current {
        background: var(--cf-accent-soft);
        border-left-color: var(--cf-accent);
        color: var(--cf-text);
      }

      /* Steps already executed read as settled; upcoming ones as pending. */
      .row.future {
        opacity: 0.45;
      }

      .n {
        flex: none;
        width: 2.5rem;
        text-align: right;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-faint);
        font-variant-numeric: tabular-nums;
      }

      .row.current .n {
        color: var(--cf-accent);
      }

      .line {
        flex: none;
        min-width: 2rem;
        padding: 0 0.3125rem;
        border-radius: var(--cf-r-sm);
        background: var(--cf-inset);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
        text-align: center;
      }

      /* Depth is drawn rather than described: a nested call is simply
         further right. */
      .indent {
        flex: none;
        border-left: 1px solid var(--cf-line);
        align-self: stretch;
      }

      .text {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .text code {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-dim);
        white-space: pre;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .row.current .text code {
        color: var(--cf-text);
      }

      /* What happened, as opposed to what the line says. */
      .note-text {
        flex: none;
        color: var(--cf-accent-hot);
        font-size: 0.75rem;
      }

      .row.ret .note-text {
        color: var(--cf-green);
      }

      .row.ret .text {
        color: var(--cf-green);
      }

      .row.err .text {
        color: var(--cf-rose);
      }

      .note {
        padding: 0.375rem 0.875rem;
        border-bottom: 1px solid var(--cf-line);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      .empty {
        padding: 0.75rem 0.875rem;
        font-size: 0.8125rem;
        font-style: italic;
        color: var(--cf-text-faint);
      }
    `,
  ];

  updated(changed: Map<string, unknown>) {
    // Follow playback, but only when the step actually moved — otherwise
    // every unrelated re-render would yank the reader's scroll position.
    if (changed.has("step") && this.step !== this.lastScrolledTo) {
      this.lastScrolledTo = this.step;
      this.currentRow?.scrollIntoView({ block: "nearest" });
    }
  }

  /**
   * Narration only exists for steps that did something observable. For the
   * rest — a condition being tested, a block being entered — the most useful
   * thing to show is the line itself, so a reader can follow the program
   * without looking back and forth at the editor.
   */
  private describe(
    line: number,
    caption: string,
  ): { code: string; note: string } {
    const sourceLine = (this.sourceLines[line - 1] ?? "").trim();
    const generic = /^Line \d+(\s|$)/.test(caption);

    return {
      code: sourceLine.length > 72 ? `${sourceLine.slice(0, 71)}…` : sourceLine,
      note: generic ? "" : caption,
    };
  }

  /** Split once per source change, not once per row. */
  private get sourceLines(): string[] {
    if (this.cachedFor !== this.source) {
      this.cachedFor = this.source;
      this.cachedLines = this.source.split(/\r?\n/);
    }
    return this.cachedLines;
  }

  // A sentinel no real source can equal, so the first read always splits.
  private cachedFor: string | null = null;
  private cachedLines: string[] = [];

  private seek(step: number) {
    this.dispatchEvent(
      new CustomEvent("cf-seek", { detail: { step }, bubbles: true }),
    );
  }

  render() {
    const frames = this.trace?.frames ?? [];

    if (frames.length === 0) {
      return html`<div class="scroll">
        <p class="empty">
          Press Run to see what your program does, step by step.
        </p>
      </div>`;
    }

    // Window large traces around the current step.
    const windowed = frames.length > FULL_RENDER_LIMIT;
    const centre = this.step >= 0 ? this.step : 0;
    const from = windowed ? Math.max(0, centre - WINDOW_RADIUS) : 0;
    const to = windowed
      ? Math.min(frames.length, centre + WINDOW_RADIUS)
      : frames.length;

    const rows = frames.slice(from, to).map((frame, i) => ({
      frame,
      index: from + i,
    }));

    const errorLine = this.trace?.error?.line;

    return html`
      ${
        windowed
          ? html`<p class="note">
              Showing steps ${from + 1}–${to} of ${frames.length}. Scrub the
              timeline to move the window.
            </p>`
          : nothing
      }

      <div class="scroll">
        <ol>
          ${repeat(
            rows,
            (row) => row.index,
            (row) => {
              const depth = Math.max(0, row.frame.stack.length - 1);
              const isError =
                errorLine !== undefined &&
                row.index === frames.length - 1 &&
                row.frame.line === errorLine;

              return html`
                <li>
                  <button
                    class=${classMap({
                      row: true,
                      current: row.index === this.step,
                      future: this.step >= 0 && row.index > this.step,
                      ret: row.frame.returned !== undefined,
                      err: isError,
                    })}
                    type="button"
                    @click=${() => this.seek(row.index)}
                    aria-current=${row.index === this.step ? "step" : "false"}
                  >
                    <span class="n">${row.index + 1}</span>
                    <span class="line" title="Line ${row.frame.line}">
                      ${row.frame.line}
                    </span>
                    ${
                      depth > 0
                        ? html`<span
                            class="indent"
                            style=${`margin-left:${(depth - 1) * 0.75}rem`}
                            aria-hidden="true"
                          ></span>`
                        : nothing
                    }
                    ${(() => {
                      const { code, note } = this.describe(
                        row.frame.line,
                        row.frame.caption,
                      );
                      return html`<span class="text">
                        ${code ? html`<code>${code}</code>` : nothing}${
                          note
                            ? html`<span class="note-text">${note}</span>`
                            : nothing
                        }
                      </span>`;
                    })()}
                  </button>
                </li>
              `;
            },
          )}
        </ol>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-transcript": CfTranscript;
  }
}
