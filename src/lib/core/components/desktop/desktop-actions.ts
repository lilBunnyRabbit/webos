import kernel, {
  type AppsService,
  type ClipboardService,
  type ConflictChoice,
  type DesktopItem,
  type DesktopService,
  type DialogsService,
  type DesktopWindowsService,
  type WindowsService,
} from "$lib/core/api";
import { view_transition } from "$lib/core/utils/view-transition";
import ConflictDialog from "../dialogs/conflict-dialog.svelte";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  ClipboardText as ClipboardTextIcon,
  Copy as CopyIcon,
  Scissors as ScissorsIcon,
  Info as InfoIcon,
  PencilSimple as PencilSimpleIcon,
  FolderPlus as FolderPlusIcon,
  HardDrives as HardDrivesIcon,
  Palette as PaletteIcon,
  ArrowsIn as ArrowsInIcon,
  Trash as TrashIcon,
} from "phosphor-svelte";
import ConfirmDialog from "../dialogs/confirm-dialog.svelte";
import PromptDialog from "../dialogs/prompt-dialog.svelte";
import PropertiesDialog from "../files/properties-dialog.svelte";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { report_file_error } from "../files/file-explorer.errors";
import { name_problem } from "../files/name-rules";
import { save_to_disk } from "../files/file-actions";

// The desktop is the shell, not an app window, so its questions are system dialogs (ADR-025).
const desktop = () => kernel.service<DesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");
const apps = () => kernel.service<AppsService>("apps");
const clipboard = () => kernel.service<ClipboardService>("clipboard");

export const desktop_path = (item: DesktopItem): string => `${PATHS.desktop}/${item.name}`;

export function copy_item(item: DesktopItem): void {
  clipboard().copy_files([desktop_path(item)]);
}

export function cut_item(item: DesktopItem): void {
  clipboard().cut_files([desktop_path(item)]);
}

export async function paste(): Promise<void> {
  const ask = async (name: string): Promise<ConflictChoice> =>
    (await dialogs().show(ConflictDialog, { name, folder: PATHS.desktop }, { dismissible: false })) ?? "skip";
  try {
    await clipboard().paste_files(PATHS.desktop, ask);
  } catch (error) {
    report_file_error("Paste failed", error);
  }
}

export async function remove_item(item: DesktopItem): Promise<void> {
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
    await desktop().remove_item(item.name);
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

export async function rename_item(item: DesktopItem): Promise<void> {
  const name = await dialogs().show(PromptDialog, {
    message: `Rename “${item.name}”`,
    initial: item.name,
    confirm_label: "Rename",
    select_stem: item.kind !== "directory",
    validate: (value: string) => name_problem(value, desktop().names(), item.name),
  });
  if (!name || name === item.name) return;

  try {
    await desktop().rename_item(item.name, name);
  } catch (error) {
    report_file_error(`Could not rename "${item.name}"`, error);
  }
}

export function show_properties(item: DesktopItem): void {
  void dialogs().show(PropertiesDialog, {
    path: desktop_path(item),
    kind: item.kind === "directory" ? ("directory" as const) : ("file" as const),
  });
}

export async function item_menu(item: DesktopItem, anchor: Position): Promise<void> {
  const shortcut = item.kind === "shortcut";
  const choice = await dialogs().menu(
    [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon, shortcut: "↵" },
      { separator: true },
      { id: "cut", label: "Cut", icon: ScissorsIcon, shortcut: "Ctrl+X" },
      { id: "copy", label: "Copy", icon: CopyIcon, shortcut: "Ctrl+C" },
      { id: "rename", label: "Rename", icon: PencilSimpleIcon, shortcut: "F2" },
      ...(shortcut ? [] : [{ id: "save_to_disk", label: "Save to disk…", icon: HardDrivesIcon }]),
      { separator: true },
      { id: "delete", label: shortcut ? "Remove shortcut" : "Delete", icon: TrashIcon, shortcut: "Del", danger: true },
      { separator: true },
      { id: "properties", label: "Properties", icon: InfoIcon, shortcut: "Alt+↵" },
    ],
    { anchor }
  );
  if (choice === "open") desktop().open(item, { anchor });
  else if (choice === "rename") rename_item(item);
  else if (choice === "copy") copy_item(item);
  else if (choice === "cut") cut_item(item);
  else if (choice === "delete") remove_item(item);
  else if (choice === "properties") show_properties(item);
  else if (choice === "save_to_disk") save_to_disk(desktop_path(item));
}

export async function background_menu(anchor: Position): Promise<void> {
  const windows = kernel.service<WindowsService>("windows");
  const gather = "gather" in windows ? (windows as DesktopWindowsService) : null;
  const choice = await dialogs().menu(
    [
      { id: "new_folder", label: "New folder", icon: FolderPlusIcon },
      { id: "paste", label: "Paste", icon: ClipboardTextIcon, shortcut: "Ctrl+V", disabled: !clipboard().content },
      { separator: true },
      ...(gather
        ? [{ id: "gather", label: "Gather windows", icon: ArrowsInIcon, shortcut: "Alt+Shift+G", disabled: windows.list().length === 0 }]
        : []),
      { id: "appearance", label: "Change theme", icon: PaletteIcon },
    ],
    { anchor }
  );
  if (choice === "new_folder") create_folder();
  else if (choice === "paste") paste();
  else if (choice === "gather") view_transition(() => gather?.gather());
  else if (choice === "appearance") apps().launch("settings");
}
