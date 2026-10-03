import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout, typography } from "../styles/shared";
import "./cf-button";
import "./cf-trace-player";
import "./cf-reveal";

const LANGUAGES = ["JavaScript", "TypeScript", "Python"];

/**
 * Product-first hero: a short claim, one sentence of explanation, two calls to
 * action, and then the running product immediately beneath the fold line.
 */
@customElement("cf-hero")
export class CfHero extends LitElement {
  static styles = [
    reset,
    layout,
    typography,
    css`
      .hero {
        position: relative;
        /* Contain the negative-z decoration inside the hero's own layer. */
        isolation: isolate;
        padding-top: clamp(3.5rem, 8vw, 6rem);
        padding-bottom: var(--cf-section-y);
        text-align: center;
      }

      /* Faint vertical rails behind the hero, echoing an editor gutter. */
      .rails {
        position: absolute;
        inset: 0;
        z-index: -1;
        pointer-events: none;
        background-image: linear-gradient(
          90deg,
          var(--cf-line) 1px,
          transparent 1px
        );
        background-size: 5rem 100%;
        mask-image: radial-gradient(70% 55% at 50% 30%, black, transparent 75%);
        -webkit-mask-image: radial-gradient(
          70% 55% at 50% 30%,
          black,
          transparent 75%
        );
        opacity: 0.55;
      }

      /* --- Badge -------------------------------------------------------- */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3125rem 0.75rem 0.3125rem 0.5rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-full);
        background: var(--cf-surface-2);
        font-size: 0.75rem;
        color: var(--cf-text-dim);
      }

      .badge em {
        font-style: normal;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.04em;
        padding: 0.0625rem 0.375rem;
        border-radius: var(--cf-r-full);
        background: var(--cf-accent-soft);
        color: var(--cf-accent-hot);
      }

      /* --- Headline ----------------------------------------------------- */
      h1 {
        margin: 1.75rem 0 0;
        font-size: clamp(2.6rem, 7.4vw, 5rem);
        line-height: 1.02;
        letter-spacing: -0.042em;
        font-weight: 600;
        text-wrap: balance;
      }

      h1 .dim {
        display: block;
        background: linear-gradient(
          180deg,
          var(--cf-text) 20%,
          var(--cf-text-muted)
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      /* The second line is the payoff, so it carries the accent. */
      h1 .lit {
        display: block;
        background: linear-gradient(
          100deg,
          var(--cf-accent-hot),
          var(--cf-accent) 45%,
          var(--cf-accent-deep)
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      p.sub {
        margin: 1.5rem auto 0;
        max-width: 48ch;
        font-size: clamp(1.0625rem, 1.9vw, 1.1875rem);
        line-height: 1.6;
        color: var(--cf-text-dim);
        text-wrap: pretty;
      }

      .cta {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.75rem;
        margin-top: 2.25rem;
      }

      /* --- Language strip ---------------------------------------------- */
      .langs {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.5rem 1.25rem;
        margin-top: 2rem;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--cf-text-faint);
      }

      .langs span {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
      }

      .langs span::before {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--cf-text-faint);
      }

      .langs .soon::before {
        background: transparent;
        border: 1px solid var(--cf-text-faint);
      }

      /* --- Player ------------------------------------------------------- */
      .player {
        margin-top: clamp(3rem, 6vw, 4.5rem);
        text-align: left;
      }

      /* A pool of accent light under the frame, so it appears to sit on the
         page rather than float in front of it. */
      .player-wrap {
        position: relative;
        isolation: isolate;
      }

      .player-wrap::after {
        content: "";
        position: absolute;
        left: 12%;
        right: 12%;
        bottom: -2.5rem;
        height: 5rem;
        z-index: -1;
        background: radial-gradient(
          50% 50% at 50% 50%,
          var(--cf-accent-glow),
          transparent 70%
        );
        filter: blur(28px);
        opacity: 0.5;
        pointer-events: none;
      }

      .hint {
        margin: 1.125rem 0 0;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }

      .hint kbd {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        padding: 0.0625rem 0.375rem;
        border: 1px solid var(--cf-line-strong);
        border-bottom-width: 2px;
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
      }
    `,
  ];

  render() {
    return html`
      <div class="hero">
        <div class="rails" aria-hidden="true"></div>

        <div class="container">
          <cf-reveal>
            <span class="badge"
              ><em>v0.2</em> Now playing back a whole run, full screen</span
            >
          </cf-reveal>

          <cf-reveal .delay=${1}>
            <h1>
              <span class="dim">See your code.</span>
              <span class="lit">Come to life.</span>
            </h1>
          </cf-reveal>

          <cf-reveal .delay=${2}>
            <p class="sub">
              CodeFlow runs your program one step at a time and shows you
              exactly what happens — every line, every variable, every call — so
              you stop guessing and start understanding.
            </p>
          </cf-reveal>

          <cf-reveal .delay=${3}>
            <div class="cta">
              <cf-button href="/signup" size="lg">
                Start Coding
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path
                    d="M6.2 3.3a.9.9 0 0 1 1.3 0l4 4.1a.9.9 0 0 1 0 1.2l-4 4.1a.9.9 0 1 1-1.3-1.2L9.5 8 6.2 4.5a.9.9 0 0 1 0-1.2Z"
                  />
                </svg>
              </cf-button>
              <cf-button href="#how-it-works" variant="secondary" size="lg">
                Explore
              </cf-button>
            </div>
          </cf-reveal>

          <cf-reveal .delay=${4}>
            <div class="langs">
              ${LANGUAGES.map((l) => html`<span>${l}</span>`)}
              <span class="soon">More soon</span>
            </div>
          </cf-reveal>

          <cf-reveal .delay=${5}>
            <div class="player">
              <div class="player-wrap">
                <cf-trace-player></cf-trace-player>
              </div>
              <p class="hint">
                A live trace — scrub it with the timeline, or step through with
                <kbd>◀</kbd> <kbd>▶</kbd>
              </p>
            </div>
          </cf-reveal>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-hero": CfHero;
  }
}
