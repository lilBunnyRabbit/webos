import kernel, { type AppsService, type DesktopService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { APP_ID, Status, status_text, WIDGET_SIZE } from "./pomodoro";
import { last_days } from "./stats";
import { acquire_timer, type PomodoroTimer } from "./timer.svelte";

const READY_TIMEOUT = 5000;

let holding = false;

// A phase started from the shell with no window or widget open would have nobody to end and announce it.
function hold_while_running(): void {
  if (holding) return;
  holding = true;
  const { timer, release } = acquire_timer();
  const stop = $effect.root(() => {
    $effect(() => {
      if (!timer.ready || timer.run.status === Status.RUNNING) return;
      queueMicrotask(() => {
        stop();
        release();
        holding = false;
      });
    });
  });
}

async function with_timer<T>(action: (timer: PomodoroTimer) => T): Promise<T> {
  const { timer, release } = acquire_timer();
  try {
    for (let waited = 0; !timer.ready; waited += 25) {
      if (waited >= READY_TIMEOUT) throw new ShellError("pomo: the timer didn't load");
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    timer.settle();
    const result = action(timer);
    if (timer.run.status === Status.RUNNING) hold_while_running();
    return result;
  } finally {
    release();
  }
}

const status_of = (timer: PomodoroTimer) => status_text(timer.run, timer.settings, timer.task, Date.now());

export function open_app(): void {
  kernel.service<AppsService>("apps").launch(APP_ID);
}

export function start({ args }: CommandContext<{ task: string[] }>): Promise<string> {
  return with_timer((timer) => {
    const task = args.task.join(" ").trim();
    if (task) timer.task = task;
    timer.start(false);
    return status_of(timer);
  });
}

export function pause(): Promise<string> {
  return with_timer((timer) => {
    if (timer.run.status !== Status.RUNNING) throw new ShellError("pomo pause: the timer isn't running");
    timer.pause();
    return status_of(timer);
  });
}

export function skip(): Promise<string> {
  return with_timer((timer) => {
    timer.skip();
    return status_of(timer);
  });
}

export function reset(): Promise<string> {
  return with_timer((timer) => {
    timer.reset();
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
  const name = await kernel.service<DesktopService>("desktop").pin_widget(APP_ID, { label: "Pomodoro", size: WIDGET_SIZE });
  if (!name) throw new ShellError("pomo pin: couldn't pin the timer");
  return `pinned ${name} to the desktop`;
}
