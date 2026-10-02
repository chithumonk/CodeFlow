import { instrumentJava } from "./java-instrument.js";
import { JAVA_TRACE_SENTINEL } from "./java-tracer.js";
import { executeRemotely } from "./execute.js";
import {
  normalize,
  toConsole,
  type RawEvent,
  type TraceEvent,
} from "./trace-events.js";

/**
 * Java step-through: instrument, run, and turn the result into the same
 * normalized event stream every other engine produces.
 *
 * Java's tracer buffers its events and prints them in one go at exit, so
 * ordering between the program's own output and the steps comes from the
 * tracer capturing System.out itself, not from interleaved printing.
 */

export interface JavaTraceResult {
  events: TraceEvent[];
  truncated: boolean;
  /** Set when tracing was not possible and the file was run unchanged. */
  note: string | null;
  stdout: string;
  stderr: string;
  compileFailed: boolean;
}

/** Pull the tracer's line out of stdout, leaving anything it did not write. */
function splitTrace(stdout: string): {
  payload: { events: RawEvent[]; truncated: boolean; stopReason?: string } | null;
  rest: string;
} {
  const lines = stdout.split("\n");
  const kept: string[] = [];
  let payload = null;

  for (const line of lines) {
    if (line.startsWith(JAVA_TRACE_SENTINEL)) {
      try {
        payload = JSON.parse(line.slice(JAVA_TRACE_SENTINEL.length));
      } catch {
        // A truncated line means the program was killed mid-print; the run
        // output is still worth showing.
      }
    } else {
      kept.push(line);
    }
  }

  return { payload, rest: kept.join("\n") };
}

export async function traceJava(source: string): Promise<JavaTraceResult> {
  const { code, error } = instrumentJava(source);

  // Could not instrument: run the file unchanged so the compiler's own error
  // reaches the user, rather than a parser's wording.
  const output = await executeRemotely({
    language: "java",
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
      stdout: output.stdout,
      stderr: output.stderr,
      compileFailed: true,
    };
  }

  const { payload, rest } = splitTrace(output.stdout);

  if (!payload) {
    // No trace came back — report what the program printed rather than
    // claiming a step-through that did not happen.
    return {
      events: [
        { type: "program_start" },
        ...toConsole(rest, "log"),
        ...toConsole(output.stderr, "error"),
        { type: "program_end" },
      ],
      truncated: false,
      note:
        error ??
        "This run produced no trace, so only its output is shown.",
      stdout: rest,
      stderr: output.stderr,
      compileFailed: false,
    };
  }

  const events = normalize(payload.events);

  // Anything the program wrote outside the captured streams, plus whatever
  // the runner itself reported.
  events.push(...toConsole(rest, "log"), ...toConsole(output.stderr, "error"));

  if (payload.truncated) {
    const reason = payload.stopReason ?? "the trace grew too large";
    events.push({ type: "console_output", level: "warn", text: `Stopped: ${reason}.` });
    events.push({ type: "error", message: `Stopped: ${reason}.` });
  } else if (output.signal) {
    events.push({
      type: "error",
      message: `The program was stopped (${output.signal}).`,
    });
  } else {
    events.push({ type: "program_end" });
  }

  return {
    events,
    truncated: payload.truncated,
    note: error,
    stdout: rest,
    stderr: output.stderr,
    compileFailed: false,
  };
}
