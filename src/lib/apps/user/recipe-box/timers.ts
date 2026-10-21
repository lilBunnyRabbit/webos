import { JobKind, type Job, type JobId, type JobInput } from "$lib/core/api/services/scheduler";
import { APP_ID } from "./constants";

/** A cook timer: a scheduler job, so it rings with the window closed. */
export interface CookTimer {
  id: JobId;
  key: string;
  label: string;
  end_at: number;
  done: boolean;
  path: string | null;
}

export interface RecipeRef {
  title: string;
  path: string;
}

export function cook_timer_input(key: string, label: string, duration_ms: number, recipe: RecipeRef, now: number): JobInput {
  return {
    key,
    title: label,
    message: `Time's up · ${recipe.title}`,
    at: { epoch: now + duration_ms },
    kind: JobKind.TIMER,
    actions: [{ label: "Stop", command: `recipe timer stop ${key}` }],
    open: { app: APP_ID, props: { path: recipe.path } },
  };
}

export function cook_timer_of(job: Job): CookTimer | null {
  if (job.app !== APP_ID || job.kind !== JobKind.TIMER || !("epoch" in job.at)) return null;
  const path = job.open?.props?.path;
  return {
    id: job.id,
    key: job.id.slice(APP_ID.length + 1),
    label: job.title,
    end_at: job.at.epoch,
    done: !job.armed,
    path: typeof path === "string" ? path : null,
  };
}

export function cook_timers(jobs: Job[]): CookTimer[] {
  return jobs
    .flatMap((job) => cook_timer_of(job) ?? [])
    .sort((a, b) => Number(a.done) - Number(b.done) || a.end_at - b.end_at);
}

/** A string is the error to show. */
export function find_cook_timer(timers: CookTimer[], typed: string): CookTimer | string {
  const exact = timers.find((timer) => timer.key === typed || timer.id === typed);
  if (exact) return exact;
  const by_key = timers.filter((timer) => timer.key.startsWith(typed));
  if (by_key.length === 1) return by_key[0];
  if (by_key.length > 1) return `timer "${typed}" is ambiguous; type more of its id`;
  const by_label = timers.filter((timer) => timer.label.toLowerCase() === typed.toLowerCase());
  if (by_label.length === 1) return by_label[0];
  return by_label.length > 1 ? `more than one timer is called "${typed}"; use its id` : `no cook timer "${typed}"`;
}

export function format_countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
