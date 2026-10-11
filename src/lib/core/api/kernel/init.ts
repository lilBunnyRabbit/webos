import type { Kernel } from "./kernel.svelte";
import { SettingsService } from "../services/settings/service.svelte";
import { WindowsService } from "../services/windows/service.svelte";
import { AppsService } from "../services/apps/service.svelte";
import { DesktopService } from "../services/desktop/service.svelte";
import { SessionService } from "../services/session/service.svelte";
import { ClipboardService } from "../services/clipboard/service.svelte";
import { FilesService } from "../services/files/service.svelte";
import { VersionService } from "../services/version/service.svelte";
import { NotificationsService } from "../services/notifications/service.svelte";
import { DialogsService } from "../services/dialogs/service.svelte";

export function register_default_services(kernel: Kernel) {
  kernel.register("settings", {
    instance: SettingsService,
    dependencies: ["files"],
  });

  kernel.register("windows", {
    instance: WindowsService,
    dependencies: [],
  });

  kernel.register("files", {
    instance: FilesService,
    dependencies: [],
  });

  kernel.register("notifications", {
    instance: NotificationsService,
    dependencies: [],
  });

  kernel.register("dialogs", {
    instance: DialogsService,
    dependencies: ["windows"],
  });

  kernel.register("apps", {
    instance: AppsService,
    dependencies: ["windows", "notifications", "files", "settings", "dialogs"],
  });

  kernel.register("desktop", {
    instance: DesktopService,
    dependencies: ["files", "apps"],
  });

  kernel.register("session", {
    instance: SessionService,
    dependencies: ["windows", "apps", "files", "dialogs", "notifications"],
  });

  kernel.register("clipboard", {
    instance: ClipboardService,
    dependencies: ["files"],
  });

  // Registered last so it initialises after session: its introduction stacks above the Restore dialog (ADR-026).
  kernel.register("version", {
    instance: VersionService,
    dependencies: ["files", "notifications", "dialogs", "apps"],
  });
}
