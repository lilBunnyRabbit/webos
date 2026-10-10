import type { Kernel } from "./kernel.svelte";
import { SettingsService } from "../services/settings/service.svelte";
import { WindowsService } from "../services/windows/service.svelte";
import { AppsService } from "../services/apps/service.svelte";
import { DesktopService } from "../services/desktop/service.svelte";
import { FilesService } from "../services/files/service.svelte";
import { VersionService } from "../services/version/service.svelte";
import { NotificationsService } from "../services/notifications/service.svelte";

export function register_default_services(kernel: Kernel) {
  kernel.register("settings", {
    instance: SettingsService,
    dependencies: [],
  });

  kernel.register("windows", {
    instance: WindowsService,
    dependencies: [],
  });

  kernel.register("files", {
    instance: FilesService,
    dependencies: [],
  });

  kernel.register("version", {
    instance: VersionService,
    dependencies: [],
  });

  kernel.register("notifications", {
    instance: NotificationsService,
    dependencies: [],
  });

  kernel.register("apps", {
    instance: AppsService,
    dependencies: ["windows", "notifications"],
  });

  kernel.register("desktop", {
    instance: DesktopService,
    dependencies: ["apps"],
  });
}
