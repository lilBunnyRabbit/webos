import kernel, { type AppsService, type DesktopService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { APP_ID, Status, status_text } from "./pomodoro";
import { last_days } from "./stats";
import { acquire_timer, type PomodoroTimer } from "./timer.svelte";

async function with_timer<T>(action: (timer: PomodoroTimer) => T | Promise<T>): Promise<T> {
  const { timer, release } = acquire_timer();
  try {
    if (!(await timer.loaded())) throw new ShellError("pomo: the timer didn't load");
    await timer.settle();
    return await action(timer);
  } finally {
    release();
  }
}

const status_of = (timer: PomodoroTimer) => status_text(timer.run, timer.settings, timer.task, Date.now(), timer.ended);

export function open_app(): void {
  kernel.service<AppsService>("apps").launch(APP_ID);
}

export function start({ args }: CommandContext<{ task: string[] }>): Promise<string> {
  return with_timer(async (timer) => {
    const task = args.task.join(" ").trim();
    if (task) timer.task = task;
    await timer.start(false);
    return status_of(timer);
  });
}

export function pause(): Promise<string> {
  return with_timer(async (timer) => {
    if (timer.run.status !== Status.RUNNING) throw new ShellError("pomo pause: the timer isn't running");
    await timer.pause();
    return status_of(timer);
  });
}

export function skip(): Promise<string> {
  return with_timer(async (timer) => {
    await timer.skip();
    return status_of(timer);
  });
}

export function reset(): Promise<string> {
  return with_timer(async (timer) => {
    await timer.reset();
    return status_of(timer);
  });
}

export function status(): Promise<string> {
  return with_timer(status_of);
}

export async function* stats(): AsyncGenerator<Tagged> {
  const days = await with_timer((timer) => last_days(timer.stats.value, new Date()));
  for (const day of days) yield { $type: "focus-day", day: day.day, sessions: day.sessions, minutes: Math.round(day.ms / 60_000) };
}

export async function pin(): Promise<string> {
  const name = await kernel.service<DesktopService>("desktop").pin_widget(APP_ID, { label: "Pomodoro" });
  if (!name) throw new ShellError("pomo pin: couldn't pin the timer");
  return `pinned ${name} to the desktop`;
}
