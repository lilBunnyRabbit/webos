import type { FilesService } from "$lib/core/api";
import { base_name, join_path, parent_path, split_path } from "$lib/core/api/services/files/path";
import type { JournalHeader } from "./crypto";
import { ENTRIES_DIR, HeaderSchema, HEADER_FILE, INBOX_DIR, INDEX_FILE, JOURNAL_ROOT, MEDIA_DIR } from "./journal";

export interface JournalRef {
  name: string;
  path: string;
  /** `null` when `journal.json` is missing or unreadable: the folder is listed so it doesn't vanish silently. */
  header: JournalHeader | null;
  stamp: number;
}

export function child(path: string, name: string): string {
  return join_path(split_path(path), name);
}

export async function read_header(files: FilesService, path: string): Promise<{ header: JournalHeader | null; stamp: number } | null> {
  const file = await files.get_file(child(path, HEADER_FILE));
  if (!file) return null;
  try {
    const parsed = HeaderSchema.safeParse(JSON.parse(await file.text()));
    return { header: parsed.success ? parsed.data : null, stamp: file.lastModified };
  } catch {
    return { header: null, stamp: file.lastModified };
  }
}

export async function list_journals(files: FilesService): Promise<JournalRef[]> {
  const root = await files.get_directory(JOURNAL_ROOT);
  if (!root) return [];
  const items = await files.list(root);
  const journals = await Promise.all(
    items.map(async (item) => {
      if (item.kind !== "directory") return null;
      const path = child(JOURNAL_ROOT, item.name);
      const read = await read_header(files, path);
      return read ? { name: item.name, path, ...read } : null;
    })
  );
  return journals.filter((journal) => journal !== null).sort((a, b) => a.name.localeCompare(b.name));
}

async function directory(files: FilesService, path: string): Promise<FileSystemDirectoryHandle> {
  const handle = await files.get_directory(path);
  if (!handle) throw new Error(`${path} is gone`);
  return handle;
}

/** `/home/Journal` is made on the first journal, not at boot. A taken name gets the usual "(1)". */
export async function create_journal_folder(files: FilesService, name: string, header: JournalHeader, index: Uint8Array<ArrayBuffer>): Promise<JournalRef> {
  const root = (await files.get_directory(JOURNAL_ROOT)) ?? (await files.create_directory(await directory(files, "/home"), "Journal"));
  const folder = await files.create_directory(root, name);
  for (const sub of [ENTRIES_DIR, MEDIA_DIR, INBOX_DIR]) await files.create_directory(folder, sub);
  await files.create_file(folder, INDEX_FILE, { overwrite: true, content: index });
  const path = child(JOURNAL_ROOT, folder.name);
  const stamp = await write_header(files, path, header);
  return { name: folder.name, path, header, stamp };
}

export async function write_header(files: FilesService, path: string, header: JournalHeader): Promise<number> {
  const folder = await directory(files, path);
  const handle = await files.create_file(folder, HEADER_FILE, { overwrite: true });
  await files.write_file(handle, `${JSON.stringify(header, null, 2)}\n`);
  return (await handle.getFile()).lastModified;
}

export async function read_bin(files: FilesService, path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const file = await files.get_file(path);
  return file ? new Uint8Array(await file.arrayBuffer()) : null;
}

export async function write_bin(files: FilesService, folder_path: string, name: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const folder = (await files.get_directory(folder_path)) ?? (await create_missing(files, folder_path));
  await files.create_file(folder, name, { overwrite: true, content: bytes });
}

async function create_missing(files: FilesService, path: string): Promise<FileSystemDirectoryHandle> {
  return files.create_directory(await directory(files, parent_path(path)), base_name(path));
}

export async function remove_bin(files: FilesService, folder_path: string, name: string): Promise<void> {
  const folder = await files.get_directory(folder_path);
  if (!folder) return;
  try {
    await files.delete_entry(folder, name);
  } catch (reason) {
    if (!(reason instanceof DOMException && reason.name === "NotFoundError")) throw reason;
  }
}
