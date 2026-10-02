import type { EngineResult, ExecutionEngine, ExecutionEvent } from "./events";

/**
 * Shared lifecycle for languages whose runtime is a WebAssembly build loaded
 * into a Worker — Python via Pyodide, Ruby via ruby.wasm.
 *
 * Everything interesting about these two is identical: the first run of a
 * session also downloads and starts a whole language runtime, later runs reuse
 * the warm worker, and a wedged program can only be stopped by terminating the
 * thread, because WebAssembly cannot be interrupted from outside.
 *
 * The worker contract is one message in, one message out:
 *   in:  { source }
 *   out: { ok: true, events, truncated } | { ok: false, message }
 */

interface WorkerSuccess {
  ok: true;
  events: ExecutionEvent[];
  truncated: boolean;
}
interface WorkerFailure {
  ok: false;
  message: string;
}

export interface WasmEngineOptions {
  id: string;
  language: string;
  /** Used in timeout and failure messages, e.g. "Python", "Ruby". */
  runtimeLabel: string;
  /**
   * Must contain a literal `new Worker(new URL("./x.worker.ts", import.meta.url))`
   * in the calling module — the bundler needs to see it to emit the chunk.
   */
  createWorker: () => Worker;
  /** Long enough to cover downloading and booting the runtime. */
  firstRunTimeoutMs?: number;
  /** Once warm, a program taking this long is stuck. */
  warmTimeoutMs?: number;
}

const DEFAULT_FIRST_RUN_TIMEOUT_MS = 60_000;
const DEFAULT_WARM_TIMEOUT_MS = 10_000;

class WasmWorkerEngine implements ExecutionEngine {
  readonly id: string;
  readonly language: string;

  private runtimeLabel: string;
  private createWorker: () => Worker;
  private firstRunTimeoutMs: number;
  private warmTimeoutMs: number;

  /** Kept warm between runs so the runtime is downloaded once per session. */
  private worker: Worker | null = null;
  private booted = false;

  constructor(options: WasmEngineOptions) {
    this.id = options.id;
    this.language = options.language;
    this.runtimeLabel = options.runtimeLabel;
    this.createWorker = options.createWorker;
    this.firstRunTimeoutMs =
      options.firstRunTimeoutMs ?? DEFAULT_FIRST_RUN_TIMEOUT_MS;
    this.warmTimeoutMs = options.warmTimeoutMs ?? DEFAULT_WARM_TIMEOUT_MS;
  }

  private ensureWorker(): Worker {
    if (!this.worker) this.worker = this.createWorker();
    return this.worker;
  }

  /** Throw the worker away — the only way to stop mid-execution. */
  private discardWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.booted = false;
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

    const worker = this.ensureWorker();
    const timeout = this.booted ? this.warmTimeoutMs : this.firstRunTimeoutMs;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};

    const detach = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
    };

    try {
      const result = await new Promise<WorkerSuccess | WorkerFailure>(
        (resolve, reject) => {
          onAbort = () => {
            detach();
            this.discardWorker();
            reject(new DOMException("Aborted", "AbortError"));
          };
          signal?.addEventListener("abort", onAbort, { once: true });

          worker.onmessage = (event: MessageEvent) =>
            resolve(event.data as WorkerSuccess | WorkerFailure);

          worker.onerror = (event) => {
            this.discardWorker();
            reject(
              new Error(
                event.message || `The ${this.runtimeLabel} worker failed.`,
              ),
            );
          };

          timer = setTimeout(() => {
            // A wedged program cannot be interrupted, so the runtime goes with
            // it and the next run boots afresh.
            const wasBooted = this.booted;
            this.discardWorker();
            resolve({
              ok: false,
              message: wasBooted
                ? `Stopped after ${this.warmTimeoutMs / 1000} seconds — the program did not finish.`
                : `The ${this.runtimeLabel} runtime did not start in time. Check your connection and try again.`,
            });
          }, timeout);

          worker.postMessage({ source });
        },
      );

      if (result.ok) this.booted = true;

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
      detach();
    }
  }
}

export function createWasmWorkerEngine(
  options: WasmEngineOptions,
): ExecutionEngine {
  return new WasmWorkerEngine(options);
}
