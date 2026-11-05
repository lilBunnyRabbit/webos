import type { FilesService } from "../files/type";
import { PATHS } from "../files/hierarchy";

export const APP_STORAGE_FILE = "storage.json";
const PREFIX = "app.";
const APPS_PATH = `${PATHS.var_lib}/apps`;

const is_not_found = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

function app_keys(storage: Storage): Map<string, Map<string, string>> {
  const groups = new Map<string, Map<string, string>>();
  for (let index = 0; index < storage.length; index++) {
    const full = storage.key(index);
    if (!full?.startsWith(PREFIX)) continue;
    const dot = full.indexOf(".", PREFIX.length);
    if (dot <= PREFIX.length || dot === full.length - 1) continue;
    const id = full.slice(PREFIX.length, dot);
    let keys = groups.get(id);
    if (!keys) groups.set(id, (keys = new Map()));
    keys.set(full.slice(dot + 1), storage.getItem(full) ?? "");
  }
  return groups;
}

function parse_value(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parse_object(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const data: unknown = JSON.parse(text);
    return data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// FilesService.create_directory picks a free name ("apps (1)") when one exists, so look first.
async function child_directory(files: FilesService, parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  try {
    return await parent.getDirectoryHandle(name);
  } catch (error) {
    if (!is_not_found(error)) throw error;
    return files.create_directory(parent, name);
  }
}

async function copy_app(files: FilesService, storage: Storage, apps: FileSystemDirectoryHandle, id: string, keys: Map<string, string>): Promise<void> {
  const directory = await child_directory(files, apps, id);
  const existing = await files.get_file(`${APPS_PATH}/${id}/${APP_STORAGE_FILE}`);
  const data = parse_object(existing ? await existing.text() : null);
  for (const [key, raw] of keys) data[key] = parse_value(raw);
  await files.create_file(directory, APP_STORAGE_FILE, { content: JSON.stringify(data, null, 2) + "\n", overwrite: true });
  for (const key of keys.keys()) storage.removeItem(`${PREFIX}${id}.${key}`);
}

// No done flag (ADR-094): a restored old backup sets `app.*` keys again, and the next boot folds them in.
export async function copy_app_storage(files: FilesService, storage: Storage): Promise<void> {
  const groups = app_keys(storage);
  if (groups.size === 0) return;
  const var_lib = await files.get_directory(PATHS.var_lib);
  if (!var_lib) return;
  const apps = await child_directory(files, var_lib, "apps");
  await Promise.all(
    [...groups].map(([id, keys]) =>
      copy_app(files, storage, apps, id, keys).catch((error) => console.error(`[AppsService] Couldn't move ${id}'s storage`, error))
    )
  );
}
