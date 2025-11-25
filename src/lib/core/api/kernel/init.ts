import type { Kernel } from "./kernel.svelte";
import { SettingsService } from "../services/settings/service.svelte";
import { WindowsService } from "../services/windows/service.svelte";
import { AppsService } from "../services/apps/service.svelte";

export function register_default_services(kernel: Kernel) {
  kernel.register("settings", {
    instance: SettingsService,
    dependencies: [],
  });

  kernel.register("windows", {
    instance: WindowsService,
    dependencies: [],
  });

  kernel.register("apps", {
    instance: AppsService,
    dependencies: ["windows"],
  });
}
