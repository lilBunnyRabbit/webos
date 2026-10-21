import { detached_root } from "$lib/core/utils/detached-root.svelte";
import { untrack } from "svelte";
import kernel, { NotificationType, type Job, type NotificationsService, type SchedulerService } from "$lib/core/api";
import { app_data_path, json_file } from "$lib/core/contexts/app";
import { error_message } from "$lib/core/utils";
import * as logic from "./pomodoro";
import { APP_ID, EMPTY_TIMER, JOB_ID, Phase, Status, TimerFileSchema, type Ended, type PhaseJob, type Run, type Settings } from "./pomodoro";
import { EMPTY_STATS, record_focus, StatsFileSchema } from "./stats";

const notifications = () => kernel.service<NotificationsService>("notifications");
const scheduler = () => kernel.service<SchedulerService>("scheduler");

const RETEXT_DELAY = 800;

const same_texts = (job: Job, input: ReturnType<typeof logic.phase_input>) =>
  job.title === input.title && job.message === input.message && JSON.stringify(job.actions ?? []) === JSON.stringify(input.actions ?? []);

// One per page, shared by every window, the widget and shell commands. The scheduler fires the phase end; this counts
// it and starts what follows. It holds itself while a phase runs, so an auto-started next phase follows in this tab
// even after the window closes.
class PomodoroTimer {
  readonly file = json_file(app_data_path(APP_ID, "timer.json"), EMPTY_TIMER, TimerFileSchema);
  readonly stats = json_file(app_data_path(APP_ID, "stats.json"), EMPTY_STATS, StatsFileSchema);
  refs = 0;

  // The job this tab is writing, shown until the registry has it, so the ring doesn't flash idle in between.
  private overlay = $state<{ job: PhaseJob | null } | null>(null);
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private dispose_root: () => void;

  constructor(private readonly drop: (timer: PomodoroTimer) => void) {
    this.dispose_root = detached_root(() => {
      $effect(() => {
        if (this.ready && this.resolved) untrack(() => void this.settle());
      });

      $effect(() => {
        if (!this.ready || this.run.status !== Status.RUNNING) return;
        untrack(() => this.refs++);
        return () => queueMicrotask(() => !this.disposed && this.drop(this));
      });

      $effect(() => {
        if (!this.ready || this.overlay) return;
        const job = scheduler().get(JOB_ID);
        if (!job?.armed || !("epoch" in job.at)) return;
        const input = logic.phase_input(this.run, this.settings, this.task);
        if (same_texts(job, input)) return;
        const { title, message, actions } = input;
        const id = setTimeout(
          () => void this.enqueue(async () => void (scheduler().get(JOB_ID)?.armed && (await scheduler().update(JOB_ID, { title, message, actions })))),
          RETEXT_DELAY
        );
        return () => clearTimeout(id);
      });
    });
  }

  get ready(): boolean {
    return this.file.ready && this.stats.ready;
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

  private get job(): PhaseJob | undefined {
    return this.overlay ? (this.overlay.job ?? undefined) : scheduler().get(JOB_ID);
  }

  // A phase end not yet counted (in this tab, or by any tab before the registry says so) already reads as counted.
  private get resolved(): logic.Resolved | null {
    return logic.resolve(this.file.value.plan, this.job, this.settings, Date.now());
  }

  get run(): Run {
    return this.resolved?.run ?? logic.run_of(this.file.value.plan, this.job);
  }

  get ended(): Ended | null {
    return this.resolved ? this.resolved.ended : this.file.value.ended;
  }

  /** Asks for notification permission, so call it from the click; a shell command passes `false`. */
  start(from_click = true): Promise<void> {
    if (from_click) void notifications().request_system();
    return this.act((run) => logic.start(run, this.settings, Date.now()));
  }

  pause(): Promise<void> {
    return this.act((run) => logic.pause(run, Date.now()));
  }

  reset(): Promise<void> {
    return this.act(logic.reset);
  }

  skip(): Promise<void> {
    return this.act((run) => logic.skip(run, this.settings));
  }

  choose(phase: Phase): Promise<void> {
    return this.act((run) => logic.choose(run, phase));
  }

  clear_stats(): void {
    this.stats.value = structuredClone(EMPTY_STATS);
  }

  settle(): Promise<void> {
    return this.enqueue(() => this.settle_now());
  }

  private act(change: (run: Run) => Run): Promise<void> {
    return this.enqueue(async () => {
      await this.settle_now();
      const job = scheduler().get(JOB_ID);
      await this.commit(change(logic.run_of(this.file.value.plan, job)), this.file.value.plan.settled, null, job);
    });
  }

  private async settle_now(): Promise<void> {
    if (!this.ready) return;
    const job = scheduler().get(JOB_ID);
    const resolved = logic.resolve(this.file.value.plan, job, this.settings, Date.now());
    if (!resolved) return;
    const { completed } = resolved;
    if (completed.phase === Phase.FOCUS) this.stats.value = record_focus(this.stats.value, completed.ended_at, completed.ms);
    await this.commit(resolved.run, resolved.settled, resolved.ended, job);
  }

  // The plan is written first and the job after, with the overlay showing the job meanwhile: a pause stores the time
  // left before the job stops, so no moment reads as idle.
  private async commit(run: Run, settled: number | null, ended: Ended | null, job: Job | undefined): Promise<void> {
    this.file.value.plan = logic.plan_of(run, settled);
    this.file.value.ended = ended;
    try {
      if (run.status === Status.RUNNING) {
        if (job?.armed && "epoch" in job.at && job.at.epoch === run.ends_at) return;
        const input = logic.phase_input(run, this.settings, this.task);
        this.overlay = { job: { armed: true, at: input.at } };
        await scheduler().schedule(APP_ID, input);
      } else if (!job) {
        return;
      } else if (run.status === Status.PAUSED) {
        this.overlay = { job: { armed: false, at: job.at } };
        await scheduler().update(JOB_ID, job.missed_at === undefined ? { armed: false } : { missed_at: undefined });
      } else {
        this.overlay = { job: null };
        await scheduler().cancel(JOB_ID);
      }
    } finally {
      this.overlay = null;
    }
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work);
    this.queue = next.catch((reason) => {
      notifications().notify(APP_ID, { type: NotificationType.ERROR, title: "Couldn't update the timer", message: error_message(reason) });
    });
    return next;
  }

  dispose(): void {
    this.disposed = true;
    this.dispose_root();
    this.file.release();
    this.stats.release();
  }
}

let shared: PomodoroTimer | null = null;

function drop(timer: PomodoroTimer): void {
  if (--timer.refs > 0) return;
  timer.dispose();
  if (shared === timer) shared = null;
}

export function acquire_timer(): { timer: PomodoroTimer; release: () => void } {
  const timer = (shared ??= new PomodoroTimer(drop));
  timer.refs++;
  let released = false;
  return {
    timer,
    release() {
      if (released) return;
      released = true;
      drop(timer);
    },
  };
}

export type { PomodoroTimer };
