import { describe, expect, it } from "vitest";
import { MAX_LINES, summarize } from "./summarize";
import type { Trace, TraceFrame } from "../execution/trace";

const frame = (over: Partial<TraceFrame> = {}): TraceFrame => ({
  line: 1,
  stack: ["global"],
  vars: [],
  node: "body",
  caption: "",
  ...over,
});

const v = (name: string, value: string, changed = false) => ({
  name,
  value,
  changed,
});

/** The sum-a-list run the visualizer is usually looking at. */
const sumTrace = (): Trace => ({
  frames: [
    frame({ line: 8, node: "call" }),
    frame({ line: 1, node: "call", stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]")] }),
    frame({ line: 2, node: "init", stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]"), v("sum", "0", true)] }),
    frame({ line: 4, iteration: 1, stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]"), v("sum", "10", true), v("n", "10")] }),
    frame({ line: 4, iteration: 2, stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]"), v("sum", "30", true), v("n", "20")] }),
    frame({ line: 4, iteration: 3, stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]"), v("sum", "60", true), v("n", "30")] }),
    frame({ line: 4, iteration: 4, stack: ["global", "total"], vars: [v("nums", "[10, 20, 30, 40]"), v("sum", "100", true), v("n", "40")] }),
    frame({ line: 6, node: "return", stack: ["global", "total"], returned: "100", vars: [v("sum", "100")] }),
  ],
  console: [{ level: "log", text: "100", step: 7 }],
});

const kinds = (t: Trace) => summarize(t).map((l) => l.kind);
const byKind = (t: Trace) =>
  Object.fromEntries(summarize(t).map((l) => [l.kind, l.text]));

describe("summarize", () => {
  it("says what problem was solved and how, and nothing else", () => {
    const lines = summarize(sumTrace());
    expect(lines.map((l) => l.text)).toEqual([
      "Adds up the numbers in a list.",
      "total([10, 20, 30, 40]) → 100",
      "Walks nums (4 items) and folds it into sum.",
      "Took 8 steps.",
    ]);
  });

  it("stays within the cap", () => {
    expect(summarize(sumTrace()).length).toBeLessThanOrEqual(MAX_LINES);
  });

  it("leaves out the mechanics that buried the point", () => {
    // Line counts, frame depth, unreached lines and per-variable update
    // counts were all noise. A bare step count survives as the last line.
    const text = summarize(sumTrace())
      .map((l) => l.text)
      .join(" ");
    expect(text).not.toMatch(/lines of code/i);
    expect(text).not.toMatch(/frames? deep/i);
    expect(text).not.toMatch(/never ran/i);
    expect(text).not.toMatch(/updates?\b/i);
    expect(text).not.toMatch(/started from/i);
  });

  it("does not repeat the answer the evidence line already showed", () => {
    // Evidence reads "total([...]) → 100"; an output line saying Printed
    // "100" and an inputs line repeating the list would be the same fact
    // three times over.
    expect(kinds(sumTrace())).not.toContain("output");
    expect(kinds(sumTrace())).not.toContain("inputs");
  });

  it("falls back to the how line when no problem can be proven", () => {
    const t = sumTrace();
    t.frames[t.frames.length - 1].returned = "999";
    t.console = [];
    expect(summarize(t)[0].text).toBe(
      "Walks nums (4 items) and folds it into sum.",
    );
    expect(kinds(t)).not.toContain("problem");
    // With no problem to show, the behaviour lines earn their place.
    expect(kinds(t)).toContain("inputs");
    expect(kinds(t)).toContain("steps");
  });

  it("describes a walk with no accumulator", () => {
    const t: Trace = {
      frames: [
        frame({ iteration: 1, vars: [v("xs", "[1, 2, 3]")] }),
        frame({ iteration: 2, vars: [v("xs", "[1, 2, 3]")] }),
      ],
      console: [],
    };
    expect(byKind(t).shape).toBe("Walks xs (3 items) one at a time.");
  });

  it("counts a string walk in characters", () => {
    const t: Trace = {
      frames: [
        frame({ iteration: 1, vars: [v("s", "'abc'")] }),
        frame({ iteration: 2, vars: [v("s", "'abc'")] }),
      ],
      console: [],
    };
    expect(byKind(t).shape).toBe("Walks s (3 characters) one at a time.");
  });

  it("describes a run with no loop as straight-through", () => {
    const t: Trace = {
      frames: [
        frame({ stack: ["global", "greet"] }),
        frame({ stack: ["global", "greet"] }),
      ],
      console: [],
    };
    expect(byKind(t).shape).toBe("Runs straight through, calling greet.");
  });

  it("reports a loop with no named collection", () => {
    const t: Trace = {
      frames: [frame({ iteration: 1 }), frame({ iteration: 3 })],
      console: [],
    };
    expect(byKind(t).shape).toBe("Loops 3 times.");
  });

  it("replaces the problem with the error when the run threw", () => {
    const t = sumTrace();
    t.error = { message: "nums is not iterable", line: 3 };
    const got = byKind(t);
    expect(got.error).toBe("Stopped on line 3: nums is not iterable");
    // A run that threw solved nothing, so no problem is claimed.
    expect(got.problem).toBeUndefined();
    expect(got.shape).toBeDefined();
  });

  it("handles an error with no line", () => {
    const t = sumTrace();
    t.error = { message: "out of memory" };
    expect(byKind(t).error).toBe("Stopped with an error: out of memory");
  });

  it("flags a weak example rather than guessing between ties", () => {
    const t: Trace = {
      frames: [
        frame({ stack: ["global", "f"], vars: [v("xs", "[1, 2, 3]")] }),
        frame({ stack: ["global", "f"], returned: "3" }),
      ],
      console: [],
    };
    const got = byKind(t);
    expect(got.problem).toBeDefined();
    expect(got.ambiguous).toMatch(/also fits/i);
  });

  it("says nothing about ties when the example is sharp", () => {
    const t: Trace = {
      frames: [
        frame({ stack: ["global", "f"], vars: [v("xs", "[5, 9, 1]")] }),
        frame({ stack: ["global", "f"], returned: "9" }),
      ],
      console: [],
    };
    const got = byKind(t);
    expect(got.problem).toBe("Finds the largest number in a list.");
    expect(got.ambiguous).toBeUndefined();
  });

  it("returns nothing for an empty trace", () => {
    expect(summarize({ frames: [], console: [] })).toEqual([]);
  });

  it("does not name the loop cursor as the accumulator", () => {
    // n only ever holds an element of nums, so it is a position.
    expect(byKind(sumTrace()).shape).not.toMatch(/into n\b/);
  });
});

describe("functions with no name of their own", () => {
  it("never reads a placeholder frame out as a function name", () => {
    // Regression: a class method traced as "(anonymous)" produced the
    // useless line "Runs straight through, calling (anonymous)."
    const t: Trace = {
      frames: [
        frame({ stack: ["global", "(anonymous)"] }),
        frame({ stack: ["global", "(arrow)"] }),
      ],
      console: [],
    };
    const text = byKind(t).shape;
    expect(text).not.toMatch(/anonymous|arrow/);
    expect(text).toBe("Runs straight through, 2 steps in all.");
  });

  it("names real functions alongside placeholders", () => {
    const t: Trace = {
      frames: [
        frame({ stack: ["global", "BrowserHistory.visit"] }),
        frame({ stack: ["global", "(arrow)"] }),
      ],
      console: [],
    };
    // The point is that "(arrow)" is dropped, not how the rest is phrased.
    expect(byKind(t).shape).toBe("Calls visit on BrowserHistory.");
    expect(byKind(t).shape).not.toMatch(/arrow/);
  });

  it("caps a long list of functions", () => {
    const t: Trace = {
      frames: ["a", "b", "c", "d", "e"].map((n) =>
        frame({ stack: ["global", n] }),
      ),
      console: [],
    };
    expect(byKind(t).shape).toBe(
      "Runs straight through, calling a, b and c and 2 more.",
    );
  });
});

describe("class-based programs", () => {
  const withFrames = (names: string[]): Trace => ({
    frames: names.map((n) => frame({ stack: ["global", n] })),
    console: [],
  });

  it("reads a single-class run as the object it drives", () => {
    // Regression: this used to read "calling new BrowserHistory,
    // BrowserHistory.visit and BrowserHistory.currentPage and 1 more".
    expect(
      byKind(
        withFrames([
          "new BrowserHistory",
          "BrowserHistory.visit",
          "BrowserHistory.currentPage",
          "BrowserHistory.back",
        ]),
      ).shape,
    ).toBe(
      "Builds a BrowserHistory and calls visit, currentPage and back on it.",
    );
  });

  it("omits the constructor when the object was not built in the trace", () => {
    expect(byKind(withFrames(["Stack.push", "Stack.pop"])).shape).toBe(
      "Calls push and pop on Stack.",
    );
  });

  it("handles a class that is only constructed", () => {
    expect(byKind(withFrames(["new Empty"])).shape).toBe("Builds a Empty.");
  });

  it("falls back to a plain list when more than one class is involved", () => {
    expect(byKind(withFrames(["A.one", "B.two"])).shape).toMatch(
      /^Runs straight through, calling/,
    );
  });

  it("falls back when plain functions are mixed in", () => {
    expect(byKind(withFrames(["Stack.push", "helper"])).shape).toMatch(
      /^Runs straight through, calling/,
    );
  });

  it("counts the remainder rather than listing every method", () => {
    expect(
      byKind(
        withFrames(
          ["a", "b", "c", "d", "e", "f"].map((m) => `Big.${m}`),
        ),
      ).shape,
    ).toBe("Calls a, b, c and d and 2 more on Big.");
  });
});

describe("behaviour of a program that computes no single answer", () => {
  /** Three visits, two backs, three currentPage calls — the class program. */
  const driven = (): Trace => {
    const f = (depth: number, name: string, vars: ReturnType<typeof v>[] = []) =>
      frame({ stack: depth === 1 ? ["global"] : ["global", name], vars });

    return {
      frames: [
        f(1, ""),
        f(2, "new BrowserHistory"),
        f(1, "", [v("browser", "{ stack: Array(0) }")]),
        f(2, "BrowserHistory.visit", [v("browser", "{ stack: Array(0) }"), v("page", '"google.com"')]),
        f(1, "", [v("browser", "{ stack: Array(0) }"), v("page", '"google.com"')]),
        f(2, "BrowserHistory.visit", [v("browser", "{ stack: Array(0) }"), v("page", '"github.com"')]),
        f(1, "", [v("browser", "{ stack: Array(0) }"), v("page", '"github.com"')]),
        f(2, "BrowserHistory.visit", [v("browser", "{ stack: Array(0) }"), v("page", '"stack.com"')]),
        f(1, "", [v("browser", "{ stack: Array(0) }"), v("page", '"stack.com"')]),
        f(2, "BrowserHistory.back"),
        f(1, ""),
        f(2, "BrowserHistory.back"),
        f(1, ""),
      ],
      console: [
        { level: "log", text: "Visited: google.com", step: 3 },
        { level: "log", text: "Back to: github.com", step: 9 },
        { level: "log", text: "Current page: google.com", step: 12 },
      ],
    };
  };

  it("gives at least five lines when there is no problem to name", () => {
    // One line was not a summary. This is the case that prompted the change.
    const lines = summarize(driven());
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
  });

  it("counts calls rather than frames", () => {
    // visit contributes several frames per call; it was called three times.
    expect(byKind(driven()).calls).toBe("Ran visit 3 times and back twice.");
  });

  it("leaves the constructor out of the call counts", () => {
    // "Builds a BrowserHistory" already says it ran, once, by definition.
    expect(byKind(driven()).calls).not.toMatch(/constructor/);
  });

  it("reports every argument, not just the first call's", () => {
    // Regression: buildTrace keeps one flat variable map and never drops a
    // function's locals, so the caller still holds `page` from the previous
    // call. Comparing names alone found only "google.com".
    expect(byKind(driven()).inputs).toBe(
      'Called with "google.com", "github.com" and "stack.com".',
    );
  });

  it("does not mistake the receiver for an argument", () => {
    // `browser` is in scope at every call but is never an argument.
    expect(byKind(driven()).inputs).not.toMatch(/stack: Array/);
  });

  it("reports what was printed, with the last line", () => {
    expect(byKind(driven()).output).toBe(
      'Printed 3 lines, ending with "Current page: google.com".',
    );
  });

  it("quotes a single printed line rather than counting it", () => {
    const t = driven();
    t.console = [{ level: "log", text: "only", step: 1 }];
    expect(byKind(t).output).toBe('Printed "only".');
  });

  it("suppresses the call line when one function ran once", () => {
    const t: Trace = {
      frames: [frame({ stack: ["global"] }), frame({ stack: ["global", "once"] })],
      console: [],
    };
    expect(byKind(t).calls).toBeUndefined();
  });
});
