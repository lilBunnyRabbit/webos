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
  ArrowDown as ArrowDownIcon,
  ArrowSquareOut as ArrowSquareOutIcon,
  ArrowUp as ArrowUpIcon,
  Info as InfoIcon,
  PencilSimple as PencilSimpleIcon,
  SquaresFour as SquaresFourIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";
import { apply_style_choice, remove_item, rename_item, show_properties, style_item, uninstall_item } from "../desktop/desktop-actions";
import { uninstall_app } from "../apps/app-actions";

const desktop = () => kernel.service<MobileDesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");
const apps = () => kernel.service<AppsService>("apps");
const notifications = () => kernel.service<NotificationsService>("notifications");

export const EDIT_HOME_ITEM = { id: "edit", label: "Edit home screen", icon: SquaresFourIcon };

/**
 * The menu of a home entry or a widget: a right-click, or a tap in edit mode, where Move up and Move down stand in for
 * the drag on a keyboard. Rename, delete and properties are the desktop's own flows.
 */
export async function home_item_menu(item: DesktopItem, anchor: Position, options: { editing: boolean; on_edit: () => void }): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const order = desktop().home().map((entry) => entry.name);
  const index = order.indexOf(item.name);
  const choice = await dialogs().menu(
    [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon },
      ...(options.editing
        ? [
            { id: "up", label: "Move up", icon: ArrowUpIcon, disabled: index <= 0 },
            { id: "down", label: "Move down", icon: ArrowDownIcon, disabled: index === -1 || index === order.length - 1 },
          ]
        : [EDIT_HOME_ITEM]),
      ...style_item(item),
      { separator: true },
      { id: "rename", label: "Rename", icon: PencilSimpleIcon },
      { id: "delete", label: shortcut ? "Remove shortcut" : item.kind === "widget" ? "Remove widget" : "Delete", icon: TrashIcon, danger: true },
      ...uninstall_item(item),
      { separator: true },
      { id: "properties", label: "Properties", icon: InfoIcon },
    ],
    { anchor }
  );
  if (apply_style_choice(item, choice)) return;
  if (choice === "open") desktop().open(item, { anchor });
  else if (choice === "edit") options.on_edit();
  else if (choice === "up") desktop().move_item(item.name, order[index - 1]);
  else if (choice === "down") desktop().move_item(item.name, order[index + 2] ?? null);
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
