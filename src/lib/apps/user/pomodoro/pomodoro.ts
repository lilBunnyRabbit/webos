import { format_time } from "$kit/games/time";
import { z } from "zod";

export const APP_ID = "pomodoro";

export const Phase = {
  FOCUS: "focus",
  SHORT: "short",
  LONG: "long",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];


export const PHASES = [Phase.FOCUS, Phase.SHORT, Phase.LONG] as const;

export const PHASE_LABELS: Record<Phase, string> = {
  [Phase.FOCUS]: "Focus",
  [Phase.SHORT]: "Short break",
  [Phase.LONG]: "Long break",
};

export const Status = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

const MINUTE = 60_000;

export const SettingsSchema = z.object({
  focus_min: z.number().int().min(1).max(180),
  short_min: z.number().int().min(1).max(60),
  long_min: z.number().int().min(1).max(120),
  long_every: z.number().int().min(2).max(12),
  auto_breaks: z.boolean(),
  auto_focus: z.boolean(),
  sound: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  focus_min: 25,
  short_min: 5,
  long_min: 15,
  long_every: 4,
  auto_breaks: false,
  auto_focus: false,
  sound: false,
};

// An end timestamp, never a tick count: right after throttling, sleep or reload. `total` pins the length at start.
export const RunSchema = z.object({
  phase: z.enum(PHASES),
  status: z.enum([Status.IDLE, Status.RUNNING, Status.PAUSED]),
  ends_at: z.number().nullable(),
  left: z.number().nullable(),
  total: z.number().nullable(),
  round: z.number().int().min(0),
});
export type Run = z.infer<typeof RunSchema>;

export const IDLE_RUN: Run = { phase: Phase.FOCUS, status: Status.IDLE, ends_at: null, left: null, total: null, round: 0 };

export const TimerFileSchema = z.object({
  version: z.literal(1),
  settings: SettingsSchema,
  run: RunSchema,
  task: z.string(),
});
export type TimerFile = z.infer<typeof TimerFileSchema>;

export const EMPTY_TIMER: TimerFile = { version: 1, settings: DEFAULT_SETTINGS, run: IDLE_RUN, task: "" };

export function phase_ms(phase: Phase, settings: Settings): number {
  const minutes = phase === Phase.FOCUS ? settings.focus_min : phase === Phase.SHORT ? settings.short_min : settings.long_min;
  return minutes * MINUTE;
}

export function total_ms(run: Run, settings: Settings): number {
  return run.status === Status.IDLE ? phase_ms(run.phase, settings) : (run.total ?? phase_ms(run.phase, settings));
}

export function remaining_ms(run: Run, settings: Settings, now: number): number {
  if (run.status === Status.RUNNING) return Math.max(0, (run.ends_at ?? now) - now);
  if (run.status === Status.PAUSED) return Math.max(0, run.left ?? 0);
  return phase_ms(run.phase, settings);
}

export function progress(run: Run, settings: Settings, now: number): number {
  const total = total_ms(run, settings);
  return total > 0 ? Math.min(1, Math.max(0, 1 - remaining_ms(run, settings, now) / total)) : 0;
}

export function format_clock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function status_text(run: Run, settings: Settings, task: string, now: number): string {
  const left = format_time(Math.ceil(remaining_ms(run, settings, now) / 1000) * 1000);
  const parts = [PHASE_LABELS[run.phase]];
  if (run.status === Status.RUNNING) parts.push(`${left} left`, `ends ${format_clock(run.ends_at ?? now)}`);
  else if (run.status === Status.PAUSED) parts.push("paused", `${left} left`);
  else parts.push("ready", left);
  if (task.trim()) parts.push(task.trim());
  return parts.join(" · ");
}

export function is_break(phase: Phase): boolean {
  return phase !== Phase.FOCUS;
}

export function start(run: Run, settings: Settings, now: number): Run {
  if (run.status === Status.RUNNING) return run;
  if (run.status === Status.PAUSED) return { ...run, status: Status.RUNNING, ends_at: now + (run.left ?? 0), left: null };
  const total = phase_ms(run.phase, settings);
  return { ...run, status: Status.RUNNING, ends_at: now + total, left: null, total };
}

export function pause(run: Run, now: number): Run {
  if (run.status !== Status.RUNNING) return run;
  return { ...run, status: Status.PAUSED, left: Math.max(0, (run.ends_at ?? now) - now), ends_at: null };
}

export function reset(run: Run): Run {
  return { ...run, status: Status.IDLE, ends_at: null, left: null, total: null };
}

export function choose(run: Run, phase: Phase): Run {
  return { ...reset(run), phase };
}

export function next_phase(run: Run, settings: Settings): Pick<Run, "phase" | "round"> {
  if (run.phase !== Phase.FOCUS) return { phase: Phase.FOCUS, round: run.phase === Phase.LONG ? 0 : run.round };
  const round = run.round + 1;
  return round >= settings.long_every ? { phase: Phase.LONG, round } : { phase: Phase.SHORT, round };
}

export function skip(run: Run, settings: Settings): Run {
  return { ...IDLE_RUN, ...next_phase(run, settings) };
}

export function auto_starts(phase: Phase, settings: Settings): boolean {
  return is_break(phase) ? settings.auto_breaks : settings.auto_focus;
}

export interface Completion {
  phase: Phase;
  ended_at: number;
  ms: number;
}

export interface Settled {
  run: Run;
  completed: Completion | null;
}

// An auto-started next phase begins at the old end, so a late check doesn't stretch it. If it would already be over
// too (the tab slept through it), it waits idle instead: time nobody was there for is never counted.
export function settle(run: Run, settings: Settings, now: number): Settled {
  if (run.status !== Status.RUNNING || run.ends_at === null || run.ends_at > now) return { run, completed: null };

  const completed: Completion = { phase: run.phase, ended_at: run.ends_at, ms: run.total ?? phase_ms(run.phase, settings) };
  const next: Run = { ...IDLE_RUN, ...next_phase(run, settings) };
  if (!auto_starts(next.phase, settings)) return { run: next, completed };

  const started = start(next, settings, run.ends_at);
  return { run: (started.ends_at ?? 0) > now ? started : next, completed };
}
