/**
 * The normalized execution event stream.
 *
 * This is the contract between "something ran code" and "something draws what
 * happened". Today the only producer is the demo engine; later a real
 * sandboxed engine will emit the same events and the visualization will not
 * change. Nothing downstream of here may assume where the events came from.
 */

export type ConsoleLevel = "log" | "warn" | "error";

export type ExecutionEvent =
  | { type: "program_start" }
  /** A statement is about to run. Starts a new step. */
  | { type: "line_execute"; line: number; note?: string; inline?: string }
  | { type: "variable_declare"; name: string; value: string }
  | { type: "variable_update"; name: string; value: string; previous?: string }
  | { type: "function_call"; name: string }
  | { type: "function_return"; name: string; value?: string }
  | { type: "loop_iteration"; label: string; iteration: number; total?: number }
  | { type: "console_output"; level: ConsoleLevel; text: string }
  | { type: "program_end"; returned?: string }
  | { type: "error"; message: string; line?: number };

/** High-level phase, used to light the control-flow diagram. */
export type FlowNodeId = "call" | "init" | "loop" | "body" | "return";

export interface EngineResult {
  events: ExecutionEvent[];
  /**
   * False when the events describe a canned sample rather than the source
   * that was handed in. The UI must say so rather than implying the user's
   * code ran.
   */
  ranUserCode: boolean;
  /** Shown next to the run status, e.g. why this is a demo. */
  note?: string;
  /**
   * True when the events line up with the source that was submitted. When
   * false, line numbers in the trace refer to some other program and must
   * not be painted onto the editor.
   */
  sourceMatches: boolean;
}

/**
 * Anything that can turn source into events.
 *
 * Deliberately async and abortable: a real engine will cross a process or
 * worker boundary and must be cancellable from the Stop button.
 */
export interface ExecutionEngine {
  readonly id: string;
  readonly language: string;
  /**
   * False when the engine reports output but no steps — a remote batch
   * executor has nowhere to attach a tracing hook. The UI hides stepping
   * controls rather than offering buttons that cannot work.
   */
  readonly traceable?: boolean;
  run(source: string, signal?: AbortSignal): Promise<EngineResult>;
}
