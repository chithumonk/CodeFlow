import type { ExecutionEngine } from "./events";
import { RUN_LANGUAGES } from "./run-languages";

/**
 * Every language CodeFlow knows, in two tiers.
 *
 * **Traced** languages run in your browser and produce a step-by-step
 * recording: line highlighting, variables, call stack, scrubbing. This needs
 * a hook inside the runtime — instrumenting a JavaScript AST, Python's
 * sys.settrace, Ruby's TracePoint — so the list is short and grows slowly.
 *
 * **Run** languages execute remotely and report what they printed. There is
 * no trace, because a batch executor offers nowhere to attach one. The
 * workspace hides the stepping controls for these rather than showing
 * buttons that cannot do anything.
 *
 * Language is decided by file extension, so a project can mix tiers freely.
 */

export type LanguageTier = "traced" | "run";

export interface Language {
  id: string;
  label: string;
  tier: LanguageTier;
  /** Lowercase, with the dot. First entry is the canonical one. */
  extensions: string[];
  sample: string;
  loadEngine: () => Promise<ExecutionEngine>;
  /** True when the first run downloads a large runtime. */
  heavyRuntime?: boolean;
  /**
   * File name a new project starts with. Defaults to "main" plus the
   * canonical extension; Java overrides it because its sample declares
   * `public class Main`, which has to match the file name.
   */
  starterFile?: string;
}

const JS_SAMPLE = `function calculate(numbers) {
  let total = 0;

  for (const n of numbers) {
    total += n;
  }

  return total;
}

const result = calculate([1, 2, 3, 4, 5]);
console.log('total is', result);
`;

const TS_SAMPLE = `interface Point {
  x: number;
  y: number;
}

function distance(a: Point, b: Point): number {
  const dx: number = b.x - a.x;
  const dy: number = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const d = distance({ x: 0, y: 0 }, { x: 3, y: 4 });
console.log('distance is', d);
`;

const JAVA_SAMPLE = `public class Main {
    public static void main(String[] args) {
        int total = 0;

        for (int n = 1; n <= 4; n++) {
            total += factorial(n);
            System.out.println("factorial(" + n + ") brings the total to " + total);
        }
    }

    static int factorial(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * factorial(n - 1);
    }
}
`;

const C_SAMPLE = `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main(void) {
    int total = 0;

    for (int n = 1; n <= 4; n++) {
        total += factorial(n);
        printf("factorial(%d) brings the total to %d\\n", n, total);
    }

    return 0;
}
`;

const CPP_SAMPLE = `#include <iostream>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    int total = 0;

    for (int n = 1; n <= 4; n++) {
        total += factorial(n);
        std::cout << "factorial(" << n << ") brings the total to " << total
                  << std::endl;
    }

    return 0;
}
`;

const RB_SAMPLE = `def factorial(n)
  raise ArgumentError, 'n must not be negative' if n < 0
  return 1 if n <= 1

  n * factorial(n - 1)
end

total = 0
[3, 4, 5].each do |n|
  total += factorial(n)
  puts "factorial(#{n}) brings the total to #{total}"
end
`;

const PY_SAMPLE = `def factorial(n):
    if n < 0:
        raise ValueError("Factorial is not defined for negative numbers.")
    if n in (0, 1):
        return 1
    return n * factorial(n - 1)


print(factorial(5))
`;

/** The short list: languages with a real tracing hook. */
const TRACED_LANGUAGES: Language[] = [
  {
    id: "javascript",
    label: "JavaScript",
    tier: "traced",
    extensions: [".js", ".mjs"],
    sample: JS_SAMPLE,
    loadEngine: async () => (await import("./js-engine")).javascriptEngine,
  },
  {
    id: "typescript",
    label: "TypeScript",
    tier: "traced",
    extensions: [".ts"],
    sample: TS_SAMPLE,
    loadEngine: async () => (await import("./ts-engine")).typescriptEngine,
  },
  {
    id: "python",
    label: "Python",
    tier: "traced",
    extensions: [".py"],
    sample: PY_SAMPLE,
    // Pyodide is several megabytes and takes a few seconds to start.
    heavyRuntime: true,
    loadEngine: async () => (await import("./python-engine")).pythonEngine,
  },
  {
    id: "java",
    label: "Java",
    tier: "traced",
    extensions: [".java"],
    sample: JAVA_SAMPLE,
    starterFile: "Main.java",
    loadEngine: async () => {
      const { RemoteTracedEngine } = await import("./remote-traced-engine");
      return new RemoteTracedEngine({ language: "java" });
    },
  },
  {
    id: "c",
    label: "C",
    tier: "traced",
    extensions: [".c"],
    sample: C_SAMPLE,
    loadEngine: async () => {
      const { RemoteTracedEngine } = await import("./remote-traced-engine");
      return new RemoteTracedEngine({ language: "c" });
    },
  },
  {
    id: "cpp",
    label: "C++",
    tier: "traced",
    extensions: [".cpp", ".cc", ".cxx"],
    sample: CPP_SAMPLE,
    loadEngine: async () => {
      const { RemoteTracedEngine } = await import("./remote-traced-engine");
      return new RemoteTracedEngine({ language: "cpp" });
    },
  },
  {
    id: "ruby",
    label: "Ruby",
    tier: "traced",
    extensions: [".rb"],
    sample: RB_SAMPLE,
    // ruby.wasm is ~30 MB on first use, then cached by the browser.
    heavyRuntime: true,
    loadEngine: async () => (await import("./ruby-engine")).rubyEngine,
  },
];

/** Remote tier, built from the provider's catalogue. */
const REMOTE_LANGUAGES: Language[] = RUN_LANGUAGES.map((spec) => ({
  id: spec.id,
  label: spec.label,
  tier: "run" as const,
  extensions: spec.extensions,
  sample: spec.sample,
  loadEngine: async () => {
    const { RemoteExecutionEngine } = await import("./remote-engine");
    return new RemoteExecutionEngine({
      language: spec.id,
      version: spec.version,
    });
  },
}));

export const LANGUAGE_LIST: Language[] = [
  ...TRACED_LANGUAGES,
  ...REMOTE_LANGUAGES,
];

export const TRACED_LIST = TRACED_LANGUAGES;
export const RUN_LIST = REMOTE_LANGUAGES;

/**
 * Extension → language. Built once; a later entry never displaces an earlier
 * one, so the traced tier wins any collision (`.ts` is TypeScript, not
 * something a provider also claims).
 */
const BY_EXTENSION = new Map<string, Language>();
for (const language of LANGUAGE_LIST) {
  for (const ext of language.extensions) {
    if (!BY_EXTENSION.has(ext)) BY_EXTENSION.set(ext, language);
  }
}

export const ALL_EXTENSIONS: string[] = [...BY_EXTENSION.keys()];

/** Which language a file name implies. Null when the extension is unknown. */
export function languageForFile(name: string): Language | null {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXTENSION.get(lower.slice(dot)) ?? null;
}

/** The engine that should run this file. */
export async function engineForFile(
  name: string,
): Promise<ExecutionEngine | null> {
  const language = languageForFile(name);
  return language ? language.loadEngine() : null;
}

/** True when this file can be stepped through rather than just run. */
export function isTraceable(name: string): boolean {
  return languageForFile(name)?.tier === "traced";
}

/** What a new project in this language should call its first file. */
export function starterFileName(language: Language): string {
  return language.starterFile ?? `main${language.extensions[0]}`;
}

/** Look a language up by id. */
export function languageById(id: string): Language | null {
  return LANGUAGE_LIST.find((l) => l.id === id) ?? null;
}
