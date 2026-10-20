import kernel, {
  type AppsService,
  type ClipboardService,
  type ConflictChoice,
  type DesktopItem,
  type DesktopService,
  type DialogsService,
  type MenuAction,
  type MenuItem,
  type DesktopWindowsService,
  type FilesService,
  type GridDesktopService,
  type WindowsService,
  DesktopHelper,
  DesktopSort,
  WidgetStyle,
} from "$lib/core/api";
import { view_transition } from "$lib/core/utils/view-transition";
import { window_transition } from "$lib/core/components/window/window-transition.svelte";
import type { Position } from "$lib/core/utils/type";
import {
  ArrowSquareOut as ArrowSquareOutIcon,
  Check as CheckIcon,
  PaintBrush as PaintBrushIcon,
  ClipboardText as ClipboardTextIcon,
  Copy as CopyIcon,
  Scissors as ScissorsIcon,
  Info as InfoIcon,
  Image as ImageIcon,
  PencilSimple as PencilSimpleIcon,
  FolderPlus as FolderPlusIcon,
  HardDrives as HardDrivesIcon,
  Palette as PaletteIcon,
  ArrowsIn as ArrowsInIcon,
  SortAscending as SortAscendingIcon,
  TerminalWindow as TerminalWindowIcon,
  Trash as TrashIcon,
  Package as PackageIcon,
} from "phosphor-svelte";
import ConfirmDialog from "../dialogs/confirm-dialog.svelte";
import PromptDialog from "../dialogs/prompt-dialog.svelte";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { report_file_error } from "../files/file-explorer.errors";
import { name_problem } from "../files/name-rules";
import { is_image, save_to_disk, set_wallpaper } from "../files/file-actions";
import { uninstall_app } from "../apps/app-actions";

// The desktop is the shell, not an app window, so its questions are system dialogs (ADR-025).
const desktop = () => kernel.service<DesktopService>("desktop");
const dialogs = () => kernel.service<DialogsService>("dialogs");
const apps = () => kernel.service<AppsService>("apps");
const clipboard = () => kernel.service<ClipboardService>("clipboard");

export const desktop_path = (item: DesktopItem): string => `${PATHS.desktop}/${item.name}`;

/** The "Uninstall {app}…" item for a shortcut or widget of an installed user app, else none (ADR-040). */
export function uninstall_item(item: DesktopItem): MenuItem[] {
  if (item.kind !== "shortcut" && item.kind !== "widget") return [];
  const manifest = apps().get(item.app_id);
  if (!manifest || manifest.system || !apps().is_installed(item.app_id)) return [];
  return [{ id: "uninstall", label: `Uninstall ${manifest.name}…`, icon: PackageIcon, danger: true }];
}

const STYLE_LABELS: Record<WidgetStyle, string> = {
  [WidgetStyle.CARD]: "Card",
  [WidgetStyle.GLASS]: "Glass",
  [WidgetStyle.CLEAR]: "Clear",
};
const STYLE_PREFIX = "style:";

/** "Style › Card / Glass / Clear" for a widget, the current one checked; else none. */
export function style_item(item: DesktopItem): MenuItem[] {
  if (item.kind !== "widget") return [];
  const items = Object.values(WidgetStyle).map((style) => ({
    id: `${STYLE_PREFIX}${style}`,
    label: STYLE_LABELS[style],
    icon: item.style === style ? CheckIcon : undefined,
  }));
  return [{ label: "Style", icon: PaintBrushIcon, items }];
}

/** Applies a `style_item` choice. Returns whether `choice` was one. */
export function apply_style_choice(item: DesktopItem, choice: string | null): boolean {
  const style = Object.values(WidgetStyle).find((entry) => choice === `${STYLE_PREFIX}${entry}`);
  if (!style || item.kind !== "widget") return false;
  desktop()
    .set_widget_style(item.name, style)
    .catch((error) => report_file_error(`Could not change the style of “${item.label}”`, error));
  return true;
}

export function copy_items(items: DesktopItem[]): void {
  clipboard().copy_files(items.map(desktop_path));
}

export function cut_items(items: DesktopItem[]): void {
  clipboard().cut_files(items.map(desktop_path));
}

export function open_items(items: DesktopItem[], anchor: Position): void {
  for (const item of items) desktop().open(item, { anchor });
}

const conflict_dialog = async () => (await import("../dialogs/conflict-dialog.svelte")).default;
const properties_dialog = async () => (await import("../files/properties-dialog.svelte")).default;

export async function paste(): Promise<void> {
  const ask = async (name: string): Promise<ConflictChoice> =>
    (await dialogs().show(await conflict_dialog(), { name, folder: PATHS.desktop }, { dismissible: false })) ?? "skip";
  try {
    await clipboard().paste_files(PATHS.desktop, ask);
  } catch (error) {
    report_file_error("Paste failed", error);
  }
}

export async function remove_item(item: DesktopItem): Promise<void> {
  return remove_items([item]);
}

/** One confirmation for the whole selection. */
export async function remove_items(items: DesktopItem[]): Promise<void> {
  if (items.length === 0) return;
  if (items.length > 1) {
    const confirmed = await dialogs().show(
      ConfirmDialog,
      {
        message: `Delete ${items.length} items?`,
        detail: "Folders go with everything in them; shortcuts only remove the shortcut. This can't be undone.",
        confirm_label: "Delete",
        danger: true,
      },
      { dismissible: false }
    );
    if (!confirmed) return;
    for (const item of items) {
      try {
        await desktop().remove_item(item.name);
      } catch (error) {
        report_file_error(`Could not delete "${item.name}"`, error);
      }
    }
    return;
  }

  const [item] = items;
  const shortcut = item.kind === "shortcut" || item.kind === "widget";
  const confirmed = await dialogs().show(
    ConfirmDialog,
    {
      message: shortcut ? `Remove the “${item.label}” ${item.kind}?` : `Delete “${item.name}”?`,
      detail: shortcut
        ? `Only the ${item.kind} goes; the app${item.kind === "widget" ? " and what it shows stay" : " stays installed"}.`
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

export async function show_properties(item: DesktopItem): Promise<void> {
  await dialogs().show(await properties_dialog(), {
    path: desktop_path(item),
    kind: item.kind === "directory" ? ("directory" as const) : ("file" as const),
  });
}

/** The menu for the selection: everything acts on all of `items`; Rename, Properties and Save to disk need one. */
export async function item_menu(items: DesktopItem[], anchor: Position): Promise<void> {
  const [item] = items;
  if (!item) return;
  const single = items.length === 1;
  const shortcut = single && (item.kind === "shortcut" || item.kind === "widget");
  const choice = await dialogs().menu(
    [
      { id: "open", label: single ? "Open" : `Open ${items.length} items`, icon: ArrowSquareOutIcon, shortcut: "↵" },
      { separator: true },
      { id: "cut", label: "Cut", icon: ScissorsIcon, shortcut: "Ctrl+X" },
      { id: "copy", label: "Copy", icon: CopyIcon, shortcut: "Ctrl+C" },
      ...(single ? [{ id: "rename", label: "Rename", icon: PencilSimpleIcon, shortcut: "F2" }] : []),
      ...(single && !shortcut ? [{ id: "save_to_disk", label: "Save to disk…", icon: HardDrivesIcon }] : []),
      ...(single && item.kind === "file" && is_image(item.type) ? [{ id: "wallpaper", label: "Set as wallpaper", icon: ImageIcon }] : []),
      ...(single ? style_item(item) : []),
      { separator: true },
      {
        id: "delete",
        label: shortcut ? `Remove ${item.kind}` : single ? "Delete" : `Delete ${items.length} items`,
        icon: TrashIcon,
        shortcut: "Del",
        danger: true,
      },
      ...(single ? uninstall_item(item) : []),
      ...(single
        ? [{ separator: true } as const, { id: "properties", label: "Properties", icon: InfoIcon, shortcut: "Alt+↵" }]
        : []),
    ],
    { anchor }
  );
  if (apply_style_choice(item, choice)) return;
  if (choice === "open") open_items(items, anchor);
  else if (choice === "rename") rename_item(item);
  else if (choice === "copy") copy_items(items);
  else if (choice === "cut") cut_items(items);
  else if (choice === "delete") remove_items(items);
  else if (choice === "properties") void show_properties(item);
  else if (choice === "save_to_disk") save_to_disk(desktop_path(item));
  else if (choice === "wallpaper") set_wallpaper(desktop_path(item));
  else if (choice === "uninstall" && (item.kind === "shortcut" || item.kind === "widget")) void uninstall_app(item.app_id, anchor);
}

/** `lead` goes first, for the phone home's own entries. */
export async function background_menu(anchor: Position, lead: { item: MenuAction; run: () => void }[] = []): Promise<void> {
  const windows = kernel.service<WindowsService>("windows");
  const gather = "gather" in windows ? (windows as DesktopWindowsService) : null;
  // The phone home is an ordered flow with no cells to sort into (ADR-016).
  const grid = "move_items" in desktop();
  const choice = await dialogs().menu(
    [
      ...lead.map((entry) => entry.item),
      ...(lead.length > 0 ? [{ separator: true } as const] : []),
      { id: "new_folder", label: "New folder", icon: FolderPlusIcon },
      { id: "paste", label: "Paste", icon: ClipboardTextIcon, shortcut: "Ctrl+V", disabled: !clipboard().content },
      ...(grid
        ? [
            {
              label: "Sort by",
              icon: SortAscendingIcon,
              items: [
                { id: "sort_name", label: "Name" },
                { id: "sort_kind", label: "Kind" },
                { id: "sort_date", label: "Date modified" },
              ],
            },
          ]
        : []),
      { separator: true },
      ...(gather
        ? [
            {
              id: "gather",
              label: "Gather windows",
              icon: ArrowsInIcon,
              shortcut: "Alt+Shift+G",
              disabled: windows.list().length === 0,
            },
          ]
        : []),
      { id: "terminal", label: "Open Terminal here", icon: TerminalWindowIcon, shortcut: "Alt+Shift+↵" },
      { id: "appearance", label: "Change wallpaper or theme", icon: PaletteIcon },
    ],
    { anchor }
  );
  const led = lead.find((entry) => entry.item.id === choice);
  if (led) led.run();
  else if (choice === "new_folder") create_folder();
  else if (choice === "paste") paste();
  else if (choice === "gather") window_transition(gather?.list() ?? [], () => gather?.gather());
  else if (choice === "appearance") apps().launch("settings");
  else if (choice === "terminal") apps().launch("terminal", { cwd: PATHS.desktop });
  else if (choice === "sort_name") sort_items(DesktopSort.NAME);
  else if (choice === "sort_kind") sort_items(DesktopSort.KIND);
  else if (choice === "sort_date") sort_items(DesktopSort.DATE);
}

export async function sort_items(by: DesktopSort): Promise<void> {
  const grid = desktop() as GridDesktopService;
  const items = grid.items();
  const modified = new Map<string, number>();
  if (by === DesktopSort.DATE) {
    const files = kernel.service<FilesService>("files");
    await Promise.all(
      items
        .filter((item) => item.kind !== "directory")
        .map(async (item) => {
          const file = await files.get_file(desktop_path(item));
          if (file) modified.set(item.name, file.lastModified);
        })
    );
  }
  const moves = DesktopHelper.sort_moves(items, by, grid.container.grid.rows, modified);
  view_transition(() => grid.move_items(moves));
}
