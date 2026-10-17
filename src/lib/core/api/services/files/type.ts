import type { IService } from "../../type";
import type { DirectoryHandler } from "./service.svelte";

export type ConflictChoice = "replace" | "keep_both" | "skip";
/** Asked when a name is taken in the target folder; the caller shows the question. */
export type ConflictHandler = (name: string) => Promise<ConflictChoice>;

export type FileSystemItem = FileSystemFileItem | FileSystemDirectoryItem;

export interface FileSystemFileItem {
  name: string;
  kind: "file";
  handle: FileSystemFileHandle;
  size?: number;
  last_modified?: number;
  type?: string;
}

export interface FileSystemDirectoryItem {
  name: string;
  kind: "directory";
  handle: FileSystemDirectoryHandle;
}

export interface ListOptions {
  include_metadata?: boolean;
  sort?: (a: FileSystemItem, b: FileSystemItem) => number;
}

export interface CreateFileOptions {
  content?: string | Blob | BufferSource;
  /** Write to exactly `name`, replacing an existing file. Without it a taken name becomes `name (1).ext`. */
  overwrite?: boolean;
}

/** Within the asked depth a folder always has `children` (biggest first, maybe empty) and a file never does. */
export interface SizeNode {
  name: string;
  path: string;
  size: number;
  children?: SizeNode[];
}

export interface UploadOptions {
  multiple?: boolean;
  accept?: string;
}

export const MountState = {
  CONNECTED: "connected",
  /** Remembered from an earlier visit; the browser asks again on Reconnect, which needs a click. */
  LOCKED: "locked",
} as const;
export type MountState = (typeof MountState)[keyof typeof MountState];

/** A real folder on the disk shown at `/mnt/<name>` (ADR-044). */
export interface Mount {
  name: string;
  path: string;
  handle: FileSystemDirectoryHandle;
  state: MountState;
}

export interface FilesService extends IService {
  get_root(): Promise<FileSystemDirectoryHandle>;
  /**
   * Reactive change counter for one directory (ADR-021). Bumped after every mutation made through FilesService in this
   * tab; read it in an effect and re-list the directory when it changes. `0` until something changes.
   */
  revision(path: string): number;
  directory(segments: string[], handle?: FileSystemDirectoryHandle | null): Promise<DirectoryHandler>;

  list(handle?: FileSystemDirectoryHandle | null, options?: ListOptions): Promise<FileSystemItem[]>;
  /** Creates a new folder. A taken name becomes `name (1)`. To open-or-create a known folder, use `get_directory_handle(..., { create: true })`. */
  create_directory(handle: FileSystemDirectoryHandle | null, name: string): Promise<FileSystemDirectoryHandle>;
  /** Creates a new file. A taken name becomes `name (1).ext` unless `overwrite` is set. */
  create_file(handle: FileSystemDirectoryHandle | null, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle>;
  write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void>;
  read_file(handle: FileSystemFileHandle): Promise<File>;
  /** Looks a file up by absolute path (`/docs/a.txt`). `null` when nothing is there (ADR-018). */
  get_file(path: string): Promise<File | null>;
  /** The directory at an absolute path, or `null` if it doesn't exist or is a file. */
  get_directory(path: string): Promise<FileSystemDirectoryHandle | null>;
  delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void>;
  /** Renames in place; throws `InvalidModificationError` if the new name is taken (never auto-renames). */
  rename_entry(handle: FileSystemDirectoryHandle | null, name: string, new_name: string): Promise<void>;
  /** Recursive folder move (OPFS directories have no native move), auto-renamed on clash. */
  move_directory(source_parent: FileSystemDirectoryHandle | null, source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemDirectoryHandle>;
  /** Recursive folder copy into `target`, auto-renamed on clash. */
  copy_directory(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemDirectoryHandle>;
  exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean>;
  /** Copies into `target`. A taken name becomes `name (1).ext`; read the result's `name`. */
  copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle>;
  /** Moves into `target`. A taken name becomes `name (1).ext`. Moving onto itself is a no-op. */
  move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle>;
  upload_files(target: FileSystemDirectoryHandle | null, options?: UploadOptions): Promise<File[]>;
  /**
   * Moves the entries at `paths` into the folder at `target` (ADR-005 revision). `on_conflict` decides a taken name;
   * without it both are kept (`name (1).ext`), which is what drag and drop wants. Entries already in `target` are left
   * where they are. Moving a folder into itself throws. Resolves with the new paths.
   */
  move_paths(paths: string[], target: string, on_conflict?: ConflictHandler): Promise<string[]>;
  /**
   * Imports things from outside WebOS (files and folders dropped from the OS) into the folder at `target`. A
   * `FileSystemDirectoryHandle` is copied recursively. Clashes keep both. Resolves with the new paths.
   */
  import_entries(target: string, entries: (File | FileSystemHandle)[]): Promise<string[]>;
  /** Copies like `move_paths`. Copying into the entry's own folder always keeps both. */
  copy_paths(paths: string[], target: string, on_conflict?: ConflictHandler): Promise<string[]>;
  /** Copies the file or folder at `path` onto the real disk (native Save dialog / folder picker). The written name, or `null` if cancelled. */
  export_to_disk(path: string): Promise<string | null>;
  /** Mounted real folders, reactive. Each one's listing is read fresh: edits made outside the browser bump no revision. */
  readonly mounts: readonly Mount[];
  /** `showDirectoryPicker` exists; Android has none, so Mount and "Folder on disk…" are hidden there. */
  readonly can_mount: boolean;
  /**
   * Shows `handle` at `/mnt/<name>`, `name (1)` when taken, and remembers it for the next visit. A folder already
   * mounted resolves its existing path. Resolves the mount path.
   */
  mount(handle: FileSystemDirectoryHandle): Promise<string>;
  /** Asks for a folder with the browser's chooser and mounts it; `null` when cancelled. Must run from a click or keypress. */
  pick_mount(): Promise<string | null>;
  /** Forgets the mount at `path` (its mount point). The folder on the disk is untouched. */
  unmount(path: string): Promise<void>;
  /** Asks the browser for access to a locked mount again. Must run from a click. Resolves whether it's connected. */
  reconnect(path: string): Promise<boolean>;
  get_storage_estimate(): Promise<{ usage: number; quota: number }>;
  get_directory_size(handle: FileSystemDirectoryHandle | null): Promise<number>;
  /** Children `depth` levels down (all by default). Cached per folder by revision (ADR-021): asking again re-reads only changed folders. */
  size_tree(path: string, depth?: number): Promise<SizeNode>;
  clear(): Promise<void>;
}
