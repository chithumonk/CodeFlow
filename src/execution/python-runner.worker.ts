/// <reference lib="webworker" />
import { PYTHON_TRACER } from "./python-tracer";

/**
 * Runs Python in a Worker via Pyodide.
 *
 * Pyodide is fetched at first use rather than bundled: it is several
 * megabytes, and someone writing JavaScript should never pay for it. The
 * Worker also gives the only reliable way to stop a wedged program — Python
 * running inside WebAssembly cannot be interrupted from outside, so the whole
 * thread is terminated instead.
 */

interface PyodideApi {
  runPython(code: string): unknown;
  globals: { get(name: string): ((source: string) => string) | undefined };
}

let pyodide: PyodideApi | null = null;

/** Default CDN. Overridable so a deployment can self-host the runtime. */
const DEFAULT_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";

async function boot(indexUrl: string): Promise<PyodideApi> {
  if (pyodide) return pyodide;

  // @vite-ignore: the URL is resolved at runtime, not bundled.
  const module = (await import(
    /* @vite-ignore */ `${indexUrl}pyodide.mjs`
  )) as {
    loadPyodide(options: { indexURL: string }): Promise<PyodideApi>;
  };

  const instance = await module.loadPyodide({ indexURL: indexUrl });
  instance.runPython(PYTHON_TRACER);
  pyodide = instance;
  return instance;
}

self.onmessage = async (
  event: MessageEvent<{ source: string; indexUrl?: string }>,
) => {
  const post = (data: unknown) => (self as unknown as Worker).postMessage(data);

  try {
    const runtime = await boot(event.data.indexUrl ?? DEFAULT_INDEX_URL);
    const run = runtime.globals.get("codeflow_run");

    if (!run) {
      post({ ok: false, message: "The Python tracer failed to install." });
      return;
    }

    const raw = run(event.data.source);
    const { events, truncated } = JSON.parse(raw) as {
      events: unknown[];
      truncated: boolean;
    };
    post({ ok: true, events, truncated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({
      ok: false,
      message: /fetch|network|import/i.test(message)
        ? "Could not download the Python runtime. Check your connection and try again."
        : message,
    });
  }
};
