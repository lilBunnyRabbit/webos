import { untrack } from "svelte";
import kernel, { type NotificationId, type NotificationsService } from "$lib/core/api";
import { app_data_path, json_file } from "$lib/core/contexts/app";
import { Timer as TimerIcon } from "phosphor-svelte";
import { chime, prime_audio } from "./chime";
import * as logic from "./pomodoro";
import { APP_ID, EMPTY_TIMER, Phase, PHASE_LABELS, Status, TimerFileSchema, type Completion, type Run, type Settings } from "./pomodoro";
import { EMPTY_STATS, record_focus, StatsFileSchema } from "./stats";

const notifications = () => kernel.service<NotificationsService>("notifications");

// One per page, shared by every window and the widget, so a phase end is handled (and announced) exactly once.
class PomodoroTimer {
  readonly file = json_file(app_data_path(APP_ID, "timer.json"), EMPTY_TIMER, TimerFileSchema);
  readonly stats = json_file(app_data_path(APP_ID, "stats.json"), EMPTY_STATS, StatsFileSchema);
  refs = 0;

  private alert: NotificationId | null = null;
  private dispose_root: () => void;

  constructor() {
    this.dispose_root = $effect.root(() => {
      $effect(() => {
        if (!this.ready) return;
        const { status, ends_at } = this.file.value.run;
        if (status !== Status.RUNNING || ends_at === null) return;
        const id = setTimeout(() => this.settle(), Math.max(0, ends_at - Date.now()));
        return () => clearTimeout(id);
      });
    });
  }

  get ready(): boolean {
    return this.file.ready && this.stats.ready;
  }

  get run(): Run {
    return this.file.value.run;
  }

  get settings(): Settings {
    return this.file.value.settings;
  }

  get task(): string {
    return this.file.value.task;
  }

  set task(task: string) {
    this.file.value.task = task;
  }

  start(): void {
    void notifications().request_system();
    if (this.settings.sound) prime_audio();
    this.change(logic.start(this.run, this.settings, Date.now()));
  }

  pause(): void {
    this.change(logic.pause(this.run, Date.now()));
  }

  reset(): void {
    this.change(logic.reset(this.run));
  }

  skip(): void {
    this.change(logic.skip(this.run, this.settings));
  }

  choose(phase: Phase): void {
    this.change(logic.choose(this.run, phase));
  }

  clear_stats(): void {
    this.stats.value = structuredClone(EMPTY_STATS);
  }

  settle(now = Date.now()): void {
    if (!this.ready) return;
    const { run, completed } = logic.settle(this.run, this.settings, now);
    if (!completed) return;
    this.file.value.run = run;
    if (completed.phase === Phase.FOCUS) this.stats.value = record_focus(this.stats.value, completed.ended_at, completed.ms);
    this.announce(completed, run);
  }

  private change(run: Run): void {
    this.hide_alert();
    this.file.value.run = run;
  }

  private hide_alert(): void {
    if (this.alert) notifications().hide_toast(this.alert);
    this.alert = null;
  }

  private announce(completed: Completion, next: Run): void {
    this.hide_alert();
    if (this.settings.sound) chime();

    const running = next.status === Status.RUNNING;
    const label = PHASE_LABELS[next.phase].toLowerCase();
    const minutes = this.settings[next.phase === Phase.FOCUS ? "focus_min" : next.phase === Phase.SHORT ? "short_min" : "long_min"];
    const focus_done = completed.phase === Phase.FOCUS;
    const task = this.task.trim();

    const title = focus_done ? (task ? `Focus done: ${task}` : "Focus done") : "Break over";
    const message = running ? `${PHASE_LABELS[next.phase]} started, ${minutes} min.` : focus_done ? `Time for a ${label}.` : "Ready for the next focus?";
    const actions = running
      ? [{ label: focus_done ? "Skip break" : "Pause", on_click: () => detached((timer) => (focus_done ? timer.skip() : timer.pause())) }]
      : [
          { label: focus_done ? "Start break" : "Start focus", on_click: () => detached((timer) => timer.start()) },
          { label: "Skip", on_click: () => detached((timer) => timer.skip()) },
        ];

    this.alert = notifications().notify(APP_ID, { title, message, actions, icon: TimerIcon, system: true, duration: running ? undefined : null });
  }

  dispose(): void {
    this.dispose_root();
    this.file.release();
    this.stats.release();
  }
}

let shared: PomodoroTimer | null = null;

export function acquire_timer(): { timer: PomodoroTimer; release: () => void } {
  const timer = (shared ??= new PomodoroTimer());
  timer.refs++;
  let released = false;
  return {
    timer,
    release() {
      if (released) return;
      released = true;
      if (--timer.refs > 0) return;
      timer.dispose();
      if (shared === timer) shared = null;
    },
  };
}

export type { PomodoroTimer };

// A notification's buttons outlive the window that posted it, so they hold the timer only for the click.
function detached(action: (timer: PomodoroTimer) => void): void {
  const { timer, release } = acquire_timer();
  const stop = $effect.root(() => {
    $effect(() => {
      if (!timer.ready) return;
      untrack(() => action(timer));
      queueMicrotask(() => {
        stop();
        release();
      });
    });
  });
}
