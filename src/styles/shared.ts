import { css } from "lit";

/**
 * The document-level reset in global.css stops at the shadow boundary, so
 * every component has to re-declare it. Without this, `width: 100%` plus
 * horizontal padding overflows its parent — which is exactly what the
 * container element does.
 *
 * Include this first in every component's `static styles`.
 */
export const reset = css`
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
`;

/**
 * Layout primitives shared by every section component: the centred container
 * and the vertical section rhythm.
 */
export const layout = css`
  :host {
    display: block;
  }

  .container {
    width: 100%;
    max-width: var(--cf-container);
    margin-inline: auto;
    padding-inline: var(--cf-gutter);
  }

  .section {
    padding-block: var(--cf-section-y);
  }
`;

/**
 * Type scale. Headings are tightened and slightly negative-tracked at large
 * sizes so display text reads as one shape rather than spaced-out letters.
 */
export const typography = css`
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 1.25rem;
    font-family: var(--cf-font-mono);
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--cf-accent);
  }

  .eyebrow::before {
    content: "";
    width: 1.5rem;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--cf-accent));
  }

  h2.title {
    margin: 0;
    font-size: clamp(2rem, 4.4vw, 3.15rem);
    line-height: 1.08;
    letter-spacing: -0.03em;
    font-weight: 600;
    color: var(--cf-text);
    text-wrap: balance;
  }

  h3 {
    margin: 0;
    font-size: 1.0625rem;
    line-height: 1.35;
    letter-spacing: -0.012em;
    font-weight: 600;
    color: var(--cf-text);
  }

  p.lede {
    margin: 1.25rem 0 0;
    max-width: 46ch;
    font-size: clamp(1rem, 1.5vw, 1.1rem);
    line-height: 1.65;
    color: var(--cf-text-dim);
    text-wrap: pretty;
  }

  p.body {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.68;
    color: var(--cf-text-dim);
    text-wrap: pretty;
  }

  .mono {
    font-family: var(--cf-font-mono);
    font-variant-ligatures: none;
  }
`;

/**
 * The hairline card surface used by feature tiles, the editor chrome and the
 * CTA panel. A single top highlight sells the "lit from above" depth without
 * resorting to heavy shadows.
 */
export const surface = css`
  .card {
    position: relative;
    border: 1px solid var(--cf-line);
    border-radius: var(--cf-r-lg);
    background: linear-gradient(
      180deg,
      var(--cf-surface-2) 0%,
      var(--cf-surface) 100%
    );
    overflow: hidden;
  }

  .card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--cf-line-bright) 45%,
      transparent
    );
    pointer-events: none;
  }
`;

/** Visually hidden but available to assistive tech. */
export const srOnly = css`
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
`;
