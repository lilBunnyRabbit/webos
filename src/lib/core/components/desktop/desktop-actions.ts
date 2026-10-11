import kernel, { type AppsService, type DesktopGridItem, type DesktopService, type DialogsService } from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  FolderPlus as FolderPlusIcon,
  Palette as PaletteIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";
import ConfirmDialog from "../dialogs/confirm-dialog.svelte";
import PromptDialog from "../dialogs/prompt-dialog.svelte";
import { report_file_error } from "../files/file-explorer.errors";
import { name_problem } from "../files/name-rules";

// The desktop is the shell, not an app window, so its questions are system dialogs (ADR-025).
const desktop = () => kernel.service<DesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");
const apps = () => kernel.service<AppsService>("apps");

export async function remove_item(item: DesktopGridItem, position: Position): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const confirmed = await dialogs().show(
    ConfirmDialog,
    {
      message: shortcut ? `Remove the “${item.label}” shortcut?` : `Delete “${item.name}”?`,
      detail: shortcut
        ? "Only the shortcut goes; the app stays installed."
        : item.kind === "directory"
          ? "The folder and everything in it will be deleted. This can't be undone."
          : "This can't be undone.",
      confirm_label: shortcut ? "Remove" : "Delete",
      danger: true,
    },
    { dismissible: false }
  );
  if (!confirmed) return;

  try {
    await desktop().remove_item(position);
  } catch (error) {
    report_file_error(`Could not delete "${item.name}"`, error);
  }
}

export async function create_folder(): Promise<void> {
  const names = desktop().names();
  const name = await dialogs().show(PromptDialog, {
    message: "New folder on the desktop",
    initial: "New folder",
    confirm_label: "Create",
    validate: (value: string) => name_problem(value, names),
  });
  if (!name) return;

  try {
    await desktop().create_folder(name);
  } catch (error) {
    report_file_error(`Could not create folder "${name}"`, error);
  }
}

export async function item_menu(item: DesktopGridItem, position: Position, anchor: Position): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const choice = await dialogs().menu(
    [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon, shortcut: "↵" },
      { separator: true },
      { id: "delete", label: shortcut ? "Remove shortcut" : "Delete", icon: TrashIcon, shortcut: "Del", danger: true },
    ],
    { anchor }
  );
  if (choice === "open") desktop().open(item, { anchor });
  else if (choice === "delete") remove_item(item, position);
}

export async function background_menu(anchor: Position): Promise<void> {
  const choice = await dialogs().menu(
    [
      { id: "new_folder", label: "New folder", icon: FolderPlusIcon },
      { separator: true },
      { id: "appearance", label: "Change theme", icon: PaletteIcon },
    ],
    { anchor }
  );
  if (choice === "new_folder") create_folder();
  else if (choice === "appearance") apps().launch("settings");
}
