import kernel, {
  apps_for,
  tools_for,
  file_extension,
  SHORTCUT_EXTENSION,
  type AppManifest,
  type AppsService,
  type ClipboardService,
  type ConflictChoice,
  type DialogsService,
  type FilesService,
  type MenuItem,
  type NotificationsService,
} from "$lib/core/api";
import ConflictDialog from "../dialogs/conflict-dialog.svelte";
import type { FileSystemItem } from "$lib/core/api/services/files";
import { join_path } from "$lib/core/api/services/files/path";
import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
import type { WindowHandle } from "$lib/core/contexts/app";
import { report_file_error } from "./file-explorer.errors";
import { name_problem } from "./name-rules";
import PropertiesDialog from "./properties-dialog.svelte";

/** File Explorer actions shared by the toolbar, keyboard shortcuts and context menus, so each exists once. */
export async function create_folder(handler: DirectoryHandler, window: WindowHandle): Promise<void> {
  const name = await window.prompt("New folder", {
    initial: "New folder",
    confirm_label: "Create",
    validate: (value) => name_problem(value, handler.items.map((item) => item.name)),
  });
  if (!name) return;

  try {
    await handler.create_directory(name);
  } catch (error) {
    report_file_error(`Could not create folder "${name}"`, error);
  }
}

export async function delete_item(handler: DirectoryHandler, window: WindowHandle, item: FileSystemItem): Promise<void> {
  const recursive = item.kind === "directory";
  const confirmed = await window.confirm(`Delete “${item.name}”?`, {
    detail: recursive ? "The folder and everything in it will be deleted. This can't be undone." : "This can't be undone.",
    confirm_label: "Delete",
    danger: true,
  });
  if (!confirmed) return;

  try {
    await handler.delete_entry(item.name, { recursive });
  } catch (error) {
    report_file_error(`Could not delete "${item.name}"`, error);
  }
}

export async function upload(handler: DirectoryHandler): Promise<void> {
  try {
    await handler.upload_files();
  } catch (error) {
    report_file_error("Upload failed", error);
  }
}

export async function rename_item(handler: DirectoryHandler, window: WindowHandle, item: FileSystemItem): Promise<void> {
  const name = await window.prompt(`Rename “${item.name}”`, {
    initial: item.name,
    confirm_label: "Rename",
    select_stem: item.kind === "file",
    validate: (value) => name_problem(value, handler.items.map((entry) => entry.name), item.name),
  });
  if (!name || name === item.name) return;

  try {
    await handler.rename_entry(item.name, name);
  } catch (error) {
    report_file_error(`Could not rename "${item.name}"`, error);
  }
}

export function show_properties(handler: DirectoryHandler, window: WindowHandle, item: FileSystemItem): void {
  void kernel
    .service<DialogsService>("dialogs")
    .show(PropertiesDialog, { path: join_path(handler.segments, item.name), kind: item.kind }, { window: window.id });
}

/** "Open with" entries for a file: every associated app, best match first, then tool apps. Ids are `open_with:<app id>`. */
export async function open_with_items(item: FileSystemItem): Promise<MenuItem[]> {
  if (item.kind !== "file" || file_extension(item.name) === SHORTCUT_EXTENSION) return [];
  const file = await item.handle.getFile();
  const apps = [...kernel.service<AppsService>("apps").list()].map(([, manifest]) => manifest);
  const entry = (app: AppManifest): MenuItem => ({ id: `open_with:${app.id}`, label: app.name, icon: app.icon });
  const associated = apps_for(apps, file).map(entry);
  const tools = tools_for(apps, file).map(entry);
  return associated.length && tools.length ? [...associated, { separator: true }, ...tools] : [...associated, ...tools];
}

export function open_with(handler: DirectoryHandler, item: FileSystemItem, app_id: string): void {
  kernel.service<AppsService>("apps").launch(app_id, { path: join_path(handler.segments, item.name) });
}

const clipboard = () => kernel.service<ClipboardService>("clipboard");

export function copy_item(handler: DirectoryHandler, item: FileSystemItem): void {
  clipboard().copy_files([join_path(handler.segments, item.name)]);
}

export function cut_item(handler: DirectoryHandler, item: FileSystemItem): void {
  clipboard().cut_files([join_path(handler.segments, item.name)]);
}

/** Pastes into the folder shown by `handler`; name clashes ask in a sheet over this window. */
export async function paste(handler: DirectoryHandler, window: WindowHandle): Promise<void> {
  const dialogs = kernel.service<DialogsService>("dialogs");
  const ask = async (name: string): Promise<ConflictChoice> =>
    (await dialogs.show(ConflictDialog, { name, folder: handler.path }, { window: window.id, dismissible: false })) ?? "skip";

  try {
    await clipboard().paste_files(handler.path, ask);
    await handler.reload();
  } catch (error) {
    report_file_error("Paste failed", error);
  }
}

/** Copies a file or folder out of WebOS onto the real disk; the browser's own dialogs pick where. */
export async function save_to_disk(path: string): Promise<void> {
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    const written = await kernel.service<FilesService>("files").export_to_disk(path);
    if (written === null) return;
    kernel.service<NotificationsService>("notifications").notify("file-explorer", { title: "Saved to disk", message: written });
  } catch (error) {
    report_file_error(`Could not save "${name}" to disk`, error);
  }
}
