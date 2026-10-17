import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
import { pick_device_files } from "$lib/core/utils/device-file";
import type { StreamOptions } from "$lib/core/utils/zip/format";
import { entry_blob, entry_stream, read_zip, readable, type ZipArchive } from "$lib/core/utils/zip/read";
import type { ZipSource } from "$lib/core/utils/zip/write";
import type { DialogsService } from "../dialogs/type";
import { get_directory_at, get_directory_size, hold_writes, list_directory } from "../files/opfs";
import { split_path } from "../files/path";
import { flush_writers } from "../files/latest-writer";
import {
  BACKUP_FORMAT,
  MANIFEST_NAME,
  app_storage,
  area_of,
  parse_manifest,
  serialize_manifest,
  storage_bytes,
  type BackupManifest,
} from "./manifest";
import { BACKUP_AREAS, BackupArea, BackupError, type BackupAreaInfo } from "./type";

export interface OpenedBackup {
  blob: Blob;
  manifest: BackupManifest;
  archive: ZipArchive;
}

export async function sizes(root: FileSystemDirectoryHandle, storage: Storage): Promise<Record<BackupArea, number>> {
  const result = { files: 0, settings: 0, apps: 0 };
  for (const { area, path } of BACKUP_AREAS) {
    const directory = await get_directory_at(root, split_path(path));
    result[area] = directory ? await get_directory_size(directory) : 0;
  }
  result.apps += storage_bytes(app_storage(storage));
  return result;
}

async function walk(directory: FileSystemDirectoryHandle, prefix: string, out: ZipSource[]): Promise<void> {
  for (const item of await list_directory(directory, { include_metadata: false })) {
    const name = `${prefix}/${item.name}`;
    if (item.kind === "directory") {
      out.push({ name, directory: true });
      await walk(item.handle, name, out);
    } else {
      const file = await item.handle.getFile();
      // Copied now: the zip would otherwise reference the OPFS file, which turns unreadable once anything rewrites it
      // (session.json does whenever a window moves) before the zip reaches the device.
      out.push({ name, data: new Blob([await file.arrayBuffer()]), modified: new Date(file.lastModified) });
    }
  }
}

export async function area_sources(root: FileSystemDirectoryHandle, info: BackupAreaInfo): Promise<ZipSource[]> {
  const sources: ZipSource[] = [{ name: info.prefix, directory: true }];
  const directory = await get_directory_at(root, split_path(info.path));
  if (directory) await walk(directory, info.prefix, sources);
  return sources;
}

export function manifest_source(
  areas: BackupArea[],
  meta: { version: string; created: Date },
  storage: Storage
): ZipSource {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: meta.version,
    created: meta.created.toISOString(),
    areas,
    local_storage: areas.includes(BackupArea.APPS) ? app_storage(storage) : {},
  };
  return { name: MANIFEST_NAME, data: new Blob([serialize_manifest(manifest)]), modified: meta.created };
}

export async function open_backup(blob: Blob): Promise<OpenedBackup> {
  const archive = await read_zip(blob);
  const entry = archive.entries.find((candidate) => !candidate.directory && candidate.name === MANIFEST_NAME);
  if (!entry) throw new BackupError("This isn't a WebOS backup: it has no backup.json.");
  const manifest = parse_manifest(await (await entry_blob(blob, entry)).text());
  const unreadable = archive.entries.find(
    (candidate) => !candidate.directory && area_of(candidate.path) && !readable(candidate)
  );
  if (unreadable)
    throw new BackupError(
      `This backup can't be read: "${unreadable.name}" is encrypted or uses unsupported compression.`
    );
  return { blob, manifest, archive };
}

async function folder_at(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
  return directory;
}

async function wipe(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const segments = split_path(path);
  const parent = await folder_at(root, segments.slice(0, -1));
  try {
    await parent.removeEntry(segments.at(-1)!, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  await parent.getDirectoryHandle(segments.at(-1)!, { create: true });
}

export const STAGE_PATH = "/tmp/restore";

export async function clear_stage(root: FileSystemDirectoryHandle): Promise<void> {
  const segments = split_path(STAGE_PATH);
  const parent = await folder_at(root, segments.slice(0, -1));
  try {
    await parent.removeEntry(segments.at(-1)!, { recursive: true });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
}

/** Unpacks one area under `STAGE_PATH`, keeping its zip path. Nothing outside the stage changes, so it can be cancelled. */
export async function stage_area(
  root: FileSystemDirectoryHandle,
  opened: OpenedBackup,
  area: BackupArea,
  stream: StreamOptions = {}
): Promise<number> {
  const stage = await folder_at(root, split_path(STAGE_PATH));
  let files = 0;
  for (const entry of opened.archive.entries) {
    if (area_of(entry.path)?.area !== area) continue;
    if (entry.directory) {
      await folder_at(stage, entry.path);
      continue;
    }
    const directory = await folder_at(stage, entry.path.slice(0, -1));
    const file = await directory.getFileHandle(entry.path.at(-1)!, { create: true });
    await (await entry_stream(opened.blob, entry, stream)).pipeTo(await file.createWritable(), { signal: stream.signal });
    files++;
  }
  return files;
}

async function move_tree(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle): Promise<void> {
  for (const item of await list_directory(source, { include_metadata: false })) {
    if (item.kind === "directory") await move_tree(item.handle, await target.getDirectoryHandle(item.name, { create: true }));
    else await item.handle.move(target, item.name);
  }
}

// The hold stays on after success so the running OS can't save stale state over the restored files before the caller
// reloads; the release is returned for tests. Native handles here, because FilesService writes are what's held.
export async function swap_staged(
  root: FileSystemDirectoryHandle,
  manifest: BackupManifest,
  storage: Storage
): Promise<() => void> {
  await flush_writers();
  const release = await hold_writes();
  try {
    const stage = await folder_at(root, split_path(STAGE_PATH));
    for (const { area, path, prefix } of BACKUP_AREAS) {
      if (!manifest.areas.includes(area)) continue;
      await wipe(root, path);
      const staged = await get_directory_at(stage, split_path(prefix));
      if (staged) await move_tree(staged, await folder_at(root, split_path(path)));
    }
    if (manifest.areas.includes(BackupArea.APPS)) {
      for (const key of Object.keys(app_storage(storage))) storage.removeItem(key);
      for (const [key, value] of Object.entries(manifest.local_storage)) storage.setItem(key, value);
    }
    await clear_stage(root);
  } catch (error) {
    release();
    throw error;
  }
  return release;
}

// File System Access pickers; TypeScript's DOM lib doesn't declare them yet.
interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}
interface DevicePickers {
  showSaveFilePicker?(options: {
    suggestedName: string;
    startIn?: "downloads";
    types?: PickerType[];
  }): Promise<FileSystemFileHandle>;
  showOpenFilePicker?(options: { startIn?: "downloads"; types?: PickerType[] }): Promise<FileSystemFileHandle[]>;
}

const pickers = () => window as unknown as Window & DevicePickers;
const ZIP_TYPE: PickerType = { description: "WebOS backup", accept: { "application/zip": [".zip"] } };
const NEEDS_ACTIVATION =
  "The file picker only opens right after a click or a key press. Try again from a button or the Terminal.";

// A picker without a user activation throws on some paths and silently never opens on others (`<input>`), so check first.
function assert_activation(): void {
  if (!navigator.userActivation.isActive) throw new BackupError(NEEDS_ACTIVATION);
}

function picker_error(error: unknown): null {
  if (error instanceof DOMException && error.name === "AbortError") return null;
  if (error instanceof DOMException && (error.name === "SecurityError" || error.name === "NotAllowedError")) {
    throw new BackupError(NEEDS_ACTIVATION);
  }
  throw error;
}

export const DOWNLOAD = "download";

export async function pick_save_target(name: string): Promise<FileSystemFileHandle | typeof DOWNLOAD | null> {
  const { showSaveFilePicker } = pickers();
  if (!showSaveFilePicker) return DOWNLOAD;
  assert_activation();
  try {
    return await showSaveFilePicker.call(window, { suggestedName: name, startIn: "downloads", types: [ZIP_TYPE] });
  } catch (error) {
    return picker_error(error);
  }
}

export async function save_to_device(
  target: FileSystemFileHandle | typeof DOWNLOAD,
  blob: Blob,
  name: string
): Promise<string> {
  if (target === DOWNLOAD) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    // Revoked later: some browsers start reading the URL only after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return name;
  }
  const writable = await target.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
  return target.name;
}

export async function pick_backup_file(): Promise<File | null> {
  assert_activation();
  const { showOpenFilePicker } = pickers();
  if (!showOpenFilePicker) return (await pick_device_files({ accept: [".zip"] }))[0] ?? null;
  try {
    const [handle] = await showOpenFilePicker.call(window, { startIn: "downloads", types: [ZIP_TYPE] });
    return await handle.getFile();
  } catch (error) {
    return picker_error(error);
  }
}

export function confirm_restore(dialogs: DialogsService, manifest: BackupManifest): Promise<boolean | null> {
  const labels = BACKUP_AREAS.filter(({ area }) => manifest.areas.includes(area)).map(
    ({ label, path }) => `${label} (${path})`
  );
  const created = new Date(manifest.created).toLocaleString();
  return dialogs.show(
    ConfirmDialog,
    {
      message: "Replace your data with this backup?",
      detail: `From ${created}, WebOS ${manifest.version}. Replaces ${labels.join(", ")}; everything else stays. This can't be undone. WebOS reloads afterwards.`,
      confirm_label: "Replace and reload",
      danger: true,
    },
    { dismissible: false }
  );
}
