import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  IDLE_RUN,
  Phase,
  Status,
  choose,
  next_phase,
  pause,
  progress,
  remaining_ms,
  reset,
  settle,
  skip,
  start,
  type Run,
  type Settings,
} from "./pomodoro";

const MIN = 60_000;
const settings: Settings = { ...DEFAULT_SETTINGS };

describe("start, pause, reset", () => {
  it("starts an idle phase from its full length", () => {
    const run = start(IDLE_RUN, settings, 1000);
    expect(run).toMatchObject({ status: Status.RUNNING, ends_at: 1000 + 25 * MIN, total: 25 * MIN });
    expect(remaining_ms(run, settings, 1000 + 5 * MIN)).toBe(20 * MIN);
  });

  it("pauses with what's left and resumes from it", () => {
    const paused = pause(start(IDLE_RUN, settings, 0), 10 * MIN);
    expect(paused).toMatchObject({ status: Status.PAUSED, left: 15 * MIN, ends_at: null });
    expect(remaining_ms(paused, settings, 99 * MIN)).toBe(15 * MIN);
    const resumed = start(paused, settings, 50 * MIN);
    expect(resumed.ends_at).toBe(65 * MIN);
    expect(resumed.total).toBe(25 * MIN);
  });

  it("is computed from wall-clock time, not ticks", () => {
    const run = start(IDLE_RUN, settings, 0);
    expect(remaining_ms(run, settings, 24 * MIN)).toBe(MIN);
    expect(remaining_ms(run, settings, 40 * MIN)).toBe(0);
    expect(progress(run, settings, 12.5 * MIN)).toBeCloseTo(0.5);
  });

  it("keeps the started length when settings change mid-phase", () => {
    const run = start(IDLE_RUN, settings, 0);
    expect(progress(run, { ...settings, focus_min: 50 }, 12.5 * MIN)).toBeCloseTo(0.5);
  });

  it("idle follows the current settings", () => {
    expect(remaining_ms(IDLE_RUN, { ...settings, focus_min: 40 }, 0)).toBe(40 * MIN);
  });

  it("reset and choose go idle and keep the round", () => {
    const run: Run = { ...start(IDLE_RUN, settings, 0), round: 2 };
    expect(reset(run)).toMatchObject({ phase: Phase.FOCUS, status: Status.IDLE, round: 2, ends_at: null });
    expect(choose(run, Phase.LONG)).toMatchObject({ phase: Phase.LONG, status: Status.IDLE, round: 2 });
  });
});

describe("the cycle", () => {
  it("goes focus, short break, …, long break every 4th", () => {
    const phases: string[] = [];
    let run: Run = IDLE_RUN;
    for (let i = 0; i < 9; i++) {
      phases.push(run.phase);
      run = { ...run, ...next_phase(run, settings) };
    }
    expect(phases).toEqual(["focus", "short", "focus", "short", "focus", "short", "focus", "long", "focus"]);
    expect(run).toMatchObject({ phase: Phase.SHORT, round: 1 });
  });

  it("honours a custom long-break interval", () => {
    expect(next_phase({ ...IDLE_RUN, round: 1 }, { ...settings, long_every: 2 }).phase).toBe(Phase.LONG);
  });

  it("skip moves on idle", () => {
    expect(skip(start(IDLE_RUN, settings, 0), settings)).toMatchObject({ phase: Phase.SHORT, status: Status.IDLE, round: 1 });
  });
});

describe("settle", () => {
  it("does nothing before the end", () => {
    const run = start(IDLE_RUN, settings, 0);
    expect(settle(run, settings, 24 * MIN)).toEqual({ run, completed: null });
  });

  it("finishes the phase at its end time and waits idle", () => {
    const run = start(IDLE_RUN, settings, 0);
    const { run: next, completed } = settle(run, settings, 25 * MIN + 30_000);
    expect(completed).toEqual({ phase: Phase.FOCUS, ended_at: 25 * MIN, ms: 25 * MIN });
    expect(next).toMatchObject({ phase: Phase.SHORT, status: Status.IDLE, round: 1 });
  });

  it("auto-starts the break from the old end, not from now", () => {
    const auto = { ...settings, auto_breaks: true };
    const { run } = settle(start(IDLE_RUN, auto, 0), auto, 26 * MIN);
    expect(run).toMatchObject({ phase: Phase.SHORT, status: Status.RUNNING, ends_at: 30 * MIN });
  });

  it("doesn't auto-start a phase that would already be over", () => {
    const auto = { ...settings, auto_breaks: true };
    const { run, completed } = settle(start(IDLE_RUN, auto, 0), auto, 8 * 60 * MIN);
    expect(completed?.phase).toBe(Phase.FOCUS);
    expect(run).toMatchObject({ phase: Phase.SHORT, status: Status.IDLE });
  });

  it("auto-starts focus only when asked", () => {
    const breaks_only = { ...settings, auto_breaks: true };
    const brk = start({ ...IDLE_RUN, phase: Phase.SHORT, round: 1 }, breaks_only, 0);
    expect(settle(brk, breaks_only, 5 * MIN).run).toMatchObject({ phase: Phase.FOCUS, status: Status.IDLE, round: 1 });
    const both = { ...breaks_only, auto_focus: true };
    expect(settle(brk, both, 5 * MIN).run).toMatchObject({ phase: Phase.FOCUS, status: Status.RUNNING, ends_at: 30 * MIN });
  });

  it("ignores paused and idle runs", () => {
    const paused = pause(start(IDLE_RUN, settings, 0), MIN);
    expect(settle(paused, settings, 99 * MIN).completed).toBeNull();
    expect(settle(IDLE_RUN, settings, 99 * MIN).completed).toBeNull();
  });
});
