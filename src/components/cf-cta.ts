import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout, typography } from "../styles/shared";
import "./cf-button";
import "./cf-reveal";

/**
 * Closing call to action. Framed as a terminal prompt so the last thing on the
 * page still looks like a tool rather than a billboard.
 */
@customElement("cf-cta")
export class CfCta extends LitElement {
  static styles = [
    reset,
    layout,
    typography,
    css`
      .panel {
        position: relative;
        overflow: hidden;
        padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4rem);
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-xl);
        background:
          radial-gradient(
            90% 130% at 50% 0%,
            var(--cf-accent-soft),
            transparent 62%
          ),
          linear-gradient(180deg, var(--cf-surface-2), var(--cf-bg-raised));
        text-align: center;
      }

      .panel::before {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent,
          var(--cf-accent-line) 50%,
          transparent
        );
      }

      /* Faint grid, masked to fade out before it reaches the copy. */
      .panel::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(var(--cf-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--cf-line) 1px, transparent 1px);
        background-size: 3rem 3rem;
        mask-image: radial-gradient(70% 100% at 50% 0%, black, transparent 70%);
        -webkit-mask-image: radial-gradient(
          70% 100% at 50% 0%,
          black,
          transparent 70%
        );
        opacity: 0.6;
      }

      .inner {
        position: relative;
        z-index: 1;
      }

      .prompt {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        padding: 0.375rem 0.875rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-full);
        background: var(--cf-inset-strong);
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-dim);
      }

      .prompt em {
        font-style: normal;
        color: var(--cf-accent);
      }

      .prompt i {
        display: inline-block;
        width: 1px;
        height: 1em;
        background: var(--cf-accent);
        animation: blink 1.1s steps(1) infinite;
      }

      @keyframes blink {
        50% {
          opacity: 0;
        }
      }

      h2.title {
        max-width: 24ch;
        margin-inline: auto;
      }

      p.lede {
        margin-inline: auto;
        max-width: 48ch;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.75rem;
        margin-top: 2.25rem;
      }

      .fine {
        margin: 1.5rem 0 0;
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }
    `,
  ];

  render() {
    return html`
      <section class="section">
        <div class="container">
          <cf-reveal>
            <div class="panel">
              <div class="inner">
                <span class="prompt"
                  ><em>$</em> codeflow run main.js<i></i
                ></span>
                <h2 class="title">Stop reading your code. Watch it.</h2>
                <p class="lede">
                  Open the editor, paste something you do not fully understand
                  yet, and press run. It takes about ten seconds.
                </p>
                <div class="actions">
                  <cf-button href="/signup" size="lg">Start Coding</cf-button>
                </div>
                <p class="fine">Free while in beta · No account required</p>
              </div>
            </div>
          </cf-reveal>
        </div>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-cta": CfCta;
  }
}
