import { parseValue, unquote } from "./value-shape";
import type { Trace } from "../execution/trace";

/**
 * Naming the problem a run solved.
 *
 * Nothing here guesses from the source. Each candidate problem is a claim
 * that can be checked against what the run actually did — given this input,
 * a solution to *this* problem would have produced exactly that output — and
 * a candidate is only ever reported when the arithmetic agrees. Summing
 * `[10, 20, 30, 40]` to `100` is evidence; a function named `total` is not.
 *
 * Two consequences worth keeping in mind:
 *
 *   - When no candidate fits, this says nothing. A wrong problem statement is
 *     far worse than none, because the reader has no way to check it.
 *   - One input often cannot separate two problems. `[1, 2, 3] → 3` is the
 *     largest item, the item count and the last item all at once. Rather than
 *     pick, that gets reported as the tie it is, which also tells the reader
 *     their example is too weak to pin down.
 */

export interface Identified {
  /** What problem the run solved, as a sentence. */
  statement: string;
  /** The input → output pair that supports it. */
  evidence: string;
  /** Other problems the same input and output would equally satisfy. */
  alsoFits: string[];
}

/* --- reading values back ---------------------------------------------------- */

function asNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const shape = parseValue(raw);
  if (shape.kind !== "scalar") return null;
  const n = Number(shape.text);
  return Number.isFinite(n) ? n : null;
}

function asNumberList(raw: string | undefined): number[] | null {
  if (raw === undefined) return null;
  const shape = parseValue(raw);
  if (shape.kind !== "array" || shape.items.length === 0) return null;
  const nums = shape.items.map((i) => Number(i.trim()));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

function asText(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const shape = parseValue(raw);
  if (shape.kind === "string") return shape.text;
  // A single character comes back as a scalar once quotes are stripped.
  if (shape.kind === "scalar") {
    const bare = unquote(shape.text);
    return bare === shape.text ? null : bare;
  }
  return null;
}

function asBool(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const t = raw.trim().toLowerCase();
  if (t === "true" || t === "false") return t === "true";
  return null;
}

const sameNumbers = (a: number[], b: number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/* --- what the run showed us -------------------------------------------------- */

export interface Observed {
  /** Arguments of the first function entered, in order. */
  args: string[];
  /** Returned value, else the last thing printed. */
  output: string | undefined;
  /** Name of the first function entered, for the evidence line. */
  fnName: string;
}

const GLOBAL_FRAMES = new Set(["global", "main", "<module>", "toplevel"]);

export function observe(trace: Trace): Observed {
  let args: string[] = [];
  let fnName = "";

  // The first frame inside a function holds its parameters, before the body
  // has had a chance to introduce anything else.
  for (const frame of trace.frames) {
    const inner = frame.stack[frame.stack.length - 1];
    if (frame.stack.length > 1 && inner !== undefined && !GLOBAL_FRAMES.has(inner)) {
      fnName = inner;
      args = frame.vars.map((v) => v.value);
      break;
    }
  }

  let returned: string | undefined;
  for (const frame of trace.frames) {
    if (frame.returned !== undefined) returned = frame.returned;
  }

  const printed = trace.console.length > 0
    ? trace.console[trace.console.length - 1].text
    : undefined;

  return { args, output: returned ?? printed, fnName };
}

/* --- the catalogue ----------------------------------------------------------- */

interface Candidate {
  id: string;
  statement: string;
  /** True when a solution to this problem, given these args, yields output. */
  fits: (o: Observed) => boolean;
}

/** Output compared as a number, a list, text or a boolean as appropriate. */
const CANDIDATES: Candidate[] = [
  // --- a list of numbers in, one number out ---
  {
    id: "sum",
    statement: "Adds up the numbers in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return xs !== null && out !== null && xs.reduce((a, b) => a + b, 0) === out;
    },
  },
  {
    id: "product",
    statement: "Multiplies the numbers in a list together.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return (
        xs !== null &&
        out !== null &&
        xs.length > 1 &&
        xs.reduce((a, b) => a * b, 1) === out
      );
    },
  },
  {
    id: "max",
    statement: "Finds the largest number in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return xs !== null && out !== null && Math.max(...xs) === out;
    },
  },
  {
    id: "min",
    statement: "Finds the smallest number in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return xs !== null && out !== null && Math.min(...xs) === out;
    },
  },
  {
    id: "average",
    statement: "Averages the numbers in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return (
        xs !== null &&
        out !== null &&
        xs.length > 1 &&
        xs.reduce((a, b) => a + b, 0) / xs.length === out
      );
    },
  },
  {
    id: "count",
    statement: "Counts how many items a list holds.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return xs !== null && out !== null && xs.length === out && xs.length > 1;
    },
  },
  {
    id: "last",
    statement: "Returns the last item of a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumber(o.output);
      return xs !== null && out !== null && xs[xs.length - 1] === out;
    },
  },

  // --- a list in, a list out ---
  {
    id: "sort-asc",
    statement: "Sorts a list into ascending order.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        !sameNumbers(xs, out) &&
        sameNumbers([...xs].sort((a, b) => a - b), out)
      );
    },
  },
  {
    id: "sort-desc",
    statement: "Sorts a list into descending order.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        !sameNumbers(xs, out) &&
        sameNumbers([...xs].sort((a, b) => b - a), out)
      );
    },
  },
  {
    id: "reverse-list",
    statement: "Reverses the order of a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        xs.length > 1 &&
        !sameNumbers(xs, out) &&
        sameNumbers([...xs].reverse(), out)
      );
    },
  },
  {
    id: "unique",
    statement: "Removes duplicate values from a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        out.length < xs.length &&
        sameNumbers([...new Set(xs)], out)
      );
    },
  },
  {
    id: "evens",
    statement: "Keeps only the even numbers in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        out.length < xs.length &&
        sameNumbers(xs.filter((n) => n % 2 === 0), out)
      );
    },
  },
  {
    id: "odds",
    statement: "Keeps only the odd numbers in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        out.length < xs.length &&
        sameNumbers(xs.filter((n) => Math.abs(n % 2) === 1), out)
      );
    },
  },
  {
    id: "doubled",
    statement: "Doubles every number in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        xs.some((n) => n !== 0) &&
        sameNumbers(xs.map((n) => n * 2), out)
      );
    },
  },
  {
    id: "squares",
    statement: "Squares every number in a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        out !== null &&
        xs.some((n) => n !== 0 && n !== 1 && n !== 2) &&
        sameNumbers(xs.map((n) => n * n), out)
      );
    },
  },
  {
    id: "running-total",
    statement: "Builds a running total of a list.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const out = asNumberList(o.output);
      if (xs === null || out === null || xs.length < 2) return false;
      let running = 0;
      return sameNumbers(xs.map((n) => (running += n)), out);
    },
  },

  // --- two-sum style: a list and a target, indices out ---
  {
    id: "two-sum",
    statement: "Finds two numbers in a list that add up to a target.",
    fits: (o) => {
      const xs = asNumberList(o.args[0]);
      const target = asNumber(o.args[1]);
      const out = asNumberList(o.output);
      return (
        xs !== null &&
        target !== null &&
        out !== null &&
        out.length === 2 &&
        out.every((i) => Number.isInteger(i) && i >= 0 && i < xs.length) &&
        out[0] !== out[1] &&
        xs[out[0]] + xs[out[1]] === target
      );
    },
  },

  // --- a string in, a string out ---
  {
    id: "reverse-string",
    statement: "Reverses a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asText(o.output);
      return (
        s !== null &&
        out !== null &&
        s.length > 1 &&
        s !== out &&
        [...s].reverse().join("") === out
      );
    },
  },
  {
    id: "upper",
    statement: "Converts a string to upper case.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asText(o.output);
      return s !== null && out !== null && s !== out && s.toUpperCase() === out;
    },
  },
  {
    id: "lower",
    statement: "Converts a string to lower case.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asText(o.output);
      return s !== null && out !== null && s !== out && s.toLowerCase() === out;
    },
  },
  {
    id: "sort-chars",
    statement: "Sorts the characters of a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asText(o.output);
      return (
        s !== null &&
        out !== null &&
        s.length > 1 &&
        s !== out &&
        [...s].sort().join("") === out
      );
    },
  },
  {
    id: "copy-string",
    statement: "Rebuilds a string character by character.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asText(o.output);
      return s !== null && out !== null && s.length > 1 && s === out;
    },
  },

  // --- a string in, a number out ---
  {
    id: "length",
    statement: "Counts the characters in a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asNumber(o.output);
      return s !== null && out !== null && s.length > 1 && s.length === out;
    },
  },
  {
    id: "first-unique-index",
    statement:
      "Finds the index of the first non-repeating character in a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asNumber(o.output);
      if (s === null || out === null || s.length < 2) return false;
      const counts = new Map<string, number>();
      for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
      const expected = [...s].findIndex((ch) => counts.get(ch) === 1);
      return expected === out;
    },
  },
  {
    id: "vowels",
    statement: "Counts the vowels in a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asNumber(o.output);
      if (s === null || out === null || s.length < 2) return false;
      const vowels = [...s.toLowerCase()].filter((c) =>
        "aeiou".includes(c),
      ).length;
      return vowels > 0 && vowels === out;
    },
  },
  {
    id: "distinct-chars",
    statement: "Counts the distinct characters in a string.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asNumber(o.output);
      if (s === null || out === null || s.length < 2) return false;
      const distinct = new Set([...s]).size;
      return distinct !== s.length && distinct === out;
    },
  },

  // --- a string in, true or false out ---
  {
    id: "palindrome",
    statement: "Checks whether a string reads the same backwards.",
    fits: (o) => {
      const s = asText(o.args[0]);
      const out = asBool(o.output);
      if (s === null || out === null || s.length < 2) return false;
      const clean = s.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (clean === [...clean].reverse().join("")) === out;
    },
  },
  {
    id: "anagram",
    statement: "Checks whether two strings are anagrams.",
    fits: (o) => {
      const a = asText(o.args[0]);
      const b = asText(o.args[1]);
      const out = asBool(o.output);
      if (a === null || b === null || out === null) return false;
      const key = (t: string) => [...t.toLowerCase()].sort().join("");
      return (key(a) === key(b)) === out;
    },
  },

  // --- one number in, one number out ---
  {
    id: "factorial",
    statement: "Calculates a factorial.",
    fits: (o) => {
      const n = asNumber(o.args[0]);
      const out = asNumber(o.output);
      if (n === null || out === null || !Number.isInteger(n) || n < 2 || n > 20) {
        return false;
      }
      let f = 1;
      for (let i = 2; i <= n; i++) f *= i;
      return f === out;
    },
  },
  {
    id: "fibonacci-nth",
    statement: "Calculates the nth Fibonacci number.",
    fits: (o) => {
      const n = asNumber(o.args[0]);
      const out = asNumber(o.output);
      if (n === null || out === null || !Number.isInteger(n) || n < 3 || n > 40) {
        return false;
      }
      let a = 0;
      let b = 1;
      for (let i = 0; i < n; i++) [a, b] = [b, a + b];
      return a === out;
    },
  },
  {
    id: "is-prime",
    statement: "Checks whether a number is prime.",
    fits: (o) => {
      const n = asNumber(o.args[0]);
      const out = asBool(o.output);
      if (n === null || out === null || !Number.isInteger(n) || n < 2) return false;
      let prime = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
      return prime === out;
    },
  },
];

/* --- the answer -------------------------------------------------------------- */

function brief(raw: string, limit = 30): string {
  const v = raw.trim();
  return v.length <= limit ? v : `${v.slice(0, limit - 1)}…`;
}

export function identify(trace: Trace): Identified | null {
  if (trace.frames.length === 0 || trace.error) return null;

  const observed = observe(trace);
  if (observed.args.length === 0 || observed.output === undefined) return null;

  const hits = CANDIDATES.filter((c) => c.fits(observed));
  if (hits.length === 0) return null;

  const call = `${observed.fnName || "it"}(${observed.args
    .map((a) => brief(a))
    .join(", ")})`;

  return {
    statement: hits[0].statement,
    evidence: `${call} → ${brief(observed.output)}`,
    // Catalogue order is specificity order, so the rest are the ties.
    alsoFits: hits.slice(1, 3).map((h) => h.statement),
  };
}
