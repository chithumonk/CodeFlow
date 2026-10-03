import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { reset } from "../styles/shared";
import { parseValue, pointerTarget } from "../lib/value-shape";
import type { TraceVar } from "../execution/trace";

/**
 * Variables drawn as the shapes they are.
 *
 * A list printed as `[1, 2, 3, 4]` tells you what the value is but not what
 * the program is doing to it. Drawn as cells, with the cells already read
 * dimmed and a marker sitting under the one being read now, the same trace
 * shows the walk through the collection — which is the thing a reader is
 * actually trying to follow.
 *
 * The marker is positioned from measured cell geometry rather than computed
 * from a fixed cell width, because cells size to their contents: a list of
 * `1000000` and a list of `1` do not have the same column width, and a
 * marker placed by arithmetic drifts off the cell on the first wide value.
 */
@customElement("cf-data-view")
export class CfDataView extends LitElement {
  @property({ attribute: false }) vars: TraceVar[] = [];
  /** 1-based loop counter for this step, when the trace reported one. */
  @property({ type: Number }) iteration?: number;

  static styles = [
    reset,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        min-width: 0;
      }

      .entry {
        min-width: 0;
      }

      .name {
        display: flex;
        align-items: baseline;
        gap: 0.4375rem;
        margin-bottom: 0.3125rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      .kind {
        font-size: 0.625rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--cf-text-faint);
      }

      /* --- Collections ------------------------------------------------------ */
      .track {
        position: relative;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 1.5rem;
      }

      .cells {
        display: flex;
        gap: 0.25rem;
        width: max-content;
      }

      .cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1875rem;
        min-width: 2.25rem;
        padding: 0.375rem 0.5rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
        color: var(--cf-text);
        transition:
          transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
          border-color 0.25s ease,
          background 0.25s ease,
          opacity 0.25s ease;
      }

      /* Placeholder glyphs are not the program's data; they read as muted. */
      .cell .ghost {
        color: var(--cf-text-faint);
      }

      .cell .idx {
        font-size: 0.5625rem;
        color: var(--cf-text-faint);
      }

      /* Already walked past: present, but no longer the subject. */
      .cell.done {
        opacity: 0.5;
        background: var(--cf-inset-soft);
      }

      .cell.now {
        transform: translateY(-4px) scale(1.08);
        border-color: var(--cf-accent);
        background: color-mix(in srgb, var(--cf-accent) 20%, transparent);
      }

      .cell.changed {
        animation: cell-flash 0.6s ease;
      }

      /*
       * One marker that slides, rather than a mark re-drawn under a different
       * cell each step. Sliding is what makes the walk legible as movement.
       */
      .marker {
        position: absolute;
        left: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        transition:
          transform 0.28s cubic-bezier(0.4, 0, 0.2, 1),
          width 0.28s ease,
          opacity 0.18s ease;
      }

      .marker .arrow {
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 6px solid var(--cf-accent);
      }

      .marker .tag {
        margin-top: 0.125rem;
        padding: 0 0.3125rem;
        border-radius: var(--cf-r-sm);
        background: var(--cf-accent);
        color: var(--cf-bg);
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        white-space: nowrap;
      }

      /* --- Objects ---------------------------------------------------------- */
      .rows {
        display: flex;
        flex-direction: column;
        gap: 0.1875rem;
      }

      .row {
        display: flex;
        gap: 0.625rem;
        padding: 0.3125rem 0.5rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      .row .k {
        color: var(--cf-text-muted);
      }

      .row .v {
        margin-left: auto;
        color: var(--cf-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* --- Scalars ---------------------------------------------------------- */
      .scalar {
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

      .scalar .k {
        color: var(--cf-text-muted);
      }

      .scalar .v {
        margin-left: auto;
        color: var(--cf-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .scalar.changed,
      .row.changed {
        animation: flash 0.6s ease;
      }

      .empty {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--cf-text-faint);
      }

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

      @keyframes cell-flash {
        0% {
          background: color-mix(in srgb, var(--cf-accent) 45%, transparent);
        }
        100% {
          background: var(--cf-surface-2);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .cell,
        .marker {
          transition: none;
        }
        .cell.changed,
        .scalar.changed,
        .row.changed {
          animation: none;
        }
      }
    `,
  ];

  updated() {
    this.placeMarkers();
  }

  /**
   * Sit each marker under its active cell, and keep that cell in view.
   *
   * Done after render against real geometry: the marker matches the cell's
   * measured width and offset, so it stays aligned whatever the values are.
   */
  private placeMarkers() {
    for (const track of this.renderRoot.querySelectorAll(".track")) {
      const marker = track.querySelector<HTMLElement>(".marker");
      if (!marker) continue;

      const index = marker.dataset.index;
      const cell =
        index === undefined
          ? null
          : track.querySelector<HTMLElement>(`.cell[data-index="${index}"]`);

      if (!cell) {
        marker.style.opacity = "0";
        continue;
      }

      marker.style.opacity = "1";
      marker.style.width = `${cell.offsetWidth}px`;
      marker.style.transform = `translateX(${cell.offsetLeft}px)`;

      // Long collections scroll; the cell being read should not sit off-screen.
      const left = cell.offsetLeft;
      const right = left + cell.offsetWidth;
      if (left < track.scrollLeft || right > track.scrollLeft + track.clientWidth) {
        track.scrollTo({
          left: left - track.clientWidth / 2 + cell.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }

  /**
   * A character with no glyph of its own, shown so the cell is not blank.
   *
   * Walking `"a b"` the middle cell is a space; drawn empty it reads as a
   * rendering bug rather than as the character the program is looking at.
   */
  private visible(ch: string): { text: string; ghost: boolean } {
    const named: Record<string, string> = {
      " ": "\u2423",
      "\n": "\u21b5",
      "\t": "\u21e5",
      "\r": "\u240d",
      "\0": "\u2400",
    };
    if (ch in named) return { text: named[ch], ghost: true };
    return { text: ch, ghost: false };
  }

  private renderCollection(
    v: TraceVar,
    items: string[],
    kindLabel: string,
    asChars = false,
  ) {
    // Resolved once for the whole step, so exactly one row carries a pointer.
    const target = pointerTarget(this.vars, this.iteration);
    const at = target?.name === v.name ? target.index : null;

    return html`
      <div class="entry">
        <div class="name">
          <span>${v.name}</span>
          <span class="kind">${kindLabel} · ${items.length}</span>
        </div>
        <div class="track">
          <div class="cells">
            ${repeat(
              items,
              (item, i) => `${i}:${item}`,
              (item, i) => html`
                <div
                  class=${classMap({
                    cell: true,
                    now: at === i,
                    done: at !== null && i < at,
                    changed: !!v.changed,
                  })}
                  data-index=${i}
                >
                  ${
                    asChars
                      ? (() => {
                          const shown = this.visible(item);
                          return html`<span class=${shown.ghost ? "ghost" : ""}
                            >${shown.text}</span
                          >`;
                        })()
                      : html`<span>${item}</span>`
                  }
                  <span class="idx">${i}</span>
                </div>
              `,
            )}
          </div>
          ${
            at === null
              ? nothing
              : html`<div class="marker" data-index=${at}>
                  <span class="arrow"></span>
                  <span class="tag">reading ${at}</span>
                </div>`
          }
        </div>
      </div>
    `;
  }

  private renderObject(
    v: TraceVar,
    entries: Array<{ key: string; value: string }>,
  ) {
    return html`
      <div class="entry">
        <div class="name">
          <span>${v.name}</span>
          <span class="kind">object · ${entries.length}</span>
        </div>
        <div class="rows">
          ${entries.map(
            (e) => html`
              <div class=${classMap({ row: true, changed: !!v.changed })}>
                <span class="k">${e.key}</span>
                <span class="v" title=${e.value}>${e.value}</span>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    if (this.vars.length === 0) {
      return html`<p class="empty">Nothing in scope yet.</p>`;
    }

    return html`
      ${repeat(
        this.vars,
        // Keyed by value as well as name: a new key is what replays the flash.
        (v) => `${v.name}=${v.value}`,
        (v) => {
          const shape = parseValue(v.value);
          if (shape.kind === "array")
            return this.renderCollection(v, shape.items, "list");
          if (shape.kind === "string")
            return this.renderCollection(v, shape.chars, "string", true);
          if (shape.kind === "object") return this.renderObject(v, shape.entries);
          return html`
            <div class=${classMap({ scalar: true, changed: !!v.changed })}>
              <span class="k">${v.name}</span>
              <span class="v" title=${v.value}>${v.value}</span>
            </div>
          `;
        },
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-data-view": CfDataView;
  }
}
