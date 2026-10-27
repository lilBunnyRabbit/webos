import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { AppsService, FilesService, Kernel, NotificationsService, SessionService } from "$lib/core/api";
import { error_message } from "$lib/core/utils";
import { spawn as spawn_worker, type WorkerApi, type WorkerHandle } from "$lib/core/utils/worker";
import { Mode } from "../../kernel/mode";
import type { AppId, AppProps } from "../apps/type";
import { LatestWriter } from "../files/latest-writer";
import { NotificationType } from "../notifications/type";
import { parse_hash } from "../router/route";
import { SessionStatus } from "../session/type";
import { background_shell } from "./shell";
import { BACKGROUND_PATH, parse_state, serialize_state, with_resume, type BackgroundState, type ResumeEntry } from "./persistence";
import type {
  BackgroundContext,
  BackgroundJob,
  BackgroundSpawnOptions,
  BackgroundWorker,
  BackgroundService as IBackgroundService,
  TabId,
} from "./type";

export const CHANNEL = "webos.background";
export const lock_name = (app_id: AppId) => `webos.background.${app_id}`;
const STATE_LOCK = "webos.background.state";
/** Another tab's job whose lock is gone (a tab that crashed without saying so) is dropped when this runs. */
const SWEEP_MS = 15_000;

interface WireJob {
  app_id: AppId;
  status: string;
  since: number;
  solo: boolean;
  workers: BackgroundWorker[];
}

type ChannelMessage =
  | { type: "hello"; tab: TabId }
  | { type: "jobs"; tab: TabId; jobs: WireJob[] }
  | { type: "gone"; tab: TabId }
  | { type: "stop"; app_id: AppId };

class LocalJob {
  status = $state("");
  view = $state.raw<unknown>(null);
  workers = $state.raw<BackgroundWorker[]>([]);
  readonly controller = new AbortController();
  readonly handles = new Map<number, WorkerHandle<never>>();
  finished: Promise<void> = Promise.resolve();

  constructor(
    readonly app_id: AppId,
    readonly props: AppProps,
    readonly since: number
  ) {}
}

export class BackgroundService implements IBackgroundService {
  name = "BackgroundService";
  description = "Runs app code with no window, one job per app per browser";
  inspector = () => import("./inspector.svelte");
  shell = () => background_shell(this);

  to_string(): string {
    const here = this.local.size;
    return `BackgroundService: ${here} here, ${this.list().length - here} elsewhere`;
  }

  public readonly tab: TabId = crypto.randomUUID().slice(0, 8);

  private readonly local = new SvelteMap<AppId, LocalJob>();
  private readonly starting = new Map<AppId, Promise<boolean>>();
  private remote = $state.raw<Map<TabId, WireJob[]>>(new Map());
  private channel: BroadcastChannel | null = null;
  private sweep_timer: ReturnType<typeof setInterval> | undefined;
  private cleanups: Array<() => void> = [];
  private destroyed = false;
  private next_worker = 0;
  private writer: LatestWriter;

  private files_service!: FilesService;
  private notifications_service!: NotificationsService;
  private apps_service!: AppsService;
  private session_service!: SessionService;

  private readonly jobs = $derived.by((): BackgroundJob[] => {
    const here = [...this.local.values()].map(
      (job): BackgroundJob => ({
        app_id: job.app_id,
        status: job.status,
        since: job.since,
        tab: this.tab,
        here: true,
        solo: this.solo,
        workers: job.workers,
        view: job.view,
      })
    );
    const elsewhere = [...this.remote].flatMap(([tab, jobs]) =>
      jobs.filter((job) => !this.local.has(job.app_id)).map((job): BackgroundJob => ({ ...job, tab, here: false, view: null }))
    );
    return [...here, ...elsewhere];
  });

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.session_service = $derived(this.kernel.service<SessionService>("session"));
    this.writer = new LatestWriter(() => this.files_service, BACKGROUND_PATH, "background state");
  }

  private get solo(): boolean {
    return this.kernel.mode === Mode.SOLO;
  }

  init(): void {
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (event: MessageEvent<ChannelMessage>) => this.on_message(event.data);
    this.post({ type: "hello", tab: this.tab });

    const on_hide = () => this.post({ type: "gone", tab: this.tab });
    window.addEventListener("pagehide", on_hide);
    this.cleanups.push(() => window.removeEventListener("pagehide", on_hide));

    // Like VersionService's prompts: after the Restore answer, so a Resume toast doesn't sit under the dialog.
    let offered = false;
    this.cleanups.push(
      $effect.root(() => {
        $effect(() => {
          if (offered || this.session_service.status === SessionStatus.PENDING) return;
          offered = true;
          untrack(() => void this.offer_resume());
        });
      })
    );
  }

  destroy(): void {
    this.destroyed = true;
    clearInterval(this.sweep_timer);
    this.post({ type: "gone", tab: this.tab });
    for (const job of this.local.values()) job.controller.abort(new DOMException("WebOS closed", "AbortError"));
    this.channel?.close();
    this.channel = null;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  public list(): BackgroundJob[] {
    return this.jobs;
  }

  public get(app_id: AppId): BackgroundJob | undefined {
    return this.jobs.find((job) => job.app_id === app_id);
  }

  public start(app_id: AppId, props: AppProps = {}): Promise<boolean> {
    const running = this.local.get(app_id);
    if (running && !running.controller.signal.aborted) return Promise.resolve(true);
    let pending = this.starting.get(app_id);
    if (!pending) {
      // A job still stopping holds the lock: the new one starts once it has let go.
      const after = running ? running.finished : Promise.resolve();
      pending = after.then(() => this.begin(app_id, props)).finally(() => this.starting.delete(app_id));
      this.starting.set(app_id, pending);
    }
    return pending;
  }

  private async begin(app_id: AppId, props: AppProps): Promise<boolean> {
    const manifest = await this.apps_service.load(app_id);
    if (!manifest) throw new Error(`App ${app_id} not found`);
    const load = manifest.background;
    if (!load) throw new Error(`${manifest.name} has nothing to run in the background`);
    let checked: AppProps = {};
    if (manifest.props) {
      const parsed = manifest.props.safeParse(props);
      if (!parsed.success) throw new Error(`${manifest.name} can't start with those props`);
      checked = parsed.data;
    }
    const { default: run } = await load();

    return new Promise<boolean>((resolve, reject) => {
      let job: LocalJob | null = null;
      let done!: () => void;
      navigator.locks
        .request(lock_name(app_id), { ifAvailable: true }, async (lock) => {
          if (!lock || this.destroyed) return resolve(false);
          if (this.local.has(app_id)) return resolve(true);
          const started = new LocalJob(app_id, checked, Date.now());
          job = started;
          started.finished = new Promise((settle) => (done = settle));
          started.controller.signal.addEventListener("abort", () => {
            if (!this.destroyed) this.set_status(started, "Stopping");
          }, { once: true });
          this.local.set(app_id, started);
          this.announce();
          resolve(true);
          try {
            await run(this.context(started));
          } catch (error) {
            if (!started.controller.signal.aborted) this.report(app_id, error);
          } finally {
            for (const handle of started.handles.values()) handle.terminate();
            if (!this.destroyed) await this.write_resume(app_id, null).catch(() => {});
          }
        })
        // Gone from the lists only once the lock is free: a tab that sees it idle can start it.
        .then(
          () => {
            if (!job) return;
            this.local.delete(app_id);
            if (!this.destroyed) this.announce();
            done();
          },
          (error: unknown) => {
            if (job) {
              this.local.delete(app_id);
              done();
            }
            reject(error);
          }
        );
    });
  }

  private set_status(job: LocalJob, text: string): void {
    if (job.status === text) return;
    job.status = text;
    this.announce();
  }

  public async stop(app_id: AppId): Promise<boolean> {
    const job = this.local.get(app_id);
    if (job) {
      job.controller.abort(new DOMException("Stopped", "AbortError"));
      await job.finished;
      return true;
    }
    if (!this.get(app_id)) return false;
    this.post({ type: "stop", app_id });
    return true;
  }

  private context(job: LocalJob): BackgroundContext {
    return {
      app_id: job.app_id,
      props: job.props,
      signal: job.controller.signal,
      status: (text) => {
        if (!job.controller.signal.aborted) this.set_status(job, text);
      },
      share: (view) => (job.view = view),
      resumable: (props) => this.write_resume(job.app_id, props === null ? null : { props: props ?? job.props, since: job.since }),
      spawn: <Api extends WorkerApi<Api>, Event = never>(WorkerCtor: new () => Worker, options: BackgroundSpawnOptions<Event> = {}) =>
        this.spawn<Api, Event>(job, WorkerCtor, options),
    };
  }

  private spawn<Api extends WorkerApi<Api>, Event>(
    job: LocalJob,
    WorkerCtor: new () => Worker,
    { name = "worker", ...options }: BackgroundSpawnOptions<Event>
  ): WorkerHandle<Api> {
    if (job.controller.signal.aborted) throw job.controller.signal.reason;
    const handle = spawn_worker<Api, Event>(WorkerCtor, options);
    const entry: BackgroundWorker = { id: this.next_worker++, name, since: Date.now() };
    job.handles.set(entry.id, handle as unknown as WorkerHandle<never>);
    job.workers = [...job.workers, entry];
    this.announce();
    // Ended when the job returns, not on abort: a job may still need its worker to finish a write after Stop.
    return {
      call: (method, input, call_options) => handle.call(method, input, call_options),
      terminate: (reason) => {
        handle.terminate(reason);
        if (!job.handles.delete(entry.id)) return;
        job.workers = job.workers.filter((worker) => worker.id !== entry.id);
        this.announce();
      },
      get alive() {
        return handle.alive;
      },
      get pending() {
        return handle.pending;
      },
    };
  }

  private report(app_id: AppId, error: unknown): void {
    console.error(`[BackgroundService] ${app_id} stopped:`, error);
    this.notifications_service.notify(app_id, {
      type: NotificationType.ERROR,
      title: `${this.apps_service.get(app_id)?.name ?? app_id} stopped`,
      message: error_message(error),
    });
  }

  private wire(): WireJob[] {
    return [...this.local.values()].map((job) => ({
      app_id: job.app_id,
      status: job.status,
      since: job.since,
      solo: this.solo,
      workers: job.workers,
    }));
  }

  private announce(): void {
    this.post({ type: "jobs", tab: this.tab, jobs: this.wire() });
  }

  private post(message: ChannelMessage): void {
    this.channel?.postMessage(message);
  }

  private on_message(message: ChannelMessage): void {
    if (message.type === "hello") {
      if (this.local.size > 0) this.announce();
      return;
    }
    if (message.type === "stop") {
      if (this.local.has(message.app_id)) void this.stop(message.app_id);
      return;
    }
    const remote = new Map(this.remote);
    if (message.type === "gone" || message.jobs.length === 0) remote.delete(message.tab);
    else remote.set(message.tab, message.jobs);
    this.remote = remote;
    this.keep_sweeping();
  }

  private keep_sweeping(): void {
    if (this.remote.size === 0) {
      clearInterval(this.sweep_timer);
      this.sweep_timer = undefined;
    } else this.sweep_timer ??= setInterval(() => void this.sweep(), SWEEP_MS);
  }

  private async sweep(): Promise<void> {
    const { held = [] } = await navigator.locks.query();
    const names = new Set(held.map((lock) => lock.name));
    const remote = new Map<TabId, WireJob[]>();
    for (const [tab, jobs] of this.remote) {
      const alive = jobs.filter((job) => names.has(lock_name(job.app_id)));
      if (alive.length > 0) remote.set(tab, alive);
    }
    if (remote.size !== this.remote.size || [...remote].some(([tab, jobs]) => this.remote.get(tab)?.length !== jobs.length))
      this.remote = remote;
    this.keep_sweeping();
  }

  private async read_state(): Promise<{ state: BackgroundState; text: string | null }> {
    const file = await this.files_service.get_file(BACKGROUND_PATH);
    const text = file ? await file.text() : null;
    return { state: parse_state(text), text };
  }

  // Under a lock and re-read first: every tab's jobs share the one file.
  private async write_resume(app_id: AppId, entry: ResumeEntry | null): Promise<void> {
    await navigator.locks.request(STATE_LOCK, async () => {
      const { state, text } = await this.read_state();
      if (!entry && !(app_id in state.resume)) return;
      this.writer.seed(text);
      this.writer.write(serialize_state(with_resume(state, app_id, entry)));
      await this.writer.idle();
    });
  }

  /** A solo tab offers only its own app: the others belong to a full tab. */
  private async offer_resume(): Promise<void> {
    let state: BackgroundState;
    try {
      ({ state } = await this.read_state());
    } catch (error) {
      console.warn("[BackgroundService] Couldn't read the resume list:", error);
      return;
    }
    const entries = Object.entries(state.resume);
    if (entries.length === 0 || this.destroyed) return;
    const { held = [] } = await navigator.locks.query();
    const running = new Set(held.map((lock) => lock.name));
    const solo_app = this.solo ? parse_hash(location.hash)?.id : null;
    for (const [app_id, entry] of entries) {
      if (running.has(lock_name(app_id)) || (this.solo && app_id !== solo_app)) continue;
      const manifest = this.apps_service.get(app_id);
      if (!manifest) {
        await this.write_resume(app_id, null).catch(() => {});
        continue;
      }
      const id = this.notifications_service.notify(app_id, {
        title: `Resume ${manifest.name}?`,
        message: "It was running in the background when WebOS closed.",
        duration: null,
        actions: [
          {
            label: "Resume",
            on_click: () => {
              this.notifications_service.dismiss(id);
              this.start(app_id, entry.props).catch((error: unknown) => this.report(app_id, error));
            },
          },
          {
            label: "Dismiss",
            on_click: () => {
              this.notifications_service.dismiss(id);
              void this.write_resume(app_id, null).catch(() => {});
            },
          },
        ],
      });
    }
  }
}
