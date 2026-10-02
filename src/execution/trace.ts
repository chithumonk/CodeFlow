import type { ConsoleLevel, ExecutionEvent, FlowNodeId } from "./events";

/**
 * Folds an event stream into the per-step snapshots the UI renders.
 *
 * Events are incremental ("x became 3"); the visualization needs whole states
 * ("at step 7, x is 3, y is 1, the stack is …"). Doing that fold once here
 * keeps every panel a pure function of the current step, which is what makes
 * scrubbing backwards work at all.
 */

export interface TraceVar {
  name: string;
  value: string;
  /** True when this step is the one that wrote the value, for the flash. */
  changed?: boolean;
}

export interface ConsoleLine {
  level: ConsoleLevel;
  text: string;
  /** Index of the step that produced it, so output can be revealed in time. */
  step: number;
}

export interface TraceFrame {
  /** 1-based line in the source. */
  line: number;
  /** Innermost frame last, matching how a debugger prints a stack. */
  stack: string[];
  vars: TraceVar[];
  node: FlowNodeId;
  iteration?: number;
  /** Plain-language narration of this step. */
  caption: string;
  /** Rendered at the end of the active line, like an inline debugger value. */
  inline?: string;
  returned?: string;
}

export interface Trace {
  frames: TraceFrame[];
  console: ConsoleLine[];
  /** Set when the program ended in an error. */
  error?: { message: string; line?: number };
}

/**
 * Describe a step in words.
 *
 * The demo engine hand-wrote narration; a real engine only reports facts, so
 * the sentence is assembled from what happened. Without this every step reads
 * "Line 10", which tells the reader nothing they cannot already see.
 */
function narrate(
  events: ExecutionEvent[],
  line: number,
  iteration: number | undefined,
): string {
  const parts: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case "function_call":
        parts.push(`Call ${event.name}`);
        break;
      case "function_return":
        parts.push(
          event.value === undefined
            ? `Return from ${event.name}`
            : `${event.name} returns ${event.value}`,
        );
        break;
      case "variable_update":
        parts.push(`${event.name} = ${event.value}`);
        break;
      case "console_output":
        parts.push(`Log: ${event.text}`);
        break;
      case "loop_iteration":
        parts.push(`Iteration ${event.iteration}`);
        break;
      default:
        break;
    }
  }

  if (parts.length === 0) {
    return iteration ? `Line ${line} — iteration ${iteration}` : `Line ${line}`;
  }

  // Two facts is a readable sentence; more becomes a wall.
  return parts.slice(0, 2).join(" · ");
}

/** Which flow node a step belongs to, inferred from the events around it. */
function nodeFor(
  eventsSinceLine: ExecutionEvent[],
  inLoop: boolean,
  depth: number,
): FlowNodeId {
  for (const e of eventsSinceLine) {
    if (e.type === "function_return") return "return";
    if (e.type === "loop_iteration") return "loop";
    if (e.type === "function_call") return "call";
    if (e.type === "variable_declare") return inLoop ? "body" : "init";
    if (e.type === "variable_update") return inLoop ? "body" : "init";
  }
  return depth > 1 ? "body" : "init";
}

export function buildTrace(events: ExecutionEvent[]): Trace {
  const frames: TraceFrame[] = [];
  const consoleLines: ConsoleLine[] = [];
  let error: Trace["error"];

  // Running state, carried forward between steps.
  const scope = new Map<string, string>();
  const stack: string[] = ["global"];
  let iteration: number | undefined;
  let inLoop = false;

  // Events that arrived after the current line_execute.
  let pending: ExecutionEvent[] = [];
  let currentLine: number | null = null;
  let note: string | undefined;
  let inline: string | undefined;
  let changed = new Set<string>();
  let returned: string | undefined;

  const flush = () => {
    if (currentLine === null) return;

    frames.push({
      line: currentLine,
      stack: [...stack],
      vars: [...scope].map(([name, value]) => ({
        name,
        value,
        changed: changed.has(name),
      })),
      node: nodeFor(pending, inLoop, stack.length),
      iteration,
      caption: note ?? narrate(pending, currentLine, iteration),
      inline,
      returned,
    });

    pending = [];
    changed = new Set();
    inline = undefined;
    note = undefined;
    returned = undefined;
  };

  for (const event of events) {
    switch (event.type) {
      case "program_start":
        break;

      case "line_execute":
        flush();
        currentLine = event.line;
        note = event.note;
        inline = event.inline;
        break;

      case "variable_declare":
      case "variable_update":
        scope.set(event.name, event.value);
        changed.add(event.name);
        pending.push(event);
        break;

      case "function_call":
        stack.push(event.name);
        pending.push(event);
        break;

      case "function_return":
        // A recursion unwinds through several returns in a row, all at the
        // same source line. Without closing the frame between them, every
        // value but the last would be overwritten and lost.
        if (returned !== undefined) flush();

        if (stack.length > 1) stack.pop();
        returned = event.value;
        pending.push(event);
        break;

      case "loop_iteration":
        iteration = event.iteration;
        inLoop = true;
        pending.push(event);
        break;

      case "console_output":
        // Attributed to the step being built, so the console can reveal
        // output as the reader scrubs rather than showing it all at once.
        consoleLines.push({
          level: event.level,
          text: event.text,
          step: frames.length,
        });
        pending.push(event);
        break;

      case "program_end":
        returned = event.returned ?? returned;
        flush();
        currentLine = null;
        inLoop = false;
        iteration = undefined;
        break;

      case "error":
        error = { message: event.message, line: event.line };
        consoleLines.push({
          level: "error",
          text: event.message,
          step: frames.length,
        });
        flush();
        currentLine = null;
        break;
    }
  }

  flush();
  return { frames, console: consoleLines, error };
}

/** Console lines visible at or before a given step. */
export function consoleUpTo(trace: Trace, step: number): ConsoleLine[] {
  return trace.console.filter((line) => line.step <= step);
}
