import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The mapping from a provider's response to what the workspace shows.
 *
 * Worth testing because the failure modes are the interesting part: a
 * compile error, a timeout and a crash all have to be told apart, and a
 * successful compile that printed warnings must not look like a failure.
 */

vi.mock("../config.js", () => ({
  config: {
    EXECUTION_PROVIDER: "judge0",
    EXECUTION_PROVIDER_URL: "https://judge0.test",
    EXECUTION_PROVIDER_TOKEN: undefined,
    EXECUTION_TIMEOUT_MS: 10_000,
  },
}));

vi.mock("../logging/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { executeRemotely } = await import("./execute.js");

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

/** Judge0 replies with base64 fields; build one without repeating that. */
function judge0(body: Record<string, unknown>, init: ResponseInit = {}) {
  const encoded = Object.fromEntries(
    Object.entries(body).map(([key, value]) =>
      typeof value === "string" ? [key, b64(value)] : [key, value],
    ),
  );
  return new Response(JSON.stringify(encoded), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const run = (language = "java") =>
  executeRemotely({ language, version: "*", source: "class Main {}" });

describe("executeRemotely via Judge0", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the pinned language id and base64 source", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(judge0({ stdout: "hi\n", status: { id: 3 } }));

    await executeRemotely({
      language: "kotlin",
      version: "*",
      source: 'println("hé")',
    });

    const call = fetchMock.mock.calls[0]!;
    const [url, init] = call;
    expect(String(url)).toContain("/submissions");
    expect(String(url)).toContain("base64_encoded=true");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent.language_id).toBe(111);
    // Non-ASCII has to survive the round trip.
    expect(Buffer.from(sent.source_code, "base64").toString("utf8")).toBe(
      'println("hé")',
    );
  });

  it("returns stdout for a successful run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      judge0({ stdout: "total is 15\n", exit_code: 0, status: { id: 3 } }),
    );

    const result = await run();
    expect(result).toMatchObject({
      stdout: "total is 15\n",
      exitCode: 0,
      compileFailed: false,
      signal: null,
    });
  });

  it("treats compile warnings on a successful run as output, not failure", async () => {
    // Kotlin prints a JVM warning while compiling even when it succeeds.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      judge0({
        stdout: "total is 15\n",
        compile_output: "warning: Options -Xverify:none are deprecated\n",
        exit_code: 0,
        status: { id: 3 },
      }),
    );

    const result = await run("kotlin");
    expect(result.compileFailed).toBe(false);
    expect(result.stdout).toBe("total is 15\n");
    expect(result.stderr).toMatch(/deprecated/);
  });

  it("reports a compile error with the compiler's own message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      judge0({
        compile_output: "Main.java:1: error: <identifier> expected\n",
        status: { id: 6 },
      }),
    );

    const result = await run();
    expect(result.compileFailed).toBe(true);
    expect(result.stderr).toMatch(/<identifier> expected/);
  });

  it("reports a timeout as a stopped run rather than a crash", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      judge0({ stdout: "partial\n", status: { id: 5 } }),
    );

    const result = await run();
    expect(result.signal).toBe("TIMEOUT");
    expect(result.compileFailed).toBe(false);
    expect(result.stdout).toBe("partial\n");
    expect(result.stderr).toMatch(/time limit/i);
  });

  it("reports a runtime crash with its signal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      judge0({ stderr: "", message: "SIGSEGV", status: { id: 11 } }),
    );

    const result = await run();
    expect(result.compileFailed).toBe(false);
    expect(result.stderr).toMatch(/SIGSEGV/);
  });

  it("refuses a language this provider does not have", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(run("zig")).rejects.toThrow(/cannot run zig/i);
    // It must fail before spending a network call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a 401 instead of blaming the user's code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 }),
    );

    await expect(run()).rejects.toThrow(/no execution service/i);
  });

  it("surfaces rate limiting as its own thing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("slow down", { status: 429 }),
    );

    await expect(run()).rejects.toThrow(/rate limiting/i);
  });

  it("rejects a file too large to run before calling out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      executeRemotely({
        language: "java",
        version: "*",
        source: "x".repeat(200_001),
      }),
    ).rejects.toThrow(/too large/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
