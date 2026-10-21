import { format_time } from "$kit/games/time";
import { JobKind, type Job, type JobAction, type JobInput } from "$lib/core/api/services/scheduler";
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
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  focus_min: 25,
  short_min: 5,
  long_min: 15,
  long_every: 4,
  auto_breaks: false,
  auto_focus: false,
};

// What the UI and the transitions work on. Only the plan (phase, round, time left while paused, length) is stored;
// whether a phase runs and when it ends belongs to the scheduler job, so `ends_at` always comes from the registry.
export interface Run {
  phase: Phase;
  status: Status;
  ends_at: number | null;
  left: number | null;
  total: number | null;
  round: number;
}

export const IDLE_RUN: Run = { phase: Phase.FOCUS, status: Status.IDLE, ends_at: null, left: null, total: null, round: 0 };

export const PlanSchema = z.object({
  phase: z.enum(PHASES),
  round: z.number().int().min(0),
  left: z.number().min(0).nullable(),
  total: z.number().min(0).nullable(),
  /** The job end (fired or missed) last counted, so one phase is never counted twice. */
  settled: z.number().nullable(),
});
export type Plan = z.infer<typeof PlanSchema>;

export const IDLE_PLAN: Plan = { phase: Phase.FOCUS, round: 0, left: null, total: null, settled: null };

export const EndedSchema = z.object({ phase: z.enum(PHASES), at: z.number() });
export type Ended = z.infer<typeof EndedSchema>;

// A file from before the scheduler has `run` instead of `plan`: it's dropped on read and the timer starts idle.
export const TimerFileSchema = z.object({
  version: z.literal(1),
  settings: SettingsSchema,
  plan: PlanSchema.default(IDLE_PLAN),
  ended: EndedSchema.nullable().default(null),
  task: z.string(),
});
export type TimerFile = z.infer<typeof TimerFileSchema>;

export const EMPTY_TIMER: TimerFile = { version: 1, settings: DEFAULT_SETTINGS, plan: IDLE_PLAN, ended: null, task: "" };

export const JOB_KEY = "phase";
export const JOB_ID = `${APP_ID}:${JOB_KEY}`;

export type PhaseJob = Pick<Job, "armed" | "at" | "last_fired" | "missed_at">;

export function phase_minutes(phase: Phase, settings: Settings): number {
  return phase === Phase.FOCUS ? settings.focus_min : phase === Phase.SHORT ? settings.short_min : settings.long_min;
}

export function phase_ms(phase: Phase, settings: Settings): number {
  return phase_minutes(phase, settings) * MINUTE;
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

export function status_text(run: Run, settings: Settings, task: string, now: number, ended: Ended | null = null): string {
  const left = format_time(Math.ceil(remaining_ms(run, settings, now) / 1000) * 1000);
  const parts = ended ? [ended_text(ended), PHASE_LABELS[run.phase]] : [PHASE_LABELS[run.phase]];
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

export function next_phase(run: Pick<Run, "phase" | "round">, settings: Settings): Pick<Run, "phase" | "round"> {
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
// too (nobody had Pomodoro loaded through it), it waits idle instead: time nobody was there for is never counted.
export function settle(run: Run, settings: Settings, now: number): Settled {
  if (run.status !== Status.RUNNING || run.ends_at === null || run.ends_at > now) return { run, completed: null };

  const completed: Completion = { phase: run.phase, ended_at: run.ends_at, ms: run.total ?? phase_ms(run.phase, settings) };
  const next: Run = { ...IDLE_RUN, ...next_phase(run, settings) };
  if (!auto_starts(next.phase, settings)) return { run: next, completed };

  const started = start(next, settings, run.ends_at);
  return { run: (started.ends_at ?? 0) > now ? started : next, completed };
}

export function due_end(plan: Plan, job: PhaseJob | undefined): number | null {
  if (!job) return null;
  const end = job.missed_at ?? (job.armed ? undefined : job.last_fired);
  return end === undefined || end === plan.settled ? null : end;
}

export function run_of(plan: Plan, job: PhaseJob | undefined): Run {
  const base = { phase: plan.phase, round: plan.round, total: plan.total };
  if (job?.armed && "epoch" in job.at) return { ...base, status: Status.RUNNING, ends_at: job.at.epoch, left: null };
  if (plan.left !== null) return { ...base, status: Status.PAUSED, ends_at: null, left: plan.left };
  return { ...base, status: Status.IDLE, ends_at: null, left: null, total: null };
}

export function plan_of(run: Run, settled: number | null): Plan {
  return {
    phase: run.phase,
    round: run.round,
    left: run.status === Status.PAUSED ? run.left : null,
    total: run.status === Status.IDLE ? null : run.total,
    settled,
  };
}

export interface Resolved {
  run: Run;
  completed: Completion;
  ended: Ended | null;
  settled: number;
}

// A missed end (WebOS was closed) leaves the next phase paused at full length, whatever auto-start says.
export function resolve(plan: Plan, job: PhaseJob | undefined, settings: Settings, now: number): Resolved | null {
  const end = due_end(plan, job);
  if (end === null) return null;
  const ended_run: Run = { phase: plan.phase, round: plan.round, status: Status.RUNNING, ends_at: end, left: null, total: plan.total ?? phase_ms(plan.phase, settings) };
  const { run, completed } = settle(ended_run, settings, Math.max(now, end));
  if (!completed) return null;
  if (job?.missed_at === undefined) return { run, completed, ended: null, settled: end };
  const total = phase_ms(run.phase, settings);
  return { run: { ...run, status: Status.PAUSED, ends_at: null, left: total, total }, completed, ended: { phase: plan.phase, at: end }, settled: end };
}

export function phase_input(run: Run, settings: Settings, task: string): JobInput {
  const next = next_phase(run, settings);
  const auto = auto_starts(next.phase, settings);
  const focus_done = run.phase === Phase.FOCUS;
  const name = task.trim();
  const title = focus_done ? (name ? `Focus done: ${name}` : "Focus done") : "Break over";
  const message = auto
    ? `${PHASE_LABELS[next.phase]} started, ${phase_minutes(next.phase, settings)} min.`
    : focus_done
      ? `Time for a ${PHASE_LABELS[next.phase].toLowerCase()}.`
      : "Ready for the next focus?";
  const actions: JobAction[] = auto
    ? [focus_done ? { label: "Skip break", command: "pomo skip" } : { label: "Pause", command: "pomo pause" }]
    : [
        { label: focus_done ? "Start break" : "Start focus", command: "pomo start" },
        { label: "Skip", command: "pomo skip" },
      ];
  return { key: JOB_KEY, kind: JobKind.PHASE, at: { epoch: run.ends_at ?? 0 }, title, message, actions };
}

export function ended_text(ended: Ended): string {
  return `${PHASE_LABELS[ended.phase]} ended at ${format_clock(ended.at)}`;
}
