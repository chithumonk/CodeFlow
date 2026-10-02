import { describe, expect, it } from "vitest";
import { transform } from "sucrase";
import { instrument } from "./instrument";
import { runInstrumented } from "./runtime";
import { buildTrace } from "./trace";
import {
  ALL_EXTENSIONS,
  LANGUAGE_LIST,
  RUN_LIST,
  TRACED_LIST,
  isTraceable,
  languageForFile,
} from "./languages";
import { RUN_LANGUAGES } from "./run-languages";

const byId = (id: string) => LANGUAGE_LIST.find((l) => l.id === id);

describe("language registry", () => {
  it("maps extensions to languages", () => {
    expect(languageForFile("main.js")?.id).toBe("javascript");
    expect(languageForFile("app.ts")?.id).toBe("typescript");
    expect(languageForFile("script.py")?.id).toBe("python");
    expect(languageForFile("Main.java")?.id).toBe("java");
    expect(languageForFile("app.rb")?.id).toBe("ruby");
    expect(languageForFile("main.go")?.id).toBe("go");
  });

  it("is case-insensitive about extensions", () => {
    expect(languageForFile("MAIN.JS")?.id).toBe("javascript");
    expect(languageForFile("Script.PY")?.id).toBe("python");
    expect(languageForFile("Main.JAVA")?.id).toBe("java");
  });

  it("matches only the final extension", () => {
    // "archive.js.bak" is a .bak file, not JavaScript.
    expect(languageForFile("archive.js.bak")).toBeNull();
    expect(languageForFile("notes.txt")).toBeNull();
    expect(languageForFile("main")).toBeNull();
    expect(languageForFile(".hidden")).toBeNull();
  });

  it("supports more than twenty languages", () => {
    expect(LANGUAGE_LIST.length).toBeGreaterThan(20);
  });

  it("separates the two tiers", () => {
    expect(TRACED_LIST.every((l) => l.tier === "traced")).toBe(true);
    expect(RUN_LIST.every((l) => l.tier === "run")).toBe(true);
    expect(TRACED_LIST.length + RUN_LIST.length).toBe(LANGUAGE_LIST.length);
  });

  it("puts Ruby in the traced tier, not the run tier", () => {
    // ruby.wasm runs it in the browser with a real TracePoint trace. Listing
    // it in both tiers would shadow one extension and show Ruby twice in the
    // docs, so run-languages.ts must not carry an entry for it.
    expect(isTraceable("app.rb")).toBe(true);
    expect(byId("ruby")?.tier).toBe("traced");
    expect(RUN_LANGUAGES.some((l) => l.id === "ruby")).toBe(false);
  });

  it("never lists one id in both tiers", () => {
    const traced = new Set(TRACED_LIST.map((l) => l.id));
    const both = RUN_LIST.filter((l) => traced.has(l.id)).map((l) => l.id);
    expect(both).toEqual([]);
  });

  it("never lets two languages claim the same extension", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const language of LANGUAGE_LIST) {
      for (const ext of language.extensions) {
        const owner = seen.get(ext);
        if (owner) clashes.push(`${ext}: ${owner} vs ${language.id}`);
        else seen.set(ext, language.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("knows which files can be stepped through", () => {
    expect(isTraceable("main.js")).toBe(true);
    expect(isTraceable("app.ts")).toBe(true);
    expect(isTraceable("script.py")).toBe(true);
    expect(isTraceable("app.rb")).toBe(true);
    // Java runs remotely but is still stepped: the server instruments the
    // source before compiling it, so a trace comes back with the output.
    expect(isTraceable("Main.java")).toBe(true);
    // The rest report output only.
    expect(isTraceable("main.go")).toBe(false);
    expect(isTraceable("main.rs")).toBe(false);
    expect(isTraceable("unknown.xyz")).toBe(false);
  });

  it("never assigns one extension to two languages", () => {
    const seen = new Map<string, string>();
    for (const language of LANGUAGE_LIST) {
      for (const ext of language.extensions) {
        const owner = seen.get(ext);
        // A duplicate would make file typing depend on list order.
        expect(
          owner,
          `${ext} claimed by ${owner} and ${language.id}`,
        ).toBeUndefined();
        seen.set(ext, language.id);
      }
    }
  });

  it("gives every language a usable sample under its own extension", () => {
    for (const language of LANGUAGE_LIST) {
      expect(language.sample.trim().length, language.id).toBeGreaterThan(0);
      const ext = language.extensions[0]!;
      expect(languageForFile(`sample${ext}`)?.id).toBe(language.id);
    }
  });

  it("gives every remote language an id and version", () => {
    // No provider name here on purpose: which service runs a language, and
    // what that service calls it, is the server's business. The browser sends
    // CodeFlow's own id.
    for (const spec of RUN_LANGUAGES) {
      expect(spec.id.trim().length, spec.id).toBeGreaterThan(0);
      expect(spec.version.trim().length, spec.id).toBeGreaterThan(0);
    }
  });

  it("flags the languages whose runtime is a large download", () => {
    // These two fetch a multi-megabyte WebAssembly runtime on first use, and
    // the workspace shows a banner so it does not look like a hang.
    expect(byId("python")?.heavyRuntime).toBe(true);
    expect(byId("ruby")?.heavyRuntime).toBe(true);
    // These are already in the bundle.
    expect(byId("javascript")?.heavyRuntime).toBeFalsy();
    expect(byId("typescript")?.heavyRuntime).toBeFalsy();
    // And a remote language downloads nothing at all.
    expect(byId("java")?.heavyRuntime).toBeFalsy();
  });

  it("exposes every extension for validation messages", () => {
    expect(ALL_EXTENSIONS).toContain(".js");
    expect(ALL_EXTENSIONS).toContain(".java");
    expect(ALL_EXTENSIONS.length).toBe(
      LANGUAGE_LIST.reduce((n, l) => n + l.extensions.length, 0),
    );
  });
});

/**
 * TypeScript is traced by stripping types and reusing the JavaScript
 * pipeline. That only works if the transform never moves a line — every
 * highlight and transcript row is a line number into the user's own file.
 */
describe("typescript", () => {
  const strip = (source: string) =>
    transform(source, {
      transforms: ["typescript"],
      disableESTransforms: true,
      preserveDynamicImport: true,
    }).code;

  const traceTs = (source: string) =>
    buildTrace(runInstrumented(instrument(strip(source))).events);

  it("preserves line numbers when stripping types", () => {
    const source = byId("typescript")!.sample;
    expect(strip(source).split("\n").length).toBe(source.split("\n").length);
  });

  it("keeps every statement on its original line", () => {
    const source = `interface A {\n  x: number;\n}\n\nconst v: A = { x: 1 };\nconsole.log(v.x);\n`;
    const out = strip(source).split("\n");
    expect(out[4]).toContain("const v = { x: 1 }");
    expect(out[5]).toContain("console.log(v.x)");
  });

  it("traces the sample and reports the right answer", () => {
    const trace = traceTs(byId("typescript")!.sample);
    expect(trace.error).toBeUndefined();
    // 3-4-5 triangle.
    expect(trace.console.at(-1)?.text).toContain("5");
  });

  it("reports a TypeScript function's calls and returns", () => {
    const trace = traceTs(`function double(n: number): number {
  return n * 2;
}

const out: number = double(21);
console.log(out);
`);
    expect(trace.frames.some((f) => f.stack.includes("double"))).toBe(true);
    expect(trace.frames.map((f) => f.returned).filter(Boolean)).toContain("42");
    expect(trace.console.at(-1)?.text).toBe("42");
  });

  it("highlights lines that exist in the original source", () => {
    const source = byId("typescript")!.sample;
    const total = source.split("\n").length;
    for (const frame of traceTs(source).frames) {
      expect(frame.line).toBeGreaterThan(0);
      expect(frame.line).toBeLessThanOrEqual(total);
    }
  });
});
