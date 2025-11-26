import type { AppsService as IAppsService, AppId, AppManifest, AppProps } from "./type";
import type { Kernel, WindowsService, WindowId } from "$lib/core/api";
import { SvelteMap } from "svelte/reactivity";
import { register_apps } from "$lib/apps";

export class AppsService implements AppsService {
  name = "AppsService";
  description = "AppsService";

  to_string(): string {
    return `AppsService: ${this.registry.size} apps registered`;
  }

  private windows_service!: WindowsService;

  readonly registry: Map<string, AppManifest> = new SvelteMap();

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));

    register_apps(this.register.bind(this));
  }

  public register(manifest: AppManifest): void {
    this.registry.set(manifest.id, manifest);
  }

  public get(id: AppId): AppManifest | undefined {
    return this.registry.get(id);
  }

  public launch(id: AppId, props?: AppProps): WindowId {
    const manifest = this.registry.get(id);
    if (!manifest) {
      throw new Error(`App ${id} not found`);
    }

    const { component: component, ...partial_manifest } = manifest;

    return this.windows_service.open({
      id,
      manifest: partial_manifest,
      component: manifest.component(),
      props,
    });
  }
}
