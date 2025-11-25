import type { AppsService as IAppsService, AppId, AppManifest } from "./type";
import type { Kernel, WindowsService, WindowId } from "$lib/core/api";
import { SvelteMap } from "svelte/reactivity";
import { register_apps } from "$lib/apps";

export class AppsService implements AppsService {
  name = "AppsService";
  description = "AppsService";

  private windows_service!: WindowsService;

  readonly registry: Map<string, AppManifest> = new SvelteMap();

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));

    register_apps(this.register.bind(this));
  }

  public register(manifest: AppManifest): void {
    this.registry.set(manifest.id, manifest);
  }

  public launch(id: AppId): WindowId {
    const manifest = this.registry.get(id);
    if (!manifest) {
      throw new Error(`App ${id} not found`);
    }

    return this.windows_service.open({
      app: {
        id,
        manifest: {
          id,
          name: manifest.name,
        },
        component: manifest.component(),
      },
    });
  }
}
