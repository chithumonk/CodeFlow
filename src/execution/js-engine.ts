import type { EngineResult, ExecutionEngine, ExecutionEvent } from "./events";
import { instrument, InstrumentError } from "./instrument";

/**
 * Engines for the JavaScript family.
 *
 * TypeScript reuses every part of this: it is stripped to JavaScript first by
 * a transform that preserves line numbers, so the instrumenter, the worker
 * and the trace all keep referring to the line the reader actually wrote.
 */

/** Longer than the worker's own budget, so its error wins when it can. */
const HARD_TIMEOUT_MS = 6000;

interface WorkerSuccess {
  ok: true;
  events: ExecutionEvent[];
  truncated: boolean;
}
interface WorkerFailure {
  ok: false;
  message: string;
}

/**
 * Turns source into plain JavaScript on the same lines.
 *
 * Line preservation is not a nicety: every highlight, transcript row and
 * error position is a line number into the user's own file.
 */
export type SourceTransform = (source: string) => string;

function errorResult(
  message: string,
  note: string,
  line?: number,
): EngineResult {
  return {
    events: [
      { type: "program_start" },
      ...(line ? [{ type: "line_execute" as const, line }] : []),
      { type: "error", message, line },
    ],
    ranUserCode: true,
    sourceMatches: true,
    note,
  };
}

class JsFamilyEngine implements ExecutionEngine {
  readonly id: string;
  readonly language: string;
  private transform?: SourceTransform;

  constructor(options: {
    id: string;
    language: string;
    transform?: SourceTransform;
  }) {
    this.id = options.id;
    this.language = options.language;
    this.transform = options.transform;
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

    // --- Strip types, if this is TypeScript -------------------------------
    let plain = source;
    if (this.transform) {
      try {
        plain = this.transform(source);
      } catch (error) {
        const err = error as Error & { loc?: { line: number } };
        return errorResult(
          `SyntaxError: ${err.message}`,
          "The program could not be compiled.",
          err.loc?.line,
        );
      }
    }

    // --- Parse and instrument ---------------------------------------------
    let instrumented: string;
    try {
      instrumented = instrument(plain);
    } catch (error) {
      if (error instanceof InstrumentError) {
        // A syntax error is a result, not a crash: show it on the line.
        return errorResult(
          `SyntaxError: ${error.message}`,
          "The program could not be parsed.",
          error.line,
        );
      }
      throw error;
    }

    // --- Run in a worker ----------------------------------------------------
    const worker = new Worker(
      new URL("./js-runner.worker.ts", import.meta.url),
      { type: "module" },
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
    };

    try {
      const result = await new Promise<WorkerSuccess | WorkerFailure>(
        (resolve, reject) => {
          onAbort = () => {
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal?.addEventListener("abort", onAbort, { once: true });

          worker.onmessage = (event: MessageEvent) =>
            resolve(event.data as WorkerSuccess | WorkerFailure);

          worker.onerror = (event) => {
            reject(new Error(event.message || "The execution worker failed."));
          };

          // Backstop: the worker's own budget should fire first, but a tight
          // loop with no instrumented statements could still wedge it.
          timer = setTimeout(() => {
            worker.terminate();
            resolve({
              ok: false,
              message: `Stopped after ${HARD_TIMEOUT_MS / 1000} seconds — the program did not finish.`,
            });
          }, HARD_TIMEOUT_MS);

          worker.postMessage({ code: instrumented });
        },
      );

      if (!result.ok) {
        return {
          events: [
            { type: "program_start" },
            { type: "error", message: result.message },
          ],
          ranUserCode: true,
          sourceMatches: true,
          note: result.message,
        };
      }

      return {
        events: result.events,
        ranUserCode: true,
        sourceMatches: true,
        note: result.truncated
          ? "The trace was cut short — see the console for why."
          : undefined,
      };
    } finally {
      cleanup();
    }
  }
}

export function createJsFamilyEngine(options: {
  id: string;
  language: string;
  transform?: SourceTransform;
}): ExecutionEngine {
  return new JsFamilyEngine(options);
}

export const javascriptEngine = createJsFamilyEngine({
  id: "javascript-worker",
  language: "javascript",
});
