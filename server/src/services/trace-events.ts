/**
 * Shared translation from "what an instrumented program printed" to the
 * normalized event stream every CodeFlow engine produces.
 *
 * Every instrumented language reports the SAME raw shapes, whatever its
 * runtime: a line with the whole call stack attached, a variable, a return
 * value, a line of output. Keeping the translation here means a new language
 * only has to emit those four things.
 *
 * The interesting part is the call stack. A tracer reports the whole stack at
 * each line, because that is what it can cheaply observe; the event model is
 * incremental, where a call pushes and a return pops. Diffing consecutive
 * stacks recovers those pushes and pops.
 */

/** What an injected tracer prints, one per line. */
export interface RawEvent {
  t: "l" | "v" | "r" | "o";
  /** line */
  n?: number;
  /** stack, outermost first */
  s?: string[];
  /** variable name */
  k?: string;
  val?: string;
  lvl?: "log" | "error";
  text?: string;
}

/** Mirrors the frontend's ExecutionEvent union. */
export type TraceEvent =
  | { type: "program_start" }
  | { type: "line_execute"; line: number }
  | { type: "variable_update"; name: string; value: string }
  | { type: "function_call"; name: string }
  | { type: "function_return"; name: string; value?: string }
  | { type: "console_output"; level: "log" | "warn" | "error"; text: string }
  | { type: "program_end" }
  | { type: "error"; message: string; line?: number };

export function toConsole(
  text: string,
  level: "log" | "error",
): TraceEvent[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => ({
    type: "console_output" as const,
    level,
    text: line,
  }));
}

/** How many leading frames two stacks share. */
function commonPrefix(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

export function normalize(raw: RawEvent[]): TraceEvent[] {
  const events: TraceEvent[] = [{ type: "program_start" }];
  let stack: string[] = [];
  // A recorded return value belongs to the frame about to be popped.
  const returned: string[] = [];

  for (const event of raw) {
    switch (event.t) {
      case "r":
        returned.push(event.val ?? "");
        break;

      case "v":
        events.push({
          type: "variable_update",
          name: event.k ?? "",
          value: event.val ?? "",
        });
        break;

      case "o":
        events.push({
          type: "console_output",
          level: event.lvl === "error" ? "error" : "log",
          text: event.text ?? "",
        });
        break;

      case "l": {
        const next = event.s ?? [];
        const shared = commonPrefix(stack, next);

        for (let i = stack.length - 1; i >= shared; i--) {
          events.push({
            type: "function_return",
            name: stack[i]!,
            value: returned.pop(),
          });
        }
        for (let i = shared; i < next.length; i++) {
          events.push({ type: "function_call", name: next[i]! });
        }

        stack = next;
        events.push({ type: "line_execute", line: event.n ?? 0 });
        break;
      }
    }
  }

  // Unwind whatever is still open, so the stack ends where it started.
  for (let i = stack.length - 1; i >= 0; i--) {
    events.push({
      type: "function_return",
      name: stack[i]!,
      value: returned.pop(),
    });
  }

  return events;
}

/**
 * Split a program's stdout into trace events and its own output, keeping the
 * order between them.
 *
 * A tracer that prints its events as they happen gets interleaving for free:
 * a line of the program's own output sits exactly where it was printed.
 */
export function splitInterleaved(
  stdout: string,
  sentinel: string,
): { raw: RawEvent[]; malformed: number } {
  const raw: RawEvent[] = [];
  let malformed = 0;

  for (const line of stdout.split("\n")) {
    const at = line.indexOf(sentinel);

    if (at === -1) {
      if (line) raw.push({ t: "o", lvl: "log", text: line });
      continue;
    }

    // Output with no trailing newline can leave a prefix on the same line.
    const before = line.slice(0, at);
    if (before) raw.push({ t: "o", lvl: "log", text: before });

    try {
      raw.push(JSON.parse(line.slice(at + sentinel.length)) as RawEvent);
    } catch {
      malformed++;
    }
  }

  return { raw, malformed };
}
