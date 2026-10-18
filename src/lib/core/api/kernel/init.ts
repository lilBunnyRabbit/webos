import type { Kernel } from "./kernel.svelte";
import { Platform } from "./platform";
import { Mode } from "./mode";
import type {
  AiService as IAiService,
  DesktopService as IDesktopService,
  WindowsService as IWindowsService,
} from "../services";
// App manifests load with AppsService and read WindowFlag through the barrel, which is still mid-cycle here. The windows
// service used to load it first; now that it's lazy, this keeps that order.
import "../services/windows/type";
import { SettingsService } from "../services/settings/service.svelte";
import { AppsService } from "../services/apps/service.svelte";
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
import { BackupService } from "../services/backup/service.svelte";
import { TasksService } from "../services/tasks/service.svelte";

// Phones and tablets get their own windows, desktop and an AI service that answers "no" (ADR-016, ADR-046); the other
// platform's code is never downloaded (ADR-036).
async function platform_services(platform: Platform) {
  if (platform === Platform.MOBILE) {
    const [windows, desktop, ai] = await Promise.all([
      import("../services/windows/mobile.svelte"),
      import("../services/desktop/mobile.svelte"),
      import("../services/ai/mobile"),
    ]);
    return { windows: windows.MobileWindowsService, desktop: desktop.MobileDesktopService, extract: null, ai: ai.MobileAiService };
  }

  const [windows, desktop, extract, ai] = await Promise.all([
    import("../services/windows/service.svelte"),
    import("../services/desktop/service.svelte"),
    import("../services/extract/service.svelte"),
    import("../services/ai/service.svelte"),
  ]);
  return { windows: windows.WindowsService, desktop: desktop.DesktopService, extract: extract.ExtractService, ai: ai.AiService };
}

// A solo link keeps every key, so nothing an app reaches for is missing, and swaps the three whose behaviour solo drops (ADR-047).
async function mode_services(mode: Mode) {
  if (mode === Mode.SOLO) {
    const [apps, session, version] = await Promise.all([
      import("../services/apps/solo.svelte"),
      import("../services/session/solo.svelte"),
      import("../services/version/solo.svelte"),
    ]);
    return { apps: apps.SoloAppsService, session: session.SoloSessionService, version: version.SoloVersionService };
  }
  return { apps: AppsService, session: SessionService, version: VersionService };
}

export async function register_default_services(kernel: Kernel) {
  const [platform, mode] = await Promise.all([platform_services(kernel.platform), mode_services(kernel.mode)]);

  kernel.register("settings", {
    instance: SettingsService,
    dependencies: ["files"],
  });

  kernel.register<IWindowsService>("windows", {
    instance: platform.windows,
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
    instance: mode.apps,
    dependencies: ["windows", "notifications", "files", "settings", "dialogs"],
  });

  kernel.register<IDesktopService>("desktop", {
    instance: platform.desktop,
    dependencies: ["files", "apps"],
  });

  kernel.register("session", {
    instance: mode.session,
    dependencies: ["windows", "apps", "files", "dialogs", "notifications"],
  });

  // Desktop only (ADR-043): phones have no Picture-in-Picture for documents.
  if (platform.extract) {
    kernel.register("extract", {
      instance: platform.extract,
      dependencies: ["windows", "dialogs", "notifications"],
    });
  }

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

  kernel.register("tasks", {
    instance: TasksService,
    dependencies: ["notifications"],
  });

  kernel.register("backup", {
    instance: BackupService,
    dependencies: ["files", "dialogs", "notifications", "windows", "tasks"],
  });

  kernel.register<IAiService>("ai", {
    instance: platform.ai,
    dependencies: ["files", "tasks", "notifications"],
  });

  kernel.register("router", {
    instance: RouterService,
    dependencies: ["windows", "apps", "session", "clipboard", "notifications"],
  });

  // Registered last so it initialises after session: its introduction stacks above the Restore dialog (ADR-026).
  kernel.register("version", {
    instance: mode.version,
    dependencies: ["files", "notifications", "dialogs", "apps", "session"],
  });
}
