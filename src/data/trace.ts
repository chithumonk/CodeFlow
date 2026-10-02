/**
 * A hand-authored execution trace for the marketing mockup.
 *
 * This is the same shape the real tracer will emit — one frame per step, each
 * carrying the active line, the visible scope, and the call stack — so the
 * player component built against it will not need reshaping when the backend
 * starts producing real traces.
 */

export type FlowNodeId = "call" | "init" | "loop" | "body" | "return";

export interface TraceVar {
  name: string;
  value: string;
  /** Set when this frame is the one that wrote the value, for the flash. */
  changed?: boolean;
}

export interface TraceStep {
  /** 1-based line number in {@link SNIPPET}. */
  line: number;
  /** Innermost frame last, matching how a debugger prints a stack. */
  stack: string[];
  vars: TraceVar[];
  node: FlowNodeId;
  /** Present while inside the loop, for the "×n" badge on the loop node. */
  iteration?: number;
  /** Plain-language narration — the whole point of the product. */
  caption: string;
  /** Rendered as an end-of-line annotation, like an inline debugger value. */
  inline?: string;
  /** Terminal frame: the value handed back to the caller. */
  returned?: string;
}

export const SNIPPET: string[] = [
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
  "calculate([1, 2, 3, 4, 5]);",
];

const INPUT = [1, 2, 3, 4, 5];
const LIST = `[${INPUT.join(", ")}]`;

/** Build the trace programmatically so the arithmetic cannot drift. */
function buildTrace(): TraceStep[] {
  const steps: TraceStep[] = [];

  steps.push({
    line: 11,
    stack: ["global"],
    vars: [],
    node: "call",
    caption: `Call calculate with ${LIST}`,
  });

  steps.push({
    line: 1,
    stack: ["global", "calculate"],
    vars: [{ name: "numbers", value: LIST, changed: true }],
    node: "call",
    caption: "Enter calculate — bind the parameter to the argument",
  });

  steps.push({
    line: 2,
    stack: ["global", "calculate"],
    vars: [
      { name: "numbers", value: LIST },
      { name: "total", value: "0", changed: true },
    ],
    node: "init",
    caption: "Declare the accumulator and set it to zero",
    inline: "total = 0",
  });

  let total = 0;

  INPUT.forEach((n, i) => {
    const iteration = i + 1;

    // Taking the next value from the iterable.
    steps.push({
      line: 4,
      stack: ["global", "calculate"],
      vars: [
        { name: "numbers", value: LIST },
        { name: "total", value: String(total) },
        { name: "n", value: String(n), changed: true },
      ],
      node: "loop",
      iteration,
      caption: `Iteration ${iteration} of ${INPUT.length} — n takes the value ${n}`,
      inline: `n = ${n}`,
    });

    const before = total;
    total += n;

    // Running the loop body.
    steps.push({
      line: 5,
      stack: ["global", "calculate"],
      vars: [
        { name: "numbers", value: LIST },
        { name: "total", value: String(total), changed: true },
        { name: "n", value: String(n) },
      ],
      node: "body",
      iteration,
      caption: `Add n to total — ${before} + ${n} = ${total}`,
      inline: `${before} + ${n} → ${total}`,
    });
  });

  steps.push({
    line: 8,
    stack: ["global", "calculate"],
    vars: [
      { name: "numbers", value: LIST },
      { name: "total", value: String(total) },
      { name: "n", value: String(INPUT[INPUT.length - 1]) },
    ],
    node: "return",
    caption: "The iterable is exhausted — hand total back to the caller",
    inline: `return ${total}`,
  });

  steps.push({
    line: 11,
    stack: ["global"],
    vars: [],
    node: "return",
    caption: `calculate returned ${total}`,
    returned: String(total),
  });

  return steps;
}

export const TRACE: TraceStep[] = buildTrace();

export const FLOW_NODES: Array<{ id: FlowNodeId; label: string }> = [
  { id: "call", label: "call" },
  { id: "init", label: "init" },
  { id: "loop", label: "for…of" },
  { id: "body", label: "total += n" },
  { id: "return", label: "return" },
];
