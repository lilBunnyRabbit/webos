import kernel, {
  NotificationType,
  type AppId,
  type AppManifest,
  type AppsService,
  type DesktopService,
  type DialogsService,
  type NotificationsService,
  type WindowsService,
} from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  Broom as BroomIcon,
  DownloadSimple as DownloadSimpleIcon,
  PushPin as PushPinIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";

const apps = () => kernel.service<AppsService>("apps");
const dialogs = () => kernel.service<DialogsService>("dialogs");

export const CLEAR_RECENT_ITEM = { id: "clear-recent", label: "Clear recent", icon: BroomIcon };
export const OPEN_ITEM = { id: "open", label: "Open", icon: ArrowSquareOutIcon };
export const INSTALL_ITEM = { id: "install", label: "Install", icon: DownloadSimpleIcon };

export function install_items(id: AppId): (typeof INSTALL_ITEM)[] {
  return apps().get(id) && !apps().is_installed(id) ? [INSTALL_ITEM] : [];
}

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
    if ((item.kind === "shortcut" || item.kind === "widget") && item.app_id === id)
      await desktop.remove_item(item.name);
  }

  await apps().uninstall(id, { data: choice.data });
  kernel.service<NotificationsService>("notifications").notify("apps", {
    title: `${manifest.name} uninstalled`,
    message: choice.data ? "Its saved data was deleted too." : "Install it again from the App Store.",
  });
  return true;
}

export interface AppMenuOptions {
  /** The app was picked from a recent list: offers Clear recent. */
  recent?: boolean;
  /** Runs after Open launched the app, so the surface can close. */
  on_launch?: () => void;
}

/** The long-press menu of an app on the phone: add to home screen, uninstall; Open and Install when not installed. */
export async function app_menu(
  manifest: AppManifest,
  anchor: Position,
  { recent = false, on_launch }: AppMenuOptions = {}
): Promise<void> {
  const desktop = kernel.service<DesktopService>("desktop");
  const pinned = desktop.items().some((item) => item.kind === "shortcut" && item.app_id === manifest.id);
  const choice = await dialogs().menu(
    apps().is_installed(manifest.id)
      ? [
          { id: "pin", label: "Add to home screen", icon: PushPinIcon, disabled: pinned },
          ...(recent ? [{ separator: true } as const, CLEAR_RECENT_ITEM] : []),
          ...(manifest.system
            ? []
            : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
        ]
      : [OPEN_ITEM, INSTALL_ITEM],
    { anchor }
  );
  if (choice === "pin") {
    desktop.pin(manifest.id).catch((reason) =>
      kernel.service<NotificationsService>("notifications").notify(manifest.id, {
        type: NotificationType.ERROR,
        title: `Couldn't add ${manifest.name} to the home screen`,
        message: String(reason),
      })
    );
  } else if (choice === OPEN_ITEM.id) {
    apps().launch(manifest.id);
    on_launch?.();
  } else if (choice === INSTALL_ITEM.id) apps().install(manifest.id);
  else if (choice === "uninstall") void uninstall_app(manifest.id, anchor);
  else if (choice === CLEAR_RECENT_ITEM.id) apps().clear_recent();
}
