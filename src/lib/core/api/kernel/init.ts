import type { Kernel } from "./kernel.svelte";
import { Platform } from "./platform";
import type { DesktopService as IDesktopService, WindowsService as IWindowsService } from "../services";
import { SettingsService } from "../services/settings/service.svelte";
import { WindowsService } from "../services/windows/service.svelte";
import { MobileWindowsService } from "../services/windows/mobile.svelte";
import { AppsService } from "../services/apps/service.svelte";
import { DesktopService } from "../services/desktop/service.svelte";
import { MobileDesktopService } from "../services/desktop/mobile.svelte";
import { SessionService } from "../services/session/service.svelte";
import { ClipboardService } from "../services/clipboard/service.svelte";
import { FilesService } from "../services/files/service.svelte";
import { VersionService } from "../services/version/service.svelte";
import { NotificationsService } from "../services/notifications/service.svelte";
import { DialogsService } from "../services/dialogs/service.svelte";
import { UiService } from "../services/ui/service.svelte";
import { ShortcutsService } from "../services/shortcuts/service.svelte";
import { RouterService } from "../services/router/service.svelte";
import { ShellService } from "../services/shell/service.svelte";

export function register_default_services(kernel: Kernel) {
  // Phones and tablets get their own windows and desktop; every other service is shared (ADR-016).
  const mobile = kernel.platform === Platform.MOBILE;

  kernel.register("settings", {
    instance: SettingsService,
    dependencies: ["files"],
  });

  kernel.register<IWindowsService>("windows", {
    instance: mobile ? MobileWindowsService : WindowsService,
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

  kernel.register<IDesktopService>("desktop", {
    instance: mobile ? MobileDesktopService : DesktopService,
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

  kernel.register("ui", {
    instance: UiService,
    dependencies: ["windows", "dialogs"],
  });

  kernel.register("shell", {
    instance: ShellService,
    dependencies: ["files", "dialogs", "notifications"],
  });

  kernel.register("shortcuts", {
    instance: ShortcutsService,
    dependencies: ["windows", "dialogs", "shell"],
  });

  kernel.register("router", {
    instance: RouterService,
    dependencies: ["windows", "apps", "session", "clipboard", "notifications"],
  });

  // Registered last so it initialises after session: its introduction stacks above the Restore dialog (ADR-026).
  kernel.register("version", {
    instance: VersionService,
    dependencies: ["files", "notifications", "dialogs", "apps"],
  });
}
