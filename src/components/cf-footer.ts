import { LitElement, css, html } from "lit";
import { customElement } from "lit/decorators.js";
import { reset, layout } from "../styles/shared";
import "./cf-logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "#product" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Features", href: "#features" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Language support", href: "#" },
      { label: "Status", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
];

@customElement("cf-footer")
export class CfFooter extends LitElement {
  static styles = [
    reset,
    layout,
    css`
      footer {
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .top {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr));
        gap: 2.5rem;
        padding-block: clamp(3rem, 6vw, 4.5rem) 2.5rem;
      }

      @media (max-width: 820px) {
        .top {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 2rem;
        }

        .brand {
          grid-column: 1 / -1;
        }
      }

      .brand p {
        margin: 1rem 0 0;
        max-width: 30ch;
        font-size: 0.875rem;
        line-height: 1.6;
        color: var(--cf-text-muted);
      }

      h4 {
        margin: 0 0 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--cf-text-dim);
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }

      a {
        font-size: 0.875rem;
        color: var(--cf-text-muted);
        text-decoration: none;
        transition: color var(--cf-dur) var(--cf-ease);
      }

      a:hover {
        color: var(--cf-text);
      }

      .bottom {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1.5rem;
        padding-block: 1.5rem;
        border-top: 1px solid var(--cf-line);
        font-size: 0.8125rem;
        color: var(--cf-text-faint);
      }

      .bottom .built {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
      }

      .bottom .built span {
        color: var(--cf-text-muted);
      }

      @media (max-width: 560px) {
        .bottom .built {
          margin-left: 0;
        }
      }
    `,
  ];

  render() {
    return html`
      <footer>
        <div class="container">
          <div class="top">
            <div class="brand">
              <cf-logo></cf-logo>
              <p>
                A visual runtime for people who would rather see a program run
                than imagine it.
              </p>
            </div>

            ${COLUMNS.map(
              (col) => html`
                <nav aria-label=${col.title}>
                  <h4>${col.title}</h4>
                  <ul>
                    ${col.links.map(
                      (l) => html`<li><a href=${l.href}>${l.label}</a></li>`,
                    )}
                  </ul>
                </nav>
              `,
            )}
          </div>

          <div class="bottom">
            <span>© ${new Date().getFullYear()} CodeFlow</span>
            <span class="built">
              <span>Built with</span> Lit · TypeScript · Vite
            </span>
          </div>
        </div>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-footer": CfFooter;
  }
}
