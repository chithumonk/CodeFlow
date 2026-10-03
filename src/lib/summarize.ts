import { identify } from "./identify";
import { parseValue, unquote } from "./value-shape";
import type { Trace } from "../execution/trace";

/**
 * What problem a run solved, and how — in a few lines.
 *
 * Deliberately short. Counts of steps, frames, updates and unreached lines
 * are all readable off the transcript and the player, and listing them here
 * buried the one thing a reader actually wants: what this code was for. So
 * the summary answers two questions and stops — what problem, and how.
 *
 * Everything is read off what the run did rather than inferred from the
 * source, which keeps it true for every language CodeFlow traces. The problem
 * statement in particular is only ever shown when the input and the output
 * bear it out; see `identify`.
 */

export const MAX_LINES = 6;

export interface SummaryLine {
  kind:
    /** The problem the run solved, when its input and output prove one. */
    | "problem"
    /** The input → output pair that proves it. */
    | "evidence"
    /** How it went about it. Also the fallback when no problem is proven. */
    | "shape"
    /** How many times each function ran. */
    | "calls"
    /** The argument values it was called with. */
    | "inputs"
    /** What it printed. */
    | "output"
    /** How long the run was. */
    | "steps"
    /** Other problems this same example would equally satisfy. */
    | "ambiguous"
    | "error";
  text: string;
}

/** Frames name the top-level scope; it is not a function the code defines. */
const GLOBAL_FRAMES = new Set(["global", "main", "<module>", "toplevel"]);

/**
 * Stand-ins the tracers use where a function genuinely has no name — an
 * inline callback, a computed member. They are placeholders, not names, and
 * reading "calling (anonymous)" tells a reader nothing at all.
 */
const PLACEHOLDER_FRAMES = new Set(["(anonymous)", "(arrow)", "(computed)"]);

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(n: number, one: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${one}s`;
}

/** Shorten a value for prose without hiding that it was shortened. */
function brief(value: string, limit = 24): string {
  const v = value.trim();
  return v.length <= limit ? v : `${v.slice(0, limit - 1)}…`;
}

/** "once", "twice", then plain counts -- it reads better than "1 times". */
function times(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

/** Drop the class prefix; the line it appears on already names the class. */
function shortName(name: string): string {
  if (name.startsWith("new ")) return "the constructor";
  const dot = name.indexOf(".");
  return dot > 0 ? name.slice(dot + 1) : name;
}

/** At most `n` names, with the remainder counted rather than listed. */
function capped(names: string[], n = 4): string {
  if (names.length <= n) return list(names);
  return `${list(names.slice(0, n))} and ${names.length - n} more`;
}

/**
 * Describe frames that all belong to one class as the object they drive.
 *
 * The instrumenter names methods `Class.method` and constructors
 * `new Class`, which is right for a call stack but reads terribly in prose:
 * "calling new BrowserHistory, BrowserHistory.visit and BrowserHistory
 * .currentPage and 1 more" repeats the class four times and says little.
 * Returns null when the frames are not all one class.
 */
function describeClass(functions: string[]): string | null {
  const owners = new Set<string>();
  const methods: string[] = [];
  let built = false;

  for (const name of functions) {
    if (name.startsWith("new ")) {
      owners.add(name.slice(4));
      built = true;
      continue;
    }
    const dot = name.indexOf(".");
    if (dot <= 0) return null; // a plain function; not a single-class run
    owners.add(name.slice(0, dot));
    const member = name.slice(dot + 1);
    if (!methods.includes(member)) methods.push(member);
  }

  if (owners.size !== 1) return null;
  const owner = [...owners][0];

  if (methods.length === 0) return built ? `Builds a ${owner}.` : null;
  return built
    ? `Builds a ${owner} and calls ${capped(methods)} on it.`
    : `Calls ${capped(methods)} on ${owner}.`;
}

export function summarize(trace: Trace): SummaryLine[] {
  const frames = trace.frames;
  if (frames.length === 0) return [];

  // --- the few facts the "how" line needs ---------------------------------
  const functions: string[] = [];
  const history = new Map<
    string,
    { first: string; last: string; writes: number }
  >();
  let maxIteration = 0;

  /*
   * Count entries, not frames.
   *
   * A method that runs two statements contributes two frames per call, so
   * frame counts say nothing about how often it was called. A call is a step
   * where the stack got deeper, which is true for every tracer.
   */
  const callCounts = new Map<string, number>();
  const argValues: string[] = [];
  let previousDepth = 0;
  /*
   * What the caller already held at each depth, as name=value pairs.
   *
   * Two things force this shape. Comparing against the immediately preceding
   * frame fails because between two calls that frame is the tail of the
   * previous call. And comparing names alone fails because buildTrace keeps
   * one flat variable map and never drops a function's locals on return --
   * so after `visit("a.com")` the global frame still lists `page`, and every
   * call after the first looked like it took no arguments. The value has to
   * be part of the comparison.
   */
  const scopePairs: Array<Set<string>> = [new Set()];
  const pair = (name: string, value: string) => `${name}=${value}`;

  for (const frame of frames) {
    const depth = frame.stack.length;
    const top = frame.stack[depth - 1];

    if (depth > previousDepth && top !== undefined && !GLOBAL_FRAMES.has(top)) {
      callCounts.set(top, (callCounts.get(top) ?? 0) + 1);

      // An argument is a binding the caller did not already have. Taking
      // everything in scope instead picked up the caller's own locals -- a
      // no-argument method reported "Called with { stack: Array(0) }", the
      // object it was called on rather than an argument.
      const caller = scopePairs[depth - 1] ?? new Set<string>();
      for (const v of frame.vars) {
        if (!caller.has(pair(v.name, v.value)) && !argValues.includes(v.value)) {
          argValues.push(v.value);
        }
      }
    }

    scopePairs[depth] = new Set(frame.vars.map((v) => pair(v.name, v.value)));
    previousDepth = depth;
  }

  for (const frame of frames) {
    if (frame.iteration !== undefined) {
      maxIteration = Math.max(maxIteration, frame.iteration);
    }
    for (const name of frame.stack) {
      if (
        !GLOBAL_FRAMES.has(name) &&
        !PLACEHOLDER_FRAMES.has(name) &&
        !functions.includes(name)
      ) {
        functions.push(name);
      }
    }
    for (const v of frame.vars) {
      const seen = history.get(v.name);
      if (seen === undefined) {
        history.set(v.name, {
          first: v.value,
          last: v.value,
          writes: v.changed ? 1 : 0,
        });
      } else {
        seen.last = v.value;
        if (v.changed) seen.writes++;
      }
    }
  }

  const collections = [...history.entries()]
    .map(([name, h]) => {
      const shape = parseValue(h.first);
      const size =
        shape.kind === "array"
          ? shape.items.length
          : shape.kind === "string"
            ? shape.chars.length
            : 0;
      return { name, size, kind: shape.kind, value: h.first };
    })
    .filter((c) => c.size >= 2);

  // The loop cursor only ever holds an element of what is being walked, so it
  // is a position rather than something being built.
  const walked = new Set(
    collections.flatMap((c) => {
      const shape = parseValue(c.value);
      if (shape.kind === "array") return shape.items.map((i) => i.trim());
      if (shape.kind === "string") return shape.chars;
      return [];
    }),
  );

  const accumulator = [...history.entries()]
    .filter(([, h]) => {
      if (h.writes < 2) return false;
      const kind = parseValue(h.last).kind;
      if (kind !== "scalar" && kind !== "string") return false;
      return !walked.has(h.last.trim()) && !walked.has(unquote(h.last));
    })
    .sort((a, b) => b[1].writes - a[1].writes)[0];

  const out: SummaryLine[] = [];
  const add = (kind: SummaryLine["kind"], text: string) =>
    out.push({ kind, text });

  // --- what problem -------------------------------------------------------
  const problem = identify(trace);
  if (problem !== null) {
    add("problem", problem.statement);
    add("evidence", problem.evidence);
  }

  // A run that threw solved nothing, so this stands in for the problem line.
  if (trace.error) {
    add(
      "error",
      trace.error.line === undefined
        ? `Stopped with an error: ${trace.error.message}`
        : `Stopped on line ${trace.error.line}: ${trace.error.message}`,
    );
  }

  // --- and how ------------------------------------------------------------
  const subject = collections[0];
  if (maxIteration > 0 && subject !== undefined) {
    const unit = subject.kind === "string" ? "character" : "item";
    const walk = `Walks ${subject.name} (${plural(subject.size, unit)})`;
    add(
      "shape",
      accumulator === undefined
        ? `${walk} one at a time.`
        : `${walk} and folds it into ${accumulator[0]}.`,
    );
  } else if (maxIteration > 0) {
    add("shape", `Loops ${plural(maxIteration, "time")}.`);
  } else if (functions.length > 0) {
    const asClass = describeClass(functions);
    add(
      "shape",
      asClass ?? `Runs straight through, calling ${capped(functions, 3)}.`,
    );
  } else {
    // No loop and nothing nameable: say the one true thing available.
    add("shape", `Runs straight through, ${plural(frames.length, "step")} in all.`);
  }

  // --- how often, with what, and what came out ---------------------------
  /*
   * These three carry the behaviour of a program that computes no single
   * answer -- a class being driven through its methods, say, where the whole
   * point is the sequence of calls and what they printed. When a problem was
   * named, the evidence line already shows the call and the answer, so the
   * input and output lines would only repeat it.
   */
  const counted = [...callCounts.entries()]
    // The constructor is left out: "Builds a BrowserHistory" already says it
    // ran, and "the constructor ran once" only lengthens the line.
    .filter(
      ([name]) => !PLACEHOLDER_FRAMES.has(name) && !name.startsWith("new "),
    )
    .sort((a, b) => b[1] - a[1]);

  const repeated = counted.some(([, n]) => n > 1);
  if (counted.length > 0 && (repeated || counted.length > 1)) {
    add(
      "calls",
      `Ran ${capped(
        counted.slice(0, 4).map(([name, n]) => `${shortName(name)} ${times(n)}`),
      )}.`,
    );
  }

  if (problem === null && argValues.length > 0) {
    add("inputs", `Called with ${capped(argValues.map((a) => brief(a)), 3)}.`);
  }

  if (problem === null && trace.console.length > 0) {
    const last = trace.console[trace.console.length - 1].text;
    add(
      "output",
      trace.console.length === 1
        ? `Printed "${brief(last, 44)}".`
        : `Printed ${plural(trace.console.length, "line")}, ending with "${brief(last, 44)}".`,
    );
  }

  add("steps", `Took ${plural(frames.length, "step")}.`);

  // Last: a tie is a prompt to try a sharper example, not a finding.
  if (problem !== null && problem.alsoFits.length > 0) {
    add(
      "ambiguous",
      `This example also fits: ${list(
        problem.alsoFits.map((a) => a.replace(/\.$/, "").toLowerCase()),
      )}.`,
    );
  }

  return out.slice(0, MAX_LINES);
}
