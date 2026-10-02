/// <reference lib="webworker" />
import { DefaultRubyVM } from "@ruby/wasm-wasi/dist/browser";
import { RUBY_TRACER } from "./ruby-tracer";

/**
 * Runs Ruby in a Worker via ruby.wasm (CRuby compiled to WebAssembly).
 *
 * The split mirrors the Python worker: the small JS glue is bundled, while the
 * ~30 MB runtime is fetched at first use so someone writing JavaScript never
 * pays for it. The browser caches it after that.
 *
 * The Worker also gives the only reliable way to stop a wedged program — Ruby
 * inside WebAssembly cannot be interrupted from outside, so the whole thread
 * is terminated instead.
 */

interface RubyVm {
  eval(code: string): { toString(): string };
}

let vm: RubyVm | null = null;

/** Default CDN. Overridable so a deployment can self-host the runtime. */
const DEFAULT_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@ruby/3.4-wasm-wasi@2.10.1/dist/ruby%2Bstdlib.wasm";

async function boot(wasmUrl: string): Promise<RubyVm> {
  if (vm) return vm;

  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Could not download the Ruby runtime (${response.status}).`);
  }

  // compileStreaming avoids holding the whole 30 MB as a buffer first.
  const module = await WebAssembly.compileStreaming(response);
  const booted = await DefaultRubyVM(module);

  booted.vm.eval(RUBY_TRACER);
  vm = booted.vm as RubyVm;
  return vm;
}

/** UTF-8 safe base64. btoa alone throws on anything outside Latin-1. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

self.onmessage = async (
  event: MessageEvent<{ source: string; wasmUrl?: string }>,
) => {
  const post = (data: unknown) => (self as unknown as Worker).postMessage(data);

  try {
    const runtime = await boot(event.data.wasmUrl ?? DEFAULT_WASM_URL);

    const raw = runtime
      .eval(`CodeFlow.run_b64('${toBase64(event.data.source)}')`)
      .toString();

    const { events, truncated } = JSON.parse(raw) as {
      events: unknown[];
      truncated: boolean;
    };
    post({ ok: true, events, truncated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({
      ok: false,
      message: /fetch|network|download|compile/i.test(message)
        ? "Could not download the Ruby runtime. Check your connection and try again."
        : message,
    });
  }
};
