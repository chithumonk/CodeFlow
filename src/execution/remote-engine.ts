import { gql } from "../lib/graphql";
import type { EngineResult, ExecutionEngine, ExecutionEvent } from "./events";

/**
 * Runs a language CodeFlow cannot trace, via the API.
 *
 * It satisfies the same ExecutionEngine interface as the tracing engines, so
 * the controller and the workspace need no special case — but the event
 * stream it produces has no `line_execute` events at all. There is nothing to
 * step through, because a remote batch executor reports what a program
 * printed, not what it did.
 *
 * The workspace reads `traceable: false` and hides the stepping controls
 * rather than offering buttons that cannot work.
 */

interface ExecutionOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  compileFailed: boolean;
}

/** Split output into console events, dropping the trailing blank line. */
function toConsoleEvents(
  text: string,
  level: "log" | "error",
): ExecutionEvent[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => ({
    type: "console_output" as const,
    level,
    text: line,
  }));
}

export class RemoteExecutionEngine implements ExecutionEngine {
  readonly id: string;
  readonly language: string;
  /** No line events are produced, so stepping is meaningless here. */
  readonly traceable = false;

  private version: string;

  constructor(options: { language: string; version: string }) {
    this.id = `remote-${options.language}`;
    this.language = options.language;
    this.version = options.version;
  }

  async run(source: string, signal?: AbortSignal): Promise<EngineResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (!source.trim()) {
      return {
        events: [{ type: "program_start" }, { type: "program_end" }],
        ranUserCode: true,
        sourceMatches: true,
        note: "Nothing to run — the file is empty.",
      };
    }

    let output: ExecutionOutput;
    try {
      const data = await gql<{ executeCode: ExecutionOutput }>(
        `mutation Execute(
           $language: String!
           $version: String!
           $source: String!
         ) {
           executeCode(language: $language, version: $version, source: $source) {
             stdout
             stderr
             exitCode
             signal
             compileFailed
           }
         }`,
        // CodeFlow's own language id. The server translates it into whatever
        // the configured provider calls it.
        { language: this.language, version: this.version, source },
      );
      output = data.executeCode;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Execution failed.";
      // No note: the error event already carries this text to the banner and
      // the console. Repeating it here would print the same sentence four
      // times on one screen.
      return {
        events: [{ type: "program_start" }, { type: "error", message }],
        ranUserCode: false,
        sourceMatches: true,
      };
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const events: ExecutionEvent[] = [{ type: "program_start" }];
    events.push(...toConsoleEvents(output.stdout, "log"));
    events.push(...toConsoleEvents(output.stderr, "error"));

    if (output.compileFailed) {
      events.push({
        type: "error",
        message: "The program did not compile. See the output above.",
      });
    } else if (output.signal) {
      events.push({
        type: "error",
        message: `The program was stopped (${output.signal}) — it may have run too long or used too much memory.`,
      });
    } else if (output.exitCode !== null && output.exitCode !== 0) {
      events.push({
        type: "error",
        message: `The program exited with code ${output.exitCode}.`,
      });
    } else {
      events.push({ type: "program_end" });
    }

    // Also no note on the way out. The controls and the side panel already say
    // this language is output-only, and they say it from `traceable` rather
    // than from a string, so they cannot disagree with each other.
    return { events, ranUserCode: true, sourceMatches: true };
  }
}
