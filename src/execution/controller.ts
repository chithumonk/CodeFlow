import type { ExecutionEngine } from "./events";
import { buildTrace } from "./trace";
import type { Trace } from "./trace";

/**
 * Drives playback of a trace and owns the Run/Pause/Step state machine.
 *
 * Kept out of any component so the transitions can be tested without a DOM,
 * and so swapping the demo engine for a real one changes nothing here.
 */

export type ExecutionStatus =
  "idle" | "running" | "paused" | "completed" | "error";

export interface ControllerState {
  status: ExecutionStatus;
  /** Index into trace.frames; -1 before anything has run. */
  step: number;
  totalSteps: number;
  trace: Trace | null;
  /** Set when the run itself failed, as opposed to the program erroring. */
  error: string | null;
  /** True when the events came from really executing the source. */
  ranUserCode: boolean;
  /** False when the trace describes a different program than the editor holds. */
  sourceMatches: boolean;
  note: string | null;
}

const IDLE: ControllerState = {
  status: "idle",
  step: -1,
  totalSteps: 0,
  trace: null,
  error: null,
  ranUserCode: false,
  sourceMatches: true,
  note: null,
};

/** Milliseconds per step during playback. */
export const STEP_INTERVAL = 700;

export class ExecutionController {
  private state: ControllerState = { ...IDLE };
  private listeners = new Set<(state: ControllerState) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;

  private engine: ExecutionEngine;
  private interval: number;

  // Written out rather than using parameter properties: the frontend
  // tsconfig sets erasableSyntaxOnly, which forbids that shorthand.
  constructor(engine: ExecutionEngine, interval: number = STEP_INTERVAL) {
    this.engine = engine;
    this.interval = interval;
  }

  getState(): ControllerState {
    return this.state;
  }

  subscribe(fn: (state: ControllerState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private clearTimer() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /** Execute the source and begin playing the resulting trace. */
  async run(source: string): Promise<void> {
    this.stop();
    this.set({ status: "running", step: -1, error: null, trace: null });

    this.abort = new AbortController();

    try {
      const result = await this.engine.run(source, this.abort.signal);
      const trace = buildTrace(result.events);

      if (trace.frames.length === 0) {
        // An output-only engine produces no steps by design, so finishing with
        // none is a completed run. Only a traceable engine coming back empty
        // means something went wrong.
        const traceable = this.engine.traceable !== false;
        this.set({
          status: trace.error || traceable ? "error" : "completed",
          error:
            trace.error?.message ??
            (traceable ? "That run produced no steps to show." : null),
          trace,
          totalSteps: 0,
          ranUserCode: result.ranUserCode,
          sourceMatches: result.sourceMatches,
          note: result.note ?? null,
        });
        return;
      }

      this.set({
        trace,
        totalSteps: trace.frames.length,
        step: 0,
        status: "running",
        ranUserCode: result.ranUserCode,
        sourceMatches: result.sourceMatches,
        note: result.note ?? null,
      });

      this.schedule();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.set({ status: "idle" });
        return;
      }
      this.set({
        status: "error",
        error: error instanceof Error ? error.message : "Execution failed.",
      });
    }
  }

  private schedule() {
    this.clearTimer();
    if (this.state.status !== "running") return;

    this.timer = setTimeout(() => {
      const next = this.state.step + 1;

      if (next >= this.state.totalSteps) {
        // A program that threw ends in "error", not "completed" — the
        // distinction is the whole point of showing it.
        this.set({
          status: this.state.trace?.error ? "error" : "completed",
          error: this.state.trace?.error?.message ?? null,
        });
        return;
      }

      this.set({ step: next });
      this.schedule();
    }, this.interval);
  }

  /**
   * Change how long each step is held on screen.
   *
   * Rescheduling matters: without it a speed change made mid-playback would
   * not be felt until the pending timer fired, which at half speed is over a
   * second of the old pace after the reader asked for a new one.
   */
  setStepInterval(ms: number) {
    this.interval = Math.max(50, ms);
    if (this.state.status === "running") this.schedule();
  }

  pause() {
    if (this.state.status !== "running") return;
    this.clearTimer();
    this.set({ status: "paused" });
  }

  resume() {
    if (this.state.status !== "paused") return;
    // Resuming from the end restarts rather than sticking.
    if (this.state.step >= this.state.totalSteps - 1) {
      this.set({ status: "completed" });
      return;
    }
    this.set({ status: "running" });
    this.schedule();
  }

  stop() {
    this.clearTimer();
    this.abort?.abort();
    this.abort = undefined;
    if (this.state.status === "idle") return;
    this.set({ status: "idle", step: -1 });
  }

  /** Replay the trace already loaded, without re-running the engine. */
  restart() {
    if (!this.state.trace) return;
    this.clearTimer();
    this.set({ status: "running", step: 0, error: null });
    this.schedule();
  }

  stepForward() {
    if (!this.state.trace) return;
    this.clearTimer();
    const next = Math.min(this.state.step + 1, this.state.totalSteps - 1);
    this.set({
      step: next,
      status: next >= this.state.totalSteps - 1 ? "completed" : "paused",
    });
  }

  stepBackward() {
    if (!this.state.trace) return;
    this.clearTimer();
    this.set({ step: Math.max(this.state.step - 1, 0), status: "paused" });
  }

  /** Jump to a step, e.g. from the timeline scrubber. */
  seek(step: number) {
    if (!this.state.trace) return;
    this.clearTimer();
    const clamped = Math.min(Math.max(step, 0), this.state.totalSteps - 1);
    this.set({ step: clamped, status: "paused" });
  }

  dispose() {
    this.clearTimer();
    this.abort?.abort();
    this.listeners.clear();
  }
}
