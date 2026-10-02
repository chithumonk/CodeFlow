import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { classMap } from "lit/directives/class-map.js";
import { reset } from "../styles/shared";
import { ExecutionController } from "../execution/controller";
import type { ControllerState } from "../execution/controller";
import type { ExecutionEngine } from "../execution/events";
import { consoleUpTo } from "../execution/trace";
import {
  RUN_LIST,
  TRACED_LIST,
  engineForFile,
  isTraceable,
  languageForFile,
} from "../execution/languages";
import {
  createFile,
  deleteFile,
  fetchProjectFiles,
  renameFile,
  updateFile,
  validateFileName,
} from "../lib/files";
import type { ProjectFile } from "../lib/files";
import "./cf-app-bar";
import "./cf-button";
import "./cf-code-editor";
import "./cf-dialog";
import "./cf-exec-controls";
import "./cf-input";
import "./cf-splash";
import "./cf-trace-panels";
import "./cf-transcript";

type SaveState = "saved" | "dirty" | "saving" | "failed";

/** Quiet period before an edit is persisted. */
const SAVE_DEBOUNCE_MS = 1200;

@customElement("cf-workspace")
export class CfWorkspace extends LitElement {
  @property({ type: String }) projectId = "";

  @state() private projectName = "";
  @state() private files: ProjectFile[] = [];
  @state() private activeId = "";
  @state() private loading = true;
  @state() private loadError = "";

  @state() private saveState: SaveState = "saved";
  @state() private saveError = "";

  @state() private exec: ControllerState;
  /** Which file the current trace describes; lines mean nothing elsewhere. */
  @state() private tracedFileId = "";
  /** Non-empty when an engine could not be loaded or started. */
  @state() private engineError = "";
  /** True while a heavy runtime is downloading for the first time. */
  @state() private booting = false;
  /** Which runtime is downloading, so the banner names the right one. */
  @state() private bootingLabel = "";

  /** Languages whose runtime is already warm this session. */
  private warmedUp = new Set<string>();

  @state() private mobilePanel: "code" | "state" = "code";
  @state() private bottomTab: "transcript" | "console" = "transcript";

  // --- File dialogs --------------------------------------------------------
  @state() private creating = false;
  @state() private renaming: ProjectFile | null = null;
  @state() private deleting: ProjectFile | null = null;
  @state() private nameDraft = "";
  @state() private nameError = "";

  /** Last persisted content per file, for working out what is dirty. */
  private savedContent = new Map<string, string>();
  private saveTimers = new Map<string, number>();

  /**
   * Created per run, because the engine depends on the active file's
   * language. Playback state is read from it, so it is replaced rather than
   * reconfigured.
   */
  private controller = new ExecutionController({
    id: "none",
    language: "none",
    run: async () => ({
      events: [],
      ranUserCode: false,
      sourceMatches: true,
    }),
  });
  private stopExecWatch?: () => void;

  constructor() {
    super();
    this.exec = this.controller.getState();
  }

  static styles = [
    reset,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
      }

      /* --- App bar ---------------------------------------------------------- */
      .save {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        white-space: nowrap;
      }

      .save i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--cf-text-faint);
      }
      .save.saved i {
        background: var(--cf-green);
      }
      .save.dirty i {
        background: var(--cf-yellow);
      }
      .save.saving i {
        background: var(--cf-accent);
      }
      .save.failed {
        color: var(--cf-rose);
      }
      .save.failed i {
        background: var(--cf-rose);
      }

      /* --- Stage ------------------------------------------------------------ */
      .stage {
        flex: 1 1 auto;
        display: grid;
        grid-template-columns: 200px minmax(0, 1fr) 250px;
        min-height: 0;
      }

      .explorer {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
        min-height: 0;
      }

      .explorer header {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.625rem 0.5rem 0.375rem 0.875rem;
      }

      .panel-title {
        margin: 0;
        font-family: var(--cf-font-mono);
        font-size: 0.625rem;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
      }

      .explorer .add {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 1px solid var(--cf-line);
        border-radius: var(--cf-r-sm);
        background: var(--cf-surface-2);
        color: var(--cf-text-dim);
        cursor: pointer;
      }

      .explorer .add:hover {
        color: var(--cf-text);
        border-color: var(--cf-line-bright);
      }

      .explorer .add svg {
        width: 13px;
        height: 13px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
      }

      .files {
        flex: 1 1 auto;
        margin: 0;
        padding: 0 0.375rem;
        list-style: none;
        overflow-y: auto;
        min-height: 0;
      }

      .file {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        border-radius: var(--cf-r-sm);
      }

      .file:hover {
        background: var(--cf-hover);
      }

      .file.active {
        background: var(--cf-surface-3);
      }

      .file .open {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.3125rem 0.375rem;
        border: 0;
        background: transparent;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        text-align: left;
        cursor: pointer;
      }

      .file.active .open {
        color: var(--cf-text);
      }

      .file .open span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* An unsaved file is marked, so nothing is lost silently. */
      .file .dot {
        flex: none;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--cf-yellow);
      }

      .file .act {
        display: none;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex: none;
        border: 0;
        border-radius: var(--cf-r-sm);
        background: transparent;
        color: var(--cf-text-faint);
        cursor: pointer;
      }

      .file:hover .act,
      .file.active .act {
        display: inline-flex;
      }

      .file .act:hover {
        color: var(--cf-text);
        background: var(--cf-hover);
      }

      .file .act.danger:hover {
        color: var(--cf-rose);
      }

      .file .act svg {
        width: 13px;
        height: 13px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .rail-empty {
        margin: 0;
        padding: 0.875rem;
        font-size: 0.8125rem;
        line-height: 1.55;
        color: var(--cf-text-muted);
      }

      .hint {
        margin: 0.5rem 0.875rem 0.75rem;
        font-size: 0.6875rem;
        line-height: 1.5;
        color: var(--cf-text-faint);
      }

      /* --- Editor ------------------------------------------------------------ */
      .editor-col {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }

      .tabstrip {
        display: flex;
        overflow-x: auto;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset);
        flex: none;
      }

      .tabstrip button {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        padding: 0.5rem 0.875rem;
        border: 0;
        border-right: 1px solid var(--cf-line);
        background: transparent;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        color: var(--cf-text-muted);
        white-space: nowrap;
        cursor: pointer;
      }

      .tabstrip button[aria-selected="true"] {
        background: var(--cf-bg);
        color: var(--cf-text);
        box-shadow: inset 0 -2px 0 var(--cf-accent);
      }

      .tabstrip .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--cf-yellow);
      }

      cf-code-editor {
        flex: 1 1 auto;
        min-height: 0;
      }

      /* --- Right rail --------------------------------------------------------- */
      .rail {
        border-left: 1px solid var(--cf-line);
        background: var(--cf-inset-soft);
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      cf-trace-panels {
        flex: 1 1 auto;
      }

      /* --- Bottom pane --------------------------------------------------------- */
      .bottom {
        border-top: 1px solid var(--cf-line);
        background: var(--cf-inset-strong);
        height: 13rem;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .bottom header {
        display: flex;
        align-items: center;
        gap: 0.125rem;
        padding: 0 0.5rem;
        border-bottom: 1px solid var(--cf-line);
        flex: none;
      }

      .bottom .tab {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        padding: 0.5rem 0.625rem;
        border: 0;
        background: transparent;
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--cf-text-muted);
        cursor: pointer;
      }

      .bottom .tab[aria-selected="true"] {
        color: var(--cf-text);
        box-shadow: inset 0 -2px 0 var(--cf-accent);
      }

      .bottom .tab .count {
        padding: 0 0.3125rem;
        border-radius: var(--cf-r-full);
        background: var(--cf-surface-3);
        font-size: 0.625rem;
        color: var(--cf-text-dim);
      }

      .bottom .spacer {
        flex: 1 1 auto;
      }

      .bottom .traced {
        font-family: var(--cf-font-mono);
        font-size: 0.6875rem;
        color: var(--cf-text-muted);
      }

      .bottom .notice {
        font-size: 0.6875rem;
        color: var(--cf-yellow);
      }

      cf-transcript {
        flex: 1 1 auto;
        min-height: 0;
      }

      .console {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .console ol {
        flex: 1 1 auto;
        margin: 0;
        padding: 0.4375rem 0.875rem;
        list-style: none;
        overflow-y: auto;
        font-family: var(--cf-font-mono);
        font-size: 0.75rem;
        line-height: 1.7;
      }

      .console li {
        display: flex;
        gap: 0.5rem;
        color: var(--cf-text-dim);
      }

      .console li::before {
        content: "›";
        color: var(--cf-text-faint);
      }

      .console li.error {
        color: var(--cf-rose);
      }
      .console li.warn {
        color: var(--cf-yellow);
      }

      .console .empty {
        color: var(--cf-text-faint);
        font-style: italic;
      }

      /* --- Banners -------------------------------------------------------------- */
      .banner {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.875rem;
        background: color-mix(in srgb, var(--cf-rose) 12%, transparent);
        border-bottom: 1px solid
          color-mix(in srgb, var(--cf-rose) 40%, transparent);
        font-size: 0.8125rem;
        color: var(--cf-text);
      }

      .info-banner {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem 0.875rem;
        border-bottom: 1px solid var(--cf-accent-line);
        background: var(--cf-accent-soft);
        font-size: 0.8125rem;
        color: var(--cf-text);
      }

      .center {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.875rem;
        padding: 2rem;
        text-align: center;
      }

      .center p {
        margin: 0;
        max-width: 38ch;
        color: var(--cf-text-dim);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      /* --- Narrow ---------------------------------------------------------------- */
      .tabs {
        display: none;
        border-bottom: 1px solid var(--cf-line);
        background: var(--cf-inset);
      }

      .tabs button {
        flex: 1 1 0;
        padding: 0.5rem;
        border: 0;
        background: transparent;
        font-family: inherit;
        font-size: 0.8125rem;
        color: var(--cf-text-muted);
        cursor: pointer;
      }

      .tabs button[aria-selected="true"] {
        color: var(--cf-text);
        box-shadow: inset 0 -2px 0 var(--cf-accent);
      }

      @media (max-width: 900px) {
        .explorer {
          display: none;
        }
        .stage {
          grid-template-columns: minmax(0, 1fr) 230px;
        }
      }

      @media (max-width: 680px) {
        .tabs {
          display: flex;
        }
        .stage {
          grid-template-columns: minmax(0, 1fr);
        }
        .rail {
          border-left: 0;
          border-top: 1px solid var(--cf-line);
        }
        :host([data-panel="code"]) .rail,
        :host([data-panel="state"]) .editor-col {
          display: none;
        }
        .bottom {
          height: 10rem;
        }
      }
    `,
  ];

  /* --- Lifecycle ----------------------------------------------------------- */

  connectedCallback() {
    super.connectedCallback();
    this.stopExecWatch = this.controller.subscribe((s) => (this.exec = s));
    void this.load();
    window.addEventListener("beforeunload", this.warnIfUnsaved);
  }

  disconnectedCallback() {
    this.stopExecWatch?.();
    this.controller.dispose();
    for (const timer of this.saveTimers.values()) clearTimeout(timer);
    this.saveTimers.clear();
    window.removeEventListener("beforeunload", this.warnIfUnsaved);
    super.disconnectedCallback();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has("mobilePanel")) {
      this.setAttribute("data-panel", this.mobilePanel);
    }
  }

  private warnIfUnsaved = (event: BeforeUnloadEvent) => {
    if (this.dirtyFiles.length > 0) event.preventDefault();
  };

  /* --- Data ---------------------------------------------------------------- */

  private async load() {
    this.loading = true;
    this.loadError = "";
    try {
      const project = await fetchProjectFiles(this.projectId);
      if (!project) {
        this.loadError = "That project does not exist, or is not yours.";
        return;
      }

      this.projectName = project.name;
      this.files = project.files;
      this.savedContent = new Map(
        project.files.map((f) => [f.id, f.content] as const),
      );
      this.activeId = project.files[0]?.id ?? "";
    } catch (error) {
      this.loadError =
        error instanceof Error ? error.message : "Could not load the project.";
    } finally {
      this.loading = false;
    }
  }

  private get active(): ProjectFile | undefined {
    return this.files.find((f) => f.id === this.activeId);
  }

  private get dirtyFiles(): ProjectFile[] {
    return this.files.filter((f) => this.savedContent.get(f.id) !== f.content);
  }

  private isDirty(file: ProjectFile): boolean {
    return this.savedContent.get(file.id) !== file.content;
  }

  /* --- Editing and saving --------------------------------------------------- */

  private onCodeChange(event: CustomEvent) {
    const file = this.active;
    if (!file) return;

    const value = event.detail.value as string;
    this.files = this.files.map((f) =>
      f.id === file.id ? { ...f, content: value } : f,
    );
    this.saveState = "dirty";

    // Debounced per file, so editing one tab does not cancel another's save.
    const existing = this.saveTimers.get(file.id);
    if (existing !== undefined) clearTimeout(existing);
    this.saveTimers.set(
      file.id,
      window.setTimeout(() => void this.save(file.id), SAVE_DEBOUNCE_MS),
    );
  }

  private async save(fileId: string) {
    const file = this.files.find((f) => f.id === fileId);
    if (!file) return;

    this.saveTimers.delete(fileId);
    this.saveState = "saving";
    this.saveError = "";

    // Captured before the request: more edits may land while it is in flight.
    const sending = file.content;

    try {
      await updateFile(fileId, sending);
      this.savedContent.set(fileId, sending);
      this.saveState = this.dirtyFiles.length > 0 ? "dirty" : "saved";
    } catch (error) {
      this.saveState = "failed";
      this.saveError =
        error instanceof Error ? error.message : "Could not save.";
    }
  }

  /** Flush every pending edit now, e.g. before running. */
  private async saveAll() {
    const pending = [...this.saveTimers.keys()];
    for (const timer of this.saveTimers.values()) clearTimeout(timer);
    this.saveTimers.clear();
    await Promise.all(pending.map((id) => this.save(id)));
  }

  private saveLabel() {
    switch (this.saveState) {
      case "saving":
        return "Saving…";
      case "dirty":
        return "Unsaved changes";
      case "failed":
        return "Save failed";
      default:
        return "Saved";
    }
  }

  /* --- File operations -------------------------------------------------------- */

  private async confirmCreate() {
    const error = validateFileName(
      this.nameDraft,
      this.files.map((f) => f.name),
    );
    if (error) {
      this.nameError = error;
      return;
    }

    try {
      const name = this.nameDraft.trim();
      const file = await createFile(
        this.projectId,
        name,
        languageForFile(name)?.sample ?? "",
      );
      this.files = [...this.files, file].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      this.savedContent.set(file.id, file.content);
      this.activeId = file.id;
      this.creating = false;
      this.nameDraft = "";
    } catch (err) {
      this.nameError =
        err instanceof Error ? err.message : "Could not create the file.";
    }
  }

  private async confirmRename() {
    const target = this.renaming;
    if (!target) return;

    const error = validateFileName(
      this.nameDraft,
      this.files.filter((f) => f.id !== target.id).map((f) => f.name),
    );
    if (error) {
      this.nameError = error;
      return;
    }

    try {
      const updated = await renameFile(target.id, this.nameDraft.trim());
      this.files = this.files
        .map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f))
        .sort((a, b) => a.name.localeCompare(b.name));
      this.renaming = null;
      this.nameDraft = "";
    } catch (err) {
      this.nameError =
        err instanceof Error ? err.message : "Could not rename the file.";
    }
  }

  private async confirmDelete() {
    const target = this.deleting;
    if (!target) return;

    this.deleting = null;
    const previous = this.files;
    this.files = this.files.filter((f) => f.id !== target.id);

    if (this.activeId === target.id) {
      this.activeId = this.files[0]?.id ?? "";
    }

    try {
      await deleteFile(target.id);
      this.savedContent.delete(target.id);
    } catch (error) {
      this.files = previous;
      this.saveState = "failed";
      this.saveError =
        error instanceof Error ? error.message : "Could not delete the file.";
    }
  }

  /* --- Execution ---------------------------------------------------------------- */

  private async run() {
    const file = this.active;
    if (!file) return;

    const language = languageForFile(file.name);
    if (!language) {
      this.engineError = `No engine knows how to run ${file.name}.`;
      return;
    }

    // Persist first: what runs and what is stored should not diverge.
    await this.saveAll();

    this.engineError = "";
    // Pyodide and ruby.wasm are multi-megabyte downloads on the first run of
    // their language; say so rather than appearing to hang.
    this.booting = Boolean(
      language.heavyRuntime && !this.warmedUp.has(language.id),
    );
    this.bootingLabel = language.label;

    try {
      const engine = await engineForFile(file.name);
      if (!engine) {
        this.engineError = `No engine knows how to run ${file.name}.`;
        return;
      }

      this.swapEngine(engine);
      this.tracedFileId = file.id;
      await this.controller.run(file.content);
      this.warmedUp.add(language.id);
    } catch (error) {
      this.engineError =
        error instanceof Error
          ? error.message
          : `Could not start the ${language.label} runtime.`;
    } finally {
      this.booting = false;
    }
  }

  /** Point playback at a different engine, preserving the subscription. */
  private swapEngine(engine: ExecutionEngine) {
    this.controller.dispose();
    this.stopExecWatch?.();
    this.controller = new ExecutionController(engine);
    this.stopExecWatch = this.controller.subscribe((s) => (this.exec = s));
    this.exec = this.controller.getState();
  }

  /* --- Rendering ------------------------------------------------------------------ */

  private icon(path: string) {
    return html`<svg viewBox="0 0 20 20" aria-hidden="true">
      <path d=${path} />
    </svg>`;
  }

  private renderExplorer() {
    return html`
      <aside class="explorer">
        <header>
          <p class="panel-title">Files</p>
          <button
            class="add"
            type="button"
            title="New file"
            aria-label="New file"
            @click=${() => {
              this.nameDraft = "";
              this.nameError = "";
              this.creating = true;
            }}
          >
            ${this.icon("M10 4v12M4 10h12")}
          </button>
        </header>

        <ul class="files">
          ${repeat(
            this.files,
            (f) => f.id,
            (f) => html`
              <li
                class=${classMap({ file: true, active: f.id === this.activeId })}
              >
                <button
                  class="open"
                  type="button"
                  @click=${() => (this.activeId = f.id)}
                >
                  <span>${f.name}</span>
                  ${
                    this.isDirty(f)
                      ? html`<i class="dot" title="Unsaved changes"></i>`
                      : nothing
                  }
                </button>
                <button
                  class="act"
                  type="button"
                  title="Rename"
                  aria-label=${`Rename ${f.name}`}
                  @click=${() => {
                    this.renaming = f;
                    this.nameDraft = f.name;
                    this.nameError = "";
                  }}
                >
                  ${this.icon("M13.5 3.5 16.5 6.5 7 16H4v-3z")}
                </button>
                <button
                  class="act danger"
                  type="button"
                  title="Delete"
                  aria-label=${`Delete ${f.name}`}
                  ?disabled=${this.files.length <= 1}
                  @click=${() => (this.deleting = f)}
                >
                  ${this.icon("M4 5.5h12M8 5.5V3.5h4v2M6 5.5 6.7 17h6.6L14 5.5")}
                </button>
              </li>
            `,
          )}
        </ul>

        <p class="hint">
          The extension picks the language.
          <strong>${TRACED_LIST.map((l) => l.extensions[0]).join(" ")}</strong>
          can be stepped through; ${RUN_LIST.length} more languages run and show
          output only. Imports between files are not supported yet.
        </p>
      </aside>
    `;
  }

  private renderBottom(traceable: boolean) {
    const trace = this.exec.trace;
    const step = Math.max(this.exec.step, 0);
    const lines = trace ? consoleUpTo(trace, step) : [];
    const steps = trace?.frames.length ?? 0;
    const tracedName = this.files.find((f) => f.id === this.tracedFileId)?.name;

    // An output-only language has no transcript to show, ever. Forcing the
    // Console tab beats leaving the reader on an empty pane wondering where
    // their output went.
    const tabId = traceable ? this.bottomTab : "console";

    const tab = (
      id: "transcript" | "console",
      label: string,
      count: number,
    ) => html`
      <button
        class="tab"
        type="button"
        role="tab"
        aria-selected=${tabId === id}
        @click=${() => (this.bottomTab = id)}
      >
        ${label}${count > 0 ? html`<span class="count">${count}</span>` : nothing}
      </button>
    `;

    return html`
      <div class="bottom">
        <header role="tablist">
          ${traceable ? tab("transcript", "Transcript", steps) : nothing}
          ${tab("console", "Console", lines.length)}
          <span class="spacer"></span>
          ${
            tracedName
              ? html`<span class="traced">traced: ${tracedName}</span>`
              : nothing
          }
          ${
            this.exec.note && this.exec.note !== this.exec.error
              ? html`<span class="notice" title=${this.exec.note}>notice</span>`
              : nothing
          }
        </header>

        ${
          tabId === "transcript"
            ? html`<cf-transcript
                .trace=${trace}
                .step=${this.exec.step}
                .source=${
                  this.files.find((f) => f.id === this.tracedFileId)?.content ??
                  ""
                }
                @cf-seek=${(e: CustomEvent) => this.controller.seek(e.detail.step)}
              ></cf-transcript>`
            : html`<div class="console">
                <ol aria-live="polite">
                  ${
                    lines.length === 0
                      ? html`<li class="empty">No output yet — press Run.</li>`
                      : lines.map(
                          (line) =>
                            html`<li class=${line.level}>${line.text}</li>`,
                        )
                  }
                </ol>
              </div>`
        }
      </div>
    `;
  }

  render() {
    if (this.loading) return html`<cf-splash></cf-splash>`;

    if (this.loadError || this.files.length === 0) {
      return html`
        <cf-app-bar heading="Project"></cf-app-bar>
        <div class="center">
          <h2>Could not open this project</h2>
          <p>${this.loadError || "This project has no files."}</p>
          <cf-button href="/dashboard">Back to dashboard</cf-button>
        </div>
      `;
    }

    const file = this.active;
    const frame =
      this.exec.trace && this.exec.step >= 0
        ? (this.exec.trace.frames[this.exec.step] ?? null)
        : null;

    // Two separate questions. "Is this the file that ran?" decides whether the
    // trace belongs to what you are looking at; "can it be traced?" decides
    // whether there are line numbers to paint at all. Conflating them told
    // people the trace came from another file while they were looking at it.
    const traceable = isTraceable(file?.name ?? "");
    const ranThisFile = file?.id === this.tracedFileId;
    const showLine = traceable && ranThisFile;
    const staleTrace =
      this.exec.trace !== null && this.tracedFileId !== "" && !ranThisFile;

    return html`
      <cf-app-bar heading=${this.projectName}>
        <span class=${`save ${this.saveState}`} aria-live="polite">
          <i></i>${this.saveLabel()}
        </span>
      </cf-app-bar>

      ${
        this.saveState === "failed"
          ? html`<div class="banner" role="alert">
              ${this.saveError}
              <cf-button
                variant="secondary"
                @click=${() => void this.save(this.activeId)}
              >
                Retry
              </cf-button>
            </div>`
          : nothing
      }
      ${
        this.exec.status === "error" && this.exec.error
          ? html`<div class="banner" role="alert">${this.exec.error}</div>`
          : nothing
      }
      ${
        staleTrace
          ? html`<div class="info-banner">
              The trace below is from
              <strong
                >${this.files.find((f) => f.id === this.tracedFileId)?.name}</strong
              >, not this file. Press Run to trace ${file?.name}.
            </div>`
          : nothing
      }
      ${
        this.engineError
          ? html`<div class="banner" role="alert">${this.engineError}</div>`
          : nothing
      }
      ${
        this.booting
          ? html`<div class="info-banner">
              Downloading the ${this.bootingLabel} runtime — this happens once
              per session and can take a few seconds.
            </div>`
          : nothing
      }
      ${
        // A note that merely restates the error is not worth a second banner.
        this.exec.note && this.exec.note !== this.exec.error
          ? html`<div class="info-banner">${this.exec.note}</div>`
          : nothing
      }

      <div class="tabs" role="tablist">
        <button
          role="tab"
          aria-selected=${this.mobilePanel === "code"}
          @click=${() => (this.mobilePanel = "code")}
        >
          Code
        </button>
        <button
          role="tab"
          aria-selected=${this.mobilePanel === "state"}
          @click=${() => (this.mobilePanel = "state")}
        >
          State
        </button>
      </div>

      <div class="stage">
        ${this.renderExplorer()}

        <div class="editor-col">
          <div class="tabstrip" role="tablist" aria-label="Open files">
            ${repeat(
              this.files,
              (f) => f.id,
              (f) => html`
                <button
                  type="button"
                  role="tab"
                  aria-selected=${f.id === this.activeId}
                  @click=${() => (this.activeId = f.id)}
                >
                  ${f.name}
                  ${
                    this.isDirty(f)
                      ? html`<i class="dot" title="Unsaved changes"></i>`
                      : nothing
                  }
                </button>
              `,
            )}
          </div>

          <cf-code-editor
            .language=${languageForFile(file?.name ?? "")?.id ?? "javascript"}
            .value=${file?.content ?? ""}
            .activeLine=${showLine ? (frame?.line ?? 0) : 0}
            @cf-change=${this.onCodeChange}
          ></cf-code-editor>
        </div>

        <aside class="rail">
          ${
            traceable
              ? html`<cf-trace-panels .frame=${frame}></cf-trace-panels>`
              : html`<p class="rail-empty">
                  ${languageForFile(file?.name ?? "")?.label ?? "This language"}
                  runs remotely, so there are no variables or call stack to
                  show. Output appears in the Console below.
                </p>`
          }
        </aside>
      </div>

      ${this.renderBottom(traceable)}

      <cf-exec-controls
        .traceable=${traceable}
        .status=${this.exec.status}
        .step=${this.exec.step}
        .totalSteps=${this.exec.totalSteps}
        .caption=${frame?.caption ?? ""}
        @cf-run=${() => void this.run()}
        @cf-pause=${() => this.controller.pause()}
        @cf-resume=${() => this.controller.resume()}
        @cf-stop=${() => this.controller.stop()}
        @cf-restart=${() => this.controller.restart()}
        @cf-step-forward=${() => this.controller.stepForward()}
        @cf-step-back=${() => this.controller.stepBackward()}
        @cf-seek=${(e: CustomEvent) => this.controller.seek(e.detail.step)}
      ></cf-exec-controls>

      <cf-dialog
        .open=${this.creating}
        heading="New file"
        confirm-label="Create"
        @cf-cancel=${() => (this.creating = false)}
        @cf-confirm=${this.confirmCreate}
      >
        <div class="field">
          <cf-input
            name="new-file-name"
            label="File name"
            placeholder="helpers.js"
            .value=${this.nameDraft}
            .error=${this.nameError}
            @cf-input=${(e: CustomEvent) => {
              this.nameDraft = e.detail.value;
              this.nameError = "";
            }}
          ></cf-input>
        </div>
      </cf-dialog>

      <cf-dialog
        .open=${this.renaming !== null}
        heading="Rename file"
        confirm-label="Save"
        @cf-cancel=${() => (this.renaming = null)}
        @cf-confirm=${this.confirmRename}
      >
        <div class="field">
          <cf-input
            name="file-name"
            label="File name"
            .value=${this.nameDraft}
            .error=${this.nameError}
            @cf-input=${(e: CustomEvent) => {
              this.nameDraft = e.detail.value;
              this.nameError = "";
            }}
          ></cf-input>
        </div>
      </cf-dialog>

      <cf-dialog
        .open=${this.deleting !== null}
        heading="Delete this file?"
        confirm-label="Delete"
        destructive
        @cf-cancel=${() => (this.deleting = null)}
        @cf-confirm=${this.confirmDelete}
      >
        <p>
          <strong>${this.deleting?.name}</strong> will be permanently removed.
          This cannot be undone.
        </p>
      </cf-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-workspace": CfWorkspace;
  }
}
