import { LitElement, css, html } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  EditorView,
  Decoration,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  indentUnit,
  bracketMatching,
} from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { Compartment } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import {
  c,
  cpp,
  csharp,
  dart,
  java,
  kotlin,
  objectiveC,
  scala,
} from "@codemirror/legacy-modes/mode/clike";
import { go } from "@codemirror/legacy-modes/mode/go";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { sqlite as sqliteMode } from "@codemirror/legacy-modes/mode/sql";
import { r } from "@codemirror/legacy-modes/mode/r";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { erlang } from "@codemirror/legacy-modes/mode/erlang";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { commonLisp } from "@codemirror/legacy-modes/mode/commonlisp";
import { scheme } from "@codemirror/legacy-modes/mode/scheme";
import { crystal } from "@codemirror/legacy-modes/mode/crystal";
import { fortran } from "@codemirror/legacy-modes/mode/fortran";
import { cobol } from "@codemirror/legacy-modes/mode/cobol";
import { pascal } from "@codemirror/legacy-modes/mode/pascal";
import { groovy } from "@codemirror/legacy-modes/mode/groovy";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { oCaml } from "@codemirror/legacy-modes/mode/mllike";
import { octave } from "@codemirror/legacy-modes/mode/octave";
import { coffeeScript } from "@codemirror/legacy-modes/mode/coffeescript";
import { forth } from "@codemirror/legacy-modes/mode/forth";
import { smalltalk } from "@codemirror/legacy-modes/mode/smalltalk";
import { vb } from "@codemirror/legacy-modes/mode/vb";
import { brainfuck } from "@codemirror/legacy-modes/mode/brainfuck";

/**
 * Stream modes for languages without a dedicated Lezer parser.
 *
 * Keyed by the ids in execution/languages.ts. A language absent from here
 * still edits and runs perfectly well — it just renders unhighlighted, which
 * is better than guessing at the wrong grammar.
 */
const STREAM_MODES: Record<string, Parameters<typeof StreamLanguage.define>[0]> =
  {
    ruby,
    java,
    c,
    cpp,
    csharp,
    kotlin,
    scala,
    dart,
    "objective-c": objectiveC,
    go,
    rust,
    swift,
    lua,
    perl,
    bash: shell,
    sqlite: sqliteMode,
    r,
    haskell,
    erlang,
    // Elixir has no mode of its own; Erlang is the closest relative and gets
    // strings, numbers and comments right.
    elixir: erlang,
    clojure,
    lisp: commonLisp,
    racket: scheme,
    crystal,
    fortran,
    cobol,
    pascal,
    // Nim, Zig, V and Raku have no modes; they stay plain rather than wrong.
    groovy,
    julia,
    powershell: powerShell,
    ocaml: oCaml,
    octave,
    awk: shell,
    coffeescript: coffeeScript,
    basic: vb,
    forth,
    smalltalk,
    brainfuck,
  };
import { tags as t } from "@lezer/highlight";

/**
 * CodeMirror 6, wrapped as a Lit element.
 *
 * A real editor rather than a styled textarea: the product is about reading
 * code closely, so selection, undo, bracket matching and gutter behaviour all
 * have to be the genuine article.
 */

/** Moves the execution highlight. */
const setActiveLine = StateEffect.define<number>();

const activeLineHighlight = Decoration.line({ class: "cm-cf-exec-line" });

/**
 * Tracks which line the trace is currently on. Kept as editor state rather
 * than a DOM class so it survives document changes and scrolling.
 */
const execLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);

    for (const effect of tr.effects) {
      if (!effect.is(setActiveLine)) continue;

      const line = effect.value;
      if (line < 1 || line > tr.state.doc.lines) {
        next = Decoration.none;
      } else {
        const from = tr.state.doc.line(line).from;
        next = Decoration.set([activeLineHighlight.range(from)]);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Syntax colours mapped onto the CodeFlow token palette. */
const codeflowHighlight = HighlightStyle.define([
  { tag: [t.comment], color: "var(--cf-text-faint)", fontStyle: "italic" },
  { tag: [t.string, t.special(t.string)], color: "var(--cf-green)" },
  { tag: [t.number, t.bool, t.null], color: "var(--cf-yellow)" },
  { tag: [t.keyword, t.modifier], color: "var(--cf-violet)" },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--cf-blue)" },
  { tag: [t.definition(t.variableName)], color: "var(--cf-text)" },
  { tag: [t.propertyName], color: "var(--cf-blue)" },
  { tag: [t.operator, t.operatorKeyword], color: "var(--cf-teal)" },
  { tag: [t.typeName, t.className], color: "var(--cf-rose)" },
  { tag: [t.punctuation, t.separator], color: "var(--cf-text-muted)" },
  { tag: [t.variableName], color: "var(--cf-text)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--cf-text)",
    backgroundColor: "transparent",
    fontSize: "0.8125rem",
  },
  ".cm-scroller": {
    fontFamily: "var(--cf-font-mono)",
    lineHeight: "1.7",
  },
  ".cm-content": { padding: "0.75rem 0" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--cf-text-faint)",
    border: "none",
    paddingRight: "0.5rem",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--cf-text-dim)",
  },
  ".cm-activeLine": { backgroundColor: "rgba(127,127,127,0.06)" },
  ".cm-cursor": { borderLeftColor: "var(--cf-accent)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--cf-accent-soft)" },
  ".cm-matchingBracket": {
    outline: "1px solid var(--cf-line-bright)",
    backgroundColor: "transparent",
  },
  // The execution pointer. Deliberately the same amber as the landing-page
  // trace player, so the two read as the same idea.
  ".cm-cf-exec-line": {
    backgroundColor: "var(--cf-accent-soft)",
    boxShadow: "inset 2px 0 0 var(--cf-accent)",
  },
});

@customElement("cf-code-editor")
export class CfCodeEditor extends LitElement {
  @property({ type: String }) value = "";
  /** Drives syntax highlighting: "javascript", "typescript" or "python". */
  @property({ type: String }) language = "javascript";
  /** 1-based line to highlight as executing; 0 clears it. */
  @property({ type: Number }) activeLine = 0;
  @property({ type: Boolean }) readonly = false;

  @query(".host") private hostEl?: HTMLElement;

  private view?: EditorView;
  /**
   * Swapping the parser has to be reconfigurable rather than a rebuild —
   * recreating the editor on a tab change would lose the caret and history.
   */
  private languageConf = new Compartment();
  /** Guards against echoing our own change back into the editor. */
  private applyingExternal = false;

  static styles = css`
    :host {
      display: block;
      min-height: 0;
      height: 100%;
    }

    .host {
      height: 100%;
      overflow: hidden;
    }

    .cm-editor {
      height: 100%;
    }
  `;

  firstUpdated() {
    if (!this.hostEl) return;

    this.view = new EditorView({
      parent: this.hostEl,
      state: EditorState.create({
        doc: this.value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          bracketMatching(),
          indentUnit.of("  "),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          this.languageConf.of(this.languageExtension()),
          syntaxHighlighting(codeflowHighlight),
          execLineField,
          editorTheme,
          EditorView.lineWrapping,
          EditorState.readOnly.of(this.readonly),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || this.applyingExternal) return;

            this.value = update.state.doc.toString();
            this.dispatchEvent(
              new CustomEvent("cf-change", {
                detail: { value: this.value },
                bubbles: true,
                composed: true,
              }),
            );
          }),
        ],
      }),
    });
  }

  /** The CodeMirror parser for the current language. */
  private languageExtension() {
    if (this.language === "python") return python();

    const mode = STREAM_MODES[this.language];
    if (mode) return StreamLanguage.define(mode);

    // One parser covers both: TypeScript is JavaScript plus type syntax.
    return javascript({ typescript: this.language === "typescript" });
  }

  updated(changed: Map<string, unknown>) {
    const view = this.view;
    if (!view) return;

    if (changed.has("language")) {
      view.dispatch({
        effects: this.languageConf.reconfigure(this.languageExtension()),
      });
    }

    // Only replace the document when the value genuinely diverged, so the
    // caret and undo history survive ordinary typing.
    if (changed.has("value") && this.value !== view.state.doc.toString()) {
      this.applyingExternal = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: this.value },
      });
      this.applyingExternal = false;
    }

    if (changed.has("activeLine")) {
      view.dispatch({ effects: setActiveLine.of(this.activeLine) });
      this.revealActiveLine();
    }
  }

  /** Keep the executing line on screen while a trace plays. */
  private revealActiveLine() {
    const view = this.view;
    if (
      !view ||
      this.activeLine < 1 ||
      this.activeLine > view.state.doc.lines
    ) {
      return;
    }
    const pos = view.state.doc.line(this.activeLine).from;
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  }

  focusEditor() {
    this.view?.focus();
  }

  disconnectedCallback() {
    this.view?.destroy();
    this.view = undefined;
    super.disconnectedCallback();
  }

  render() {
    return html`<div class="host"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cf-code-editor": CfCodeEditor;
  }
}
