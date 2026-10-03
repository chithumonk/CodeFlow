import { describe, expect, it } from "vitest";
import { identify, observe } from "./identify";
import type { Trace, TraceFrame } from "../execution/trace";

/**
 * Each case is a whole run reduced to what identification actually reads: the
 * arguments the function was entered with, and the value it produced.
 */
function run(
  fn: string,
  args: Array<[string, string]>,
  output: string,
  opts: { printed?: boolean } = {},
): Trace {
  const frame = (over: Partial<TraceFrame>): TraceFrame => ({
    line: 1,
    stack: ["global", fn],
    vars: [],
    node: "body",
    caption: "",
    ...over,
  });

  return {
    frames: [
      frame({ vars: args.map(([name, value]) => ({ name, value })) }),
      frame(opts.printed ? {} : { returned: output }),
    ],
    console: opts.printed ? [{ level: "log", text: output, step: 1 }] : [],
  };
}

const problem = (t: Trace) => identify(t)?.statement;

describe("identify", () => {
  it("names summing a list, and shows the evidence", () => {
    const got = identify(run("total", [["nums", "[10, 20, 30, 40]"]], "100"));
    expect(got?.statement).toBe("Adds up the numbers in a list.");
    expect(got?.evidence).toBe("total([10, 20, 30, 40]) → 100");
  });

  it("refuses to name a problem the numbers do not support", () => {
    // 99 is not the sum, the max, the count or anything else in the catalogue.
    expect(identify(run("total", [["nums", "[10, 20, 30, 40]"]], "99"))).toBeNull();
  });

  it("reads the answer from printed output when nothing was returned", () => {
    const got = identify(
      run("total", [["nums", "[1, 2, 3]"]], "6", { printed: true }),
    );
    expect(got?.statement).toBe("Adds up the numbers in a list.");
  });

  it("names list problems from the input and output alone", () => {
    expect(problem(run("f", [["xs", "[3, 1, 2]"]], "[1, 2, 3]"))).toBe(
      "Sorts a list into ascending order.",
    );
    expect(problem(run("f", [["xs", "[1, 2, 3]"]], "[3, 2, 1]"))).toBe(
      "Sorts a list into descending order.",
    );
    expect(problem(run("f", [["xs", "[1, 1, 2, 3]"]], "[1, 2, 3]"))).toBe(
      "Removes duplicate values from a list.",
    );
    expect(problem(run("f", [["xs", "[1, 2, 3, 4]"]], "[2, 4]"))).toBe(
      "Keeps only the even numbers in a list.",
    );
    expect(problem(run("f", [["xs", "[1, 2, 3]"]], "[2, 4, 6]"))).toBe(
      "Doubles every number in a list.",
    );
    expect(problem(run("f", [["xs", "[1, 2, 3, 4]"]], "[1, 3, 6, 10]"))).toBe(
      "Builds a running total of a list.",
    );
    expect(problem(run("f", [["xs", "[4, 8, 15]"]], "480"))).toBe(
      "Multiplies the numbers in a list together.",
    );
  });

  it("separates sorting from reversing when the input allows it", () => {
    // [3, 1, 2] reversed is [2, 1, 3], which is not the sorted order.
    expect(problem(run("f", [["xs", "[3, 1, 2]"]], "[2, 1, 3]"))).toBe(
      "Reverses the order of a list.",
    );
  });

  it("names string problems", () => {
    expect(problem(run("f", [["s", "'abc'"]], "'cba'"))).toBe(
      "Reverses a string.",
    );
    expect(problem(run("f", [["s", "'abc'"]], "'ABC'"))).toBe(
      "Converts a string to upper case.",
    );
    expect(problem(run("f", [["s", "'ABC'"]], "'abc'"))).toBe(
      "Converts a string to lower case.",
    );
    // 'cab' reversed is 'bac', so only sorting explains 'abc'. ('cba' would
    // be a tie: reversing and sorting it give the same answer.)
    expect(problem(run("f", [["s", "'cab'"]], "'abc'"))).toBe(
      "Sorts the characters of a string.",
    );
    expect(problem(run("f", [["s", "'abca'"]], "'abca'"))).toBe(
      "Rebuilds a string character by character.",
    );
  });

  it("names the first-non-repeating-character problem", () => {
    // The question that started this: 'leetcode' -> 0, 'loveleetcode' -> 2.
    expect(problem(run("firstUniq", [["s", "'leetcode'"]], "0"))).toBe(
      "Finds the index of the first non-repeating character in a string.",
    );
    expect(problem(run("firstUniq", [["s", "'loveleetcode'"]], "2"))).toBe(
      "Finds the index of the first non-repeating character in a string.",
    );
  });

  it("names a no-such-character answer of -1", () => {
    expect(problem(run("firstUniq", [["s", "'aabb'"]], "-1"))).toBe(
      "Finds the index of the first non-repeating character in a string.",
    );
  });

  it("names boolean problems", () => {
    expect(problem(run("f", [["s", "'racecar'"]], "true"))).toBe(
      "Checks whether a string reads the same backwards.",
    );
    expect(problem(run("f", [["s", "'abc'"]], "false"))).toBe(
      "Checks whether a string reads the same backwards.",
    );
    expect(
      problem(run("f", [["a", "'listen'"], ["b", "'silent'"]], "true")),
    ).toBe("Checks whether two strings are anagrams.");
    expect(problem(run("f", [["n", "7"]], "true"))).toBe(
      "Checks whether a number is prime.",
    );
  });

  it("names number problems", () => {
    expect(problem(run("f", [["n", "5"]], "120"))).toBe(
      "Calculates a factorial.",
    );
    expect(problem(run("f", [["n", "10"]], "55"))).toBe(
      "Calculates the nth Fibonacci number.",
    );
  });

  it("verifies two-sum by checking the indices really add to the target", () => {
    const got = identify(
      run("twoSum", [["nums", "[2, 7, 11, 15]"], ["target", "9"]], "[0, 1]"),
    );
    expect(got?.statement).toBe(
      "Finds two numbers in a list that add up to a target.",
    );
    // Indices that do not sum to the target must not be accepted.
    expect(
      problem(
        run("twoSum", [["nums", "[2, 7, 11, 15]"], ["target", "9"]], "[0, 2]"),
      ),
    ).not.toBe("Finds two numbers in a list that add up to a target.");
  });

  it("reports a tie rather than picking, and says why", () => {
    // [1, 2, 3] -> 3 is the largest, the count and the last item at once.
    const got = identify(run("f", [["xs", "[1, 2, 3]"]], "3"));
    expect(got?.alsoFits.length).toBeGreaterThan(0);
    expect([got?.statement, ...(got?.alsoFits ?? [])]).toContain(
      "Finds the largest number in a list.",
    );
  });

  it("reports no tie when the input discriminates", () => {
    // [5, 9, 1] -> 9 is the largest, and is neither the count (3) nor the
    // last item (1), so nothing else in the catalogue explains it.
    const got = identify(run("f", [["xs", "[5, 9, 1]"]], "9"));
    expect(got?.statement).toBe("Finds the largest number in a list.");
    expect(got?.alsoFits).toEqual([]);
  });

  it("still ties when the largest happens to be last", () => {
    // The lesson the ambiguous line exists to teach: this example is weak.
    const got = identify(run("f", [["xs", "[5, 1, 9]"]], "9"));
    expect(got?.alsoFits).toContain("Returns the last item of a list.");
  });

  it("says nothing when the run failed", () => {
    const t = run("total", [["nums", "[1, 2]"]], "3");
    t.error = { message: "boom" };
    expect(identify(t)).toBeNull();
  });

  it("says nothing without arguments or without an answer", () => {
    expect(identify(run("f", [], "3"))).toBeNull();
    expect(identify({ frames: [], console: [] })).toBeNull();
  });

  it("shortens long values in the evidence line", () => {
    const big = `[${Array.from({ length: 40 }, () => 1).join(", ")}]`;
    const got = identify(run("total", [["xs", big]], "40"));
    expect(got?.evidence).toMatch(/…/);
    expect(got!.evidence.length).toBeLessThan(60);
  });
});

describe("observe", () => {
  it("takes the arguments of the first function entered", () => {
    const t = run("total", [["nums", "[1, 2]"], ["start", "0"]], "3");
    expect(observe(t)).toMatchObject({
      fnName: "total",
      args: ["[1, 2]", "0"],
      output: "3",
    });
  });

  it("ignores top-level frames when looking for the function", () => {
    const t: Trace = {
      frames: [
        { line: 1, stack: ["global"], vars: [{ name: "x", value: "1" }], node: "body", caption: "" },
        { line: 2, stack: ["global", "work"], vars: [{ name: "n", value: "2" }], node: "body", caption: "" },
      ],
      console: [],
    };
    expect(observe(t).fnName).toBe("work");
    expect(observe(t).args).toEqual(["2"]);
  });
});
