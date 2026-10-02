import { GraphQLError } from "graphql";
import { config } from "../config.js";
import { logger } from "../logging/logger.js";
import {
  JUDGE0_LANGUAGE_IDS,
  JUDGE0_STATUS,
  PISTON_LANGUAGE_NAMES,
} from "./judge0-languages.js";

/**
 * Remote code execution, for the languages that cannot run in a browser.
 *
 * Requests are proxied through this server rather than sent from the browser
 * directly, for three reasons: the provider URL and any credentials stay out
 * of the bundle, the call can be restricted to signed-in users, and swapping
 * provider — or self-hosting one — becomes a config change rather than a
 * frontend release.
 *
 * Two providers are supported:
 *
 *   judge0  (default) — the public instance needs no key and covers the
 *                       compiled languages. Pinned compiler versions.
 *   piston            — what a self-hosted runner usually is. Covers a wider
 *                       catalogue, but the public instance became whitelist
 *                       only in February 2026.
 *
 * This returns output only. It cannot produce a step-by-step trace: that
 * needs a hook inside the language runtime, which a remote batch executor
 * does not offer.
 */

export interface ExecutionOutput {
  stdout: string;
  stderr: string;
  /** Null when the process was killed rather than exiting. */
  exitCode: number | null;
  /** Set when the run was cut short. */
  signal: string | null;
  /** True when compilation failed before the program ran. */
  compileFailed: boolean;
}

export interface ExecuteInput {
  language: string;
  version: string;
  source: string;
  stdin?: string;
}

/** Guards against someone pasting a novel into the editor. */
const MAX_SOURCE_BYTES = 200_000;

function unavailable(aborted: boolean): never {
  throw new GraphQLError(
    aborted
      ? "The program took too long to run and was stopped."
      : "Could not reach the execution service. Try again shortly.",
    { extensions: { code: "EXECUTION_UNAVAILABLE", http: { status: 503 } } },
  );
}

/** Shared handling for the statuses that mean "not your code's fault". */
async function assertUsable(response: Response): Promise<void> {
  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => "");
    logger.error(
      { status: response.status, body: body.slice(0, 300) },
      "execute provider refused our credentials",
    );
    throw new GraphQLError(
      "This CodeFlow instance has no execution service it is allowed to use. " +
        "Run languages need a runner — set EXECUTION_PROVIDER_URL on the server.",
      { extensions: { code: "EXECUTION_NOT_CONFIGURED", http: { status: 503 } } },
    );
  }

  if (response.status === 429) {
    throw new GraphQLError(
      "The execution service is rate limiting us. Wait a moment and try again.",
      { extensions: { code: "RATE_LIMITED", http: { status: 429 } } },
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error(
      { status: response.status, body: body.slice(0, 500) },
      "execute provider error",
    );
    throw new GraphQLError("The execution service rejected that request.", {
      extensions: { code: "EXECUTION_FAILED", http: { status: 502 } },
    });
  }
}

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    // The provider enforces its own limit; this is the ceiling on waiting for
    // an answer at all, so it has to be the longer of the two.
    config.EXECUTION_TIMEOUT_MS + 5_000,
  );
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

// --- Judge0 ----------------------------------------------------------------

interface Judge0Response {
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  exit_code?: number | null;
  status?: { id?: number; description?: string };
}

const b64 = {
  encode: (text: string) => Buffer.from(text, "utf8").toString("base64"),
  decode: (text: string | null | undefined) =>
    text ? Buffer.from(text, "base64").toString("utf8") : "",
};

async function executeViaJudge0(
  input: ExecuteInput,
): Promise<ExecutionOutput> {
  const languageId = JUDGE0_LANGUAGE_IDS[input.language];

  if (!languageId) {
    throw new GraphQLError(
      `The configured execution service cannot run ${input.language}. ` +
        "A self-hosted Piston runner covers more languages.",
      {
        extensions: {
          code: "EXECUTION_LANGUAGE_UNSUPPORTED",
          http: { status: 400 },
        },
      },
    );
  }

  const { signal, done } = withTimeout();
  let response: Response;

  try {
    response = await fetch(
      `${config.EXECUTION_PROVIDER_URL}/submissions?base64_encoded=true&wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.EXECUTION_PROVIDER_TOKEN
            ? { "X-Auth-Token": config.EXECUTION_PROVIDER_TOKEN }
            : {}),
        },
        signal,
        body: JSON.stringify({
          language_id: languageId,
          // Base64 so a program containing any byte sequence survives the
          // round trip unchanged.
          source_code: b64.encode(input.source),
          stdin: b64.encode(input.stdin ?? ""),
          cpu_time_limit: Math.ceil(config.EXECUTION_TIMEOUT_MS / 1000),
        }),
      },
    );
  } catch (error) {
    logger.warn({ err: error, language: input.language }, "execute failed");
    unavailable((error as Error)?.name === "AbortError");
  } finally {
    done();
  }

  await assertUsable(response);
  const body = (await response.json()) as Judge0Response;

  const status = body.status?.id ?? JUDGE0_STATUS.INTERNAL_ERROR;
  const stdout = b64.decode(body.stdout);
  const compileOutput = b64.decode(body.compile_output);
  const stderr = b64.decode(body.stderr);

  // A successful compile can still print warnings, so only the status decides.
  if (status === JUDGE0_STATUS.COMPILATION_ERROR) {
    return {
      stdout: "",
      stderr: compileOutput || "Compilation failed.",
      exitCode: 1,
      signal: null,
      compileFailed: true,
    };
  }

  if (status === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED) {
    return {
      stdout,
      stderr: stderr || "The program ran longer than the time limit allows.",
      exitCode: null,
      signal: "TIMEOUT",
      compileFailed: false,
    };
  }

  if (status === JUDGE0_STATUS.ACCEPTED) {
    return {
      stdout,
      // Warnings printed during a successful compile are worth showing.
      stderr: stderr || compileOutput,
      exitCode: body.exit_code ?? 0,
      signal: null,
      compileFailed: false,
    };
  }

  // Everything else is the program failing at runtime: signals, non-zero
  // exits, memory limits. `message` carries the signal name when there is one.
  const message = b64.decode(body.message);
  return {
    stdout,
    stderr: stderr || message || body.status?.description || "The program failed.",
    exitCode: body.exit_code ?? null,
    signal: body.exit_code === null || body.exit_code === undefined ? message || null : null,
    compileFailed: false,
  };
}

// --- Piston ----------------------------------------------------------------

interface PistonStage {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: string | null;
}

interface PistonResponse {
  run?: PistonStage;
  compile?: PistonStage;
  message?: string;
}

async function executeViaPiston(input: ExecuteInput): Promise<ExecutionOutput> {
  const { signal, done } = withTimeout();
  let response: Response;

  try {
    response = await fetch(`${config.EXECUTION_PROVIDER_URL}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.EXECUTION_PROVIDER_TOKEN
          ? { Authorization: `Bearer ${config.EXECUTION_PROVIDER_TOKEN}` }
          : {}),
      },
      signal,
      body: JSON.stringify({
        language: PISTON_LANGUAGE_NAMES[input.language] ?? input.language,
        version: input.version,
        files: [{ content: input.source }],
        stdin: input.stdin ?? "",
        run_timeout: config.EXECUTION_TIMEOUT_MS,
        compile_timeout: config.EXECUTION_TIMEOUT_MS,
      }),
    });
  } catch (error) {
    logger.warn({ err: error, language: input.language }, "execute failed");
    unavailable((error as Error)?.name === "AbortError");
  } finally {
    done();
  }

  await assertUsable(response);
  const body = (await response.json()) as PistonResponse;

  // A compile failure never reaches the run stage, so its output is the
  // only thing worth showing.
  const compile = body.compile;
  if (compile && typeof compile.code === "number" && compile.code !== 0) {
    return {
      stdout: compile.stdout ?? "",
      stderr: compile.stderr ?? body.message ?? "Compilation failed.",
      exitCode: compile.code,
      signal: compile.signal ?? null,
      compileFailed: true,
    };
  }

  const run = body.run ?? {};
  return {
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    exitCode: run.code ?? null,
    signal: run.signal ?? null,
    compileFailed: false,
  };
}

// --- Entry point -----------------------------------------------------------

export async function executeRemotely(
  input: ExecuteInput,
): Promise<ExecutionOutput> {
  if (Buffer.byteLength(input.source, "utf8") > MAX_SOURCE_BYTES) {
    throw new GraphQLError("That file is too large to run.", {
      extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
    });
  }

  return config.EXECUTION_PROVIDER === "judge0"
    ? executeViaJudge0(input)
    : executeViaPiston(input);
}
