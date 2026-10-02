import { gql } from "../lib/graphql";
import type { EngineResult, ExecutionEngine, ExecutionEvent } from "./events";

/**
 * A language that runs remotely but is still fully steppable.
 *
 * The server rewrites the source so the program reports each statement, its
 * call stack and its local variables as it runs, then compiles and runs it.
 * What comes back is the same normalized event stream a browser engine
 * produces, so the controller, transcript and panels need no special case.
 *
 * `traceable` is true here, unlike RemoteExecutionEngine — the distinction is
 * whether a trace exists, not where the code ran.
 */

interface TracedRun {
  events: string;
  truncated: boolean;
  note: string | null;
  compileFailed: boolean;
}

export class RemoteTracedEngine implements ExecutionEngine {
  readonly id: string;
  readonly language: string;
  readonly traceable = true;

  constructor(options: { language: string }) {
    this.id = `remote-traced-${options.language}`;
    this.language = options.language;
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

    let run: TracedRun;
    try {
      const data = await gql<{ traceCode: TracedRun }>(
        `mutation Trace($language: String!, $source: String!) {
           traceCode(language: $language, source: $source) {
             events
             truncated
             note
             compileFailed
           }
         }`,
        { language: this.language, source },
      );
      run = data.traceCode;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Execution failed.";
      return {
        events: [{ type: "program_start" }, { type: "error", message }],
        ranUserCode: false,
        sourceMatches: true,
      };
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let events: ExecutionEvent[];
    try {
      events = JSON.parse(run.events) as ExecutionEvent[];
    } catch {
      return {
        events: [
          { type: "program_start" },
          { type: "error", message: "The trace came back unreadable." },
        ],
        ranUserCode: true,
        sourceMatches: true,
      };
    }

    return {
      events,
      ranUserCode: true,
      // Line numbers refer to the file as written: the rewrite preserves them,
      // and a file that could not be rewritten is reported through `note`.
      sourceMatches: true,
      note:
        run.note ??
        (run.truncated
          ? "The trace was cut short — see the console for why."
          : undefined),
    };
  }
}
