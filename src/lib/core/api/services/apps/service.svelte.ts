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
  OpenOptions,
  UninstallOptions,
} from "./type";
import type {
  DialogsService,
  FilesService,
  Kernel,
  NotificationsService,
  SettingsService,
  WindowsService,
  WindowId,
  WindowOptions,
} from "$lib/core/api";
import type { Component } from "svelte";
import { best_apps_for, file_extension, has_compound_match } from "./associations";
import { parse_shortcut, SHORTCUT_EXTENSION } from "./shortcut";
import { parse_widget, WIDGET_EXTENSION } from "./widget";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { apps_shell } from "./shell";
import { LatestWriter } from "../files/latest-writer";
import { PATHS } from "../files/hierarchy";
import { VERSION_STATE_PATH } from "../version/persistence";
import { CATALOGUE_PATH, INSTALLED_PATH, parse_installed, serialize_installed } from "./installed";
import { LAZY_PARTS, manifest_data, parse_catalogue_text, type Catalogue, type CatalogueApp, type LazyPart } from "./catalogue";
import { catalogue_source, type CatalogueSource } from "./source";
import { current_ids, current_list, current_target, resolve_replaced } from "./replaces";
import { parse_recent, RECENT_PATH, serialize_recent, with_recent } from "./recent";
import { without_pin } from "../settings/taskbar";
import { track_launch } from "$lib/core/utils/analytics";
import { on_idle } from "$lib/core/utils/idle";
import { ActiveTime } from "./active-time.svelte";
import type { AppUsage } from "./active-time";
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
  /** User apps only: system apps are always installed (ADR-040). Ids no entry names yet stay, so they're saved back. */
  private readonly installed = new SvelteSet<AppId>();
  private readonly entries = new SvelteMap<AppId, CatalogueApp>();
  private readonly code = new SvelteMap<AppId, AppManifest>();
  private readonly loading = new Map<AppId, Promise<AppManifest>>();
  private readonly failed = new SvelteSet<AppId>();
  /** Entries from another build's catalogue: listed, never run, since their files and core aren't this page's. */
  private readonly foreign = new SvelteSet<AppId>();
  private readonly icons = new Map<AppId, Component>();
  private header: Omit<Catalogue, "apps"> | null = $state.raw(null);
  public complete = $state(false);
  private fetching: Promise<boolean> | null = null;
  private wanted = false;
  private source!: CatalogueSource;
  private cleanups: (() => void)[] = [];

  private writer = new LatestWriter(() => this.files_service, INSTALLED_PATH, "installed apps");
  private recent_writer = new LatestWriter(() => this.files_service, RECENT_PATH, "recent apps");
  private readonly active_time = new ActiveTime(() => this.files_service, () => this.windows_service);
  /** As saved: can hold apps uninstalled since, which `recent` leaves out until they're reinstalled. */
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
    if (slice && slice.build === this.source.build) {
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
    const own = catalogue.build === this.source.build;
    this.add(catalogue, own);
    if (own) this.complete = true;
    return own;
  }

  private add(catalogue: Catalogue, own: boolean): void {
    const { apps, ...header } = catalogue;
    if (own) this.header = header;
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
    const ids = [...this.list({ installed: true })].map(([id]) => id);
    if (ids.some((id) => this.foreign.has(id))) return null;
    return { ...header, apps: ids.map((id) => this.entries.get(id)!) };
  }

  public load(id: AppId): Promise<AppManifest | undefined> {
    const loaded = this.code.get(id);
    if (loaded) return Promise.resolve(loaded);
    const entry = this.entries.get(id);
    if (!entry) return Promise.resolve(undefined);
    if (this.foreign.has(id)) return Promise.reject(new Error(`WebOS was updated since this page loaded. Update WebOS to open ${entry.name}.`));
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.source
        .manifest(entry)
        .then((definition) => {
          const manifest: AppManifest = { ...definition, system: entry.system, version: entry.version };
          this.code.set(id, manifest);
          this.registry.set(id, manifest);
          this.failed.delete(id);
          return manifest;
        })
        .catch((error: unknown) => {
          this.failed.add(id);
          throw error;
        })
        .finally(() => this.loading.delete(id));
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
      for (const id of current_ids(this.registry.values(), saved, known)) this.installed.add(id);
      return;
    }
    // No list yet. A first boot starts with the system apps (the intro adds the picked interests); a device from before
    // installs existed keeps what it ever used, once.
    const first_boot = (await this.read(VERSION_STATE_PATH)) === null;
    if (!first_boot && (await this.catalogue())) {
      // Runs once per device, so its readers stay out of the boot chunk.
      const { command_apps, read_usage, used_apps } = await import("./usage");
      const signals = await read_usage(this.files_service, this.settings_service.file_defaults);
      const commands = await command_apps(this.registry.values());
      this.tidy([...this.registry.keys()], used_apps(this.registry.values(), signals, commands));
    }
    this.writer.write(serialize_installed(this.installed));
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
    this.recent_ids = ids.filter((id) => this.registry.get(id)?.system !== true);
  }

  protected remember(id: AppId): void {
    if (!this.is_recent_candidate(id) || this.recent_ids[0] === id) return;
    this.recent_ids = with_recent(this.recent_ids, id);
    this.recent_writer.write(serialize_recent(this.recent_ids));
  }

  private is_recent_candidate(id: AppId): boolean {
    return this.registry.get(id)?.system === false && this.is_installed(id);
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
    for (const entry of this.registry.entries()) {
      if (filter.installed === undefined || this.is_installed(entry[0]) === filter.installed) yield entry;
    }
  }

  public is_installed(id: AppId): boolean {
    const manifest = this.registry.get(id);
    return manifest !== undefined && (manifest.system === true || this.installed.has(id));
  }

  public install(ids: AppId | AppId[]): AppId[] {
    const added = [ids].flat().filter((id) => this.registry.has(id) && !this.is_installed(id));
    if (added.length === 0) return [];
    for (const id of added) this.installed.add(id);
    this.writer.write(serialize_installed(this.installed));
    for (const id of added) void this.load(id).catch(() => {});
    return added;
  }

  public async uninstall(id: AppId, options: UninstallOptions = {}): Promise<void> {
    const manifest = this.registry.get(id);
    if (!manifest) throw new Error(`App ${id} not found`);
    if (manifest.system) throw new Error(`${manifest.name} is part of WebOS and can't be uninstalled`);
    this.installed.delete(id);
    this.writer.write(serialize_installed(this.installed));
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
    if (filter.installed === undefined) return this.all_listings;
    return this.all_listings.filter((listing) => this.is_installed(listing.id) === filter.installed);
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

  public launch(requested: AppId, requested_props?: unknown): WindowId {
    const { id, props } = this.target(requested, requested_props) ?? { id: requested, props: requested_props };
    const manifest = this.registry.get(id);
    if (!manifest) {
      throw new Error(`App ${id} not found`);
    }
    // Opening isn't installing (ADR-077): the app runs on demand, out of the menus and not offline, until Install.
    if (!this.is_installed(id)) this.offer_install(manifest);

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
