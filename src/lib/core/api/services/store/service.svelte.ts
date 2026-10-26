import type { AppId, AppsService, FilesService, Kernel, TasksService } from "$lib/core/api";
import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { error_message } from "$lib/core/utils";
import { on_idle } from "$lib/core/utils/idle";
import { Mode } from "../../kernel/mode";
import { LatestWriter } from "../files/latest-writer";
import { TaskJobStatus } from "../tasks/type";
import { BUILD_INFO } from "../version/build-info";
import { stale_caches } from "./lists";
import { current_ids } from "../apps/replaces";
import { serialize_slice } from "../apps/catalogue";
import { CATALOGUE_PATH } from "../apps/installed";
import { LEGACY_PICKED_PATH, LEGACY_STATE_DIR, LEGACY_STATE_PATH, STORE_STATE_PATH, parse_picked, parse_state, serialize_state } from "./persistence";
import { StoreStatus, type StoreService as IStoreService } from "./type";

const SYNC_LOCK = "webos.store.sync";
const SENDER = "store";
const work = () => import("./sync");

const parent_of = (path: string) => path.slice(0, path.lastIndexOf("/"));
const split = (path: string) => [parent_of(path), path.slice(path.lastIndexOf("/") + 1)] as const;

const SyncReason = { SETUP: "setup", UPDATE: "update", INSTALL: "install" } as const;
type SyncReason = (typeof SyncReason)[keyof typeof SyncReason];

export class StoreService implements IStoreService {
  name = "StoreService";
  description = "Keeps installed apps on the device: downloads them on install and after updates, deletes them on uninstall";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `StoreService: ${this.saved.size} saved, ${this.downloading.size} downloading`;
  }

  public online = $state(true);
  public syncing = $state(false);
  private readonly saved = new SvelteSet<AppId>();
  private readonly downloading = new SvelteMap<AppId, number>();
  private installed = new Set<AppId>();
  private reason: SyncReason = SyncReason.INSTALL;
  private readonly build = BUILD_INFO.buildTimestamp;
  private readonly base = import.meta.env.BASE_URL;
  private running: Promise<void> | null = null;
  private cleanups: Array<() => void> = [];
  private destroyed = false;

  private files_service!: FilesService;
  private apps_service!: AppsService;
  private tasks_service!: TasksService;

  private state_writer = new LatestWriter(() => this.files_service, STORE_STATE_PATH, "store state");
  private catalogue_writer = new LatestWriter(() => this.files_service, CATALOGUE_PATH, "installed apps' catalogue");

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.tasks_service = $derived(this.kernel.service<TasksService>("tasks"));
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

    const state_text = await this.read(STORE_STATE_PATH);
    this.state_writer.seed(state_text);
    const state = parse_state(state_text) ?? (state_text === null ? await this.migrate_state() : null);
    const new_build = state?.build !== this.build;
    if (!new_build) this.add_saved(state.apps);
    else this.write_state();
    if (new_build) this.reason = state === null ? SyncReason.SETUP : SyncReason.UPDATE;
    if (this.kernel.mode !== Mode.SOLO) await this.migrate_picked();
    this.installed = this.installed_ids();
    this.catalogue_writer.seed(await this.read(CATALOGUE_PATH));

    this.cleanups.push(
      $effect.root(() => {
        let first = true;
        $effect(() => {
          this.files_service.revision(parent_of(STORE_STATE_PATH));
          if (first) {
            first = false;
            return;
          }
          untrack(() => void this.reload());
        });
        $effect(() => {
          const ids = this.installed_ids();
          untrack(() => this.follow_installed(ids));
        });
        // Boot reads only this (ADR-077), so it follows every install and uninstall, and a new build's catalogue.
        $effect(() => {
          const slice = this.apps_service.installed_catalogue();
          if (slice) untrack(() => this.catalogue_writer.write(serialize_slice(slice, slice.apps)));
        });
      })
    );

    // After an update the old build's cache still has to go; off the boot path either way.
    if (new_build || this.pending().length > 0) on_idle(() => void this.sync());
  }

  destroy(): void {
    this.destroyed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  public is_saved(id: AppId): boolean {
    return this.saved.has(id);
  }

  public status(id: AppId): StoreStatus {
    if (!this.apps_service.is_installed(id)) return StoreStatus.NOT_INSTALLED;
    if (this.downloading.has(id)) return StoreStatus.DOWNLOADING;
    return this.saved.has(id) ? StoreStatus.SAVED : StoreStatus.NOT_SAVED;
  }

  public progress(id: AppId): number | null {
    return this.downloading.get(id) ?? null;
  }

  public sync(): Promise<void> {
    if (import.meta.env.DEV || this.destroyed) return Promise.resolve();
    if (this.running) return this.running;
    const running = navigator.locks
      .request(SYNC_LOCK, (): Promise<void> => this.run_sync())
      .then(() => {})
      .catch((error: unknown) => console.error("[StoreService] Sync failed:", error))
      .finally(() => {
        this.running = null;
        this.syncing = false;
      });
    this.running = running;
    return running;
  }

  /** System apps first: the OS's own windows should work offline before anything else. */
  private pending(): AppId[] {
    const ids = [...this.installed].filter((id) => !this.saved.has(id));
    const system = (id: AppId) => (this.apps_service.get(id)?.system ? 0 : 1);
    return ids.sort((a, b) => system(a) - system(b));
  }

  private installed_ids(): Set<AppId> {
    return new Set(Array.from(this.apps_service.list({ installed: true }), ([id]) => id));
  }

  private follow_installed(ids: Set<AppId>): void {
    const removed = [...this.installed].filter((id) => !ids.has(id));
    const added = [...ids].filter((id) => !this.installed.has(id));
    this.installed = ids;
    for (const id of removed) void this.drop(id);
    if (added.some((id) => !this.saved.has(id))) void this.sync();
  }

  private async run_sync(): Promise<void> {
    // The tab that held the lock before may have saved them already.
    await this.reload();
    while (!this.destroyed && this.online && this.pending().length > 0) {
      this.syncing = true;
      const { sync_task } = await work();
      const first = this.pending();
      const reason = this.reason;
      const name = (id: AppId) => this.apps_service.get(id)?.name ?? id;
      const job = this.tasks_service.run(
        SENDER,
        (context) =>
          sync_task(
            {
              apps: this.pending().map((id) => ({ id, name: name(id) })),
              build: this.build,
              base: this.base,
              on_start: (id) => this.downloading.set(id, 0),
              on_progress: (id, fraction) => this.downloading.set(id, fraction),
              on_end: (id, saved) => {
                this.downloading.delete(id);
                if (saved && this.installed.has(id)) this.add_saved([id]);
              },
            },
            context
          ),
        {
          title: job_title(reason, first.map(name)),
          done: () => job_done(reason, first.map(name)),
          failed: (error, cancelled) => ({
            title: cancelled ? "Stopped downloading apps" : "Couldn't download apps",
            message: cancelled ? "They open while you're online. Retry in Activity Monitor › Tasks." : error_message(error),
          }),
        }
      );
      await job.done;
      if (job.status !== TaskJobStatus.DONE) return;
      this.reason = SyncReason.INSTALL;
    }
    // Only once nothing is left: a retry still copies unchanged files out of the old build's cache.
    if (this.pending().length === 0) await this.prune();
  }

  private async drop(id: AppId): Promise<void> {
    if (this.saved.delete(id)) this.write_state();
    if (import.meta.env.DEV || this.destroyed || !this.online) return;
    await navigator.locks.request(SYNC_LOCK, async () => {
      if (this.apps_service.is_installed(id)) return;
      try {
        const { drop_app } = await work();
        await drop_app(id, [...this.installed], { build: this.build, base: this.base });
      } catch (error) {
        // Left in the cache until the next update deletes this build's cache.
        console.warn(`[StoreService] Couldn't delete ${id}'s files`, error);
      }
    });
  }

  private async prune(): Promise<void> {
    try {
      const stale = stale_caches(await caches.keys(), this.build);
      await Promise.all(stale.map((key) => caches.delete(key)));
    } catch (error) {
      console.warn("[StoreService] Couldn't delete older builds' caches", error);
    }
  }

  private async migrate_picked(): Promise<void> {
    const text = await this.read(LEGACY_PICKED_PATH);
    if (text === null) return;
    const picked = parse_picked(text) ?? [];
    // Picks the device doesn't know yet wait for a boot that can fetch the catalogue, rather than being dropped.
    if (picked.some((id) => !this.apps_service.get(id)) && !(await this.apps_service.catalogue())) return;
    const manifests = Array.from(this.apps_service.list(), ([, manifest]) => manifest);
    this.apps_service.install(current_ids(manifests, picked, (id) => this.apps_service.get(id) !== undefined));
    await this.remove(...split(LEGACY_PICKED_PATH));
  }

  private async migrate_state() {
    const legacy = parse_state(await this.read(LEGACY_STATE_PATH));
    await this.remove(...split(LEGACY_STATE_DIR), true);
    return legacy;
  }

  private async remove(parent: string, name: string, recursive = false): Promise<void> {
    try {
      const directory = await this.files_service.get_directory(parent);
      if (directory && (await this.files_service.exists(directory, name))) await this.files_service.delete_entry(directory, name, { recursive });
    } catch (error) {
      console.warn(`[StoreService] Couldn't delete ${parent}/${name}`, error);
    }
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
    if (this.state_writer.busy) return;
    const state = parse_state(await this.read(STORE_STATE_PATH));
    if (state?.build === this.build) this.add_saved(state.apps.filter((id) => this.installed.has(id)));
  }

  private async read(path: string): Promise<string | null> {
    try {
      return (await (await this.files_service.get_file(path))?.text()) ?? null;
    } catch {
      return null;
    }
  }
}

function job_title(reason: SyncReason, names: string[]): string {
  const what = names.length === 1 ? names[0] : `${names.length} apps`;
  if (reason === SyncReason.SETUP) return "Setting up apps";
  return reason === SyncReason.UPDATE ? `Updating ${what}` : `Installing ${what}`;
}

function job_done(reason: SyncReason, names: string[]): { title: string; message: string } {
  if (reason === SyncReason.SETUP) return { title: "Apps are ready", message: "They work offline now." };
  if (reason === SyncReason.UPDATE) return { title: names.length === 1 ? `${names[0]} updated` : `${names.length} apps updated`, message: "They work offline too." };
  return names.length === 1
    ? { title: `${names[0]} is installed`, message: "It works offline too." }
    : { title: `${names.length} apps installed`, message: names.join(", ") };
}
