/// <reference lib="webworker" />
import { runInstrumented } from "./runtime";

/**
 * Thin worker wrapper around the runtime.
 *
 * A Worker for two reasons: an infinite loop cannot be interrupted from
 * inside, so the only reliable stop is terminating the thread from outside;
 * and a Worker has no DOM, so the code cannot reach into the page.
 *
 * This is NOT a sandbox for untrusted code — it shares the origin and can
 * still use fetch. It is sized for the real case: running your own code in
 * your own browser.
 */
self.onmessage = (event: MessageEvent<{ code: string }>) => {
  try {
    const { events, truncated } = runInstrumented(event.data.code);
    (self as unknown as Worker).postMessage({ ok: true, events, truncated });
  } catch (error) {
    (self as unknown as Worker).postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
