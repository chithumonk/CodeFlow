import { createWasmWorkerEngine } from "./wasm-worker-engine";

/**
 * Python, executed by Pyodide inside a Worker.
 *
 * Generous first-run timeout on purpose: that run also downloads and starts a
 * Python runtime, which takes seconds on a good connection and longer on a bad
 * one. Subsequent runs reuse the same warm worker.
 */
export const pythonEngine = createWasmWorkerEngine({
  id: "python-pyodide",
  language: "python",
  runtimeLabel: "Python",
  createWorker: () =>
    new Worker(new URL("./python-runner.worker.ts", import.meta.url), {
      type: "module",
    }),
});
