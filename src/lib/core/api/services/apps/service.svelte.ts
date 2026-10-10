import type { AppsService as IAppsService, AppId, AppManifest, AppProps } from "./type";
import type { Kernel, NotificationsService, WindowsService, WindowId } from "$lib/core/api";
import { SvelteMap } from "svelte/reactivity";
import { apps } from "$lib/apps";

export class AppsService implements AppsService {
  name = "AppsService";
  description = "AppsService";

  to_string(): string {
    return `AppsService: ${this.registry.size} apps registered`;
  }

  private windows_service!: WindowsService;
  private notifications_service!: NotificationsService;

  readonly registry: Map<string, AppManifest> = new SvelteMap();

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));

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
