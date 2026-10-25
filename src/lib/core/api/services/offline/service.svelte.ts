import type { AppId, AppsService, FilesService, Kernel, NotificationsService, TasksService, WindowsService } from "$lib/core/api";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { error_message } from "$lib/core/utils";
import { on_idle } from "$lib/core/utils/idle";
import { Mode } from "../../kernel/mode";
import { LatestWriter } from "../files/latest-writer";
import { TaskJobStatus } from "../tasks/type";
import { BUILD_INFO } from "../version/build-info";
import { VERSION_STATE_PATH } from "../version/persistence";
import { stale_caches } from "./lists";
import { current_ids } from "../apps/replaces";
import { OFFLINE_STATE_PATH, PICKED_PATH, parse_picked, parse_state, serialize_picked, serialize_state } from "./persistence";
import { OfflineStatus, type OfflineService as IOfflineService } from "./type";

const SYNC_LOCK = "webos.offline.sync";
const SENDER = "offline";
const work = () => import("./sync");

const parent_of = (path: string) => path.slice(0, path.lastIndexOf("/"));

export class OfflineService implements IOfflineService {
  name = "OfflineService";
  description = "Which apps work offline: the picked ones and the ones opened this build, downloaded whole";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `OfflineService: ${this.picked.size} picked, ${this.saved.size} saved`;
  }

  public online = $state(true);
  public syncing = $state(false);
  public readonly picked = new SvelteSet<AppId>();
  private readonly saved = new SvelteSet<AppId>();
  private readonly downloading = new SvelteSet<AppId>();
  private readonly opened = new Set<AppId>();
  private readonly build = BUILD_INFO.buildTimestamp;
  private readonly base = import.meta.env.BASE_URL;
  private running: Promise<void> | null = null;
  private quiet: Promise<void> = Promise.resolve();
  private cleanups: Array<() => void> = [];
  private destroyed = false;

  private files_service!: FilesService;
  private apps_service!: AppsService;
  private tasks_service!: TasksService;
  private notifications_service!: NotificationsService;
  private windows_service!: WindowsService;

  private picked_writer = new LatestWriter(() => this.files_service, PICKED_PATH, "offline apps");
  private state_writer = new LatestWriter(() => this.files_service, OFFLINE_STATE_PATH, "offline state");

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.tasks_service = $derived(this.kernel.service<TasksService>("tasks"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
  }

  async init(): Promise<void> {
    this.online = navigator.onLine;
    const on_online = () => {
      this.online = true;
      if (this.pending().length > 0) void this.sync();
    };
    const on_offline = () => (this.online = false);
    // Revisions are per tab: another tab's saves show up when this one comes back to the front.
    const on_visibility = () => {
      if (document.visibilityState === "visible") void this.reload();
    };
    window.addEventListener("online", on_online);
    window.addEventListener("offline", on_offline);
    document.addEventListener("visibilitychange", on_visibility);
    this.cleanups.push(() => {
      window.removeEventListener("online", on_online);
      window.removeEventListener("offline", on_offline);
      document.removeEventListener("visibilitychange", on_visibility);
    });

    const [picked_text, state_text] = await Promise.all([this.read(PICKED_PATH), this.read(OFFLINE_STATE_PATH)]);
    this.picked_writer.seed(picked_text);
    this.state_writer.seed(state_text);
    this.apply_picked(parse_picked(picked_text) ?? []);
    const state = parse_state(state_text);
    const new_build = state?.build !== this.build;
    if (!new_build) this.add_saved(state.apps);
    else this.write_state();

    // First boot of this version on a device that had the old everything-offline precache (ADR-065 migration).
    if (state === null && this.kernel.mode !== Mode.SOLO && (await this.read(VERSION_STATE_PATH)) !== null) this.announce();

    this.cleanups.push(
      $effect.root(() => {
        let first = true;
        $effect(() => {
          this.files_service.revision(parent_of(PICKED_PATH));
          this.files_service.revision(parent_of(OFFLINE_STATE_PATH));
          if (first) {
            first = false;
            return;
          }
          untrack(() => void this.reload());
        });
        $effect(() => {
          const ids = this.windows_service.list().map((id) => this.windows_service.get(id)?.app.id);
          untrack(() => {
            for (const id of ids) if (id) this.on_open(id);
          });
        });
      })
    );

    // After an update the old build's cache still has to go, even with nothing picked; off the boot path either way.
    if (new_build || this.pending().length > 0) on_idle(() => void this.sync());
  }

  destroy(): void {
    this.destroyed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  public is_picked(id: AppId): boolean {
    return this.picked.has(id);
  }

  public is_saved(id: AppId): boolean {
    return this.saved.has(id) || this.apps_service.get(id)?.system === true;
  }

  public can_open(id: AppId): boolean {
    return this.online || this.is_saved(id);
  }

  public status(id: AppId): OfflineStatus {
    if (this.apps_service.get(id)?.system) return OfflineStatus.SYSTEM;
    if (this.downloading.has(id)) return OfflineStatus.DOWNLOADING;
    return this.saved.has(id) ? OfflineStatus.SAVED : OfflineStatus.NOT_SAVED;
  }

  public set_picked(id: AppId, keep: boolean): void {
    const manifest = this.apps_service.get(id);
    if (!manifest || manifest.system || this.picked.has(id) === keep) return;
    if (keep) this.picked.add(id);
    else this.picked.delete(id);
    this.picked_writer.write(serialize_picked(this.picked));
    if (keep && !this.saved.has(id)) void this.sync();
  }

  public sync(): Promise<void> {
    if (import.meta.env.DEV || this.destroyed) return Promise.resolve();
    if (this.running) return this.running;
    const running = navigator.locks
      .request(SYNC_LOCK, (): Promise<void> => this.run_sync())
      .then(() => {})
      .catch((error: unknown) => console.error("[OfflineService] Sync failed:", error))
      .finally(() => {
        this.running = null;
        this.syncing = false;
      });
    this.running = running;
    return running;
  }

  private pending(): AppId[] {
    return [...this.picked].filter((id) => !this.saved.has(id) && this.apps_service.is_installed(id));
  }

  private async run_sync(): Promise<void> {
    // The tab that held the lock before may have saved them already.
    await this.reload();
    while (!this.destroyed && this.online && this.pending().length > 0) {
      this.syncing = true;
      const { sync_task } = await work();
      const first = this.pending();
      const name = (id: AppId) => this.apps_service.get(id)?.name ?? id;
      const job = this.tasks_service.run(
        SENDER,
        (context) =>
          sync_task(
            {
              apps: this.pending().map((id) => ({ id, name: name(id) })),
              build: this.build,
              base: this.base,
              on_start: (id) => this.downloading.add(id),
              on_end: (id, saved) => {
                this.downloading.delete(id);
                if (saved) this.add_saved([id]);
              },
            },
            context
          ),
        {
          title: first.length === 1 ? `Keeping ${name(first[0])} offline` : `Keeping ${first.length} apps offline`,
          done: () => ({ title: "Saved for offline", message: first.map(name).join(", ") }),
          failed: (error, cancelled) => ({
            title: cancelled ? "Stopped saving apps for offline" : "Couldn't save apps for offline",
            message: cancelled ? "They open while you're online. Retry in Activity Monitor › Tasks." : error_message(error),
          }),
        }
      );
      await job.done;
      if (job.status !== TaskJobStatus.DONE) return;
    }
    // Only once nothing is left: a retry still copies unchanged files out of the old build's cache.
    if (this.pending().length === 0) await this.prune();
  }

  private async prune(): Promise<void> {
    try {
      const stale = stale_caches(await caches.keys(), this.build);
      await Promise.all(stale.map((key) => caches.delete(key)));
    } catch (error) {
      console.warn("[OfflineService] Couldn't delete older builds' caches", error);
    }
  }

  // The first open of an app in a build keeps it whole, quietly, so it opens offline until the next update.
  private on_open(id: AppId): void {
    if (this.opened.has(id)) return;
    this.opened.add(id);
    const manifest = this.apps_service.get(id);
    if (!manifest || manifest.system || this.saved.has(id)) return;
    this.quiet = this.quiet.then(() => this.save_quietly(id));
  }

  private async save_quietly(id: AppId): Promise<void> {
    if (import.meta.env.DEV || this.destroyed || !this.online || this.saved.has(id) || this.downloading.has(id)) return;
    this.downloading.add(id);
    try {
      const { save_app } = await work();
      await save_app(id, { build: this.build, base: this.base });
      this.add_saved([id]);
    } catch (error) {
      this.opened.delete(id);
      console.warn(`[OfflineService] Couldn't keep ${id} for offline`, error);
    } finally {
      this.downloading.delete(id);
    }
  }

  private announce(): void {
    this.notifications_service.notify(SENDER, {
      title: "Apps now load when you open them",
      message: "Updates take seconds now. Pick the apps that should also work offline.",
      duration: null,
      actions: [{ label: "Choose apps", on_click: () => this.apps_service.launch("settings", { section: "offline" }) }],
    });
  }

  private apply_picked(ids: AppId[]): void {
    const manifests = Array.from(this.apps_service.list(), ([, manifest]) => manifest);
    const next = new Set(current_ids(manifests, ids, (id) => this.apps_service.get(id) !== undefined).filter((id) => this.apps_service.get(id)?.system === false));
    for (const id of [...this.picked]) if (!next.has(id)) this.picked.delete(id);
    for (const id of next) this.picked.add(id);
  }

  private add_saved(ids: AppId[]): void {
    const fresh = ids.filter((id) => !this.saved.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) this.saved.add(id);
    this.write_state();
  }

  private write_state(): void {
    this.state_writer.write(serialize_state({ build: this.build, apps: [...this.saved] }));
  }

  // Never while a write of ours is on its way: the file would still hold the text before it.
  private async reload(): Promise<void> {
    if (!this.picked_writer.busy) {
      const picked = parse_picked(await this.read(PICKED_PATH));
      if (picked && !this.picked_writer.busy) this.apply_picked(picked);
    }
    if (!this.state_writer.busy) {
      const state = parse_state(await this.read(OFFLINE_STATE_PATH));
      if (state?.build === this.build) this.add_saved(state.apps);
    }
  }

  private async read(path: string): Promise<string | null> {
    try {
      return (await (await this.files_service.get_file(path))?.text()) ?? null;
    } catch {
      return null;
    }
  }
}
