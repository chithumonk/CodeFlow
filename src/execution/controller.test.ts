import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ExecutionController } from "./controller";
import { demoEngine } from "./demo-engine";
import type { EngineResult, ExecutionEngine } from "./events";

/** Engine that returns a fixed three-step trace, so counts are predictable. */
const tinyEngine: ExecutionEngine = {
  id: "tiny",
  language: "javascript",
  async run(): Promise<EngineResult> {
    return {
      ranUserCode: false,
      sourceMatches: false,
      events: [
        { type: "line_execute", line: 1 },
        { type: "line_execute", line: 2 },
        { type: "line_execute", line: 3 },
        { type: "program_end" },
      ],
    };
  },
};

const failingEngine: ExecutionEngine = {
  id: "bad",
  language: "javascript",
  async run() {
    throw new Error("engine exploded");
  },
};

/**
 * A remote runner: console output, no steps. This is a successful run, and
 * treating "no frames" as a failure told Java users their program had broken.
 */
const outputOnlyEngine: ExecutionEngine = {
  id: "remote",
  language: "java",
  traceable: false,
  async run(): Promise<EngineResult> {
    return {
      ranUserCode: true,
      sourceMatches: true,
      note: "Java runs remotely.",
      events: [
        { type: "program_start" },
        { type: "console_output", level: "log", text: "hi" },
        { type: "program_end" },
      ],
    };
  },
};

/** Same, but the remote compile failed. That is a genuine error. */
const failedCompileEngine: ExecutionEngine = {
  id: "remote-bad",
  language: "java",
  traceable: false,
  async run(): Promise<EngineResult> {
    return {
      ranUserCode: true,
      sourceMatches: true,
      events: [
        { type: "program_start" },
        { type: "error", message: "cannot find symbol" },
      ],
    };
  },
};

describe("ExecutionController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle", () => {
    const c = new ExecutionController(tinyEngine, 10);
    expect(c.getState().status).toBe("idle");
    expect(c.getState().step).toBe(-1);
  });

  it("runs to completion and stops at the last step", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");

    expect(c.getState().totalSteps).toBe(3);
    expect(c.getState().status).toBe("running");

    await vi.advanceTimersByTimeAsync(100);

    expect(c.getState().status).toBe("completed");
    // Never runs past the end.
    expect(c.getState().step).toBe(2);
  });

  it("treats a stepless output-only run as completed, not an error", async () => {
    const c = new ExecutionController(outputOnlyEngine, 10);
    await c.run("");

    const s = c.getState();
    expect(s.status).toBe("completed");
    expect(s.error).toBeNull();
    expect(s.totalSteps).toBe(0);
    // The console still has to survive, since it is the only output.
    expect(s.trace?.console.map((l) => l.text)).toEqual(["hi"]);
    // And the explanatory note must not be dropped on this path.
    expect(s.note).toBe("Java runs remotely.");
    expect(s.ranUserCode).toBe(true);
  });

  it("still reports an error when a stepless run actually failed", async () => {
    const c = new ExecutionController(failedCompileEngine, 10);
    await c.run("");

    expect(c.getState().status).toBe("error");
    expect(c.getState().error).toBe("cannot find symbol");
  });

  it("a traceable engine returning no steps is still an error", async () => {
    const empty: ExecutionEngine = {
      id: "empty",
      language: "javascript",
      async run(): Promise<EngineResult> {
        return { ranUserCode: true, sourceMatches: true, events: [] };
      },
    };
    const c = new ExecutionController(empty, 10);
    await c.run("");

    expect(c.getState().status).toBe("error");
    expect(c.getState().error).toMatch(/no steps/i);
  });

  it("pause stops the clock; resume restarts it", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");

    c.pause();
    const frozen = c.getState().step;
    await vi.advanceTimersByTimeAsync(100);
    expect(c.getState().step).toBe(frozen);
    expect(c.getState().status).toBe("paused");

    c.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(c.getState().status).toBe("completed");
  });

  it("stepping pauses and clamps at both ends", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");
    c.pause();
    c.seek(0);

    c.stepBackward();
    expect(c.getState().step).toBe(0);

    c.stepForward();
    c.stepForward();
    c.stepForward();
    expect(c.getState().step).toBe(2);
    expect(c.getState().status).toBe("completed");
  });

  it("seek clamps out-of-range values", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");
    c.seek(999);
    expect(c.getState().step).toBe(2);
    c.seek(-5);
    expect(c.getState().step).toBe(0);
  });

  it("stop resets to idle", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");
    c.stop();
    expect(c.getState().status).toBe("idle");
    expect(c.getState().step).toBe(-1);
  });

  it("restart replays without re-running the engine", async () => {
    const spy = vi.spyOn(tinyEngine, "run");
    const c = new ExecutionController(tinyEngine, 10);
    await c.run("");
    const callsAfterRun = spy.mock.calls.length;

    c.restart();
    expect(c.getState().step).toBe(0);
    expect(spy.mock.calls.length).toBe(callsAfterRun);
    spy.mockRestore();
  });

  it("surfaces an engine failure as error status", async () => {
    const c = new ExecutionController(failingEngine, 10);
    await c.run("");
    expect(c.getState().status).toBe("error");
    expect(c.getState().error).toMatch(/exploded/);
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const c = new ExecutionController(tinyEngine, 10);
    const seen: string[] = [];
    const off = c.subscribe((s) => seen.push(s.status));

    await c.run("");
    expect(seen.length).toBeGreaterThan(0);

    off();
    const before = seen.length;
    c.pause();
    expect(seen.length).toBe(before);
  });

  it("reports that the demo engine did not run user code", async () => {
    const c = new ExecutionController(demoEngine, 10);
    await c.run("console.log('hi')");
    expect(c.getState().ranUserCode).toBe(false);
    expect(c.getState().note).toBeTruthy();
    // The editor must not be told to highlight lines from another program.
    expect(c.getState().sourceMatches).toBe(false);
  });
});
