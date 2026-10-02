import { describe, expect, it } from "vitest";
import { buildTrace, consoleUpTo } from "./trace";
import { demoEngine } from "./demo-engine";
import type { ExecutionEvent } from "./events";

describe("buildTrace", () => {
  it("turns incremental events into whole-state frames", () => {
    const events: ExecutionEvent[] = [
      { type: "program_start" },
      { type: "line_execute", line: 1 },
      { type: "variable_declare", name: "x", value: "1" },
      { type: "line_execute", line: 2 },
      { type: "variable_declare", name: "y", value: "2" },
      { type: "program_end" },
    ];

    const { frames } = buildTrace(events);

    expect(frames).toHaveLength(2);
    // Frame 1 knows only about x...
    expect(frames[0].vars.map((v) => v.name)).toEqual(["x"]);
    // ...frame 2 carries x forward and adds y. This is the whole point of
    // the fold: panels render a state, not a delta.
    expect(frames[1].vars.map((v) => v.name)).toEqual(["x", "y"]);
    expect(frames[1].vars.find((v) => v.name === "x")?.value).toBe("1");
  });

  it("marks only the variable written on this step as changed", () => {
    const { frames } = buildTrace([
      { type: "line_execute", line: 1 },
      { type: "variable_declare", name: "a", value: "1" },
      { type: "line_execute", line: 2 },
      { type: "variable_update", name: "a", value: "2" },
      { type: "line_execute", line: 3 },
      { type: "variable_declare", name: "b", value: "9" },
      { type: "program_end" },
    ]);

    expect(frames[1].vars.find((v) => v.name === "a")?.changed).toBe(true);
    // `a` did not change on the step that declared `b`.
    expect(frames[2].vars.find((v) => v.name === "a")?.changed).toBeFalsy();
    expect(frames[2].vars.find((v) => v.name === "b")?.changed).toBe(true);
  });

  it("tracks the call stack across calls and returns", () => {
    const { frames } = buildTrace([
      { type: "line_execute", line: 1 },
      { type: "function_call", name: "outer" },
      { type: "line_execute", line: 2 },
      { type: "function_call", name: "inner" },
      { type: "line_execute", line: 3 },
      { type: "function_return", name: "inner", value: "7" },
      { type: "line_execute", line: 4 },
      { type: "program_end" },
    ]);

    expect(frames[0].stack).toEqual(["global", "outer"]);
    expect(frames[1].stack).toEqual(["global", "outer", "inner"]);
    expect(frames[2].stack).toEqual(["global", "outer"]);
    expect(frames[2].returned).toBe("7");
  });

  it("never pops past the global frame", () => {
    const { frames } = buildTrace([
      { type: "line_execute", line: 1 },
      { type: "function_return", name: "nope" },
      { type: "function_return", name: "nope" },
      { type: "program_end" },
    ]);

    expect(frames[0].stack).toEqual(["global"]);
  });

  it("attributes console output to the step that produced it", () => {
    const trace = buildTrace([
      { type: "line_execute", line: 1 },
      { type: "line_execute", line: 2 },
      { type: "console_output", level: "log", text: "second" },
      { type: "program_end" },
    ]);

    expect(trace.console[0].text).toBe("second");
    // Output belongs to the step being built, not the one after it.
    expect(consoleUpTo(trace, 0)).toHaveLength(0);
    expect(consoleUpTo(trace, 1)).toHaveLength(1);
  });

  it("records an error and still closes the frame", () => {
    const trace = buildTrace([
      { type: "line_execute", line: 3 },
      { type: "error", message: "x is not defined", line: 3 },
    ]);

    expect(trace.error).toEqual({ message: "x is not defined", line: 3 });
    expect(trace.frames).toHaveLength(1);
    expect(trace.console.at(-1)?.level).toBe("error");
  });

  it("produces no frames for an empty stream", () => {
    expect(buildTrace([]).frames).toEqual([]);
  });
});

describe("demo engine", () => {
  it("is honest that it did not run the source", async () => {
    const result = await demoEngine.run("anything at all");
    expect(result.ranUserCode).toBe(false);
    expect(result.sourceMatches).toBe(false);
    expect(result.note).toMatch(/not executed|not implemented/i);
  });

  it("reports a match only when the source is the sample it replays", async () => {
    const { DEMO_SOURCE } = await import("./demo-engine");
    expect((await demoEngine.run(DEMO_SOURCE)).sourceMatches).toBe(true);
    expect((await demoEngine.run("function other() {}")).sourceMatches).toBe(
      false,
    );
  });

  it("produces a trace whose arithmetic is internally consistent", async () => {
    const { events } = await demoEngine.run("");
    const { frames } = buildTrace(events);

    expect(frames.length).toBeGreaterThan(10);

    const last = frames.at(-1)!;
    // 1+2+3+4+5
    expect(last.vars.find((v) => v.name === "result")?.value).toBe("15");
    expect(last.stack).toEqual(["global"]);
  });

  it("reaches five loop iterations", async () => {
    const { events } = await demoEngine.run("");
    const { frames } = buildTrace(events);
    expect(Math.max(...frames.map((f) => f.iteration ?? 0))).toBe(5);
  });

  it("can be aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(demoEngine.run("", controller.signal)).rejects.toThrow();
  });
});
