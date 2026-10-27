import type {
  AppsService as IAppsService,
  AppId,
  AppInstance,
  AppListing,
  AppManifest,
  AppMeta,
  AppProps,
  AppsFilter,
  AppCategory,
  AppsUpdate,
  LaunchOptions,
  OpenOptions,
  UninstallOptions,
} from "./type";
import type {
  DialogsService,
  FilesService,
  Kernel,
  NotificationsService,
  SettingsService,
  VersionService,
  WindowsService,
  WindowId,
  WindowOptions,
  WindowSnapshot,
} from "$lib/core/api";
import { untrack, type Component } from "svelte";
import { best_apps_for, file_extension, has_compound_match } from "./associations";
import { parse_shortcut, SHORTCUT_EXTENSION } from "./shortcut";
import { parse_widget, WIDGET_EXTENSION } from "./widget";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { apps_shell } from "./shell";
import { LatestWriter } from "../files/latest-writer";
import { PATHS } from "../files/hierarchy";
import { VERSION_STATE_PATH } from "../version/persistence";
import { CATALOGUE_PATH, INSTALLED_PATH, parse_installed, serialize_installed } from "./installed";
import { LAZY_PARTS, manifest_data, parse_catalogue_text, type Catalogue, type CatalogueApp, type CatalogueHeader, type LazyPart } from "./catalogue";
import { catalogue_source, type CatalogueSource } from "./source";
import { current_ids, current_list, current_target, resolve_replaced } from "./replaces";
import { parse_recent, RECENT_PATH, serialize_recent, with_recent } from "./recent";
import { without_pin } from "../settings/taskbar";
import { is_core_app } from "./helpers";
import { track_launch } from "$lib/core/utils/analytics";
import { error_message } from "$lib/core/utils";
import { on_idle } from "$lib/core/utils/idle";
import { ActiveTime } from "./active-time.svelte";
import type { AppUsage } from "./active-time";
import { snapshot_window } from "../session/snapshot.svelte";
import CatalogueIcon, { type CatalogueIconSource } from "$lib/core/components/apps/catalogue-icon.svelte";

export class AppsService implements IAppsService {
  name = "AppsService";
  description = "App registry, launching and file associations";
  inspector = () => import("./inspector.svelte");
  shell = () => apps_shell(this, () => this.files_service, () => this.settings_service);

  to_string(): string {
    return `AppsService: ${this.registry.size} apps known, ${this.code.size} loaded, ${[...this.list({ installed: true })].length} installed`;
  }

  private windows_service!: WindowsService;
  private notifications_service!: NotificationsService;
  private files_service!: FilesService;
  private settings_service!: SettingsService;
  private dialogs_service!: DialogsService;

  /** Every app known so far: its manifest once its code is here, a stub from its catalogue entry until then (ADR-077). */
  readonly registry: Map<string, AppManifest> = new SvelteMap();
  /** Everything installed but the core apps, which always are (ADR-077). Ids no entry names yet stay, so they're saved back. */
  private readonly installed = new SvelteSet<AppId>();
  /** Optional system apps an offline boot keeps until the move to core apps can run (ADR-077): installed, never saved. */
  private readonly provisional = new SvelteSet<AppId>();
  private migrated = true;
  private readonly entries = new SvelteMap<AppId, CatalogueApp>();
  private readonly code = new SvelteMap<AppId, AppManifest>();
  private readonly loading = new Map<AppId, Promise<AppManifest>>();
  private readonly failed = new SvelteSet<AppId>();
  private readonly failures = new Map<AppId, number>();
  /** Entries from a catalogue built on another core: listed, never run, since their files and core aren't this page's. */
  private readonly foreign = new SvelteSet<AppId>();
  /**
   * Apps whose code here is older than their entry (ADR-077 stage 3): the entry they were loaded from. One version per
   * app per tab, so the old code runs every window until the last one closes.
   */
  private readonly stale = new SvelteMap<AppId, CatalogueApp>();
  private readonly icons = new Map<AppId, Component>();
  /** Windows Restart app closed to reopen: the user didn't close them, so Session doesn't offer them back. */
  private readonly restarted = new Set<WindowId>();
  public header: CatalogueHeader | null = $state.raw(null);
  public complete = $state(false);
  public last_update: AppsUpdate | null = $state.raw(null);
  private fetching: Promise<boolean> | null = null;
  private wanted = false;
  private source!: CatalogueSource;
  private cleanups: (() => void)[] = [];

  private writer = new LatestWriter(() => this.files_service, INSTALLED_PATH, "installed apps");
  private recent_writer = new LatestWriter(() => this.files_service, RECENT_PATH, "recent apps");
  private readonly active_time = new ActiveTime(() => this.files_service, () => this.windows_service);
  /** As saved: can hold apps no catalogue knows any more, which `recent` leaves out. */
  private recent_ids: AppId[] = $state.raw([]);
  private readonly recent_listed: AppId[] = $derived(this.recent_ids.filter((id) => this.is_recent_candidate(id)));
  private readonly all_listings: AppListing[] = $derived(
    [...this.registry.values()].map((manifest) => {
      const entry = this.entries.get(manifest.id);
      return entry ? { ...manifest, ...text_of(entry), daily: entry.daily } : manifest;
    })
  );

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.settings_service = $derived(this.kernel.service<SettingsService>("settings"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
  }

  async init(): Promise<void> {
    this.source = await this.catalogue_source();
    await this.boot_catalogue();
    await this.init_installed();
    await this.load_recent();
    this.map_replaced_settings();

    const on_online = () => {
      if (this.wanted && !this.complete) void this.catalogue();
      for (const id of this.failed) if (this.is_installed(id)) void this.load(id).catch(() => {});
    };
    window.addEventListener("online", on_online);
    this.cleanups.push(() => window.removeEventListener("online", on_online));
    // An installed id the slice doesn't name (a crash between two writes): the full catalogue brings its entry back.
    if ([...this.installed].some((id) => !this.entries.has(id))) void this.catalogue();
    this.cleanups.push(on_idle(() => this.preload_installed()));
    void this.active_time.start();
    this.cleanups.push(() => this.active_time.destroy());
    this.cleanups.push(
      $effect.root(() => {
        $effect(() => {
          if (this.stale.size === 0) return;
          const open = new Set(this.windows_service.list().map((id) => this.windows_service.get(id)?.app.id));
          untrack(() => {
            for (const id of [...this.stale.keys()]) if (!open.has(id)) this.swap(id);
          });
        });
      })
    );
  }

  public usage(id: AppId): AppUsage | null {
    return this.active_time.get(id);
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  protected catalogue_source(): Promise<CatalogueSource> {
    return catalogue_source();
  }

  /**
   * Boot reads only the installed apps' entries (ADR-077). Another build's slice, or none (a new release, a restored
   * backup, the first boot of this release), fetches the full catalogue; if that fails too, the old slice still lists
   * the apps, which then can't open until the catalogue arrives.
   */
  private async boot_catalogue(): Promise<void> {
    const slice = parse_catalogue_text(await this.read(CATALOGUE_PATH));
    // Another release on the same core is still this core's (ADR-077 stage 3): an app-only update keeps the page.
    if (slice && slice.core === this.source.core) {
      this.add(slice, true);
      return;
    }
    if (!(await this.catalogue()) && slice) this.add(slice, false);
  }

  protected preload_installed(): void {
    for (const [id] of this.list({ installed: true })) void this.load(id).catch(() => {});
  }

  public catalogue(): Promise<boolean> {
    this.wanted = true;
    if (this.complete) return Promise.resolve(true);
    return (this.fetching ??= this.fetch_catalogue().finally(() => (this.fetching = null)));
  }

  private async fetch_catalogue(): Promise<boolean> {
    const catalogue = await this.source.fetch();
    if (!catalogue) return false;
    const own = catalogue.core === this.source.core;
    if (own && this.header && catalogue.build > this.header.build) this.adopt(catalogue);
    else if (own && this.header && catalogue.build < this.header.build) this.add({ ...catalogue, apps: catalogue.apps.filter((entry) => !this.entries.has(entry.id)) }, true, false);
    else this.add(catalogue, own);
    if (own) {
      this.complete = true;
      this.drop_unknown();
    }
    return own;
  }

  public async refresh(newer_than = 0): Promise<AppId[]> {
    if (this.header && newer_than > 0 && newer_than <= this.header.build) return [];
    const catalogue = await this.source.fetch();
    if (!catalogue || catalogue.core !== this.source.core) return [];
    if (this.header && catalogue.build <= this.header.build) return [];
    const changed = this.adopt(catalogue);
    this.complete = true;
    this.drop_unknown();
    return changed;
  }

  /**
   * A newer catalogue of the running core (ADR-077 stage 3). Apps not running here take their new entry at once; an
   * app with open windows keeps its code, and the entry waits in `stale` until its last window closes.
   */
  private adopt(catalogue: Catalogue): AppId[] {
    const { apps, ...header } = catalogue;
    const changed: AppId[] = [];
    const swapped: AppId[] = [];
    for (const entry of apps) {
      const before = this.foreign.has(entry.id) ? undefined : this.entries.get(entry.id);
      const same_files = before !== undefined && same_install(before, entry);
      if (before && before.hash !== entry.hash) changed.push(entry.id);
      if (before && !same_files) swapped.push(entry.id);
      this.entries.set(entry.id, entry);
      this.foreign.delete(entry.id);
      const loaded = this.code.get(entry.id);
      if (same_files && loaded) {
        this.registry.set(entry.id, { ...loaded, version: entry.version });
      } else if (loaded && this.has_windows(entry.id)) {
        if (!this.stale.has(entry.id) && before) this.stale.set(entry.id, before);
      } else {
        this.swap(entry.id);
      }
    }
    const named = new Set(apps.map(({ id }) => id));
    for (const id of [...this.entries.keys()]) {
      if (named.has(id) || this.foreign.has(id) || this.has_windows(id)) continue;
      this.entries.delete(id);
      this.registry.delete(id);
      this.code.delete(id);
      this.stale.delete(id);
      this.loading.delete(id);
      this.failed.delete(id);
    }
    this.header = header;
    this.last_update = { build: header.build, changed, swapped };
    return changed;
  }

  private has_windows(id: AppId): boolean {
    return this.windows_service.list().some((window_id) => this.windows_service.get(window_id)?.app.id === id);
  }

  /** The app's next load imports its current entry's manifest by URL; an installed one starts loading now. */
  private swap(id: AppId): void {
    this.stale.delete(id);
    this.code.delete(id);
    this.loading.delete(id);
    this.failed.delete(id);
    const entry = this.entries.get(id);
    if (!entry) return;
    this.registry.set(id, this.stub(entry));
    if (this.is_installed(id)) void this.load(id).catch(() => {});
  }

  public update_ready(id: AppId): boolean {
    return this.stale.has(id);
  }

  public restarting(window_id: WindowId): boolean {
    return this.restarted.has(window_id);
  }

  public async restart(id: AppId): Promise<boolean> {
    const windows = this.windows_service;
    const of_app = () => windows.list().filter((window_id) => windows.get(window_id)?.app.id === id);
    if (of_app().length === 0) return false;
    const name = this.registry.get(id)?.name ?? id;
    // The new version loads before any window closes: if it can't, every window stays on the version it has.
    let next: AppManifest | null;
    try {
      next = await this.next_version(id);
    } catch (error) {
      this.count_failure(id);
      this.notifications_service.notify("apps", {
        type: "error",
        title: `Couldn't update ${name}`,
        message: `${navigator.onLine ? error_message(error) : "You're offline."} It stays on the version it has.`,
      });
      return false;
    }
    const ids = of_app();
    if (ids.length === 0) return false;
    const snapshots = new Map(ids.map((window_id) => [window_id, snapshot_window(windows.get(window_id)!)]));
    const order = new Map(ids.map((window_id) => [window_id, windows.get(window_id)!.order]));
    const by_order = (list: WindowId[]) => [...list].sort((a, b) => order.get(a)! - order.get(b)!).map((window_id) => snapshots.get(window_id)!);
    const stale = this.stale.get(id);
    // Out of `stale` while closing, or the last window to close would swap the code before the new version is in.
    this.stale.delete(id);
    // Dirty windows ask first; the clean ones close only once every dirty one agreed.
    const dirty = (window_id: WindowId) => (windows.get(window_id)?.dirty ? 1 : 0);
    const closing = [...ids].sort((a, b) => dirty(b) - dirty(a));
    const closed: WindowId[] = [];
    for (const window_id of closing) {
      this.restarted.add(window_id);
      if (await windows.close(window_id)) {
        closed.push(window_id);
        continue;
      }
      this.restarted.delete(window_id);
      if (stale) this.stale.set(id, stale);
      this.reopen(by_order(closed));
      return false;
    }
    if (next) this.commit(id, next);
    this.reopen(by_order(ids));
    return true;
  }

  private async next_version(id: AppId): Promise<AppManifest | null> {
    const entry = this.entries.get(id);
    if (!entry || !this.stale.has(id)) {
      await this.require(id);
      return null;
    }
    const definition = await this.source.manifest(entry, this.failures.get(id));
    const manifest: AppManifest = { ...definition, system: entry.system, version: entry.version };
    await manifest.component();
    return manifest;
  }

  private count_failure(id: AppId): void {
    this.failures.set(id, (this.failures.get(id) ?? 0) + 1);
  }

  private commit(id: AppId, manifest: AppManifest): void {
    this.stale.delete(id);
    this.loading.delete(id);
    this.failed.delete(id);
    this.code.set(id, manifest);
    this.registry.set(id, manifest);
  }

  private reopen(snapshots: WindowSnapshot[]): void {
    if (snapshots.length === 0) return;
    const { restored } = this.windows_service.restore(snapshots, ({ app_id, props, state }) => this.create_instance(app_id, props, state));
    const last = restored.at(-1);
    if (last) this.windows_service.focus(last);
  }

  public files_in_use(): Set<string> {
    const files = new Set<string>();
    const add = (entry: CatalogueApp | undefined) => {
      for (const file of [...(entry?.files ?? []), ...(entry?.content ?? [])]) files.add(file);
    };
    for (const [id] of this.list({ installed: true })) add(this.entries.get(id));
    for (const id of this.code.keys()) add(this.stale.get(id) ?? this.entries.get(id));
    return files;
  }

  private add(catalogue: Catalogue, own: boolean, current = true): void {
    const { apps, ...header } = catalogue;
    if (own && current) this.header = header;
    for (const entry of apps) {
      if (!own && this.entries.has(entry.id) && !this.foreign.has(entry.id)) continue;
      this.entries.set(entry.id, entry);
      if (own) this.foreign.delete(entry.id);
      else this.foreign.add(entry.id);
      const loaded = this.code.get(entry.id);
      this.registry.set(entry.id, loaded ? { ...loaded, version: entry.version } : this.stub(entry));
    }
  }

  public installed_catalogue(): Catalogue | null {
    const header = this.header;
    if (!header) return null;
    if (!this.complete && [...this.installed].some((id) => !this.entries.has(id))) return null;
    const ids = new Set(Array.from(this.list({ installed: true }), ([id]) => id));
    if ([...ids].some((id) => this.foreign.has(id))) return null;
    // Another core's entries (a core update waits) are left out rather than holding the slice back.
    const known = (id: AppId) => this.entries.has(id) && !this.foreign.has(id);
    // System apps that aren't installed still open on demand from what boot knows: a file's default, Docs from Kernel.
    for (const [id, entry] of this.entries) if (entry.system && known(id)) ids.add(id);
    // Recent and taskbar-pinned apps stay known after a reload even when they aren't installed.
    for (const id of [...this.recent_ids, ...this.settings_service.taskbar.pinned]) if (known(id)) ids.add(id);
    return { ...header, apps: [...ids].map((id) => this.entries.get(id)!) };
  }

  public load(id: AppId): Promise<AppManifest | undefined> {
    const loaded = this.code.get(id);
    if (loaded) return Promise.resolve(loaded);
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve(undefined);
    if (this.foreign.has(id)) return Promise.reject(new Error(`WebOS was updated since this page loaded. Update WebOS to open ${entry.name}.`));
    let pending = this.loading.get(id);
    if (!pending) {
      const loading: Promise<AppManifest> = this.source
        .manifest(entry, this.failures.get(id))
        .then((definition) => {
          // A newer entry arrived while this one loaded: its code would be the old version.
          if (this.entries.get(id) !== entry) return this.require(id);
          const manifest: AppManifest = { ...definition, system: entry.system, version: entry.version };
          this.code.set(id, manifest);
          this.registry.set(id, manifest);
          this.failed.delete(id);
          return manifest;
        })
        .catch((error: unknown) => {
          this.failed.add(id);
          this.count_failure(id);
          throw error;
        })
        .finally(() => {
          if (this.loading.get(id) === loading) this.loading.delete(id);
        });
      pending = loading;
      this.loading.set(id, pending);
    }
    return pending;
  }

  private require(id: AppId): Promise<AppManifest> {
    return this.load(id).then((manifest) => manifest ?? Promise.reject(new Error(`App ${id} not found`)));
  }

  private stub(entry: CatalogueApp): AppManifest {
    const parts: Partial<Pick<AppManifest, LazyPart>> = {};
    for (const part of LAZY_PARTS) {
      if (!entry[part]) continue;
      const run = async () => {
        const loader = (await this.require(entry.id))[part] as (() => Promise<unknown>) | undefined;
        if (!loader) throw new Error(`${entry.name} has no ${part}`);
        return loader();
      };
      Object.assign(parts, { [part]: run });
    }
    return {
      id: entry.id,
      name: entry.name,
      version: entry.version,
      icon: this.icon(entry.id),
      category: entry.category as AppCategory,
      system: entry.system,
      defaults: entry.defaults as WindowOptions | undefined,
      associations: entry.associations,
      tools: entry.tools,
      restore: entry.restore,
      daily_rank: entry.daily_rank as AppManifest["daily_rank"],
      replaces: entry.replaces,
      widget_size: entry.widget_size,
      default_widget: entry.default_widget,
      ...parts,
      component: () => this.require(entry.id).then((manifest) => manifest.component()),
    };
  }

  private icon(id: AppId): Component {
    let icon = this.icons.get(id);
    if (!icon) {
      icon = bind_icon({
        code: () => this.code.get(id)?.icon as ReturnType<CatalogueIconSource["code"]>,
        sprite: () => (this.is_installed(id) ? null : `${import.meta.env.BASE_URL}store/icons.svg#${id}`),
        failed: () => this.failed.has(id),
      });
      this.icons.set(id, icon);
    }
    return icon;
  }

  /** Taskbar pins and file defaults naming a replaced id (ADR-071) point at its replacement; settings saves the new shape. */
  private map_replaced_settings(): void {
    const known = (id: AppId) => !this.complete || this.registry.has(id);
    const pinned = current_list(this.registry.values(), this.settings_service.taskbar.pinned, known);
    if (pinned.join() !== this.settings_service.taskbar.pinned.join()) this.settings_service.taskbar.pinned = pinned;
    const defaults = Object.entries(this.settings_service.file_defaults).map(([extension, id]) => [extension, current_target(this.registry.values(), id, undefined, known).id]);
    if (defaults.some(([extension, id]) => this.settings_service.file_defaults[extension] !== id)) {
      this.settings_service.file_defaults = Object.fromEntries(defaults);
    }
  }

  private async init_installed(): Promise<void> {
    const saved = parse_installed(await this.read(INSTALLED_PATH));
    if (saved) {
      // Only the full catalogue tells a replaced id from one the slice doesn't name; until then every id stays.
      const known = (id: AppId) => !this.complete || this.registry.has(id);
      for (const id of current_ids(this.registry.values(), saved.ids, known)) this.installed.add(id);
      if (!saved.system) {
        this.migrated = false;
        await this.keep_used_system_apps();
      }
      return;
    }
    // No list yet. A first boot starts with the core apps (the intro adds the picked interests); a device from before
    // installs existed keeps what it ever used, once.
    const first_boot = (await this.read(VERSION_STATE_PATH)) === null;
    if (!first_boot && (await this.catalogue())) {
      // Runs once per device, so its readers stay out of the boot chunk.
      const { command_apps, read_usage, used_apps } = await import("./usage");
      const signals = await read_usage(this.files_service, this.settings_service.file_defaults);
      const commands = await command_apps(this.registry.values());
      this.tidy([...this.registry.keys()], used_apps(this.registry.values(), signals, commands));
    }
    this.save_installed();
  }

  /**
   * A list from before ADR-077's core apps names user apps only, since every system app was installed. The optional
   * system apps stay installed where past use points to them (ADR-040's signals), once. Without the full catalogue
   * (offline) they all count as installed for this boot, never saved, and a boot with the catalogue decides.
   */
  private async keep_used_system_apps(): Promise<void> {
    const optional = [...this.registry.values()].filter((manifest) => manifest.system && !is_core_app(manifest.id));
    if (!this.complete) {
      for (const manifest of optional) this.provisional.add(manifest.id);
      return;
    }
    const { command_apps, read_usage, used_apps } = await import("./usage");
    const signals = await read_usage(this.files_service, this.settings_service.file_defaults);
    const commands = await command_apps(optional).catch((error: unknown) => {
      console.warn("[AppsService] Couldn't read system apps' commands for the move to core apps", error);
      return [];
    });
    for (const id of used_apps(optional, signals, commands)) this.installed.add(id);
    this.migrated = true;
    this.save_installed();
  }

  private save_installed(): void {
    this.writer.write(serialize_installed(this.installed, this.migrated));
  }

  /** Once the full catalogue is here, an installed id it doesn't name is gone, or became the apps replacing it (ADR-071). */
  private drop_unknown(): void {
    const ids = current_ids(this.registry.values(), this.installed, (id) => this.registry.has(id));
    if (ids.length === this.installed.size && ids.every((id) => this.installed.has(id))) return;
    this.installed.clear();
    for (const id of ids) this.installed.add(id);
    this.save_installed();
  }

  public get recent(): AppId[] {
    return this.recent_listed;
  }

  public clear_recent(): void {
    if (this.recent_ids.length === 0) return;
    this.recent_ids = [];
    this.recent_writer.write(serialize_recent([]));
  }

  protected async load_recent(): Promise<void> {
    const text = await this.read(RECENT_PATH);
    this.recent_writer.seed(text);
    const known = (id: AppId) => !this.complete || this.registry.has(id);
    const ids = current_list(this.registry.values(), parse_recent(text), known);
    this.recent_ids = ids.filter((id) => !is_core_app(id));
  }

  protected remember(id: AppId): void {
    if (!this.is_recent_candidate(id) || this.recent_ids[0] === id) return;
    this.recent_ids = with_recent(this.recent_ids, id);
    this.recent_writer.write(serialize_recent(this.recent_ids));
  }

  private is_recent_candidate(id: AppId): boolean {
    // Opening isn't installing (ADR-077), so an app opened without installing counts too; the core apps are always listed.
    return this.registry.has(id) && !is_core_app(id);
  }

  private tidy(all: AppId[], used: Set<AppId>): void {
    this.install([...used]);
    const removed = all.filter((id) => !this.is_installed(id)).length;
    if (removed === 0) return;
    this.notifications_service.notify("apps", {
      title: `Tidied ${removed} apps you never opened`,
      message: "They're still in the App Store and in search.",
      actions: [
        { label: "Undo", on_click: () => void this.install(all) },
        { label: "App Store", on_click: () => void this.launch("app-library") },
      ],
    });
  }

  private async read(path: string): Promise<string | null> {
    const file = await this.files_service.get_file(path);
    return file ? file.text() : null;
  }

  public *list(filter: AppsFilter = {}): IterableIterator<[AppId, AppManifest]> {
    this.want_all(filter);
    for (const entry of this.registry.entries()) {
      if (filter.installed === undefined || this.is_installed(entry[0]) === filter.installed) yield entry;
    }
  }

  public is_installed(id: AppId): boolean {
    const manifest = this.registry.get(id);
    return manifest !== undefined && (is_core_app(id) || this.installed.has(id) || this.provisional.has(id));
  }

  public install(ids: AppId | AppId[]): AppId[] {
    const wanted = [ids].flat();
    // Its files are another core's, which this page can't run or keep: it installs after the update.
    for (const id of wanted) if (this.foreign.has(id)) this.offer_update(this.registry.get(id)!);
    const kept = wanted.filter((id) => this.provisional.delete(id));
    for (const id of kept) this.installed.add(id);
    const added = wanted.filter((id) => this.registry.has(id) && !this.is_installed(id) && !this.foreign.has(id));
    if (added.length === 0) {
      if (kept.length > 0) this.save_installed();
      return [];
    }
    for (const id of added) this.installed.add(id);
    this.save_installed();
    for (const id of added) void this.load(id).catch(() => {});
    return added;
  }

  public async uninstall(id: AppId, options: UninstallOptions = {}): Promise<void> {
    const manifest = this.registry.get(id);
    if (!manifest) throw new Error(`App ${id} not found`);
    if (is_core_app(id)) throw new Error(`${manifest.name} is part of WebOS and can't be uninstalled`);
    this.installed.delete(id);
    this.provisional.delete(id);
    this.save_installed();
    if (this.settings_service.taskbar.pinned.includes(id)) this.settings_service.taskbar.pinned = without_pin(this.settings_service.taskbar.pinned, id);
    if (!options.data) return;

    const prefix = `app.${id}.`;
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    const parent = await this.files_service.get_directory(`${PATHS.var_lib}/apps`);
    if (parent && (await this.files_service.exists(parent, id, "directory"))) {
      await this.files_service.delete_entry(parent, id, { recursive: true });
    }
    if (!manifest.on_uninstall_data) return;
    try {
      await (await manifest.on_uninstall_data()).default();
    } catch (error) {
      console.error(`[AppsService] ${id}'s uninstall cleanup failed`, error);
      this.notifications_service.notify("apps", { type: "error", title: `Some of ${manifest.name}'s data is left`, message: String(error) });
    }
  }

  public async meta(id: AppId): Promise<AppMeta> {
    if (!this.entries.has(id)) await this.catalogue();
    const entry = this.entries.get(id);
    return entry ? text_of(entry) : {};
  }

  public listings(filter: AppsFilter = {}): AppListing[] {
    this.want_all(filter);
    if (filter.installed === undefined) return this.all_listings;
    return this.all_listings.filter((listing) => this.is_installed(listing.id) === filter.installed);
  }

  // Read inside `$derived`, which may not write state: the fetch starts after it.
  private want_all(filter: AppsFilter): void {
    if (filter.all && !this.complete) queueMicrotask(() => void this.catalogue());
  }

  public register(manifest: AppManifest): void {
    const data = manifest_data(manifest as unknown as Record<string, unknown>, {}, manifest.system);
    this.entries.set(manifest.id, { ...data, version: manifest.version, hash: "", manifest: manifest.id, entry: "", files: [] });
    this.foreign.delete(manifest.id);
    this.code.set(manifest.id, manifest);
    this.registry.set(manifest.id, manifest);
  }

  public get(id: AppId): AppManifest | undefined {
    return this.registry.get(id);
  }

  public launch(requested: AppId, requested_props?: unknown, options: LaunchOptions = {}): WindowId | null {
    const { id, props } = this.target(requested, requested_props) ?? { id: requested, props: requested_props };
    const manifest = this.registry.get(id);
    if (!manifest) {
      throw new Error(`App ${id} not found`);
    }
    // Its files are another core's: nothing can open until WebOS updates.
    if (this.foreign.has(id)) {
      this.offer_update(manifest);
      return null;
    }
    // Opening isn't installing (ADR-077): the app runs on demand, out of the menus and not offline, until Install.
    if (!this.is_installed(id) && options.offer_install !== false) this.offer_install(manifest);

    const code = this.code.get(id);
    const window_id = code
      ? this.windows_service.open(this.instantiate(code, this.validate_props(code, props)))
      : this.open_pending(manifest, props, (real) => this.validate_props(real, props));
    this.remember(id);
    track_launch(id, this.kernel.mode, this.kernel.platform);
    return window_id;
  }

  /**
   * A window for an app whose code is still on its way: it opens at once from the entry (name, icon, size), and the
   * props are checked against the schema once the manifest lands, before the component renders.
   */
  private open_pending(manifest: AppManifest, props: unknown, check: (real: AppManifest) => AppProps | undefined): WindowId {
    let window_id: WindowId | null = null;
    const component = this.require(manifest.id).then((real) => {
      const valid = check(real);
      const instance = window_id ? this.windows_service.get(window_id) : undefined;
      if (instance) instance.app.props = valid;
      return real.component();
    });
    window_id = this.windows_service.open(this.instantiate(manifest, as_props(props), undefined, component));
    return window_id;
  }

  protected offer_install(manifest: AppManifest): void {
    this.notifications_service.notify("apps", {
      title: `${manifest.name} isn't installed`,
      message: "Install it to keep it in your apps and use it offline.",
      actions: [{ label: "Install", on_click: () => void this.install(manifest.id) }],
    });
  }

  protected offer_update(manifest: AppManifest): void {
    this.notifications_service.notify("apps", {
      title: `Update WebOS to open ${manifest.name}`,
      message: "WebOS changed since this page opened, and this app needs the new version.",
      actions: [{ label: "Restart", on_click: () => void this.kernel.service<VersionService>("version").apply_update() }],
    });
  }

  /** A known id as is; a replaced one (ADR-071) as the app that took it over, with the props left after matching. */
  private target(id: AppId, props: unknown): { id: AppId; props: unknown } | null {
    if (this.registry.has(id)) return { id, props };
    return resolve_replaced(this.registry.values(), id, as_props(props));
  }

  public create_instance(id: AppId, props?: unknown, state?: Record<string, unknown>): AppInstance | null {
    const manifest = this.code.get(id);
    if (!manifest) return null;
    if (props === undefined) return this.instantiate(manifest, undefined, state);
    if (!manifest.props) return null;

    const result = manifest.props.safeParse(props);
    return result.success ? this.instantiate(manifest, result.data, state) : null;
  }

  private instantiate(
    manifest: AppManifest,
    props: AppProps | undefined,
    initial_state: Record<string, unknown> = {},
    component: AppInstance["component"] = manifest.component()
  ): AppInstance {
    const { component: _, ...partial_manifest } = manifest;
    const state = $state(initial_state);
    return { id: manifest.id, manifest: partial_manifest, component, props, state };
  }

  public async open(path: string, options: OpenOptions = {}): Promise<WindowId | null> {
    const file = await this.files_service.get_file(path);
    if (!file) {
      this.notifications_service.notify("apps", { type: "error", title: "File not found", message: path });
      return null;
    }

    const extension = file_extension(file.name);

    // A shortcut is an OS concept, not a file type an app opens: launch its target instead (ADR-022).
    if (extension === SHORTCUT_EXTENSION) {
      const shortcut = parse_shortcut(await file.text());
      if (!shortcut || !(await this.known_target(shortcut.app_id, shortcut.props))) {
        this.notifications_service.notify("apps", { type: "error", title: "Broken shortcut", message: path });
        return null;
      }
      return this.launch(shortcut.app_id, shortcut.props);
    }

    // A widget opens its app with the widget's props, like a shortcut.
    if (extension === WIDGET_EXTENSION) {
      const widget = parse_widget(await file.text());
      if (!widget || !(await this.known_target(widget.app, widget.props))) {
        this.notifications_service.notify("apps", { type: "error", title: "Broken widget", message: path });
        return null;
      }
      return this.launch(widget.app, widget.props);
    }

    // `.form.md` goes to Forms even when `.md` has a remembered default.
    const default_id = extension && !has_compound_match(this.registry.values(), file) ? this.settings_service.file_defaults[extension] : undefined;
    if (default_id && (await this.known_target(default_id, undefined))) {
      return this.launch(default_id, { path });
    }

    let candidates = best_apps_for(this.registry.values(), file);
    // No app this device knows opens it: the full catalogue may have one that isn't installed.
    if (candidates.length === 0 && (await this.catalogue())) candidates = best_apps_for(this.registry.values(), file);
    if (candidates.length === 0) {
      this.notifications_service.notify("apps", { type: "warning", title: `No app can open ${file.name}` });
      return null;
    }

    if (candidates.length === 1) {
      return this.launch(candidates[0].id, { path });
    }

    const choice = await this.dialogs_service.show(
      (await import("$lib/core/components/dialogs/open-with-dialog.svelte")).default,
      { file_name: file.name, extension, apps: candidates },
      { anchor: options.anchor }
    );
    if (!choice) return null;

    if (choice.always && extension) {
      this.settings_service.file_defaults[extension] = choice.app_id;
    }
    return this.launch(choice.app_id, { path });
  }

  private async known_target(id: AppId, props: unknown): Promise<boolean> {
    if (this.target(id, props)) return true;
    return (await this.catalogue()) && this.target(id, props) !== null;
  }

  private validate_props(manifest: AppManifest, props: unknown): AppProps | undefined {
    if (props === undefined) return undefined;

    if (!manifest.props) {
      return this.discard_props(manifest, "has no props schema", props);
    }

    const result = manifest.props.safeParse(props);
    if (result.success) return result.data;

    return this.discard_props(manifest, "props failed validation", result.error.issues);
  }

  private discard_props(manifest: AppManifest, reason: string, detail: unknown): undefined {
    console.warn(`[AppsService] "${manifest.id}" ${reason}, discarding:`, detail);
    this.notifications_service.notify(manifest.id, {
      type: "warning",
      title: `${manifest.name} opened without its data`,
      message: "It was launched with invalid arguments.",
    });
    return undefined;
  }
}

function same_install(a: CatalogueApp, b: CatalogueApp): boolean {
  return a.manifest === b.manifest && a.files.join() === b.files.join() && (a.content ?? []).join() === (b.content ?? []).join();
}

function as_props(props: unknown): AppProps | undefined {
  return typeof props === "object" && props !== null && !Array.isArray(props) ? (props as AppProps) : undefined;
}

function text_of(entry: CatalogueApp): AppMeta {
  const { description, keywords, pitch, authors } = entry;
  return Object.fromEntries(Object.entries({ description, keywords, pitch, authors }).filter(([, value]) => value !== undefined));
}

/** Gives the icon component its source while keeping the props each caller passes (`class`, `weight`) reactive. */
function bind_icon(source: CatalogueIconSource): Component {
  const own = (key: string | symbol): key is keyof CatalogueIconSource => typeof key === "string" && key in source;
  const bound = (anchor: unknown, props: Record<string | symbol, unknown>) =>
    (CatalogueIcon as unknown as (anchor: unknown, props: unknown) => unknown)(
      anchor,
      new Proxy(props, {
        get: (target, key) => (own(key) ? source[key] : Reflect.get(target, key)),
        has: (target, key) => own(key) || Reflect.has(target, key),
      })
    );
  return bound as unknown as Component;
}
