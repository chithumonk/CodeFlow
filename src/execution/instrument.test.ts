import { describe, expect, it } from "vitest";
import { parse } from "acorn";
import { instrument, InstrumentError } from "./instrument";
import { runInstrumented } from "./runtime";
import { buildTrace } from "./trace";
import type { Trace } from "./trace";

/** Instrument, execute, and fold — the whole pipeline the workspace uses. */
function trace(source: string): Trace {
  const { events } = runInstrumented(instrument(source));
  return buildTrace(events);
}

/** The exact program that prompted building a real engine. */
const FACTORIAL = `function factorial(n) {
  // 1. Edge case handling (Prevent infinite loops from negative numbers)
  if (n < 0) {
    throw new Error("Factorial is not defined for negative numbers.");
  }

  // 2. Base case: 0! and 1! are always 1
  if (n === 0 || n === 1) {
    return 1;
  }

  // 3. Recursive case: n * (n - 1)!
  return n * factorial(n - 1);
}

console.log(factorial(5)); // Output: 120
`;

describe("instrument", () => {
  it("produces code that still parses", () => {
    expect(() =>
      parse(instrument(FACTORIAL), { ecmaVersion: 2022 }),
    ).not.toThrow();
  });

  it("reports a syntax error with its line instead of throwing raw", () => {
    try {
      instrument("function broken( {\n");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InstrumentError);
      expect((error as InstrumentError).line).toBeGreaterThan(0);
    }
  });

  it("does not change what the program computes", () => {
    const { events } = runInstrumented(
      instrument(
        "let total = 0;\nfor (const n of [1,2,3]) { total += n; }\nconsole.log(total);",
      ),
    );
    const out = events.find((e) => e.type === "console_output");
    expect(out && "text" in out ? out.text : null).toBe("6");
  });
});

describe("factorial, end to end", () => {
  it("computes the right answer and says so on the console", () => {
    const t = trace(FACTORIAL);
    expect(t.error).toBeUndefined();
    expect(t.console.map((c) => c.text)).toContain("120");
  });

  it("records the recursive call stack getting deeper", () => {
    const t = trace(FACTORIAL);
    const deepest = Math.max(...t.frames.map((f) => f.stack.length));

    // global + factorial(5,4,3,2,1) = 6 frames at the deepest point.
    expect(deepest).toBe(6);
    const atDeepest = t.frames.find((f) => f.stack.length === deepest)!;
    expect(atDeepest.stack.filter((s) => s === "factorial")).toHaveLength(5);
  });

  it("tracks n changing on the way down", () => {
    const t = trace(FACTORIAL);
    const values = new Set(
      t.frames
        .map((f) => f.vars.find((v) => v.name === "n")?.value)
        .filter(Boolean),
    );
    // Every level of the recursion is visible.
    for (const n of ["5", "4", "3", "2", "1"]) expect(values).toContain(n);
  });

  it("reports each return value as the recursion unwinds", () => {
    const t = trace(FACTORIAL);
    const returned = t.frames.map((f) => f.returned).filter(Boolean);
    // 1, 2, 6, 24, 120
    expect(returned).toEqual(
      expect.arrayContaining(["1", "2", "6", "24", "120"]),
    );
  });

  it("highlights real lines of the submitted source", () => {
    const lines = new Set(trace(FACTORIAL).frames.map((f) => f.line));
    const total = FACTORIAL.split("\n").length;
    for (const line of lines) {
      expect(line).toBeGreaterThan(0);
      expect(line).toBeLessThanOrEqual(total);
    }
    // The recursive-case line is genuinely executed.
    expect(lines).toContain(13);
  });
});

describe("error handling", () => {
  it("surfaces a thrown error with the line it happened on", () => {
    const t = trace(`${FACTORIAL}\nfactorial(-1);\n`);
    expect(t.error?.message).toMatch(/not defined for negative numbers/);
    expect(t.error?.line).toBeGreaterThan(0);
  });

  it("surfaces a runtime error from undefined variables", () => {
    const t = trace("const a = 1;\nconsole.log(b);\n");
    expect(t.error?.message).toMatch(/ReferenceError/);
  });

  it("stops an infinite loop instead of hanging", () => {
    const { events, truncated } = runInstrumented(
      instrument("let i = 0;\nwhile (true) { i++; }\n"),
    );
    expect(truncated).toBe(true);
    const err = events.find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toMatch(
      /infinite loop|too long/i,
    );
  });

  it("stops runaway recursion instead of blowing the stack", () => {
    const { events } = runInstrumented(
      instrument("function f(n) { return f(n + 1); }\nf(0);\n"),
    );
    const err = events.find((e) => e.type === "error");
    expect(err && "message" in err ? err.message : "").toMatch(
      /recursion|stack/i,
    );
  });
});

describe("language coverage", () => {
  it("handles loops, objects and array methods", () => {
    const t = trace(`const items = [3, 1, 2];
const sorted = items.slice().sort((a, b) => a - b);
let sum = 0;
for (let i = 0; i < sorted.length; i++) {
  sum += sorted[i];
}
const summary = { sum, count: sorted.length };
console.log(summary);
`);

    expect(t.error).toBeUndefined();
    const last = t.frames.at(-1)!;
    expect(last.vars.find((v) => v.name === "sum")?.value).toBe("6");
    expect(t.console.at(-1)?.text).toContain("sum: 6");
  });

  it("counts loop iterations", () => {
    const t = trace("for (const x of [1,2,3]) { const y = x; }\n");
    expect(Math.max(...t.frames.map((f) => f.iteration ?? 0))).toBe(3);
  });

  it("handles an empty program", () => {
    expect(trace("").frames).toEqual([]);
  });
});
