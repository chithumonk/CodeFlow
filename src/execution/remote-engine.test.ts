import { describe, expect, it, vi } from "vitest";
import { buildTrace } from "./trace";

const gql = vi.fn();
vi.mock("../lib/graphql", () => ({
  gql: (...args: unknown[]) => gql(...args),
  GraphQLRequestError: class extends Error {},
}));

const { RemoteExecutionEngine } = await import("./remote-engine");

const engine = new RemoteExecutionEngine({ language: "java", version: "*" });

const ok = (stdout: string, extra: Record<string, unknown> = {}) => ({
  executeCode: {
    stdout,
    stderr: "",
    exitCode: 0,
    signal: null,
    compileFailed: false,
    ...extra,
  },
});

describe("RemoteExecutionEngine", () => {

  it("is not traceable", () => {
    expect(engine.traceable).toBe(false);
  });

  it("turns stdout into console events", async () => {
    gql.mockResolvedValue(ok("total is 15\n"));
    const result = await engine.run("class Main {}");
    const trace = buildTrace(result.events);

    expect(trace.console.map((l) => l.text)).toEqual(["total is 15"]);
    expect(result.ranUserCode).toBe(true);
  });

  it("never repeats the error text as a note", async () => {
    // The workspace renders `error` as a banner and `note` as a second one,
    // and the console shows the error event too. Setting both to the same
    // string printed one sentence four times on a single screen.
    const message = "This instance has no execution service it may use.";
    // The rejection is marked handled before it is returned. Vitest watches
    // what a mock settles to and reports the failure itself as an unhandled
    // error otherwise, which fails this test even though the engine catches
    // it and returns exactly the right result.
    gql.mockImplementation(() => {
      const failure = Promise.reject(new Error(message));
      failure.catch(() => {});
      return failure;
    });

    const result = await engine.run("class Main {}");
    const trace = buildTrace(result.events);

    expect(trace.error?.message).toBe(message);
    expect(result.note).toBeUndefined();
  });

  it("does not restate what the controls already say", async () => {
    // "Output only" is shown by cf-exec-controls and the side panel, driven
    // by `traceable` rather than by a string, so the engine adding its own
    // copy is duplication that can also drift out of step with them.
    gql.mockResolvedValue(ok("hi\n"));
    const result = await engine.run("class Main {}");
    expect(result.note).toBeUndefined();
  });

  it("reports a failed compile as an error", async () => {
    gql.mockResolvedValue(
      ok("", { compileFailed: true, exitCode: 1, stderr: "cannot find symbol\n" }),
    );
    const trace = buildTrace((await engine.run("class Main {}")).events);

    expect(trace.error?.message).toMatch(/did not compile/i);
    expect(trace.console.some((l) => l.text === "cannot find symbol")).toBe(true);
  });

  it("reports a non-zero exit", async () => {
    gql.mockResolvedValue(ok("", { exitCode: 3 }));
    const trace = buildTrace((await engine.run("class Main {}")).events);
    expect(trace.error?.message).toMatch(/exited with code 3/);
  });

  it("does not call the API for an empty file", async () => {
    // Counted rather than `not.toHaveBeenCalled()`: earlier tests in this file
    // have already called the mock, and there is no beforeEach clearing it —
    // adding one makes Vitest 5.0.2 misreport a caught mock throw as a test
    // failure. A before/after count is exact regardless.
    const before = gql.mock.calls.length;
    const result = await engine.run("   \n  ");

    expect(gql.mock.calls.length).toBe(before);
    expect(result.note).toMatch(/empty/i);
  });
});
