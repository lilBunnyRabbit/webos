import type { FileSystemItem } from "$lib/core/api/services/files";
import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
import type { WindowHandle } from "$lib/core/contexts/app";
import { report_file_error } from "./file-explorer.errors";
import { name_problem } from "./name-rules";

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
