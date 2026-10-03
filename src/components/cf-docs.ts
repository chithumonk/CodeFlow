import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { reset, layout } from "../styles/shared";
import { getSession, onAuthChange } from "../lib/auth";
import { RUN_LIST, TRACED_LIST } from "../execution/languages";
import type { Session } from "@supabase/supabase-js";
import "./cf-logo";
import "./cf-button";
import "./cf-theme-toggle";

/**
 * The documentation page.
 *
 * Written against what the product actually does today, limits included.
 * Documentation that describes intentions rather than behaviour is worse
 * than none, because it costs the reader trust as well as time.
 */

interface Section {
  id: string;
  title: string;
}

/**
 * How each traced language gets its trace. Keyed by language id so adding a
 * language to the registry without explaining it here degrades to the generic
 * description rather than silently claiming the wrong mechanism.
 */
const TRACE_METHOD: Record<string, string> = {
  javascript: "AST instrumentation in a Web Worker",
  typescript: "Types stripped, then instrumented as JavaScript",
  python: "Pyodide, hooked with sys.settrace",
  ruby: "ruby.wasm, hooked with TracePoint",
  java: "Source instrumented, then compiled and run remotely",
  c: "Source instrumented, then compiled and run remotely",
  cpp: "Source instrumented, then compiled and run remotely",
};

const SECTIONS: Section[] = [
  { id: "what", title: "What CodeFlow is" },
  { id: "watch", title: "Watch it work" },
  { id: "start", title: "Getting started" },
  { id: "projects", title: "Projects and files" },
  { id: "running", title: "Running your code" },
  { id: "engines", title: "What runs your code" },
  { id: "reading", title: "Reading a run" },
  { id: "summary", title: "What the run solved" },
  { id: "fullview", title: "Full view" },
  { id: "languages", title: "Languages" },
  { id: "supported", title: "What's traced" },
  { id: "limits", title: "Limits and safeguards" },
  { id: "trouble", title: "Troubleshooting" },
  { id: "roadmap", title: "Not built yet" },
];

@customElement("cf-docs")
export class CfDocs extends LitElement {
  @state() private session: Session | null | undefined = undefined;
  @state() private activeId = SECTIONS[0]?.id ?? "";
  /** Mirrors <html data-theme>, so screenshots match the page around them. */
  @state() private theme: "dark" | "light" = "dark";
  private themeWatch?: MutationObserver;

  private stopWatch?: () => void;
  private scrollFrame?: number;
  /** Autoplay is motion nobody asked for if the reader has opted out of it. */
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  static styles = [
    reset,
    layout,
    css`
      :host {
        display: block;
        min-height: 100vh;
        min-height: 100dvh;
      }

      /* --- Header ---------------------------------------------------------- */
      header.top {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 1rem;
        height: 3.75rem;
        padding-inline: var(--cf-gutter);
        border-bottom: 1px solid var(--cf-line);
        background: color-mix(in srgb, var(--cf-bg) 88%, transparent);
        backdrop-filter: blur(12px);
      }

      .brand {
        display: inline-flex;
        text-decoration: none;
      }

      .tag {
        padding: 0.125rem 0.4375rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-full);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
      }

      .top .spacer {
        flex: 1 1 auto;
      }

      .top .actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      /* --- Layout ----------------------------------------------------------- */
      .shell {
        display: grid;
        grid-template-columns: 15rem minmax(0, 1fr);
        gap: 3rem;
        max-width: var(--cf-container);
        margin-inline: auto;
        padding: clamp(2rem, 5vw, 3.25rem) var(--cf-gutter)
          clamp(4rem, 8vw, 6rem);
      }

      nav.toc {
        position: sticky;
        top: 5.5rem;
        align-self: start;
        max-height: calc(100vh - 8rem);
        overflow-y: auto;
      }

      nav.toc p {
        margin: 0 0 0.75rem 0.625rem;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      nav.toc a {
        display: block;
        padding: 0.375rem 0.625rem;
        border-left: 2px solid var(--cf-line);
        font-size: 0.875rem;
        color: var(--cf-text-muted);
        text-decoration: none;
      }

      nav.toc a:hover {
        color: var(--cf-text);
      }

      nav.toc a[aria-current="true"] {
        border-left-color: var(--cf-accent);
        color: var(--cf-text);
        background: var(--cf-accent-soft);
      }

      /* --- Content ----------------------------------------------------------- */
      article {
        min-width: 0;
        max-width: 46rem;
      }

      h1 {
        margin: 0 0 0.5rem;
        font-size: clamp(2rem, 4vw, 2.5rem);
        line-height: 1.1;
        letter-spacing: -0.032em;
        font-weight: 600;
        color: var(--cf-text);
      }

      .lede {
        margin: 0 0 3rem;
        font-size: 1.0625rem;
        line-height: 1.65;
        color: var(--cf-text-dim);
      }

      section {
        scroll-margin-top: 6rem;
        margin-bottom: 3.25rem;
      }

      h2 {
        margin: 0 0 1rem;
        padding-top: 0.5rem;
        font-size: 1.375rem;
        line-height: 1.25;
        letter-spacing: -0.022em;
        font-weight: 600;
        color: var(--cf-text);
      }

      h3 {
        margin: 1.75rem 0 0.625rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--cf-text);
      }

      p,
      li {
        font-size: 0.9375rem;
        line-height: 1.7;
        color: var(--cf-text-dim);
      }

      p {
        margin: 0 0 1rem;
      }

      ul,
      ol {
        margin: 0 0 1rem;
        padding-left: 1.25rem;
      }

      li {
        margin-bottom: 0.4375rem;
      }

      strong {
        color: var(--cf-text);
        font-weight: 600;
      }

      code {
        font-family: var(--cf-font-mono);
        font-size: 0.8125rem;
        padding: 0.0625rem 0.3125rem;
        border-radius: var(--cf-r-sm);
        background: var(--cf-inset-strong);
        color: var(--cf-text);
      }

      /* A key to press, rather than code to read: same family, with an edge. */
      kbd {
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        padding: 0.0625rem 0.375rem;
        border: 1px solid var(--cf-line-bright);
        border-bottom-width: 2px;
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text);
        white-space: nowrap;
      }

      pre {
        margin: 0 0 1rem;
        padding: 0.875rem 1rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-md);
        background: var(--cf-inset-strong);
        overflow-x: auto;
      }

      pre code {
        padding: 0;
        background: none;
        color: var(--cf-text-dim);
        line-height: 1.7;
      }

      /* --- Tables -------------------------------------------------------------- */
      /* --- Screenshots and video ------------------------------------------ */
      .shot {
        margin: 1.25rem 0;
      }

      .shot img,
      .shot video {
        display: block;
        width: 100%;
        height: auto;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-md);
        background: var(--cf-inset);
      }

      /* Cropped panels are tall and narrow; full width would blow them up. */
      .shot img[width="512"],
      .shot img[width="420"] {
        max-width: 17rem;
        margin-inline: auto;
      }

      .shot figcaption {
        margin-top: 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--cf-text-muted);
      }

      .steps {
        margin: 1rem 0;
        padding-left: 1.25rem;
        display: grid;
        gap: 0.5rem;
      }

      .steps li {
        padding-left: 0.25rem;
        line-height: 1.6;
      }

      table {
        width: 100%;
        margin: 0 0 1rem;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      th,
      td {
        padding: 0.5rem 0.75rem;
        text-align: left;
        border-bottom: 1px solid var(--cf-line);
        vertical-align: top;
      }

      th {
        font-weight: 600;
        color: var(--cf-text);
        font-size: 0.8125rem;
      }

      td {
        color: var(--cf-text-dim);
      }

      td code {
        white-space: nowrap;
      }

      /* --- Callouts -------------------------------------------------------------- */
      .note {
        display: flex;
        gap: 0.75rem;
        margin: 0 0 1.25rem;
        padding: 0.875rem 1rem;
        border: 1px solid var(--cf-line-strong);
        border-left-width: 3px;
        border-radius: var(--cf-r-md);
        background: var(--cf-inset);
      }

      .note p:last-child {
        margin-bottom: 0;
      }

      .note.warn {
        border-color: var(--cf-accent-line);
        border-left-color: var(--cf-accent);
        background: var(--cf-accent-soft);
      }

      .note strong {
        color: var(--cf-text);
      }

      /* Two calls to action plus the logo do not fit a phone header. The
         primary one survives; signing in is one tap further on. */
      @media (max-width: 560px) {
        .top .actions cf-button[variant="secondary"],
        .tag {
          display: none;
        }
      }

      @media (max-width: 900px) {
        .shell {
          grid-template-columns: minmax(0, 1fr);
          gap: 2rem;
        }
        nav.toc {
          position: static;
          max-height: none;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--cf-line);
        }
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    getSession().then((s) => {
      if (this.session === undefined) this.session = s;
    });
    this.stopWatch = onAuthChange((s) => (this.session = s));

    // Screenshots exist in both themes. The theme lives on <html>, which a
    // shadow root cannot select against, so it is mirrored into state here.
    const read = () =>
      (this.theme =
        document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark");
    read();
    this.themeWatch = new MutationObserver(read);
    this.themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  /**
   * A screenshot of the real application, captured by scripts/capture-docs-media.
   *
   * Width and height are set so the page does not reflow as images load, and
   * everything below the first screen is lazy — the media here is heavier than
   * the text.
   */
  private shot(
    name: string,
    alt: string,
    caption: string,
    width: number,
    height: number,
  ) {
    return html`
      <figure class="shot">
        <img
          src=${`/docs/${name}-${this.theme}.png`}
          alt=${alt}
          width=${width}
          height=${height}
          loading="lazy"
          decoding="async"
        />
        <figcaption>${caption}</figcaption>
      </figure>
    `;
  }

  firstUpdated() {
    // Highlight the section currently in view rather than the last one
    // clicked, so the contents stay truthful when scrolling by hand.
    //
    // Computed from positions rather than with an IntersectionObserver: an
    // observer only fires when a section crosses its band, and the last
    // section on the page is too short to ever reach it. That left the
    // contents pointing at the wrong entry — sometimes the first one — for
    // the whole bottom of the page.
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
    this.syncActive();
  }

  private onScroll = () => {
    if (this.scrollFrame !== undefined) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = undefined;
      this.syncActive();
    });
  };

  private syncActive() {
    const sections = [
      ...this.renderRoot.querySelectorAll<HTMLElement>("section[id]"),
    ];
    if (sections.length === 0) return;

    // The heading nearest above a line a quarter down the viewport is the one
    // being read.
    const line = window.innerHeight * 0.25;
    let active = sections[0]!.id;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) active = section.id;
    }

    // The last section may be shorter than the gap below that line, so it
    // could never win on its own. At the end of the page it always does.
    const scrolled = window.scrollY + window.innerHeight;
    if (scrolled >= document.documentElement.scrollHeight - 4) {
      active = sections[sections.length - 1]!.id;
    }

    if (active !== this.activeId) this.activeId = active;
  }

  disconnectedCallback() {
    this.stopWatch?.();
    this.themeWatch?.disconnect();
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
    if (this.scrollFrame !== undefined) cancelAnimationFrame(this.scrollFrame);
    super.disconnectedCallback();
  }

  /**
   * Scroll to a section.
   *
   * The headings live inside this shadow root, and native `#id` navigation
   * only searches the document tree — so clicking a contents link would
   * otherwise change the URL and do nothing.
   */
  private goTo(event: Event, id: string) {
    event.preventDefault();

    const target = this.renderRoot.querySelector(`#${id}`);
    if (!target) return;

    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    this.activeId = id;
    history.replaceState(null, "", `#${id}`);
  }

  render() {
    return html`
      <header class="top">
        <a class="brand" href="/" aria-label="CodeFlow home">
          <cf-logo></cf-logo>
        </a>
        <span class="tag">docs</span>
        <span class="spacer"></span>
        <div class="actions">
          <cf-theme-toggle></cf-theme-toggle>
          ${
            this.session
              ? html`<cf-button href="/dashboard">Dashboard</cf-button>`
              : html`<cf-button href="/login" variant="secondary">
                    Sign in
                  </cf-button>
                  <cf-button href="/signup">Start coding</cf-button>`
          }
        </div>
      </header>

      <div class="shell">
        <nav class="toc" aria-label="Contents">
          <p>On this page</p>
          ${SECTIONS.map(
            (s) => html`
              <a
                href=${`#${s.id}`}
                aria-current=${this.activeId === s.id ? "true" : "false"}
                @click=${(e: Event) => this.goTo(e, s.id)}
                >${s.title}</a
              >
            `,
          )}
        </nav>

        <article>
          <h1>CodeFlow documentation</h1>
          <p class="lede">
            CodeFlow runs your JavaScript and records every step it takes, so
            you can move through the run and see exactly what happened — which
            line ran, what each variable held, and how the call stack grew.
          </p>

          ${this.what()} ${this.watch()} ${this.start()} ${this.projects()}
          ${this.running()} ${this.engines()} ${this.languages()}
          ${this.reading()} ${this.summary()} ${this.fullview()}
          ${this.supported()} ${this.limits()}
          ${this.trouble()} ${this.roadmap()}
        </article>
      </div>
    `;
  }

  /* --- Sections ------------------------------------------------------------- */

  private what() {
    return html`
      <section id="what">
        <h2>What CodeFlow is</h2>
        <p>
          A debugger you do not have to drive. Instead of placing breakpoints
          and stepping manually, you press <strong>Run</strong> once and get the
          whole execution as a recording you can scrub backwards and forwards.
        </p>
        <p>Three things follow from that:</p>
        <ul>
          <li>
            <strong>You can go backwards.</strong> The run is recorded, so
            stepping back shows a genuine earlier state, not a re-run.
          </li>
          <li>
            <strong>Nothing needs instrumenting by hand.</strong> No
            <code>console.log</code> to add and later delete.
          </li>
          <li>
            <strong>The whole run is readable at once</strong> in the
            transcript, rather than one step at a time.
          </li>
        </ul>
        <div class="note">
          <p>
            Your code runs <strong>in your own browser</strong>, in a Web
            Worker. It is never uploaded to a server to be executed.
          </p>
        </div>
      </section>
    `;
  }

  private start() {
    return html`
      <section id="start">
        <h2>Getting started</h2>
        <ol>
          <li>
            <strong>Create an account</strong> at <code>/signup</code> with a
            display name, email and a password of at least
            <strong>8 characters</strong>. Your display name is how you are
            shown in the app; it does not have to be unique. Your email is the
            account identifier.
          </li>
          <li>
            <strong>Confirm your email</strong> if your instance has
            confirmation enabled — you will see a "Check your email" screen and
            the link brings you back signed in. If confirmation is off, sign-up
            takes you straight to the dashboard.
          </li>
          <li>
            <strong>Create a project</strong> from the dashboard. It starts with
            a <code>main.js</code> containing a small sample.
          </li>
          <li><strong>Press Run</strong> and read the transcript.</li>
        </ol>

        <h3>Signing back in</h3>
        <p>
          Sessions persist across reloads. If you forget your password, use
          <strong>Forgot password?</strong> on the sign-in page — the emailed
          link takes you to a page where you set a new one. Reset links are
          single-use and expire.
        </p>
      </section>
    `;
  }

  private projects() {
    return html`
      <section id="projects">
        <h2>Projects and files</h2>
        <p>
          A project is a named collection of files belonging to you. Nobody else
          can read, edit or delete it — ownership is enforced by the database
          itself, not only by the application.
        </p>

        <h3>On the dashboard</h3>
        <ul>
          <li><strong>New project</strong> creates one and opens it.</li>
          <li><strong>Search</strong> filters by name as you type.</li>
          <li><strong>Sort</strong> by last updated, newest, or name.</li>
          <li>
            <strong>Rename</strong> and <strong>Delete</strong> are on each
            card. Deleting asks first and cannot be undone.
          </li>
        </ul>

        <h3>Files</h3>
        <p>
          Each project can hold several files, and they do not have to be in the
          same language. Add one with <strong>+</strong> in the Files panel;
          rename or delete with the icons that appear on hover. A project always
          keeps at least one file.
        </p>
        <p>
          On a narrow screen the Files panel is hidden, so
          <strong>+</strong> appears at the end of the file tabs instead.
          Renaming and deleting still need a wider window.
        </p>
        <p>
          The <strong>extension decides the language</strong> — name a file
          <code>main.py</code> and it runs as Python,
          <code>Main.java</code> and it runs as Java. See
          <a href="#languages">Languages</a> for the full list of recognised
          extensions.
        </p>
        <p>
          A name must start with a letter or number and contain only letters,
          numbers, dots, dashes and underscores, ending in a known extension. No
          slashes — there are no folders yet.
        </p>

        <div class="note warn">
          <p>
            <strong>Files do not import each other.</strong> Each one runs on
            its own, and <code>import</code> or <code>require</code> between
            them will not resolve.
            <strong>Run traces whichever tab is open.</strong> The bottom pane
            shows which file a trace came from.
          </p>
        </div>

        <h3>Saving</h3>
        <p>
          Edits save automatically about
          <strong>1.2 seconds</strong> after you stop typing. The indicator in
          the header reads <em>Unsaved changes</em> → <em>Saving…</em> →
          <em>Saved</em>, and unsaved files show a dot on their tab. Pressing
          Run saves everything first, so what executes always matches what is
          stored.
        </p>
      </section>
    `;
  }

  private running() {
    return html`
      <section id="running">
        <h2>Running your code</h2>
        <p>
          <strong>Run</strong> executes the file in the active tab and plays the
          recording back at roughly one step every <strong>0.7 seconds</strong>.
          You do not have to watch it play — scrub or step at your own pace.
        </p>

        ${this.shot(
          "controls",
          "The playback controls: Run, Stop, Restart, step back, step forward, the timeline and the status badge",
          "The controls, left to right: Run, Stop, Restart, step back, step forward, the timeline, the step counter and the status.",
          1440,
          96,
        )}

        <table>
          <thead>
            <tr>
              <th>Control</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Run</strong></td>
              <td>Saves, executes the active file, starts playback.</td>
            </tr>
            <tr>
              <td><strong>Pause</strong> / <strong>Resume</strong></td>
              <td>Stops and restarts playback. The recording is kept.</td>
            </tr>
            <tr>
              <td><strong>Stop</strong></td>
              <td>Ends playback and clears the current position.</td>
            </tr>
            <tr>
              <td><strong>Restart</strong></td>
              <td>
                Replays from step one <em>without re-running</em> your code.
              </td>
            </tr>
            <tr>
              <td><strong>Step back</strong> / <strong>forward</strong></td>
              <td>Move one step at a time. Stepping pauses playback.</td>
            </tr>
            <tr>
              <td><strong>Timeline</strong></td>
              <td>Drag to jump anywhere in the run.</td>
            </tr>
          </tbody>
        </table>

        <h3>Status</h3>
        <p>
          The badge next to the timeline reads <code>idle</code>,
          <code>running</code>, <code>paused</code>, <code>completed</code> or
          <code>error</code>. <code>error</code> means your program threw or hit
          a safeguard — the message appears in a banner and in the console.
        </p>
      </section>
    `;
  }

  private reading() {
    return html`
      <section id="reading">
        <h2>Reading a run</h2>
        <p>
          Every panel shows the state at the step you are on. Move the timeline
          and they all move together.
        </p>
        <p>
          The output panel along the bottom can be resized: drag the edge above
          its tabs, or focus it and use the arrow keys
          (<kbd>Shift</kbd> for larger steps, <kbd>Home</kbd> and
          <kbd>End</kbd> for the limits). Double-click to reset it. The editor
          keeps a minimum height of its own, so the panel cannot cover the code
          it is describing.
        </p>

        ${this.shot(
          "workspace",
          "The CodeFlow workspace mid-run: highlighted line, variables, call stack and console",
          "A C++ program paused inside the fourth nested call. The highlight, the variables and the call stack all describe the same step.",
          1440,
          860,
        )}

        <h3>The editor</h3>
        <p>
          The line being executed is highlighted in amber and scrolled into
          view. If you switch to a different file, the highlight disappears — a
          trace's line numbers only mean something for the file it came from.
        </p>

        <h3>Data</h3>
        <p>
          Everything in scope at this step, with the value that just changed
          flashing. Plain values show as a name and a value; long ones are
          abbreviated.
        </p>
        <p>
          <strong>Lists and strings are drawn as cells</strong>, each labelled
          with its index — a string by character, a list by item. The cells
          already passed are dimmed, the current one is raised, and a marker
          slides along underneath as the walk advances. That is what turns
          <code>[10, 20, 30, 40]</code> from a value into something you can
          watch being read. Objects show as key and value rows.
        </p>

        <div class="note">
          <p>
            <strong>The marker is worked out, not recorded.</strong> A trace
            says a loop is on its third iteration; it does not say which
            variable that counts through. So the position is inferred from the
            loop counter and corroborated against the values in scope, and
            <strong>no marker is shown when nothing supports one</strong> —
            before the loop starts, for instance. Exactly one collection
            carries it: the one being read, never the one being built.
          </p>
        </div>

        <h3>Call stack</h3>
        <p>
          A class method appears as
          <code>ClassName.method</code> and a constructor as
          <code>new ClassName</code>. A function assigned to a variable, or
          defined as an object property, takes that name. Only a genuinely
          nameless function — an inline callback — shows as
          <code>(anonymous)</code>.
        </p>
        <p>
          Which function you are inside and how you got there, innermost first.
          Recursion shows as the same name repeated, which is the clearest way
          to see how deep it went.
        </p>

        ${this.shot(
          "panels",
          "The variables, call stack and execution flow panels",
          "The three panels together. Here factorial has called itself four times, so it appears four times on the stack.",
          512,
          1094,
        )}

        <h3>Execution flow</h3>
        <p>
          A small diagram of the phase you are in — call, init, loop, body,
          return — with the loop iteration count when you are inside one.
        </p>

        <h3>Transcript</h3>
        ${this.shot(
          "transcript",
          "The transcript pane, listing each step with its line and what happened",
          "The transcript. Indentation is call depth, so a recursion reads as a descent and then an unwind.",
          1440,
          300,
        )}
        <p>
          The whole run written out in order, one row per step: step number,
          line number, the source line, and what happened. Rows are
          <strong>indented by call depth</strong>, so nesting and recursion are
          visible as a shape. Click any row to jump to it. Executed steps are
          solid; upcoming ones are dimmed.
        </p>
        <p>
          For a recursive <code>factorial(4)</code>, the transcript reads as the
          descent and then the unwind:
        </p>
        <pre><code>2  13  console.log(factorial(4));      Call factorial · n = 4
5  10    return n * factorial(n - 1);  Call factorial · n = 3
8  10      return n * factorial(n - 1);  Call factorial · n = 2
14  7        return 1;                   factorial returns 1
15 10      return n * factorial(n - 1);  factorial returns 2
17 10  return n * factorial(n - 1);      factorial returns 24</code></pre>

        <h3>Console</h3>
        <p>
          Output from <code>console.log</code>, <code>warn</code>,
          <code>error</code> and <code>info</code>. Output appears as you reach
          the step that produced it, so scrubbing backwards hides it again.
        </p>
      </section>
    `;
  }

  /**
   * Built from the registry rather than written by hand, so the list here
   * cannot fall out of step with the list the product actually uses.
   */
  private watch() {
    return html`
      <section id="watch">
        <h2>Watch it work</h2>
        <p>
          A real recording of a Python program being traced: pressing Run, the
          highlight moving line by line, variables updating beside it, and the
          timeline being scrubbed backwards.
        </p>

        <figure class="shot video">
          <video
            src="/docs/walkthrough.webm"
            poster=${`/docs/workspace-${this.theme}.png`}
            width="1280"
            height="720"
            controls
            muted
            loop
            playsinline
            ?autoplay=${!this.reducedMotion}
            preload="metadata"
            aria-label="A Python program being traced in CodeFlow"
          ></video>
          <figcaption>
            Plays on a loop, with no audio. Use the controls to pause or scrub.
            Nothing depends on being able to play it — everything shown is
            written out below and captured in the screenshots further down.
          </figcaption>
        </figure>

        <h3>The whole thing in four steps</h3>
        <ol class="steps">
          <li>
            <strong>Pick a language</strong> on the dashboard. Each tile makes
            a project that already holds a small working program.
          </li>
          <li>
            <strong>Press Run.</strong> Your code is executed for real — the
            trace is a recording of what actually happened, not a simulation.
          </li>
          <li>
            <strong>Watch, or take control.</strong> Playback steps on its own;
            Pause, the arrows and the timeline let you go at your own speed, in
            either direction.
          </li>
          <li>
            <strong>Read the panels.</strong> Variables, call stack and the
            transcript all describe the step you are on.
          </li>
        </ol>

        ${this.shot(
          "launcher",
          "The dashboard language launcher, with a tile for each traced language",
          "Step 1 — the launcher on your dashboard. The tiles are the languages that can be stepped through.",
          1140,
          230,
        )}
      </section>
    `;
  }

  private engines() {
    return html`
      <section id="engines">
        <h2>What runs your code</h2>
        <p>
          Nothing here simulates your program. Every language is executed by a
          real implementation of that language — the difference is only
          <em>where</em>, and that decides whether your code leaves the machine.
        </p>

        <table>
          <thead>
            <tr>
              <th>Language</th>
              <th>Executed by</th>
              <th>Stepped?</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>JavaScript</strong>, <strong>TypeScript</strong></td>
              <td>Your browser's own engine, in a Web Worker</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td><strong>Python</strong></td>
              <td>CPython as WebAssembly, in your browser (Pyodide)</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td><strong>Ruby</strong></td>
              <td>CRuby as WebAssembly, in your browser (ruby.wasm)</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>
                <strong>Java</strong>, <strong>C</strong>, <strong>C++</strong>
              </td>
              <td>A real JDK or GCC, on a server</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>The other ${RUN_LIST.length}</td>
              <td>That language's own compiler or interpreter, on a server</td>
              <td>No — output only</td>
            </tr>
          </tbody>
        </table>

        <h3>How the stepping is done</h3>
        <p>
          Seeing inside a running program needs a hook, and each language
          offers a different one:
        </p>
        <ul>
          <li>
            <strong>JavaScript and TypeScript</strong> — the syntax tree is
            rewritten before it runs, so the program reports each statement as
            it reaches it. TypeScript has its types stripped first.
          </li>
          <li>
            <strong>Python</strong> uses <code>sys.settrace</code> and
            <strong>Ruby</strong> uses <code>TracePoint</code>: hooks those
            languages provide for exactly this purpose.
          </li>
          <li>
            <strong>Java, C and C++</strong> are rewritten the same way
            JavaScript is, then compiled. Java reads its call stack from the
            JVM; C++ keeps one with a scope guard, and C with a cleanup
            attribute.
          </li>
        </ul>

        <div class="note warn">
          <p>
            <strong>Where your code goes.</strong> JavaScript, TypeScript,
            Python and Ruby never leave your browser. Everything else —
            including traced Java, C and C++ — is sent to an execution service
            to be compiled and run. Do not put secrets or private data in those
            files.
          </p>
        </div>
      </section>
    `;
  }

  private languages() {
    return html`
      <section id="languages">
        <h2>Languages</h2>
        <p>
          CodeFlow supports
          <strong>${TRACED_LIST.length + RUN_LIST.length} languages</strong>, in
          two tiers. The tier decides what Run gives you, and it is a property
          of the language rather than a setting.
        </p>
        <p>
          The <strong>file extension</strong> picks the language — there is no
          dropdown to get out of sync with the file name, and one project can
          mix tiers freely.
        </p>

        <h3>Traced — the full picture</h3>
        <p>
          These produce a recording you can step through: line highlighting,
          variables, call stack, transcript and timeline.
        </p>
        <p>
          JavaScript, TypeScript, Python and Ruby run
          <strong>in your browser</strong>, so that code never leaves your
          machine. Java, C and C++ are the exceptions: they are compiled and
          run remotely, so the same privacy note applies to them as to the run
          tier below.
        </p>
        <table>
          <thead>
            <tr>
              <th>Language</th>
              <th>Extensions</th>
              <th>How it is traced</th>
            </tr>
          </thead>
          <tbody>
            ${TRACED_LIST.map(
              (language) => html`
                <tr>
                  <td><strong>${language.label}</strong></td>
                  <td>
                    ${language.extensions.map(
                      (ext) => html`<code>${ext}</code> `,
                    )}
                  </td>
                  <td>
                    ${TRACE_METHOD[language.id] ??
                    "AST instrumentation in a Web Worker"}
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>

        <h3>Run — output only</h3>
        <p>
          The other ${RUN_LIST.length} languages execute remotely and report
          what they printed, plus an exit code.
          <strong>There is no stepping</strong> — no line highlighting, no
          variables, no call stack. The workspace hides those controls rather
          than showing buttons that cannot work.
        </p>
        ${this.shot(
          "output-only",
          "A Go file running: the side panel says there are no variables or call stack, and the console shows the output",
          "A run-tier language. The stepping controls and panels are absent rather than disabled — they could not work, so they are not offered.",
          420,
          640,
        )}

        <p>${RUN_LIST.map((l) => html`<code>${l.extensions[0]}</code> `)}</p>
        <table>
          <thead>
            <tr>
              <th>Language</th>
              <th>Extension</th>
            </tr>
          </thead>
          <tbody>
            ${RUN_LIST.map(
              (language) => html`
                <tr>
                  <td>${language.label}</td>
                  <td><code>${language.extensions[0]}</code></td>
                </tr>
              `,
            )}
          </tbody>
        </table>

        <div class="note warn">
          <p>
            <strong>Run-tier code leaves your browser.</strong> It is sent to a
            code execution service to be compiled and run — by default a shared
            public one, which is also rate limited. Traced languages never
            leave your machine. If that distinction matters for what you are
            working on, stay in the traced tier, or point the server at an
            execution service you host yourself.
          </p>
        </div>

        <p>
          A few of these depend on which execution service is configured; not
          every service offers every language. If one is unavailable you get a
          message saying so by name, rather than a failure that looks like your
          code. The default service covers all the mainstream ones — Java, C,
          C++, C#, Go, Rust, PHP, Kotlin and Swift among them.
        </p>

        <h3>Why the split</h3>
        <p>
          Tracing needs a hook inside the language runtime — Python's
          <code>sys.settrace</code>, Ruby's <code>TracePoint</code>, or
          instrumenting a JavaScript syntax tree before it runs. Those three
          runtimes have WebAssembly builds, so the hook is available right in
          the browser.
        </p>
        <p>
          A remote executor, by contrast, takes source, runs it, and hands back
          what was printed; there is nowhere to attach a step hook. The way
          around that is to rewrite the program before compiling it, so that it
          reports on itself — which is what happens for Java, C and C++. Java
          reads its call stack from the JVM; C++ keeps one with a scope guard
          whose destructor pops, and C does the same with a cleanup attribute.
          All three stay correct through recursion and early returns.
        </p>
        <p>
          That rewrite has to be written once per language, which is why the
          remaining compiled languages are output-only for now rather than
          impossible. Two limitations are worth knowing. A loop or
          <code>if</code> body written without braces has no statement list to
          instrument, so it runs but is not reported — adding braces makes it
          visible, and JavaScript behaves the same way. And in C and C++ only
          values whose type can be printed are shown: numbers, booleans,
          <code>char *</code> and <code>std::string</code>. A struct or an
          arbitrary pointer is skipped rather than guessed at.
        </p>
      </section>
    `;
  }

  private summary() {
    return html`
      <section id="summary">
        <h2>What the run solved</h2>
        <p>
          The <strong>Summary</strong> tab, beside Transcript and Console,
          answers two questions in a few lines: what problem the code solved,
          and how it went about it. For a program that adds up a list it reads:
        </p>
        <pre><code>Adds up the numbers in a list.
total([10, 20, 30, 40]) → 100
Walks nums (4 items) and folds it into sum.
Took 9 steps.</code></pre>

        <h3>How the problem is worked out</h3>
        <p>
          Not from the names in your code. A function called
          <code>total</code> proves nothing — it might do anything. Instead each
          candidate problem is a claim that gets
          <strong>checked against the run&rsquo;s own input and output</strong>:
          summing <code>[10, 20, 30, 40]</code> really does give
          <code>100</code>, so that claim holds. Sorting, reversing,
          de-duplicating, counting characters, finding the first non-repeating
          character, two-sum, factorials, primes, anagrams and palindromes are
          all recognised the same way.
        </p>

        <div class="note">
          <p>
            <strong>When nothing fits, nothing is claimed.</strong> A problem
            statement you cannot check is worse than none, so an unrecognised
            program gets only the line describing how it ran.
          </p>
        </div>

        <div class="note warn">
          <p>
            <strong>One example often cannot tell two problems apart.</strong>
            <code>[1, 2, 3] → 3</code> is the largest item, the item count and
            the last item all at once. Rather than pick, the summary says so and
            invites a sharper example: <code>[5, 9, 1] → 9</code> can only be
            the largest.
          </p>
        </div>

        <h3>Programs with no single answer</h3>
        <p>
          A class driven through its methods computes no one value, so there is
          no problem to prove. The summary describes the behaviour instead — how
          often each method ran, what it was called with, and what it printed:
        </p>
        <pre><code>Builds a BrowserHistory and calls visit, currentPage and back on it.
Ran visit 3 times, currentPage 3 times and back twice.
Called with "google.com", "github.com" and "stackoverflow.com".
Printed 8 lines, ending with "Current page: google.com".
Took 29 steps.</code></pre>
        <p>
          Those lines appear only when they are carrying the weight. When a
          problem <em>is</em> named, the line beneath it already shows the call
          and the answer, so repeating them would be the same fact twice.
        </p>
      </section>
    `;
  }

  private fullview() {
    return html`
      <section id="fullview">
        <h2>Full view</h2>
        <p>
          The workspace shows a run in a narrow side panel, which is enough to
          follow while you edit but small to watch. <strong>Full view</strong>,
          from the button in the output panel header, gives the same run the
          whole screen — and plays it.
        </p>

        ${this.shot(
          "fullview",
          "Full view: the summary, the list drawn as cells with a reading marker, the call stack, the flow diagram and the transport controls",
          "Full view, paused mid-loop. The summary names the problem, the list is drawn as cells with a marker under the item being read, and the transport along the bottom runs it.",
          1440,
          860,
        )}

        <p>
          It needs a trace, so the button stays disabled until you have run a
          file in a traced language. Nothing is re-run or re-fetched: it is the
          same trace the workspace already has, so opening and closing it never
          interrupts playback.
        </p>

        <h3>Playing it</h3>
        <ul>
          <li><strong>Play / Pause</strong>, and <strong>Replay</strong> once it reaches the end</li>
          <li>Step <strong>forward</strong> and <strong>back</strong> one step at a time</li>
          <li>A <strong>timeline</strong> to scrub to any step</li>
          <li>
            Speed at <strong>0.5×</strong>, <strong>1×</strong>,
            <strong>2×</strong> or <strong>4×</strong> — 1× holds each step for
            about three quarters of a second
          </li>
        </ul>
        <p>
          From the keyboard: <kbd>Space</kbd> plays and pauses,
          <kbd>←</kbd> and <kbd>→</kbd> step, and <kbd>Esc</kbd> closes.
        </p>

        <h3>What moves</h3>
        <p>
          The motion is there to be read, not for decoration. The line marker
          <strong>travels</strong> between lines rather than blinking from one
          to the next, and the code scrolls to keep it centred. A changed value
          flashes, so you can see which one this step wrote. Stack frames slide
          in as they are pushed. The node in the flow diagram pulses, and the
          path behind it lights up.
        </p>
        <p>
          If your system asks for reduced motion, the travel and the pulsing
          stop but every state change stays — the movement carries information,
          so removing it entirely would remove the explanation with it.
        </p>
      </section>
    `;
  }

  private supported() {
    return html`
      <section id="supported">
        <h2>What's traced</h2>
        <p>
          This section is about the <strong>traced</strong> languages:
          ${TRACED_LIST.map((l) => l.label).join(", ")}. Your code is run by a
          real engine for that language, so behaviour is genuine rather than an
          approximation. The details below describe JavaScript and TypeScript,
          which are traced by instrumenting the syntax tree; Python and Ruby use
          their runtime's own tracing hook and so report every line.
        </p>

        <h3>Traced in full</h3>
        <ul>
          <li>Function declarations and expressions, including recursion</li>
          <li>Calls and returns, with the returned value</li>
          <li><code>if</code> / <code>else</code>, and thrown errors</li>
          <li>
            <code>for</code>, <code>for…of</code>, <code>for…in</code>,
            <code>while</code>, <code>do…while</code>, with iteration counts
          </li>
          <li>
            Variable declarations and assignments, including destructuring
          </li>
          <li>Console output</li>
        </ul>

        <h3>Runs correctly, but is not narrated</h3>
        <p>
          These work — your program produces the right answer — but they do not
          appear as their own steps in the transcript:
        </p>
        <ul>
          <li>
            Arrow functions with an expression body, e.g.
            <code>x => x * 2</code>
          </li>
          <li><code>async</code> / <code>await</code>, generators, classes</li>
          <li>
            Single-statement bodies without braces, e.g.
            <code>if (x) return;</code> — add braces to see them
          </li>
        </ul>

        <div class="note">
          <p>
            Variables are shown as one flat scope rather than per stack frame.
            At the deepest point of a recursion you see the innermost
            <code>n</code>, not one for every level.
          </p>
        </div>
      </section>
    `;
  }

  private limits() {
    return html`
      <section id="limits">
        <h2>Limits and safeguards</h2>
        <h3>Traced languages, in your browser</h3>
        <p>
          A program that never finishes would otherwise freeze the page, so runs
          stop when they exceed any of these:
        </p>
        <table>
          <thead>
            <tr>
              <th>Limit</th>
              <th>Value</th>
              <th>Reported as</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Steps</td>
              <td>50,000</td>
              <td>"this looks like an infinite loop"</td>
            </tr>
            <tr>
              <td>Time</td>
              <td>4 seconds</td>
              <td>"the program ran too long"</td>
            </tr>
            <tr>
              <td>Call depth</td>
              <td>500</td>
              <td>"runaway recursion"</td>
            </tr>
            <tr>
              <td>Recorded events</td>
              <td>250,000</td>
              <td>"too large to trace in full"</td>
            </tr>
          </tbody>
        </table>
        <p>
          Your code runs in a Web Worker, which has no access to the page. If it
          wedges entirely, the worker is terminated after 6 seconds.
        </p>

        <div class="note warn">
          <p>
            <strong>This is not a security sandbox.</strong> The worker shares
            your browser origin and can still make network requests. It is built
            for running <em>your own</em> code. Do not paste in code you do not
            trust.
          </p>
        </div>

        <h3>Run-only languages, on a remote runner</h3>
        <p>
          The other ${RUN_LIST.length} languages cannot run in a browser, so
          CodeFlow sends the file to an execution service through its own API and
          returns whatever the program printed. Those runs have their own time
          and memory limits, set by that service rather than by CodeFlow — a
          program killed there reports a timeout or a non-zero exit code instead
          of one of the messages above. Requests are also authenticated, so you
          must be signed in.
        </p>

        <div class="note warn">
          <p>
            <strong>Run-tier code leaves your browser.</strong> Do not put
            secrets, credentials or private data in a file you run in one of
            those languages. See
            <a href="#languages">Languages</a> for which tier a language is in.
          </p>
        </div>
      </section>
    `;
  }

  private trouble() {
    return html`
      <section id="trouble">
        <h2>Troubleshooting</h2>

        <h3>The variables are not from my code</h3>
        <p>
          Check the <code>traced:</code> label in the bottom pane. It names the
          file the recording came from. If it is not the file you are looking
          at, press Run again.
        </p>

        <h3>My program stopped early</h3>
        <p>
          Look at the console. Hitting a safeguard is reported there with the
          reason. An infinite loop is the usual cause; a missing
          <code>break</code> or a recursion with no base case are the usual
          reasons for that.
        </p>

        <h3>Nothing appears in the transcript</h3>
        <p>
          A syntax error stops the program before it runs. The error, with its
          line number, is shown in a banner and in the console.
        </p>

        <h3>A step says nothing happened</h3>
        <p>
          Not every line produces an observable event — testing a condition, for
          example. Those rows show the source line without narration, which is
          still enough to follow the path taken.
        </p>

        <h3>The Summary does not name my problem</h3>
        <p>
          It only names a problem it can check against the run’s input and
          output, and the list it checks against is finite. An unrecognised
          program still gets the line describing how it ran — see
          <a href="#summary">What the run solved</a>.
        </p>

        <h3>A variable is still listed after its function returned</h3>
        <p>
          Values are held in one flat view, and a function’s locals are not
          cleared when it returns, so a parameter can linger in the Data panel
          while you are back at the top level. It is stale rather than wrong,
          and per-frame scopes are on the list of things
          <a href="#roadmap">not built yet</a>.
        </p>

        <h3>My edit did not save</h3>
        <p>
          The header shows <em>Save failed</em> with a Retry button when a save
          does not go through. This is almost always a lost connection to the
          API.
        </p>
      </section>
    `;
  }

  private roadmap() {
    return html`
      <section id="roadmap">
        <h2>Not built yet</h2>
        <p>
          Listed so you know where the edges are, rather than discovering them
          mid-task:
        </p>
        <ul>
          <li><strong>Imports between files</strong> in the same project</li>
          <li>
            <strong>Stepping through most languages</strong> — only
            ${TRACED_LIST.length} are traced. The other ${RUN_LIST.length} run
            and print output, with no timeline
          </li>
          <li>
            <strong>Per-frame variable scopes</strong> — variables are one flat
            view today, and a function’s locals are not cleared when it
            returns, so they can linger in the Data panel afterwards
          </li>
          <li>
            <strong>Renaming and deleting files on a narrow screen</strong> —
            adding one works, the rest needs a wider window
          </li>
          <li><strong>Folders</strong> — file names are flat</li>
          <li>
            <strong>Sharing or collaboration</strong> — projects are private to
            you
          </li>
          <li><strong>Editing your display name</strong> after sign-up</li>
        </ul>
        <p>
          Found something that behaves differently from this page? The page is
          wrong — please say so.
        </p>
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-docs": CfDocs;
  }
}
