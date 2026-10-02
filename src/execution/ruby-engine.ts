import { createWasmWorkerEngine } from "./wasm-worker-engine";

/**
 * Ruby, executed by ruby.wasm inside a Worker.
 *
 * TracePoint gives real line, call and return events with locals attached, so
 * Ruby is a fully traced language rather than an output-only one — and it runs
 * in the browser, so no source leaves the machine.
 */
export const rubyEngine = createWasmWorkerEngine({
  id: "ruby-wasm",
  language: "ruby",
  runtimeLabel: "Ruby",
  createWorker: () =>
    new Worker(new URL("./ruby-runner.worker.ts", import.meta.url), {
      type: "module",
    }),
});
