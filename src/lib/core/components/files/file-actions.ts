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
  type SettingsService,
} from "$lib/core/api";
import type { FileSystemItem } from "$lib/core/api/services/files";
import { mount_point_of } from "$lib/core/api/services/files/hierarchy";
import { can_pick_folders } from "$lib/core/api/services/files/opfs";
import { base_name, join_path } from "$lib/core/api/services/files/path";
import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
import type { WindowHandle } from "$lib/core/contexts/app";
import { report_file_error } from "./file-explorer.errors";
import { name_problem } from "./name-rules";

const conflict_dialog = async () => (await import("../dialogs/conflict-dialog.svelte")).default;
const properties_dialog = async () => (await import("./properties-dialog.svelte")).default;
const bulk_rename_dialog = async () => (await import("./bulk-rename-dialog.svelte")).default;

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

/** One confirmation for the whole selection. Inside a mount it names the real folder: the delete hits the disk. */
export async function delete_items(handler: DirectoryHandler, window: WindowHandle, items: FileSystemItem[]): Promise<void> {
  const [first] = items;
  if (!first) return;
  const single = items.length === 1;
  const folders = items.some((item) => item.kind === "directory");
  const what = single ? `“${first.name}”` : `${items.length} items`;
  const mount = mount_point_of(handler.path);
  const message = mount ? `Delete ${what} from ${base_name(mount)} on your disk?` : `Delete ${what}?`;
  const confirmed = await window.confirm(message, {
    detail: folders ? "Folders go with everything in them. This can't be undone." : "This can't be undone.",
    confirm_label: "Delete",
    danger: true,
  });
  if (!confirmed) return;

  for (const item of items) {
    try {
      await handler.delete_entry(item.name, { recursive: item.kind === "directory" });
    } catch (error) {
      report_file_error(`Could not delete "${item.name}"`, error);
    }
  }
}

export async function upload(handler: DirectoryHandler): Promise<void> {
  try {
    await handler.upload_files();
  } catch (error) {
    report_file_error("Upload failed", error);
  }
}

const upload_folder = () => import("./upload-folder");

export async function upload_folder_into(handler: DirectoryHandler): Promise<void> {
  try {
    const { pick_device_folder, copy_folder_in } = await upload_folder();
    const folder = await pick_device_folder();
    if (folder) await copy_folder_in(folder, handler.path);
  } catch (error) {
    report_file_error("Upload failed", error);
  }
}

/** Mounts a real folder (ADR-044) and resolves its path, or `null` when cancelled. */
export async function mount_folder(): Promise<string | null> {
  try {
    return await kernel.service<FilesService>("files").pick_mount();
  } catch (error) {
    report_file_error("Couldn't mount the folder", error);
    return null;
  }
}

export async function unmount(path: string): Promise<void> {
  try {
    await kernel.service<FilesService>("files").unmount(path);
  } catch (error) {
    report_file_error(`Couldn't unmount ${base_name(path)}`, error);
  }
}

export async function reconnect(path: string): Promise<boolean> {
  try {
    return await kernel.service<FilesService>("files").reconnect(path);
  } catch (error) {
    report_file_error(`Couldn't reconnect ${base_name(path)}`, error);
    return false;
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

export async function rename_items(handler: DirectoryHandler, window: WindowHandle, items: FileSystemItem[]): Promise<void> {
  if (items.length === 1) return rename_item(handler, window, items[0]);
  const sources = items.map((item) => ({
    path: join_path(handler.segments, item.name),
    modified: item.kind === "file" ? (item.last_modified ?? null) : null,
  }));
  const taken = handler.items.map((item) => item.name);
  const steps = await kernel
    .service<DialogsService>("dialogs")
    .show(await bulk_rename_dialog(), { folder: handler.path, sources, taken }, { window: window.id });
  if (!steps) return;

  try {
    const { apply_renames } = await import("$lib/core/api/services/files/rename-batch");
    await apply_renames(kernel.service<FilesService>("files"), steps);
  } catch (error) {
    report_file_error(`Could not rename ${items.length} items`, error);
  }
}

export function show_properties(handler: DirectoryHandler, window: WindowHandle, item: FileSystemItem): void {
  void properties_dialog().then((dialog) =>
    kernel.service<DialogsService>("dialogs").show(dialog, { path: join_path(handler.segments, item.name), kind: item.kind }, { window: window.id })
  );
}

/** "Open with" entries for a file: every associated app, best match first, then tool apps. Ids are `open_with:<app id>`. */
export async function open_with_items(item: FileSystemItem): Promise<MenuItem[]> {
  if (item.kind !== "file" || file_extension(item.name) === SHORTCUT_EXTENSION) return [];
  const file = await item.handle.getFile();
  const service = kernel.service<AppsService>("apps");
  const known = () => [...service.list()].map(([, manifest]) => manifest);
  // No app this device knows works on it: the full catalogue may have one that isn't installed (ADR-077).
  let apps = known();
  if (apps_for(apps, file).length === 0 && tools_for(apps, file).length === 0 && (await service.catalogue())) apps = known();
  const entry = (app: AppManifest): MenuItem => ({ id: `open_with:${app.id}`, label: app.name, icon: app.icon });
  const associated = apps_for(apps, file).map(entry);
  const tools = tools_for(apps, file).map(entry);
  return associated.length && tools.length ? [...associated, { separator: true }, ...tools] : [...associated, ...tools];
}

export function open_with(handler: DirectoryHandler, item: FileSystemItem, app_id: string): void {
  kernel.service<AppsService>("apps").launch(app_id, { path: join_path(handler.segments, item.name) });
}

/** A Terminal window starting in `cwd` (ADR-033). */
export function open_terminal(cwd: string): void {
  kernel.service<AppsService>("apps").launch("terminal", { cwd });
}

// Lazy: the zip code stays out of Explorer's bundle until it's used.
const zip = () => import("$lib/core/utils/zip/operations");

export const is_zip = (item: FileSystemItem): boolean => item.kind === "file" && file_extension(item.name) === ".zip";

export async function compress_items(handler: DirectoryHandler, items: FileSystemItem[]): Promise<void> {
  try {
    await (await zip()).compress_into(items.map((item) => join_path(handler.segments, item.name)), handler.path);
  } catch (error) {
    report_file_error("Couldn't compress", error);
  }
}

export async function extract_here(handler: DirectoryHandler, item: FileSystemItem): Promise<void> {
  try {
    await (await zip()).extract_to(join_path(handler.segments, item.name), handler.path);
  } catch (error) {
    report_file_error(`Couldn't extract "${item.name}"`, error);
  }
}

const clipboard = () => kernel.service<ClipboardService>("clipboard");

export function copy_items(handler: DirectoryHandler, items: FileSystemItem[]): void {
  clipboard().copy_files(items.map((item) => join_path(handler.segments, item.name)));
}

export function cut_items(handler: DirectoryHandler, items: FileSystemItem[]): void {
  clipboard().cut_files(items.map((item) => join_path(handler.segments, item.name)));
}

/** Pastes into the folder shown by `handler`; name clashes ask in a sheet over this window. */
export async function paste(handler: DirectoryHandler, window: WindowHandle): Promise<void> {
  const dialogs = kernel.service<DialogsService>("dialogs");
  const ask = async (name: string): Promise<ConflictChoice> =>
    (await dialogs.show(await conflict_dialog(), { name, folder: handler.path }, { window: window.id, dismissible: false })) ?? "skip";

  try {
    await clipboard().paste_files(handler.path, ask);
    await handler.reload();
  } catch (error) {
    report_file_error("Paste failed", error);
  }
}

/** A folder needs the browser's folder picker; a file always works, through the downloads without a Save dialog. */
export const can_save_to_disk = (kind: "file" | "directory"): boolean => kind === "file" || can_pick_folders;

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

export const is_image = (type: string | undefined): boolean => type?.startsWith("image/") ?? false;

/** Copies the image into the OS's own storage, so the wallpaper survives the file moving or being deleted. */
export async function set_wallpaper(source: string | File): Promise<void> {
  try {
    await kernel.service<SettingsService>("settings").set_wallpaper_image(source);
  } catch (error) {
    report_file_error("Couldn't set the wallpaper", error);
  }
}
