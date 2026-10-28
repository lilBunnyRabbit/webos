import kernel, {
  is_core_app,
  NotificationType,
  type AppId,
  type AppManifest,
  type AppsService,
  type DesktopService,
  type DialogsService,
  type NotificationsService,
  type StoreService,
  type WindowsService,
} from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  Broom as BroomIcon,
  DownloadSimple as DownloadSimpleIcon,
  PushPin as PushPinIcon,
  Star as StarIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";

const apps = () => kernel.service<AppsService>("apps");
const dialogs = () => kernel.service<DialogsService>("dialogs");

export const CLEAR_RECENT_ITEM = { id: "clear-recent", label: "Clear recent", icon: BroomIcon };
export const OPEN_ITEM = { id: "open", label: "Open", icon: ArrowSquareOutIcon };
export const INSTALL_ITEM = { id: "install", label: "Install", icon: DownloadSimpleIcon };
export const FAVOURITE_ITEM = { id: "favourite", label: "Add to favourites", icon: StarIcon };
export const UNFAVOURITE_ITEM = { id: "unfavourite", label: "Remove from favourites", icon: StarIcon };

export function favourite_item(id: AppId): typeof FAVOURITE_ITEM {
  return apps().favourites.includes(id) ? UNFAVOURITE_ITEM : FAVOURITE_ITEM;
}

/** Runs a menu choice that was a favourite item; `false` for any other choice. */
export function apply_favourite(choice: string | null, id: AppId): boolean {
  if (choice !== FAVOURITE_ITEM.id && choice !== UNFAVOURITE_ITEM.id) return false;
  apps().favourite(id, choice === FAVOURITE_ITEM.id);
  return true;
}

/** Restart app needs the new version's files: on the device already, or a connection to fetch them. Reactive. */
export function can_update(id: AppId): boolean {
  const store = kernel.service<StoreService>("store");
  return apps().update_ready(id) && (store.online || store.is_saved(id));
}

export function install_items(id: AppId): (typeof INSTALL_ITEM)[] {
  return apps().get(id) && !apps().is_installed(id) ? [INSTALL_ITEM] : [];
}

/**
 * Asks, closes the app's windows (guarded: a dirty one can keep it), removes its desktop shortcuts and widgets, then
 * uninstalls it (ADR-040). Resolves `true` once it's gone.
 */
export async function uninstall_app(id: AppId, anchor?: Position): Promise<boolean> {
  const manifest = apps().get(id);
  if (!manifest || is_core_app(id) || !apps().is_installed(id)) return false;
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

/** The long-press menu of an app on the phone: add to home screen, favourite, uninstall; Open and Install when not installed. */
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
          favourite_item(manifest.id),
          ...(recent ? [{ separator: true } as const, CLEAR_RECENT_ITEM] : []),
          ...(is_core_app(manifest.id)
            ? []
            : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
        ]
      : [OPEN_ITEM, INSTALL_ITEM],
    { anchor }
  );
  if (apply_favourite(choice, manifest.id)) return;
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
