import { untrack } from "svelte";
import type { AppsService, FilesService, Kernel, NotificationsService, ShellService } from "$lib/core/api";
import { error_message, format_datetime } from "$lib/core/utils";
import { Mode } from "../../kernel/mode";
import { NotificationType } from "../notifications/type";
import {
  active_registration,
  announce_ready,
  ClickSource,
  listen_clicks,
  permission,
  show_system_notification,
  show_triggered_notification,
  supports_triggers,
  type NotificationClick,
  type SystemNotificationOptions,
} from "../notifications/system";
import { parse_hash, RouteKind, serialize_route } from "../router/route";
import { next_due, pending, plan } from "./occurrence";
import { JobSchema, SCHEDULER_PATH, type Registry } from "./persistence";
import { scheduler_shell } from "./shell";
import { CHANNEL, LEADER_LOCK, RegistryStore, type Change } from "./store";
import {
  FireOutcome,
  JobKind,
  type Job,
  type JobFire,
  type JobId,
  type JobInput,
  type JobPatch,
  type MissedJob,
  type SchedulerService as ISchedulerService,
} from "./type";
import type { AppId } from "../apps/type";

/** While it has jobs, the leader wakes at least once a minute, on the minute, so a clock change or an edit nobody announced is seen. */
const MAX_DELAY = 60_000;
/** Wall clock and `performance.now()` drifting apart by more than this between wake-ups: the device slept or the clock moved. */
const JUMP = 5_000;
/** A failed pass (storage error) retries no sooner than this, instead of spinning on a due job it can't record. */
const RETRY_DELAY = 5_000;
const MAX_MISSED = 50;
const MISSED_TAG = "scheduler:missed";
const SCHEDULER_FIELDS = ["armed_at", "last_fired", "missed_at"] as const;
const CHIME_ORDER: JobKind[] = [JobKind.ALARM, JobKind.TIMER, JobKind.PHASE];

type ChannelMessage = { type: "changed" } | { type: "seen" } | { type: "badge"; count: number };

interface LockRequest {
  id: number;
  abort: AbortController | null;
}

export class SchedulerService implements ISchedulerService {
  name = "SchedulerService";
  description = "Fires scheduled notifications for every app while any WebOS tab lives";
  inspector = () => import("./inspector.svelte");
  shell = () => scheduler_shell(this, (job) => this.open(job));

  to_string(): string {
    return `SchedulerService: ${this.jobs.length} jobs, ${this.is_leader ? "leader" : "follower"}`;
  }

  public jobs = $state.raw<Job[]>([]);
  public is_leader = $state(false);
  public triggers = $state(false);
  public missed = $state.raw<MissedJob[]>([]);
  public last_jump = $state<number | null>(null);

  private text: string | null = null;
  private readonly store = new RegistryStore(() => this.files_service);
  private channel: BroadcastChannel | null = null;
  private cleanups: Array<() => void> = [];

  private request: LockRequest | null = null;
  private leading: number | null = null;
  private release: (() => void) | null = null;
  private sequence = 0;
  private destroyed = false;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private armed_wall = 0;
  private armed_mono = 0;
  private processing: Promise<void> | null = null;
  private again = false;
  private failed = false;
  private first_pass = true;
  private badge = 0;
  private triggered: Map<JobId, number> | null = null;
  private handlers: Promise<void> = Promise.resolve();

  private files_service!: FilesService;
  private notifications_service!: NotificationsService;
  private apps_service!: AppsService;
  private shell_service!: ShellService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.shell_service = $derived(this.kernel.service<ShellService>("shell"));
  }

  async init(): Promise<void> {
    this.triggers = supports_triggers();
    const { registry, text } = await this.store.read();
    this.apply(registry, text);

    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => this.on_channel(event.data);

    const wake = () => this.wake();
    const on_visibility = () => {
      if (document.visibilityState !== "visible") return;
      this.seen();
      this.wake();
    };
    document.addEventListener("visibilitychange", on_visibility);
    document.addEventListener("resume", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    this.cleanups.push(() => {
      document.removeEventListener("visibilitychange", on_visibility);
      document.removeEventListener("resume", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    });

    // Edits this tab makes another way (Terminal, Text Editor) bump the folder's revision; other tabs ping the channel.
    this.cleanups.push(
      $effect.root(() => {
        let first = true;
        $effect(() => {
          this.files_service.revision(SCHEDULER_PATH.slice(0, SCHEDULER_PATH.lastIndexOf("/")));
          // The first run only subscribes; init() already read the registry.
          if (first) {
            first = false;
            return;
          }
          untrack(() => void this.refresh());
        });
        // Uninstalling happens in one tab and isn't shared, so whichever full tab sees it drops the app's jobs.
        $effect(() => {
          if (this.jobs.some((job) => this.uninstalled(job.app))) untrack(() => void this.drop_uninstalled());
        });
      })
    );

    this.cleanups.push(listen_clicks(ClickSource.SCHEDULER, (click) => this.on_click(click)));
    announce_ready();
    // An installed app keeps its badge after the tab that set it closed, so a visible boot clears it whatever this tab knows.
    if (document.visibilityState === "visible") this.clear_badge();
    this.join(this.may_steal());
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.request?.abort?.abort();
    this.release?.();
    this.channel?.close();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  public get(id: JobId): Job | undefined {
    return this.jobs.find((job) => job.id === id);
  }

  public list(app?: AppId): Job[] {
    return app === undefined ? this.jobs : this.jobs.filter((job) => job.app === app);
  }

  public next(id: JobId): number | null {
    const job = this.get(id);
    return job ? pending(job) : null;
  }

  public async schedule(app: AppId, input: JobInput): Promise<Job> {
    const job = this.build(app, input, Date.now());
    return this.mutate((registry) => {
      const index = registry.jobs.findIndex((item) => item.id === job.id);
      const jobs = index === -1 ? [...registry.jobs, job] : registry.jobs.map((item, at) => (at === index ? job : item));
      return { next: { ...registry, jobs }, result: job };
    });
  }

  public async update(id: JobId, patch: JobPatch): Promise<Job | null> {
    const now = Date.now();
    return this.mutate((registry) => {
      const index = registry.jobs.findIndex((item) => item.id === id);
      if (index === -1) return { next: null, result: null };
      const job = this.patched(registry.jobs[index], patch, now);
      return { next: { ...registry, jobs: registry.jobs.map((item, at) => (at === index ? job : item)) }, result: job };
    });
  }

  public async cancel(id: JobId): Promise<boolean> {
    return this.mutate((registry) => {
      const jobs = registry.jobs.filter((job) => job.id !== id);
      return jobs.length === registry.jobs.length ? { next: null, result: false } : { next: { ...registry, jobs }, result: true };
    });
  }

  private build(app: AppId, input: JobInput, now: number): Job {
    const { key, armed = true, ...rest } = input;
    const job = { ...rest, id: `${app}:${key}`, app, armed } as Job;
    for (const field of SCHEDULER_FIELDS) delete job[field];
    if (armed) job.armed_at = now;
    return this.validate(job);
  }

  private patched(current: Job, patch: JobPatch, now: number): Job {
    const job: Job = { ...current };
    for (const [key, value] of Object.entries(patch) as [keyof Job, unknown][]) {
      if (key === "id" || key === "app" || key === "armed_at" || key === "last_fired") continue;
      if (value === undefined) delete job[key];
      else if (key !== "missed_at") Object.assign(job, { [key]: value });
    }
    const retimed =
      ("at" in patch && JSON.stringify(patch.at) !== JSON.stringify(current.at)) ||
      ("repeat" in patch && JSON.stringify(patch.repeat) !== JSON.stringify(current.repeat));
    if (job.armed && (retimed || !current.armed)) job.armed_at = now;
    // Clearing a repeating job's missed_at mustn't bring back the occurrences it skipped.
    if (current.missed_at !== undefined && job.missed_at === undefined && job.repeat) {
      job.armed_at = Math.max(job.armed_at ?? -Infinity, current.missed_at + 1);
    }
    return this.validate(job);
  }

  /** A user app taken out of the installed list. Never in solo: a solo link opens apps that were never installed. */
  private uninstalled(app: AppId): boolean {
    if (this.kernel.mode !== Mode.FULL) return false;
    const manifest = this.apps_service.get(app);
    return manifest !== undefined && !this.apps_service.is_installed(app);
  }

  private async drop_uninstalled(): Promise<void> {
    try {
      await this.mutate((registry) => {
        const jobs = registry.jobs.filter((job) => !this.uninstalled(job.app));
        return { next: jobs.length === registry.jobs.length ? null : { ...registry, jobs }, result: undefined };
      });
    } catch (error) {
      if (!this.destroyed) console.warn("[SchedulerService] Couldn't drop an uninstalled app's jobs:", error);
    }
  }

  private validate(job: Job): Job {
    const result = JobSchema.safeParse(job);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "job"}: ${issue.message}`).join("; ");
      throw new Error(`[SchedulerService] Invalid job ${job.id}: ${issues}`);
    }
    return job;
  }

  private async mutate<T>(change: (registry: Registry) => Change<T>): Promise<T> {
    const transaction = await this.store.transact(change);
    this.apply(transaction.registry, transaction.text);
    if (transaction.written) this.announce({ type: "changed" });
    if (this.is_leader) void this.process();
    return transaction.result;
  }

  private apply(registry: Registry, text: string | null): void {
    if (text === this.text) return;
    this.text = text;
    this.jobs = registry.jobs;
  }

  private async refresh(): Promise<void> {
    if (this.destroyed) return;
    try {
      const { registry, text } = await this.store.read();
      if (text === this.text) return;
      this.apply(registry, text);
      if (this.is_leader) void this.process();
    } catch (error) {
      console.warn("[SchedulerService] Couldn't re-read the jobs:", error);
    }
  }

  private announce(message: ChannelMessage): void {
    this.channel?.postMessage(message);
  }

  private on_channel(message: ChannelMessage): void {
    if (message.type === "changed") void this.refresh();
    else if (message.type === "seen") this.badge = 0;
    else if (message.type === "badge") this.badge = message.count;
  }

  // Leadership (ADR-062): one tab per browser holds the lock and keeps the timer. A visible full tab takes it over;
  // a solo tab only queues, so it leads when no full tab is open.

  private may_steal(): boolean {
    return this.kernel.mode === Mode.FULL && document.visibilityState === "visible";
  }

  private join(steal: boolean): void {
    if (this.destroyed) return;
    const previous = this.request;
    const request: LockRequest = { id: ++this.sequence, abort: steal ? null : new AbortController() };
    this.request = request;
    previous?.abort?.abort();

    // A steal can't carry a signal (Web Locks spec); it's granted at once anyway.
    const options: LockOptions = steal ? { steal: true } : { signal: request.abort!.signal };
    navigator.locks
      .request(LEADER_LOCK, options, () => {
        if (this.request !== request || this.destroyed) return;
        this.leading = request.id;
        this.lead();
        return new Promise<void>((resolve) => (this.release = resolve));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("[SchedulerService] Lock request failed:", error);
      })
      .finally(() => {
        if (this.leading === request.id) this.stand_down();
        // Stolen by another tab: queue again, to lead once it's gone.
        if (this.request === request && !this.destroyed) this.join(false);
      });
  }

  private lead(): void {
    this.is_leader = true;
    this.triggered = null;
    void this.process();
  }

  private stand_down(): void {
    this.leading = null;
    this.is_leader = false;
    clearTimeout(this.timer);
    this.release?.();
    this.release = null;
  }

  private wake(): void {
    if (this.destroyed) return;
    this.check_jump();
    if (this.is_leader) {
      if (this.jobs.length > 0) void this.process();
    } else if (this.may_steal() && !this.stealing()) this.join(true);
  }

  /** Becoming visible fires visibilitychange and focus together; the second mustn't steal again. */
  private stealing(): boolean {
    return this.request !== null && this.request.abort === null && this.leading !== this.request.id;
  }

  private check_jump(): void {
    if (!this.is_leader || this.armed_mono === 0) return;
    const drift = Date.now() - this.armed_wall - (performance.now() - this.armed_mono);
    if (Math.abs(drift) > JUMP) this.last_jump = Date.now();
  }

  private arm(): void {
    clearTimeout(this.timer);
    // No jobs, nothing to fire or notice: a schedule, a re-read or another tab's ping runs a pass, which arms it again.
    if (!this.is_leader || this.destroyed || this.jobs.length === 0) return;
    const now = Date.now();
    const due = next_due(this.jobs);
    const until_due = due === null ? Infinity : Math.max(due - now, 0);
    // The idle wake-up lands on the minute, so a hidden tab shares the taskbar clock's tick instead of adding its own.
    const heartbeat = MAX_DELAY - (now % MAX_DELAY);
    const next = until_due < MAX_DELAY ? until_due : heartbeat;
    const delay = this.failed ? Math.max(next, RETRY_DELAY) : next;
    this.armed_wall = now;
    this.armed_mono = performance.now();
    // Armed after a pass's storage I/O, never straight from the timer callback, so it isn't a chained timer that
    // Chrome throttles to once a minute in a hidden tab.
    this.timer = setTimeout(() => {
      this.check_jump();
      void this.process();
    }, delay);
  }

  private process(): Promise<void> {
    if (this.processing) {
      this.again = true;
      return this.processing;
    }
    this.processing = (async () => {
      do {
        this.again = false;
        await this.pass();
      } while (this.again && this.is_leader && !this.destroyed);
    })().finally(() => {
      this.processing = null;
      this.arm();
    });
    return this.processing;
  }

  private async pass(): Promise<void> {
    if (!this.is_leader || this.destroyed) return;
    const now = Date.now();
    try {
      const transaction = await this.store.transact((registry) => {
        const result = plan(registry.jobs, now);
        return { next: result.changed ? { ...registry, jobs: result.jobs } : null, result };
      });
      this.failed = false;
      this.apply(transaction.registry, transaction.text);
      if (transaction.written) this.announce({ type: "changed" });

      const closed = this.first_pass;
      this.first_pass = false;
      const { fired, missed } = transaction.result;
      const after = (id: JobId) => transaction.registry.jobs.find((job) => job.id === id);
      for (const { job, due } of fired) {
        const shown = this.fire(job, due);
        this.hand_off(after(job.id) ?? job, { outcome: FireOutcome.FIRED, due }, shown);
      }
      this.chime(fired.filter(({ job }) => !job.silent).map(({ job }) => job.kind));
      if (missed.length > 0) this.report_missed(missed, closed);
      for (const { id, due } of missed) {
        const job = after(id);
        if (job) this.hand_off(job, { outcome: FireOutcome.MISSED, due });
      }
      await this.sync_triggers();
    } catch (error) {
      if (this.destroyed) return;
      this.failed = true;
      console.error("[SchedulerService] A scheduler pass failed:", error);
    }
  }

  private target(job: Job) {
    return job.open ?? { app: job.app };
  }

  private route(job: Job): string {
    const target = this.target(job);
    return serialize_route({ kind: RouteKind.APP, id: target.app, props: target.props });
  }

  private notification_options(job: Job, due: number): SystemNotificationOptions {
    return {
      body: job.message,
      tag: job.id,
      data: { source: ClickSource.SCHEDULER, id: job.id, route: this.route(job), commands: (job.actions ?? []).map((action) => action.command) },
      actions: job.actions?.map((action) => action.label),
      require_interaction: job.kind === JobKind.ALARM,
      renotify: true,
      timestamp: due,
    };
  }

  private async fire(job: Job, due: number): Promise<void> {
    try {
      if (!(this.triggers && (await this.shown_by_trigger(job.id, due)))) {
        await show_system_notification(job.title, this.notification_options(job, due));
      }
    } catch (error) {
      console.warn(`[SchedulerService] Couldn't show ${job.id}:`, error);
    }
    if (document.visibilityState !== "visible") return;
    this.notifications_service.notify(job.app, {
      title: job.title,
      message: job.message,
      duration: job.kind === JobKind.ALARM ? null : undefined,
      actions: [
        ...(job.actions ?? []).map((action) => ({ label: action.label, on_click: () => void this.shell_service.execute(action.command) })),
        { label: "Open", on_click: () => this.open(job) },
      ],
    });
  }

  // Handlers run one at a time, in firing order, off the pass: a slow one never holds up the timer, and two jobs of one
  // app never race each other.
  private hand_off(job: Job, fire: JobFire, shown: Promise<void> = Promise.resolve()): void {
    const load = this.apps_service.get(job.app)?.on_fire;
    if (!load) return;
    this.handlers = this.handlers.then(async () => {
      await shown;
      if (this.destroyed) return;
      try {
        const { default: handle } = await load();
        await handle(job, fire);
      } catch (error) {
        console.error(`[SchedulerService] ${job.app} failed handling ${job.id}:`, error);
        this.notifications_service.notify(job.app, {
          type: NotificationType.ERROR,
          title: `Couldn't finish “${job.title || job.id}”`,
          message: error_message(error),
        });
      }
    });
  }

  // One chime per pass, the loudest kind that fired, so jobs due together don't stack. Browsers keep audio off until
  // the page has had a click; without one the OS notification's sound carries it.
  private chime(kinds: JobKind[]): void {
    const kind = CHIME_ORDER.find((candidate) => kinds.includes(candidate));
    if (!kind || !navigator.userActivation.hasBeenActive) return;
    void import("./chime").then((module) => module.play_chime(kind));
  }

  private async shown_by_trigger(id: JobId, due: number): Promise<boolean> {
    const registration = await active_registration();
    const shown = (await registration?.getNotifications({ tag: id })) ?? [];
    return shown.some((notification) => notification.timestamp === due);
  }

  private report_missed(missed: MissedJob[], closed: boolean): void {
    this.missed = [...this.missed, ...missed].slice(-MAX_MISSED);
    const title = `${missed.length} missed while WebOS was ${closed ? "closed" : "asleep"}`;
    const body = missed.map((job) => job.title || job.id).join(", ");

    for (const job of missed) {
      const id = this.notifications_service.notify(job.app, {
        title: job.title || job.id,
        message: `Missed · due ${format_datetime(job.due)}`,
        type: NotificationType.WARNING,
      });
      this.notifications_service.hide_toast(id);
    }
    this.notifications_service.notify("scheduler", { title, message: body, type: NotificationType.WARNING });
    show_system_notification(title, {
      body,
      tag: MISSED_TAG,
      data: { source: ClickSource.SCHEDULER, id: MISSED_TAG, route: null, commands: [] },
      renotify: true,
    }).catch((error) => console.warn("[SchedulerService] Couldn't show the missed summary:", error));

    if (document.visibilityState !== "visible") {
      this.badge += missed.length;
      navigator.setAppBadge?.(this.badge).catch(() => {});
      this.announce({ type: "badge", count: this.badge });
    }
  }

  private seen(): void {
    if (this.badge > 0) this.clear_badge();
  }

  private clear_badge(): void {
    this.badge = 0;
    navigator.clearAppBadge?.().catch(() => {});
    this.announce({ type: "seen" });
  }

  private async sync_triggers(): Promise<void> {
    if (!this.triggers || !this.is_leader || permission() !== "granted") return;
    const registration = await active_registration();
    if (!registration) return;

    if (this.triggered === null) {
      this.triggered = new Map();
      for (const notification of await registration.getNotifications({ includeTriggered: true })) {
        if (notification.showTrigger) this.triggered.set(notification.tag, notification.showTrigger.timestamp);
      }
    }

    const now = Date.now();
    const wanted = new Map<JobId, { job: Job; due: number }>();
    for (const job of this.jobs) {
      const due = pending(job);
      if (due !== null && due > now) wanted.set(job.id, { job, due });
    }

    for (const [id, at] of this.triggered) {
      if (wanted.get(id)?.due === at) continue;
      for (const notification of await registration.getNotifications({ tag: id, includeTriggered: true })) {
        if (notification.showTrigger) notification.close();
      }
      this.triggered.delete(id);
    }
    for (const [id, { job, due }] of wanted) {
      if (this.triggered.get(id) === due) continue;
      await show_triggered_notification(job.title, due, this.notification_options(job, due));
      this.triggered.set(id, due);
    }
  }

  private open(job: Job): void {
    const target = this.target(job);
    try {
      this.apps_service.launch(target.app, target.props);
    } catch (error) {
      console.warn(`[SchedulerService] Couldn't open ${target.app}:`, error);
    }
  }

  /**
   * A full tab takes every click: it runs the button's command or opens the route. A solo tab takes only a body click
   * for its own app; anything else opens full WebOS from the worker.
   */
  private on_click(click: NotificationClick): boolean {
    const route = click.route ? parse_hash(click.route) : null;
    if (this.kernel.mode === Mode.SOLO) {
      return click.command === null && route !== null && route.id === parse_hash(location.hash)?.id;
    }
    if (click.command !== null) void this.shell_service.execute(click.command);
    else if (route) {
      try {
        this.apps_service.launch(route.id, route.props);
      } catch (error) {
        console.warn(`[SchedulerService] Couldn't open ${route.id}:`, error);
      }
    }
    return true;
  }
}
