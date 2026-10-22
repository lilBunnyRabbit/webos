import type {
  AppsService as IAppsService,
  AppId,
  AppInstance,
  AppListing,
  AppManifest,
  AppMeta,
  AppProps,
  AppsFilter,
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
} from "$lib/core/api";
import { best_apps_for, file_extension, has_compound_match } from "./associations";
import { parse_shortcut, SHORTCUT_EXTENSION } from "./shortcut";
import { parse_widget, WIDGET_EXTENSION } from "./widget";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { apps } from "$lib/apps";
import { apps_shell } from "./shell";
import { LatestWriter } from "../files/latest-writer";
import { PATHS } from "../files/hierarchy";
import { VERSION_STATE_PATH } from "../version/persistence";
import { INSTALLED_PATH, parse_installed, serialize_installed } from "./installed";
import { parse_recent, RECENT_PATH, serialize_recent, with_recent } from "./recent";
import { without_pin } from "../settings/taskbar";
import { on_idle } from "$lib/core/utils/idle";

export class AppsService implements IAppsService {
  name = "AppsService";
  description = "App registry, launching and file associations";
  inspector = () => import("./inspector.svelte");
  shell = () => apps_shell(this, () => this.files_service, () => this.settings_service);

  to_string(): string {
    return `AppsService: ${this.registry.size} apps registered, ${[...this.list({ installed: true })].length} installed`;
  }

  private windows_service!: WindowsService;
  private notifications_service!: NotificationsService;
  private files_service!: FilesService;
  private settings_service!: SettingsService;
  private dialogs_service!: DialogsService;

  readonly registry: Map<string, AppManifest> = new SvelteMap();
  /** User apps only: system apps are always installed (ADR-040). */
  private readonly installed = new SvelteSet<AppId>();
  private writer = new LatestWriter(() => this.files_service, INSTALLED_PATH, "installed apps");
  private recent_writer = new LatestWriter(() => this.files_service, RECENT_PATH, "recent apps");
  /** As saved: can hold apps uninstalled since, which `recent` leaves out until they're reinstalled. */
  private recent_ids: AppId[] = $state.raw([]);
  private readonly recent_listed: AppId[] = $derived(this.recent_ids.filter((id) => this.is_recent_candidate(id)));
  private metas: ReadonlyMap<AppId, AppMeta> = $state.raw(new Map());
  private meta_loading: Promise<void> | null = null;
  private readonly all_listings: AppListing[] = $derived(
    [...this.registry.values()].map((manifest) => {
      const meta = this.metas.get(manifest.id);
      return meta ? { ...manifest, ...meta } : manifest;
    })
  );

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.settings_service = $derived(this.kernel.service<SettingsService>("settings"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));

    for (const app of apps) {
      this.register(app);
    }
  }

  async init(): Promise<void> {
    on_idle(() => void this.meta_ready);
    await this.init_installed();
    await this.load_recent();
  }

  private async init_installed(): Promise<void> {
    const saved = parse_installed(await this.read(INSTALLED_PATH));
    if (saved) {
      for (const id of saved) if (this.registry.has(id)) this.installed.add(id);
      return;
    }
    // No list yet. A first boot starts with the system apps (the intro adds the picked interests); a device from before
    // installs existed keeps what it ever used, once.
    const first_boot = (await this.read(VERSION_STATE_PATH)) === null;
    if (!first_boot) {
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
    this.recent_ids = parse_recent(text).filter((id) => this.registry.get(id)?.system === false);
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
      message: "They're still in the App Library and in search.",
      actions: [
        { label: "Undo", on_click: () => void this.install(all) },
        { label: "App Library", on_click: () => void this.launch("app-library") },
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

  public get meta_ready(): Promise<void> {
    this.meta_loading ??= this.load_metas();
    return this.meta_loading;
  }

  public async meta(id: AppId): Promise<AppMeta> {
    await this.meta_ready;
    return this.metas.get(id) ?? {};
  }

  private async load_metas(): Promise<void> {
    const loaders = [...this.registry.values()].flatMap((manifest) => (manifest.meta ? [{ id: manifest.id, load: manifest.meta }] : []));
    const settled = await Promise.allSettled(loaders.map(({ load }) => load()));
    const metas = new Map<AppId, AppMeta>();
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") metas.set(loaders[index].id, result.value.default);
      else console.error(`[AppsService] ${loaders[index].id}'s meta failed to load`, result.reason);
    });
    this.metas = metas;
  }

  public listings(filter: AppsFilter = {}): AppListing[] {
    if (filter.installed === undefined) return this.all_listings;
    return this.all_listings.filter((listing) => this.is_installed(listing.id) === filter.installed);
  }

  public register(manifest: AppManifest): void {
    this.registry.set(manifest.id, manifest);
  }

  public get(id: AppId): AppManifest | undefined {
    return this.registry.get(id);
  }

  public launch(id: AppId, props?: unknown): WindowId {
    const manifest = this.registry.get(id);
    if (!manifest) {
      throw new Error(`App ${id} not found`);
    }
    // Opening an app from the UI (a file, a link, a store tile) is the intent to have it (ADR-040). The shell checks first.
    if (this.install(id).length > 0) {
      this.notifications_service.notify("apps", { title: `${manifest.name} installed`, message: "It's in the start menu now." });
    }

    const window_id = this.windows_service.open(this.instantiate(manifest, this.validate_props(manifest, props)));
    this.remember(id);
    return window_id;
  }

  public create_instance(id: AppId, props?: unknown, state?: Record<string, unknown>): AppInstance | null {
    const manifest = this.registry.get(id);
    if (!manifest) return null;
    if (props === undefined) return this.instantiate(manifest, undefined, state);
    if (!manifest.props) return null;

    const result = manifest.props.safeParse(props);
    return result.success ? this.instantiate(manifest, result.data, state) : null;
  }

  private instantiate(
    manifest: AppManifest,
    props: AppProps | undefined,
    initial_state: Record<string, unknown> = {}
  ): AppInstance {
    const { component, ...partial_manifest } = manifest;
    const state = $state(initial_state);
    return { id: manifest.id, manifest: partial_manifest, component: component(), props, state };
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
      if (!shortcut || !this.registry.has(shortcut.app_id)) {
        this.notifications_service.notify("apps", { type: "error", title: "Broken shortcut", message: path });
        return null;
      }
      return this.launch(shortcut.app_id, shortcut.props);
    }

    // A widget opens its app with the widget's props, like a shortcut.
    if (extension === WIDGET_EXTENSION) {
      const widget = parse_widget(await file.text());
      if (!widget || !this.registry.has(widget.app)) {
        this.notifications_service.notify("apps", { type: "error", title: "Broken widget", message: path });
        return null;
      }
      return this.launch(widget.app, widget.props);
    }

    // `.form.md` goes to Forms even when `.md` has a remembered default.
    const default_id = extension && !has_compound_match(this.registry.values(), file) ? this.settings_service.file_defaults[extension] : undefined;
    if (default_id && this.registry.has(default_id)) {
      return this.launch(default_id, { path });
    }

    const candidates = best_apps_for(this.registry.values(), file);
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
