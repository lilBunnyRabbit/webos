import kernel, {
  type AppId,
  type AppsService,
  type DesktopService,
  type DialogsService,
  type NotificationsService,
  type WindowsService,
} from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import { Broom as BroomIcon } from "phosphor-svelte";

const apps = () => kernel.service<AppsService>("apps");
const dialogs = () => kernel.service<DialogsService>("dialogs");

export const CLEAR_RECENT_ITEM = { id: "clear-recent", label: "Clear recent", icon: BroomIcon };

/**
 * Asks, closes the app's windows (guarded: a dirty one can keep it), removes its desktop shortcuts and widgets, then
 * uninstalls it (ADR-040). Resolves `true` once it's gone.
 */
export async function uninstall_app(id: AppId, anchor?: Position): Promise<boolean> {
  const manifest = apps().get(id);
  if (!manifest || manifest.system || !apps().is_installed(id)) return false;
  const dialog = (await import("./uninstall-dialog.svelte")).default;
  const choice = await dialogs().show(dialog, { manifest }, { anchor });
  if (!choice) return false;

  const windows = kernel.service<WindowsService>("windows");
  const open = () => windows.list().filter((window_id) => windows.get(window_id)?.app.id === id);
  for (const window_id of open()) await windows.close(window_id);
  if (open().length > 0) return false;

  const desktop = kernel.service<DesktopService>("desktop");
  for (const item of desktop.items()) {
    if ((item.kind === "shortcut" || item.kind === "widget") && item.app_id === id) await desktop.remove_item(item.name);
  }

  await apps().uninstall(id, { data: choice.data });
  kernel.service<NotificationsService>("notifications").notify("apps", {
    title: `${manifest.name} uninstalled`,
    message: choice.data ? "Its saved data was deleted too." : "Get it again from the App Library.",
  });
  return true;
}
