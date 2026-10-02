import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { reset } from "../styles/shared";
import type { ExecutionStatus } from "../execution/controller";

/**
 * Transport controls and the timeline scrubber.
 *
 * Emits intent only — it holds no playback state of its own, so the
 * controller stays the single source of truth for what "running" means.
 *
 * @fires cf-run @fires cf-pause @fires cf-resume @fires cf-stop
 * @fires cf-step-forward @fires cf-step-back @fires cf-restart
 * @fires cf-seek {detail:{step:number}}
 */
@customElement("cf-exec-controls")
export class CfExecControls extends LitElement {
  @property({ type: String }) status: ExecutionStatus = "idle";
  @property({ type: Number }) step = -1;
  @property({ type: Number }) totalSteps = 0;
  /** Narration for the current step. */
  @property({ type: String }) caption = "";

  /**
   * False for languages that only report output. Stepping, the scrubber and
   * the step counter are hidden rather than disabled — a control that can
   * never work is worse than one that is absent.
   */
  @property({ type: Boolean }) traceable = true;

  static styles = [
    reset,
    css`
      :host {
        display: block;
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .row {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem 0.875rem;
        flex-wrap: wrap;
      }

      .group {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex: none;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        height: 30px;
        min-width: 30px;
        padding: 0 0.4375rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        font-family: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
        transition:
          background var(--cf-dur) var(--cf-ease),
          color var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease);
      }

      button:hover:not(:disabled) {
        background: var(--cf-surface-3);
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      button.primary {
        padding-inline: 0.75rem;
        background: linear-gradient(
          180deg,
          var(--cf-btn-top),
          var(--cf-btn-bot)
        );
        border-color: transparent;
        color: var(--cf-on-accent);
        font-weight: 550;
      }

      button.primary:hover:not(:disabled) {
        filter: brightness(1.06);
        background: linear-gradient(
          180deg,
          var(--cf-btn-top),
          var(--cf-btn-bot)
        );
        color: var(--cf-on-accent);
      }

      svg {
        width: 13px;
        height: 13px;
        fill: currentColor;
      }

      /* --- Scrubber -------------------------------------------------------- */
      .track {
        flex: 1 1 12rem;
        min-width: 8rem;
        height: 22px;
        display: flex;
        align-items: center;
      }

      input[type="range"] {
        width: 100%;
        accent-color: var(--cf-accent);
        cursor: pointer;
      }

      input[type="range"]:disabled {
        opacity: 0.4;
        cursor: not-allowed;
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

      /* --- Status ---------------------------------------------------------- */
      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        flex: none;
        padding: 0.1875rem 0.5rem;
        border-radius: var(--cf-r-full);
        border: 1px solid var(--cf-line);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      .status i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--cf-text-faint);
      }

      .status.running {
        color: var(--cf-accent);
        border-color: var(--cf-accent-line);
      }
      .status.running i {
        background: var(--cf-accent);
        animation: pulse 1.4s var(--cf-ease) infinite;
      }
      .status.paused i {
        background: var(--cf-yellow);
      }
      .status.completed {
        color: var(--cf-green);
      }
      .status.completed i {
        background: var(--cf-green);
      }
      .status.error {
        color: var(--cf-rose);
        border-color: color-mix(in srgb, var(--cf-rose) 45%, transparent);
      }
      .status.error i {
        background: var(--cf-rose);
      }

      @keyframes pulse {
        50% {
          opacity: 0.35;
        }
      }

      .output-only {
        flex: 1 1 auto;
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }

      .caption {
        display: flex;
        align-items: flex-start;
        gap: 0.4375rem;
        padding: 0 0.875rem 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--cf-text-dim);
      }

      .caption::before {
        content: "▸";
        color: var(--cf-accent);
      }
    `,
  ];

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  private icon(path: string) {
    return html`<svg viewBox="0 0 16 16" aria-hidden="true">
      <path d=${path} />
    </svg>`;
  }

  render() {
    const { status, step, totalSteps } = this;
    const hasTrace = totalSteps > 0;
    const running = status === "running";
    const busy = running && step < 0; // executing, before the first frame

    return html`
      <div class="row">
        <div class="group">
          ${
            running
              ? html`<button
                  class="primary"
                  type="button"
                  @click=${() => this.emit("cf-pause")}
                >
                  ${this.icon("M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z")} Pause
                </button>`
              : html`<button
                  class="primary"
                  type="button"
                  ?disabled=${busy}
                  @click=${() =>
                    this.emit(status === "paused" ? "cf-resume" : "cf-run")}
                >
                  ${this.icon("M4 2.5l9 5.5-9 5.5z")}
                  ${status === "paused" ? "Resume" : "Run"}
                </button>`
          }

          <button
            type="button"
            title="Stop"
            aria-label="Stop"
            ?disabled=${status === "idle"}
            @click=${() => this.emit("cf-stop")}
          >
            ${this.icon("M3.5 3.5h9v9h-9z")}
          </button>

          <button
            type="button"
            title="Restart"
            aria-label="Restart"
            ?disabled=${!hasTrace}
            @click=${() => this.emit("cf-restart")}
          >
            ${this.icon(
              "M8 3a5 5 0 1 0 4.6 3h-1.7A3.4 3.4 0 1 1 8 4.6V7l3.2-2.5L8 2z",
            )}
          </button>
        </div>

        ${
          !this.traceable
            ? html`<span class="output-only"
                >Output only — this language cannot be stepped through.</span
              >`
            : nothing
        }
        ${
          !this.traceable
            ? nothing
            : html`<div class="group">
          <button
            type="button"
            title="Step back"
            aria-label="Step back"
            ?disabled=${!hasTrace || step <= 0}
            @click=${() => this.emit("cf-step-back")}
          >
            ${this.icon("M12 2.5v11L4.5 8zM2.5 2.5h1.6v11H2.5z")}
          </button>
          <button
            type="button"
            title="Step forward"
            aria-label="Step forward"
            ?disabled=${!hasTrace || step >= totalSteps - 1}
            @click=${() => this.emit("cf-step-forward")}
          >
            ${this.icon("M4 2.5v11L11.5 8zM11.9 2.5h1.6v11h-1.6z")}
          </button>
        </div>

        </div>`
        }
        ${
          this.traceable
            ? html`<div class="track">
                <label class="sr-only" for="scrub">Execution timeline</label>
                <input
                  id="scrub"
                  type="range"
                  min="0"
                  max=${Math.max(totalSteps - 1, 0)}
                  .value=${String(Math.max(step, 0))}
                  ?disabled=${!hasTrace}
                  aria-label="Execution timeline"
                  aria-valuetext=${
                    hasTrace ? `Step ${step + 1} of ${totalSteps}` : "No trace"
                  }
                  @input=${(e: Event) =>
                    this.emit("cf-seek", {
                      step: Number((e.target as HTMLInputElement).value),
                    })}
                />
              </div>`
            : nothing
        }
        ${
          this.traceable
            ? html`<span class="counter">
                ${
                  hasTrace
                    ? html`<b>${String(step + 1).padStart(2, "0")}</b> /
                        ${totalSteps}`
                    : html`— / —`
                }
              </span>`
            : nothing
        }

        <span class=${`status ${status}`}> <i></i>${status} </span>
      </div>

      ${
        this.caption
          ? html`<p class="caption" aria-live="polite">${this.caption}</p>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-exec-controls": CfExecControls;
  }
}
