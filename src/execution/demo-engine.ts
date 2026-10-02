import type { EngineResult, ExecutionEngine, ExecutionEvent } from "./events";

/**
 * A stand-in engine that replays a canned trace.
 *
 * It does NOT run the source it is given. Nothing here parses, evaluates or
 * sandboxes anything — running untrusted code safely is a separate piece of
 * engineering, and pretending otherwise would be the most dangerous kind of
 * placeholder. `ranUserCode: false` is how it tells the UI to say so.
 */

export const DEMO_SOURCE = [
  "function calculate(numbers) {",
  "  let total = 0;",
  "",
  "  for (const n of numbers) {",
  "    total += n;",
  "  }",
  "",
  "  return total;",
  "}",
  "",
  "const result = calculate([1, 2, 3, 4, 5]);",
  "console.log('total is', result);",
].join("\n");

const INPUT = [1, 2, 3, 4, 5];

/** Builds the event stream programmatically so the arithmetic cannot drift. */
function demoEvents(): ExecutionEvent[] {
  const list = `[${INPUT.join(", ")}]`;
  const events: ExecutionEvent[] = [{ type: "program_start" }];

  events.push(
    {
      type: "line_execute",
      line: 11,
      note: `Call calculate with ${list}`,
    },
    { type: "function_call", name: "calculate" },
    {
      type: "line_execute",
      line: 1,
      note: "Enter calculate — bind the parameter to the argument",
    },
    { type: "variable_declare", name: "numbers", value: list },
    {
      type: "line_execute",
      line: 2,
      note: "Declare the accumulator and set it to zero",
      inline: "total = 0",
    },
    { type: "variable_declare", name: "total", value: "0" },
  );

  let total = 0;
  INPUT.forEach((n, i) => {
    const iteration = i + 1;

    events.push(
      {
        type: "line_execute",
        line: 4,
        note: `Iteration ${iteration} of ${INPUT.length} — n takes the value ${n}`,
        inline: `n = ${n}`,
      },
      {
        type: "loop_iteration",
        label: "for…of",
        iteration,
        total: INPUT.length,
      },
      { type: "variable_update", name: "n", value: String(n) },
    );

    const before = total;
    total += n;

    events.push(
      {
        type: "line_execute",
        line: 5,
        note: `Add n to total — ${before} + ${n} = ${total}`,
        inline: `${before} + ${n} → ${total}`,
      },
      {
        type: "variable_update",
        name: "total",
        value: String(total),
        previous: String(before),
      },
    );
  });

  events.push(
    {
      type: "line_execute",
      line: 8,
      note: "The iterable is exhausted — hand total back to the caller",
      inline: `return ${total}`,
    },
    { type: "function_return", name: "calculate", value: String(total) },
    {
      type: "line_execute",
      line: 11,
      note: `calculate returned ${total}`,
    },
    { type: "variable_declare", name: "result", value: String(total) },
    {
      type: "line_execute",
      line: 12,
      note: "Write the result to the console",
    },
    { type: "console_output", level: "log", text: `total is ${total}` },
    { type: "program_end", returned: String(total) },
  );

  return events;
}

export class DemoExecutionEngine implements ExecutionEngine {
  readonly id = "demo";
  readonly language = "javascript";

  async run(source: string, signal?: AbortSignal): Promise<EngineResult> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const matchesSample = source.trim() === DEMO_SOURCE.trim();

    return {
      events: demoEvents(),
      ranUserCode: false,
      sourceMatches: matchesSample,
      note: matchesSample
        ? "Demo trace — a recorded run of this sample. Live execution is not implemented yet."
        : "Demo trace — your code was not executed. Live execution is not implemented yet.",
    };
  }
}

export const demoEngine = new DemoExecutionEngine();
