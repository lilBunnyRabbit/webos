import type { AppsService as IAppsService, AppId, AppManifest, AppProps, OpenOptions } from "./type";
import type { DialogsService, FilesService, Kernel, NotificationsService, SettingsService, WindowsService, WindowId } from "$lib/core/api";
import { best_apps_for, file_extension } from "./associations";
import OpenWithDialog from "$lib/core/components/dialogs/open-with-dialog.svelte";
import { SvelteMap } from "svelte/reactivity";
import { apps } from "$lib/apps";

export class AppsService implements IAppsService {
  name = "AppsService";
  description = "AppsService";

  to_string(): string {
    return `AppsService: ${this.registry.size} apps registered`;
  }

  private windows_service!: WindowsService;
  private notifications_service!: NotificationsService;
  private files_service!: FilesService;
  private settings_service!: SettingsService;
  private dialogs_service!: DialogsService;

  readonly registry: Map<string, AppManifest> = new SvelteMap();

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

  public list(): IterableIterator<[AppId, AppManifest]> {
    return this.registry.entries();
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

    const { component, ...partial_manifest } = manifest;

    return this.windows_service.open({
      id,
      manifest: partial_manifest,
      component: component(),
      props: this.validate_props(manifest, props),
    });
  }

  public async open(path: string, options: OpenOptions = {}): Promise<WindowId | null> {
    const file = await this.files_service.get_file(path);
    if (!file) {
      this.notifications_service.notify("apps", { type: "error", title: "File not found", message: path });
      return null;
    }

    const extension = file_extension(file.name);
    const default_id = extension ? this.settings_service.file_defaults[extension] : undefined;
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
      OpenWithDialog,
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
