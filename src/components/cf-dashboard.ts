import { LitElement, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { reset, layout } from "../styles/shared";
import { navigate } from "../lib/router";
import { displayNameOf, getSession } from "../lib/auth";
import {
  createProject,
  createProjectInLanguage,
  deleteProject,
  fetchProjects,
  renameProject,
} from "../lib/projects";
import type { Project, ProjectSort } from "../lib/projects";
import {
  RUN_LIST,
  TRACED_LIST,
  languageById,
  starterFileName,
} from "../execution/languages";
import "./cf-app-bar";
import "./cf-button";
import "./cf-input";
import "./cf-dialog";

type Load = "loading" | "ready" | "error";

const SORTS: Array<{ value: ProjectSort; label: string }> = [
  { value: "UPDATED_DESC", label: "Last updated" },
  { value: "CREATED_DESC", label: "Newest" },
  { value: "NAME_ASC", label: "Name" },
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
  ];

  let value = seconds / 60;
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  for (const [divisor, next] of units) {
    if (Math.abs(value) < divisor) break;
    value /= divisor;
    unit = next;
  }

  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    -Math.round(value),
    unit,
  );
}

@customElement("cf-dashboard")
export class CfDashboard extends LitElement {
  @state() private status: Load = "loading";
  @state() private error = "";
  @state() private projects: Project[] = [];
  @state() private search = "";
  @state() private sort: ProjectSort = "UPDATED_DESC";
  @state() private creating = false;
  /** Which launcher tile is working, so only that one shows a spinner. */
  @state() private startingId = "";
  @state() private who = "";

  /** Project pending deletion, shown in the confirm dialog. */
  @state() private pendingDelete: Project | null = null;
  /** Project being renamed inline. */
  @state() private renaming: Project | null = null;
  @state() private renameValue = "";
  @state() private renameError = "";

  private searchTimer?: number;

  static styles = [
    reset,
    layout,
    css`
      :host {
        display: block;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .section {
        padding-block: clamp(2rem, 5vw, 3rem);
      }

      /* --- Welcome ------------------------------------------------------- */
      .welcome {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 2rem;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.5rem, 3vw, 1.875rem);
        line-height: 1.15;
        letter-spacing: -0.028em;
        font-weight: 600;
        color: var(--cf-text);
      }

      .welcome p {
        margin: 0.375rem 0 0;
        font-size: 0.9375rem;
        color: var(--cf-text-dim);
      }

      /* --- Language launcher ---------------------------------------------- */
      .launcher {
        margin-bottom: 2rem;
        padding: 1.125rem 1.25rem 1.25rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-lg);
        background: var(--cf-inset);
      }

      .launcher-head h2 {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--cf-text);
      }

      .launcher-head p {
        margin: 0.25rem 0 0;
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
        gap: 0.5rem;
        margin-top: 0.875rem;
      }

      .tile {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.125rem;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-md);
        background: var(--cf-surface-2);
        font-family: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          background var(--cf-dur) var(--cf-ease),
          border-color var(--cf-dur) var(--cf-ease),
          transform var(--cf-dur) var(--cf-ease);
      }

      .tile:hover:not(:disabled) {
        background: var(--cf-surface-3);
        border-color: var(--cf-accent-line);
        transform: translateY(-1px);
      }

      .tile:focus-visible {
        outline: 2px solid var(--cf-accent);
        outline-offset: 2px;
      }

      .tile:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .tile-name {
        font-size: 0.875rem;
        font-weight: 550;
        color: var(--cf-text);
      }

      .tile-ext {
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
      }

      .tile-busy {
        font-size: 0.6875rem;
        color: var(--cf-accent);
      }

      .run-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-top: 0.875rem;
        padding-top: 0.875rem;
        border-top: 1px solid var(--cf-line);
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
      }

      .run-row select {
        padding: 0.3125rem 0.5rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text);
        font-family: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
      }

      .run-row select:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      /* --- Toolbar -------------------------------------------------------- */
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
      }

      .search {
        position: relative;
        flex: 1 1 16rem;
        min-width: 0;
      }

      .search input {
        width: 100%;
        padding: 0.5rem 0.75rem 0.5rem 2.125rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-md);
        background: var(--cf-bg-raised);
        color: var(--cf-text);
        font-family: inherit;
        font-size: 0.875rem;
      }

      .search input:focus {
        outline: none;
        border-color: var(--cf-accent);
        box-shadow: 0 0 0 3px var(--cf-accent-soft);
      }

      .search svg {
        position: absolute;
        left: 0.6875rem;
        top: 50%;
        translate: 0 -50%;
        width: 15px;
        height: 15px;
        fill: none;
        stroke: var(--cf-text-muted);
        stroke-width: 1.6;
        pointer-events: none;
      }

      select {
        padding: 0.5rem 0.625rem;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-md);
        background: var(--cf-surface-2);
        color: var(--cf-text);
        font-family: inherit;
        font-size: 0.875rem;
        cursor: pointer;
      }

      /* --- Grid ----------------------------------------------------------- */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
        gap: 1rem;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.125rem;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-lg);
        background: var(--cf-surface-2);
        transition:
          border-color var(--cf-dur) var(--cf-ease),
          transform var(--cf-dur) var(--cf-ease);
      }

      .card:hover {
        border-color: var(--cf-line-strong);
        transform: translateY(-2px);
      }

      .card h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        letter-spacing: -0.012em;
        color: var(--cf-text);
        overflow-wrap: anywhere;
      }

      .card .meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--cf-text-muted);
      }

      .lang {
        display: inline-flex;
        align-items: center;
        padding: 0.0625rem 0.4375rem;
        border-radius: var(--cf-r-full);
        border: 1px solid var(--cf-line);
        background: var(--cf-inset);
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-yellow);
      }

      .card .actions {
        display: flex;
        gap: 0.375rem;
        margin-top: auto;
        padding-top: 0.75rem;
      }

      .card .actions cf-button {
        flex: 1 1 auto;
      }

      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex: none;
        border: 1px solid var(--cf-line-strong);
        border-radius: var(--cf-r-md);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        cursor: pointer;
      }

      .icon-btn:hover {
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      .icon-btn.danger:hover {
        color: var(--cf-rose);
        border-color: color-mix(in srgb, var(--cf-rose) 45%, transparent);
      }

      .icon-btn svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* --- States --------------------------------------------------------- */
      .panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.875rem;
        padding: clamp(2.5rem, 7vw, 4rem) 1.5rem;
        border: 1px dashed var(--cf-line-strong);
        border-radius: var(--cf-r-lg);
        text-align: center;
      }

      .panel h2 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--cf-text);
      }

      .panel p {
        margin: 0;
        max-width: 38ch;
        font-size: 0.9375rem;
        line-height: 1.6;
        color: var(--cf-text-dim);
      }

      .panel.bad {
        border-style: solid;
        border-color: color-mix(in srgb, var(--cf-rose) 40%, transparent);
        background: color-mix(in srgb, var(--cf-rose) 7%, transparent);
      }

      .skeleton {
        height: 9.5rem;
        border-radius: var(--cf-r-lg);
        border: 1px solid var(--cf-line);
        background: linear-gradient(
          90deg,
          var(--cf-surface-2) 25%,
          var(--cf-surface-3) 50%,
          var(--cf-surface-2) 75%
        );
        background-size: 300% 100%;
        animation: shimmer 1.4s ease-in-out infinite;
      }

      @keyframes shimmer {
        to {
          background-position-x: -200%;
        }
      }

      .rename {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    getSession().then((s) => (this.who = displayNameOf(s?.user)));
    void this.load();
  }

  disconnectedCallback() {
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    super.disconnectedCallback();
  }

  private async load() {
    this.status = "loading";
    try {
      this.projects = await fetchProjects({
        search: this.search || undefined,
        sort: this.sort,
      });
      this.status = "ready";
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not load projects.";
      this.status = "error";
    }
  }

  /** Debounced so typing does not fire a request per keystroke. */
  private onSearch(event: Event) {
    this.search = (event.target as HTMLInputElement).value;
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => void this.load(), 250);
  }

  private async onCreate() {
    if (this.creating) return;
    this.creating = true;
    try {
      const project = await createProject();
      navigate(`/projects/${project.id}`);
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : "Could not create the project.";
      this.status = "error";
    } finally {
      this.creating = false;
    }
  }

  /** Start a project already holding a runnable sample in this language. */
  private async onCreateIn(id: string) {
    if (this.creating) return;
    const language = languageById(id);
    if (!language) return;

    this.creating = true;
    this.startingId = id;

    try {
      const project = await createProjectInLanguage({
        id: language.id,
        label: language.label,
        sample: language.sample,
        starterFileName: starterFileName(language),
      });
      navigate(`/projects/${project.id}`);
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : "Could not create the project.";
      this.status = "error";
    } finally {
      this.creating = false;
      this.startingId = "";
    }
  }

  /** The language launcher: the point of the product, one click from here. */
  private launcher() {
    return html`
      <section class="launcher" aria-labelledby="start-heading">
        <div class="launcher-head">
          <h2 id="start-heading">Start something new</h2>
          <p>
            These ${TRACED_LIST.length} can be stepped through line by line.
            Each starts with a small working program.
          </p>
        </div>

        <div class="tiles">
          ${TRACED_LIST.map(
            (language) => html`
              <button
                class="tile"
                type="button"
                ?disabled=${this.creating}
                aria-busy=${this.startingId === language.id}
                @click=${() => void this.onCreateIn(language.id)}
              >
                <span class="tile-name">${language.label}</span>
                <span class="tile-ext">${language.extensions[0]}</span>
                ${
                  this.startingId === language.id
                    ? html`<span class="tile-busy">Creating…</span>`
                    : nothing
                }
              </button>
            `,
          )}
        </div>

        <div class="run-row">
          <label for="run-lang">
            …or one of ${RUN_LIST.length} more that run and print output:
          </label>
          <select
            id="run-lang"
            ?disabled=${this.creating}
            .value=${""}
            @change=${(event: Event) => {
              const select = event.target as HTMLSelectElement;
              const id = select.value;
              select.value = "";
              if (id) void this.onCreateIn(id);
            }}
          >
            <option value="">Choose a language…</option>
            ${RUN_LIST.map(
              (language) =>
                html`<option value=${language.id}>${language.label}</option>`,
            )}
          </select>
        </div>
      </section>
    `;
  }

  private async confirmDelete() {
    const target = this.pendingDelete;
    if (!target) return;

    this.pendingDelete = null;
    // Optimistic: the row disappears immediately and comes back on failure.
    const previous = this.projects;
    this.projects = this.projects.filter((p) => p.id !== target.id);

    try {
      await deleteProject(target.id);
    } catch (error) {
      this.projects = previous;
      this.error =
        error instanceof Error
          ? error.message
          : "Could not delete the project.";
      this.status = "error";
    }
  }

  private async confirmRename() {
    const target = this.renaming;
    if (!target) return;

    const name = this.renameValue.trim();
    if (!name) {
      this.renameError = "Give the project a name.";
      return;
    }

    try {
      const updated = await renameProject(target.id, name);
      this.projects = this.projects.map((p) =>
        p.id === updated.id ? updated : p,
      );
      this.renaming = null;
      this.renameError = "";
    } catch (error) {
      this.renameError =
        error instanceof Error ? error.message : "Could not rename.";
    }
  }

  private card(project: Project) {
    return html`
      <article class="card">
        <h3>${project.name}</h3>
        <div class="meta">
          <span class="lang">${project.language}</span>
          <span>Updated ${relativeTime(project.updatedAt)}</span>
        </div>
        <div class="actions">
          <cf-button href=${`/projects/${project.id}`} variant="secondary">
            Open
          </cf-button>
          <button
            class="icon-btn"
            type="button"
            title="Rename"
            aria-label=${`Rename ${project.name}`}
            @click=${() => {
              this.renaming = project;
              this.renameValue = project.name;
              this.renameError = "";
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
            </svg>
          </button>
          <button
            class="icon-btn danger"
            type="button"
            title="Delete"
            aria-label=${`Delete ${project.name}`}
            @click=${() => (this.pendingDelete = project)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 5.5h12M8 5.5V3.5h4v2M6 5.5 6.7 17h6.6L14 5.5" />
            </svg>
          </button>
        </div>
      </article>
    `;
  }

  private body() {
    if (this.status === "loading") {
      return html`<div class="grid">
        ${[0, 1, 2].map(() => html`<div class="skeleton"></div>`)}
      </div>`;
    }

    if (this.status === "error") {
      return html`
        <div class="panel bad">
          <h2>Could not load your projects</h2>
          <p>${this.error}</p>
          <cf-button @click=${() => void this.load()}>Try again</cf-button>
        </div>
      `;
    }

    if (this.projects.length === 0) {
      const searching = this.search.trim().length > 0;
      return html`
        <div class="panel">
          <h2>${searching ? "No matches" : "No projects yet"}</h2>
          <p>
            ${
              searching
                ? html`Nothing matches “${this.search}”. Try a different search.`
                : "Create your first project and watch it run, one step at a time."
            }
          </p>
          ${
            searching
              ? nothing
              : html`<cf-button
                  size="lg"
                  ?loading=${this.creating}
                  @click=${this.onCreate}
                >
                  Create your first project
                </cf-button>`
          }
        </div>
      `;
    }

    return html`<div class="grid">
      ${repeat(
        this.projects,
        (p) => p.id,
        (p) => this.card(p),
      )}
    </div>`;
  }

  render() {
    return html`
      <cf-app-bar></cf-app-bar>

      <div class="container section">
        <div class="welcome">
          <div>
            <h1>${this.who ? `Welcome back, ${this.who}` : "Welcome back"}</h1>
            <p>Pick up where you left off, or start something new.</p>
          </div>
          <cf-button ?loading=${this.creating} @click=${this.onCreate}>
            New project
          </cf-button>
        </div>

        ${this.launcher()}

        <div class="toolbar">
          <div class="search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3 3" stroke-linecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search projects"
              aria-label="Search projects"
              .value=${this.search}
              @input=${this.onSearch}
            />
          </div>

          <label class="sr-only" for="sort">Sort projects</label>
          <select
            id="sort"
            aria-label="Sort projects"
            .value=${this.sort}
            @change=${(e: Event) => {
              this.sort = (e.target as HTMLSelectElement).value as ProjectSort;
              void this.load();
            }}
          >
            ${SORTS.map(
              (s) => html`<option value=${s.value}>${s.label}</option>`,
            )}
          </select>
        </div>

        ${this.body()}
      </div>

      <cf-dialog
        .open=${this.pendingDelete !== null}
        heading="Delete this project?"
        confirm-label="Delete"
        destructive
        @cf-cancel=${() => (this.pendingDelete = null)}
        @cf-confirm=${this.confirmDelete}
      >
        <p>
          <strong>${this.pendingDelete?.name}</strong> and its code will be
          permanently removed. This cannot be undone.
        </p>
      </cf-dialog>

      <cf-dialog
        .open=${this.renaming !== null}
        heading="Rename project"
        confirm-label="Save"
        @cf-cancel=${() => (this.renaming = null)}
        @cf-confirm=${this.confirmRename}
      >
        <div class="rename">
          <cf-input
            name="project-name"
            label="Project name"
            .value=${this.renameValue}
            .error=${this.renameError}
            @cf-input=${(e: CustomEvent) => {
              this.renameValue = e.detail.value;
              this.renameError = "";
            }}
          ></cf-input>
        </div>
      </cf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-dashboard": CfDashboard;
  }
}
