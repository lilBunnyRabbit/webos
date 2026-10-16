import kernel, { type DesktopItem, type DialogsService, type MobileDesktopService } from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  PushPin as PushPinIcon,
  PushPinSlash as PushPinSlashIcon,
  Info as InfoIcon,
  PencilSimple as PencilSimpleIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";
import { remove_item, rename_item, show_properties, uninstall_item } from "../desktop/desktop-actions";
import { uninstall_app } from "../apps/app-actions";

const desktop = () => kernel.service<MobileDesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");

/** The long-press menu of a home or dock icon. Rename, delete and properties are the desktop's own flows. */
export async function home_item_menu(item: DesktopItem, docked: boolean, anchor: Position): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const choice = await dialogs().menu(
    [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon },
      docked
        ? { id: "undock", label: "Remove from dock", icon: PushPinSlashIcon }
        : { id: "dock", label: "Add to dock", icon: PushPinIcon, disabled: desktop().dock_full },
      { separator: true },
      { id: "rename", label: "Rename", icon: PencilSimpleIcon },
      { id: "delete", label: shortcut ? "Remove shortcut" : "Delete", icon: TrashIcon, danger: true },
      ...uninstall_item(item),
      { separator: true },
      { id: "properties", label: "Properties", icon: InfoIcon },
    ],
    { anchor }
  );
  if (choice === "open") desktop().open(item, { anchor });
  else if (choice === "dock") desktop().set_docked(item.name, true);
  else if (choice === "undock") desktop().set_docked(item.name, false);
  else if (choice === "rename") rename_item(item);
  else if (choice === "delete") remove_item(item);
  else if (choice === "properties") show_properties(item);
  else if (choice === "uninstall" && (item.kind === "shortcut" || item.kind === "widget")) void uninstall_app(item.app_id, anchor);
}
