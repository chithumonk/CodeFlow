import { instrumentC, type CDialect } from "./c-instrument.js";
import { C_TRACE_SENTINEL } from "./c-tracer.js";
import { executeRemotely } from "./execute.js";
import {
  normalize,
  splitInterleaved,
  toConsole,
  type TraceEvent,
} from "./trace-events.js";

/**
 * C and C++ step-through: instrument, compile, run, and turn the result into
 * the same normalized event stream every other engine produces.
 */

export interface CTraceResult {
  events: TraceEvent[];
  truncated: boolean;
  /** Set when tracing was not possible and the file was run unchanged. */
  note: string | null;
  compileFailed: boolean;
}

/** Events a tracer stops emitting once its budget is spent. */
const MAX_EVENTS = 200_000;

export async function traceC(
  source: string,
  dialect: CDialect,
): Promise<CTraceResult> {
  const { code, error } = await instrumentC(source, dialect);

  // Could not instrument: run the file unchanged so the compiler's own error
  // reaches the user rather than a parser's wording.
  const output = await executeRemotely({
    language: dialect,
    version: "*",
    source: error ? source : code,
  });

  if (output.compileFailed) {
    return {
      events: [
        { type: "program_start" },
        ...toConsole(output.stderr, "error"),
        {
          type: "error",
          message: "The program did not compile. See the output above.",
        },
      ],
      truncated: false,
      note: error,
      compileFailed: true,
    };
  }

  const { raw, malformed } = splitInterleaved(output.stdout, C_TRACE_SENTINEL);
  const sawTrace = raw.some((e) => e.t !== "o");

  if (!sawTrace) {
    return {
      events: [
        { type: "program_start" },
        ...toConsole(output.stdout, "log"),
        ...toConsole(output.stderr, "error"),
        { type: "program_end" },
      ],
      truncated: false,
      note:
        error ?? "This run produced no trace, so only its output is shown.",
      compileFailed: false,
    };
  }

  const events = normalize(raw);

  // The program's own stderr is not interleaved — it is a separate stream, so
  // there is no position to put it in. It goes at the end rather than being
  // dropped.
  events.push(...toConsole(output.stderr, "error"));

  // The tracer stops emitting at its budget rather than crashing, so a trace
  // at the cap is a trace that was cut short.
  const truncated = raw.filter((e) => e.t !== "o").length >= MAX_EVENTS;

  if (truncated) {
    const message = "Stopped: the trace grew too large to record in full.";
    events.push({ type: "console_output", level: "warn", text: message });
    events.push({ type: "error", message });
  } else if (output.signal) {
    events.push({
      type: "error",
      message: `The program was stopped (${output.signal}).`,
    });
  } else if (output.exitCode !== null && output.exitCode !== 0) {
    events.push({
      type: "error",
      message: `The program exited with code ${output.exitCode}.`,
    });
  } else {
    events.push({ type: "program_end" });
  }

  return {
    events,
    truncated,
    note:
      error ??
      (malformed > 0
        ? "Part of the recording was unreadable and has been left out."
        : null),
    compileFailed: false,
  };
}
