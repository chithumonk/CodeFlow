import type { ExecutionEvent } from "./events";

/**
 * Executes instrumented code and collects the events it reports.
 *
 * Deliberately free of Worker APIs so the whole pipeline — instrument, run,
 * fold into a trace — can be tested directly. The Worker is a thin wrapper
 * around this.
 */

/** Hard ceilings so a runaway program fails fast instead of hanging. */
// Steps must trip before events, or a runaway loop reports the vague
// "too large to trace" instead of the useful "looks like an infinite loop".
const MAX_STEPS = 50_000;
const MAX_EVENTS = 250_000;
const MAX_MS = 4000;
const MAX_DEPTH = 500;

class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

/** Short, readable rendering of a runtime value. */
function format(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      return depth === 0 ? value : JSON.stringify(value);
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "symbol":
      return value.toString();
    case "function": {
      const name = (value as { name?: string }).name;
      return name ? `ƒ ${name}()` : "ƒ ()";
    }
  }

  if (Array.isArray(value)) {
    if (depth > 1) return `Array(${value.length})`;
    const items = value.slice(0, 8).map((v) => format(v, depth + 1));
    if (value.length > 8) items.push(`… ${value.length - 8} more`);
    return `[${items.join(", ")}]`;
  }

  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof Map) return `Map(${value.size})`;
  if (value instanceof Set) return `Set(${value.size})`;

  if (depth > 1) return "{…}";
  try {
    const entries = Object.entries(value as object).slice(0, 6);
    const body = entries
      .map(([k, v]) => `${k}: ${format(v, depth + 1)}`)
      .join(", ");
    return `{ ${body}${Object.keys(value as object).length > 6 ? ", …" : ""} }`;
  } catch {
    return "{…}";
  }
}

export function runInstrumented(code: string): {
  events: ExecutionEvent[];
  truncated: boolean;
} {
  const events: ExecutionEvent[] = [];
  const loopCounts = new Map<number, number>();
  const startedAt = Date.now();

  let steps = 0;
  let depth = 0;
  let lastLine = -1;
  let truncated = false;

  const push = (event: ExecutionEvent) => {
    if (events.length >= MAX_EVENTS) {
      truncated = true;
      throw new BudgetError(
        `Stopped after ${MAX_EVENTS.toLocaleString()} recorded events — the program is too large to trace in full.`,
      );
    }
    events.push(event);
  };

  const runtime = {
    /** Called before every statement. The budget lives here. */
    s(line: number) {
      steps += 1;
      if (steps > MAX_STEPS) {
        truncated = true;
        throw new BudgetError(
          `Stopped after ${MAX_STEPS.toLocaleString()} steps — this looks like an infinite loop.`,
        );
      }
      // Checking the clock on every statement would dominate the runtime.
      if ((steps & 0x3ff) === 0 && Date.now() - startedAt > MAX_MS) {
        truncated = true;
        throw new BudgetError(
          `Stopped after ${MAX_MS / 1000} seconds — the program ran too long.`,
        );
      }
      lastLine = line;
      push({ type: "line_execute", line });
    },

    enter(name: string) {
      depth += 1;
      if (depth > MAX_DEPTH) {
        truncated = true;
        throw new BudgetError(
          `Call stack went ${MAX_DEPTH} deep — this looks like runaway recursion.`,
        );
      }
      push({ type: "function_call", name });
    },

    exit(name: string) {
      depth = Math.max(0, depth - 1);
      push({ type: "function_return", name });
    },

    /**
     * Wraps a returned value so the value itself can be reported.
     *
     * Emits the call site's line first when it differs from the last one
     * seen, which is what separates the frames of an unwinding recursion.
     */
    ret<T>(name: string, line: number, value: T): T {
      depth = Math.max(0, depth - 1);
      if (line !== lastLine) {
        lastLine = line;
        push({ type: "line_execute", line });
      }
      push({ type: "function_return", name, value: format(value, 1) });
      return value;
    },

    v(name: string, value: unknown) {
      push({ type: "variable_update", name, value: format(value, 1) });
    },

    loop(id: number, label: string) {
      const next = (loopCounts.get(id) ?? 0) + 1;
      loopCounts.set(id, next);
      push({ type: "loop_iteration", label, iteration: next });
    },
  };

  const consoleShim = {
    log: (...args: unknown[]) =>
      push({
        type: "console_output",
        level: "log",
        text: args.map((a) => format(a)).join(" "),
      }),
    warn: (...args: unknown[]) =>
      push({
        type: "console_output",
        level: "warn",
        text: args.map((a) => format(a)).join(" "),
      }),
    error: (...args: unknown[]) =>
      push({
        type: "console_output",
        level: "error",
        text: args.map((a) => format(a)).join(" "),
      }),
    info: (...args: unknown[]) =>
      push({
        type: "console_output",
        level: "log",
        text: args.map((a) => format(a)).join(" "),
      }),
  };

  events.push({ type: "program_start" });

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function("__cf", "console", `"use strict";\n${code}`);
    fn(runtime, consoleShim);
    events.push({ type: "program_end" });
  } catch (error) {
    const err = error as Error;
    const lastLine = [...events]
      .reverse()
      .find(
        (e): e is Extract<ExecutionEvent, { type: "line_execute" }> =>
          e.type === "line_execute",
      )?.line;

    events.push({
      type: "error",
      message:
        err?.name && err?.message
          ? `${err.name}: ${err.message}`
          : String(error),
      line: lastLine,
    });
  }

  return { events, truncated };
}
