import kernel, { type NotificationsService, WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
import { error_message } from "$lib/core/utils";

type WindowGuide = (typeof import("./window-guide.svelte"))["default"];

// The content is inert while the flag is on: a failed chunk turns it off so the app isn't left frozen.
export function load_guide(window_id: WindowId): Promise<WindowGuide | null> {
  return import("./window-guide.svelte").then(
    (module) => module.default,
    (error: unknown) => {
      const windows = kernel.service<WindowsService>("windows");
      const instance = windows.get(window_id);
      if (instance?.flags.has(WindowFlag.GUIDE)) windows.toggle_guide(window_id);
      console.error("[window] Couldn't load the guide:", error);
      kernel.service<NotificationsService>("notifications").notify(instance?.app.id ?? "windows", {
        type: "error",
        title: `Couldn't load the ${instance?.app.manifest.name ?? "app"} guide`,
        message: error_message(error),
      });
      return null;
    }
  );
}
