import type { AppId, AppsService, AppsUpdate, FilesService, Kernel, TasksService } from "$lib/core/api";
import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { error_message } from "$lib/core/utils";
import { on_idle } from "$lib/core/utils/idle";
import { Mode } from "../../kernel/mode";
import { LatestWriter } from "../files/latest-writer";
import { TaskJobStatus } from "../tasks/type";
import { BUILD_LOCK, legacy_caches, missing_apps, older_build_held } from "./lists";
import { current_ids } from "../apps/replaces";
import { parse_catalogue_text, serialize_slice, type Catalogue, type CatalogueApp } from "../apps/catalogue";
import { CATALOGUE_PATH } from "../apps/installed";
import { running_core } from "../apps/source";
import { LEGACY_PICKED_PATH, LEGACY_STATE_DIR, LEGACY_STATE_PATH, STORE_STATE_PATH, parse_picked, parse_state, serialize_state, type StoreState } from "./persistence";
import { StoreStatus, type StoreService as IStoreService } from "./type";

const SYNC_LOCK = "webos.store.sync";
const CHANNEL = "webos:store";
const SENDER = "store";
const work = () => import("./sync");

const parent_of = (path: string) => path.slice(0, path.lastIndexOf("/"));
const split = (path: string) => [parent_of(path), path.slice(path.lastIndexOf("/") + 1)] as const;

const SyncReason = { SETUP: "setup", UPDATE: "update", APPS: "apps", INSTALL: "install" } as const;
type SyncReason = (typeof SyncReason)[keyof typeof SyncReason];

/** Another tab downloaded an app-only update (ADR-077 stage 3): this one takes the same catalogue right away. */
interface AppsReady {
  type: "apps-ready";
  core: string;
  apps: AppId[];
}

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
  /** Last known entry per app, kept after an uninstall so its files can still be told apart. */
  private readonly entries = new Map<AppId, CatalogueApp>();
  private reason: SyncReason = SyncReason.INSTALL;
  private updated: AppId[] = [];
  /** The catalogue the saved set is for: the build's own, or a newer one taken on the same core. */
  private build = 0;
  /**
   * The state file read while no catalogue said which release runs (offline with another core's slice): which files
   * are here is decided once the catalogue arrives, and nothing counts as saved meanwhile.
   */
  private unsettled: { state: StoreState | null } | null = null;
  /** Shared Web Locks naming the catalogue builds whose files this tab may still load, so no tab prunes them. */
  private readonly build_locks = new Map<number, () => void>();
  private slice_write: Promise<void> = Promise.resolve();
  private readonly base = import.meta.env.BASE_URL;
  private running: Promise<void> | null = null;
  private channel: BroadcastChannel | null = null;
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
    this.listen();

    const catalogue = this.apps_service.installed_catalogue();
    if (catalogue) this.remember(catalogue.apps);
    const state_text = await this.read(STORE_STATE_PATH);
    this.state_writer.seed(state_text);
    const state = parse_state(state_text) ?? (state_text === null ? await this.migrate_state() : null);
    let new_build = false;
    if (catalogue) {
      this.build = catalogue.build;
      new_build = this.settle(state);
    } else {
      this.unsettled = { state };
      this.build = state?.build ?? this.build;
    }
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
        // Boot reads only this (ADR-077), so it follows every install and uninstall, a new build's catalogue and an
        // app-only update.
        $effect(() => {
          const slice = this.apps_service.installed_catalogue();
          if (!slice) return;
          untrack(() => {
            this.remember(slice.apps);
            this.take_first_catalogue(slice);
            this.write_slice(slice);
          });
        });
        $effect(() => {
          const update = this.apps_service.last_update;
          if (update) untrack(() => void this.take_update(update));
        });
        // The old build's lock stays while a window still runs an app's old version.
        $effect(() => {
          const build = this.apps_service.header?.build;
          const waiting = Array.from(this.apps_service.list(), ([id]) => id).some((id) => this.apps_service.update_ready(id));
          untrack(() => this.hold_builds(build, waiting));
        });
      })
    );

    // Off the boot path: a restored backup or an evicted cache can leave `saved` naming apps whose files are gone.
    this.cleanups.push(
      on_idle(() => {
        void this.verify_saved().then(() => {
          if (!this.destroyed && (new_build || this.pending().length > 0)) void this.sync();
        });
      })
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.channel?.close();
    for (const release of this.build_locks.values()) release();
    this.build_locks.clear();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  private settle(state: StoreState | null): boolean {
    if (state?.build === this.build) {
      this.add_saved(state.apps);
      return false;
    }
    this.saved.clear();
    this.write_state();
    this.reason = state === null ? SyncReason.SETUP : SyncReason.UPDATE;
    return true;
  }

  /** Boot had no catalogue for this core (offline on a release's first boot); now it's here, the state is checked against it. */
  private take_first_catalogue(slice: Catalogue): void {
    if (!this.unsettled) return;
    const { state } = this.unsettled;
    this.unsettled = null;
    this.build = slice.build;
    if (this.settle(state)) void this.sync();
  }

  /** Another tab may have taken a newer catalogue on this core since this one's: its slice stays. */
  private write_slice(slice: Catalogue): void {
    this.slice_write = this.slice_write.then(async () => {
      const disk = parse_catalogue_text(await this.read(CATALOGUE_PATH));
      if (disk && disk.core === slice.core && disk.build > slice.build) return;
      this.catalogue_writer.write(serialize_slice(slice, slice.apps));
    });
  }

  private async verify_saved(): Promise<void> {
    const apps = [...this.saved].flatMap((id) => {
      const first = this.entries.get(id)?.files[0];
      return first ? [{ id, file: first }] : [];
    });
    if (apps.length === 0) return;
    try {
      const missing = await missing_apps(apps, this.base);
      if (missing.length === 0 || this.destroyed) return;
      for (const id of missing) this.saved.delete(id);
      this.write_state();
    } catch (error) {
      console.warn("[StoreService] Couldn't check the saved apps' files", error);
    }
  }

  private hold_builds(build: number | undefined, keep_old: boolean): void {
    if (typeof navigator.locks === "undefined") return;
    if (build !== undefined && !this.build_locks.has(build)) {
      let release = () => {};
      const held = new Promise<void>((resolve) => (release = resolve));
      this.build_locks.set(build, release);
      navigator.locks.request(`${BUILD_LOCK}${build}`, { mode: "shared" }, () => held).catch(() => {});
    }
    if (keep_old) return;
    for (const [held, release] of [...this.build_locks]) {
      if (held === build) continue;
      release();
      this.build_locks.delete(held);
    }
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

  private listen(): void {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (event: MessageEvent<AppsReady>) => {
      if (event.data?.type === "apps-ready" && event.data.core === running_core()) void this.apps_service.refresh();
    };
  }

  /**
   * An app-only update this tab took (ADR-077 stage 3). Apps whose files changed download again; another tab that took
   * it first already wrote the state file for the new catalogue, so its saved set counts.
   */
  private async take_update(update: AppsUpdate): Promise<void> {
    if (update.build === this.build) return;
    const state = parse_state(await this.read(STORE_STATE_PATH));
    this.build = update.build;
    if (state?.build === update.build) {
      this.saved.clear();
      this.add_saved(state.apps.filter((id) => this.installed.has(id)));
    } else {
      for (const id of update.swapped) this.saved.delete(id);
      this.write_state();
    }
    // The toast names a user app first: system apps change with every release whose docs name it.
    const system = (id: AppId) => (this.apps_service.get(id)?.system ? 1 : 0);
    this.updated = update.changed.filter((id) => this.installed.has(id)).sort((a, b) => system(a) - system(b));
    if (this.pending().length === 0) return;
    this.reason = SyncReason.APPS;
    void this.sync();
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

  private remember(entries: CatalogueApp[]): void {
    for (const entry of entries) this.entries.set(entry.id, entry);
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
      // Entries arrive with the catalogue; offline with another core's slice there's nothing to download from.
      if (!this.apps_service.installed_catalogue()) break;
      this.syncing = true;
      const { sync_task } = await work();
      const first = this.pending();
      const reason = this.reason;
      const updated = this.updated;
      const name = (id: AppId) => this.apps_service.get(id)?.name ?? id;
      const job = this.tasks_service.run(
        SENDER,
        (context) =>
          sync_task(
            {
              apps: this.pending().map((id) => ({ id, name: name(id), files: this.entries.get(id)?.files ?? [] })),
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
          done: () => this.job_done(reason, (reason === SyncReason.APPS && updated.length > 0 ? updated : first).map(name)),
          failed: (error, cancelled) => ({
            title: cancelled ? "Stopped downloading apps" : "Couldn't download apps",
            message: cancelled ? "They open while you're online. Retry in Activity Monitor › Tasks." : error_message(error),
          }),
        }
      );
      await job.done;
      if (job.status !== TaskJobStatus.DONE) break;
      if (reason === SyncReason.APPS) this.announce(updated);
      this.reason = SyncReason.INSTALL;
    }
    this.reason = SyncReason.INSTALL;
    // Only once nothing is left: a retry still copies unchanged files out of the old caches.
    if (this.pending().length === 0) await this.prune();
  }

  private announce(apps: AppId[]): void {
    this.channel?.postMessage({ type: "apps-ready", core: running_core(), apps } satisfies AppsReady);
  }

  private job_done(reason: SyncReason, names: string[]) {
    if (reason !== SyncReason.APPS) return job_done(reason, names);
    const [first, ...rest] = names;
    return {
      title: rest.length === 0 ? `${first} updated` : `${first} and ${rest.length} more updated`,
      message: "They work offline too.",
      actions: [{ label: "What's new", on_click: () => void this.apps_service.launch("settings", { section: "whats-new" }) }],
    };
  }

  private async drop(id: AppId): Promise<void> {
    if (this.saved.delete(id)) this.write_state();
    if (import.meta.env.DEV || this.destroyed) return;
    const own = this.entries.get(id);
    if (!own) return;
    await navigator.locks.request(SYNC_LOCK, async () => {
      if (this.apps_service.is_installed(id)) return;
      try {
        const { drop_files } = await work();
        const others = [...this.installed].map((other) => [...(this.entries.get(other)?.files ?? []), ...(this.entries.get(other)?.content ?? [])]);
        others.push([...this.apps_service.files_in_use()]);
        await drop_files([...own.files, ...(own.content ?? [])], others, this.base);
      } catch (error) {
        console.warn(`[StoreService] Couldn't delete ${id}'s files`, error);
      }
    });
  }

  /**
   * Drops the caches from before one cache held every release, then every file no installed app and nothing running
   * here lists. Skipped when another tab took a newer catalogue (its new files aren't in this tab's lists) or still
   * runs an older one (its old files aren't either); a later sync prunes.
   */
  private async prune(): Promise<void> {
    try {
      await Promise.all(legacy_caches(await caches.keys()).map((key) => caches.delete(key)));
      const state = parse_state(await this.read(STORE_STATE_PATH));
      if (state && state.build !== this.build) return;
      const { held = [] } = await navigator.locks.query();
      if (older_build_held(held.map((lock) => lock.name ?? ""), this.build)) return;
      const { prune_files } = await work();
      await prune_files(this.apps_service.files_in_use(), this.base);
    } catch (error) {
      console.warn("[StoreService] Couldn't delete unused app files", error);
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
    if (this.state_writer.busy || this.unsettled) return;
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
  return reason === SyncReason.UPDATE || reason === SyncReason.APPS ? `Updating ${what}` : `Installing ${what}`;
}

function job_done(reason: SyncReason, names: string[]): { title: string; message: string } {
  if (reason === SyncReason.SETUP) return { title: "Apps are ready", message: "They work offline now." };
  if (reason === SyncReason.UPDATE) return { title: names.length === 1 ? `${names[0]} updated` : `${names.length} apps updated`, message: "They work offline too." };
  return names.length === 1
    ? { title: `${names[0]} is installed`, message: "It works offline too." }
    : { title: `${names.length} apps installed`, message: names.join(", ") };
}
