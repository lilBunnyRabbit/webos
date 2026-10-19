import kernel, {
  NotificationType,
  type AppsService,
  type DesktopItem,
  type DialogsService,
  type MobileDesktopService,
  type NotificationsService,
} from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  PushPin as PushPinIcon,
  PushPinSlash as PushPinSlashIcon,
  Info as InfoIcon,
  PencilSimple as PencilSimpleIcon,
  SquaresFour as SquaresFourIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";
import { remove_item, rename_item, show_properties, uninstall_item } from "../desktop/desktop-actions";
import { uninstall_app } from "../apps/app-actions";

const desktop = () => kernel.service<MobileDesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");
const apps = () => kernel.service<AppsService>("apps");
const notifications = () => kernel.service<NotificationsService>("notifications");

export const EDIT_HOME_ITEM = { id: "edit", label: "Edit home screen", icon: SquaresFourIcon };

/** The long-press menu of a home or dock icon or a widget. Rename, delete and properties are the desktop's own flows. */
export async function home_item_menu(item: DesktopItem, docked: boolean, anchor: Position, on_edit: () => void): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const choice = await dialogs().menu(
    [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon },
      ...(item.kind === "widget"
        ? []
        : [
            docked
              ? { id: "undock", label: "Remove from dock", icon: PushPinSlashIcon }
              : { id: "dock", label: "Add to dock", icon: PushPinIcon, disabled: desktop().dock_full },
          ]),
      EDIT_HOME_ITEM,
      { separator: true },
      { id: "rename", label: "Rename", icon: PencilSimpleIcon },
      { id: "delete", label: shortcut ? "Remove shortcut" : item.kind === "widget" ? "Remove widget" : "Delete", icon: TrashIcon, danger: true },
      ...uninstall_item(item),
      { separator: true },
      { id: "properties", label: "Properties", icon: InfoIcon },
    ],
    { anchor }
  );
  if (choice === "open") desktop().open(item, { anchor });
  else if (choice === "dock") desktop().set_docked(item.name, true);
  else if (choice === "undock") desktop().set_docked(item.name, false);
  else if (choice === "edit") on_edit();
  else if (choice === "rename") rename_item(item);
  else if (choice === "delete") remove_item(item);
  else if (choice === "properties") show_properties(item);
  else if (choice === "uninstall" && (item.kind === "shortcut" || item.kind === "widget")) void uninstall_app(item.app_id, anchor);
}

/** Every installed app with a widget, as a menu; the pick lands at the end of the home. */
export async function add_widget_menu(anchor: Position): Promise<void> {
  const choices = apps()
    .listings({ installed: true })
    .filter((app) => app.widget);
  if (choices.length === 0) return;
  const choice = await dialogs().menu(
    choices.map((app) => ({ id: app.id, label: app.name, icon: app.icon })),
    { anchor }
  );
  const app = choices.find((entry) => entry.id === choice);
  if (!app) return;
  try {
    await desktop().pin_widget(app.id, { label: app.name });
  } catch (reason) {
    notifications().notify(app.id, { type: NotificationType.ERROR, title: `Couldn't add the ${app.name} widget`, message: String(reason) });
  }
}
