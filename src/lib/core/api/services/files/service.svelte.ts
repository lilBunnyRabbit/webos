import type {
  ConflictHandler,
  FilesService as IFilesService,
  FileSystemItem,
  ListOptions,
  CreateFileOptions,
  Mount,
  UploadOptions,
  SizeNode,
} from "./type";
import { MountState } from "./type";
import { untrack } from "svelte";
import { createSubscriber, SvelteMap } from "svelte/reactivity";
import * as opfs from "./opfs";
import { ensure_hierarchy, mount_point_of, PATHS } from "./hierarchy";
import * as mounts_store from "./mounts-store";
import { join_path, split_path } from "./path";
import { files_shell } from "./shell";
import type { SizeCache } from "./size-tree";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "OPFS file system";
  inspector = () => import("./inspector.svelte");
  shell = () => files_shell(this);

  to_string(): string {
    return "FilesService";
  }

  private _root: Promise<FileSystemDirectoryHandle> | null = null;
  // One cell per folder: reading a missing key of a SvelteMap subscribes to the whole map, so every watcher of an untouched
  // folder re-ran whenever any other folder got its first revision (widgets reloaded when an app opened).
  private revisions = new Map<string, Revision>();
  // Lazy: the boot bundle is at its budget. Reads without subscribing, so a walk started in an effect doesn't track every
  // folder it passes; making the cell lets clear(), which bumps only existing cells, invalidate the listing.
  private sizes: Promise<SizeCache> | null = null;

  mounts = $state.raw<Mount[]>([]);
  readonly can_mount = opfs.can_pick_folders;

  async init(): Promise<void> {
    await ensure_hierarchy(await this.get_root());
    try {
      const stored = await mounts_store.load_mounts();
      this.mounts = await Promise.all(stored.map(async ({ name, handle }) => this.mount_entry(name, handle)));
    } catch (error) {
      console.error("[FilesService] Couldn't load mounts", error);
    }
  }

  private async mount_entry(name: string, handle: FileSystemDirectoryHandle): Promise<Mount> {
    const permission = await handle.queryPermission({ mode: "readwrite" }).catch(() => "denied" as const);
    return { name, path: `${PATHS.mnt}/${name}`, handle, state: permission === "granted" ? MountState.CONNECTED : MountState.LOCKED };
  }

  private mount_at(path: string): Mount | null {
    const point = mount_point_of(path);
    return point === null ? null : (this.mounts.find((mount) => mount.path === point) ?? null);
  }

  async mount(handle: FileSystemDirectoryHandle): Promise<string> {
    for (const mount of this.mounts) if (await mount.handle.isSameEntry(handle)) return mount.path;

    const taken = new Set(this.mounts.map((mount) => mount.name));
    let name = handle.name || "Folder";
    for (let n = 1; taken.has(name); n++) name = `${handle.name || "Folder"} (${n})`;

    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") await handle.requestPermission({ mode: "readwrite" });
    await mounts_store.save_mount({ name, handle });
    const mount = await this.mount_entry(name, handle);
    this.mounts = [...this.mounts, mount];
    this.bump(PATHS.mnt);
    return mount.path;
  }

  async pick_mount(): Promise<string | null> {
    const handle = await opfs.pick_disk_folder();
    return handle ? this.mount(handle) : null;
  }

  async unmount(path: string): Promise<void> {
    const mount = this.mounts.find((entry) => entry.path === join_path(split_path(path)));
    if (!mount) throw new DOMException(`${path} isn't a mount`, "NotFoundError");
    await mounts_store.delete_mount(mount.name);
    this.mounts = this.mounts.filter((entry) => entry !== mount);
    this.bump(PATHS.mnt);
    this.bump(mount.path);
  }

  async reconnect(path: string): Promise<boolean> {
    const mount = this.mount_at(path);
    if (!mount) return false;
    const granted = (await mount.handle.requestPermission({ mode: "readwrite" })) === "granted";
    this.mounts = this.mounts.map((entry) => (entry === mount ? { ...entry, state: granted ? MountState.CONNECTED : MountState.LOCKED } : entry));
    if (granted) this.bump(mount.path);
    return granted;
  }

  private mount_items(): FileSystemItem[] {
    return this.mounts.map(({ name, handle }) => ({ name, kind: "directory" as const, handle })).sort(opfs.default_sort);
  }

  /** Where a path's walk starts: a mount's handle for `/mnt/<name>/…`, else the OPFS root. `null` for an unknown mount. */
  private async start(segments: string[]): Promise<{ root: FileSystemDirectoryHandle; rest: string[] } | null> {
    if (segments[0] !== "mnt" || segments.length < 2) return { root: await this.get_root(), rest: segments };
    const mount = this.mount_at(join_path(segments));
    return mount ? { root: mount.handle, rest: segments.slice(2) } : null;
  }

  /** The path of a handle, mounts first: an OPFS folder can stand in for a picked one in tests. */
  private async path_of(handle: FileSystemHandle): Promise<string[] | null> {
    for (const mount of this.mounts) {
      const inside = await mount.handle.resolve(handle).catch(() => null);
      if (inside) return ["mnt", mount.name, ...inside];
    }
    return (await this.get_root()).resolve(handle);
  }

  private async is_mnt(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const segments = await (await this.get_root()).resolve(handle).catch(() => null);
    return segments?.length === 1 && segments[0] === "mnt";
  }

  /** Which root a path lives under: a mount point, or `/` for OPFS. Moves between two roots are copy plus delete. */
  private volume_of(path: string): string {
    return mount_point_of(path) ?? "/";
  }

  revision(path: string): number {
    return this.cell(join_path(split_path(path))).read();
  }

  /**
   * Bumps the revision of the directory that changed. Internal: called by FilesService and DirectoryHandler after
   * every mutation. `resolve()` maps a handle back to its path, since mutations only get handles.
   */
  async changed(directory: FileSystemDirectoryHandle): Promise<void> {
    const segments = await this.path_of(directory);
    if (segments !== null) this.bump(join_path(segments));
  }

  private async changed_file(file: FileSystemFileHandle): Promise<void> {
    const segments = await this.path_of(file);
    if (segments !== null) this.bump(join_path(segments.slice(0, -1)));
  }

  private cell(path: string): Revision {
    let revision = this.revisions.get(path);
    if (!revision) {
      revision = new Revision();
      this.revisions.set(path, revision);
    }
    return revision;
  }

  private bump(path: string): void {
    this.cell(path).bump();
  }

  async get_root(): Promise<FileSystemDirectoryHandle> {
    if (!this._root) {
      // A rejected root (e.g. private browsing without OPFS) must not be cached forever.
      this._root = opfs.get_root().catch((error) => {
        this._root = null;
        throw error;
      });

      navigator.storage.persist().then(
        (persisted) => persisted || console.warn("[FilesService] Storage not persisted"),
        (error) => console.error("[FilesService] Failed to persist storage", error)
      );
    }

    return await this._root;
  }

  private async resolve(handle: FileSystemDirectoryHandle | null): Promise<FileSystemDirectoryHandle> {
    return handle ?? (await this.get_root());
  }

  async directory(segments: string[], handle?: FileSystemDirectoryHandle | null): Promise<DirectoryHandler> {
    if (handle) return new DirectoryHandler(this, handle, segments);

    const start = await this.start(segments);
    if (!start) throw new DOMException(`${join_path(segments)} isn't mounted`, "NotFoundError");
    let resolved = start.root;
    for (const segment of start.rest) {
      resolved = await resolved.getDirectoryHandle(segment);
    }
    return new DirectoryHandler(this, resolved, segments);
  }

  async list(handle?: FileSystemDirectoryHandle | null, options?: ListOptions): Promise<FileSystemItem[]> {
    const directory = await this.resolve(handle ?? null);
    if (await this.is_mnt(directory)) return this.mount_items();
    return opfs.list_directory(directory, options);
  }

  /** DirectoryHandler's listing: `/mnt` lists the mount table, everything else the folder itself. */
  async list_at(path: string, handle: FileSystemDirectoryHandle): Promise<FileSystemItem[]> {
    return path === PATHS.mnt ? this.mount_items() : opfs.list_directory(handle);
  }

  async create_directory(handle: FileSystemDirectoryHandle | null, name: string): Promise<FileSystemDirectoryHandle> {
    const parent = await this.resolve(handle);
    const result = await opfs.create_directory(parent, name);
    await this.changed(parent);
    return result;
  }

  async create_file(handle: FileSystemDirectoryHandle | null, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle> {
    const parent = await this.resolve(handle);
    const result = await opfs.create_file(parent, name, options);
    await this.changed(parent);
    return result;
  }

  async write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void> {
    await opfs.write_file(handle, content);
    await this.changed_file(handle);
  }

  async read_file(handle: FileSystemFileHandle): Promise<File> {
    return opfs.read_file(handle);
  }

  async get_file(path: string): Promise<File | null> {
    const start = await this.start(split_path(path));
    return start ? opfs.get_file_at(start.root, start.rest) : null;
  }

  async get_directory(path: string): Promise<FileSystemDirectoryHandle | null> {
    const start = await this.start(split_path(path));
    return start ? opfs.get_directory_at(start.root, start.rest) : null;
  }

  async rename_entry(handle: FileSystemDirectoryHandle | null, name: string, new_name: string): Promise<void> {
    const parent = await this.resolve(handle);
    await opfs.rename_entry(parent, name, new_name);
    await this.changed(parent);
  }

  async copy_directory(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemDirectoryHandle> {
    const target_dir = await this.resolve(target);
    const result = await opfs.copy_directory(source, target_dir, new_name);
    await this.changed(target_dir);
    return result;
  }

  async delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void> {
    const parent = await this.resolve(handle);
    await opfs.delete_entry(parent, name, options);
    await this.changed(parent);
  }

  async exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean> {
    return opfs.exists(await this.resolve(handle), name, kind);
  }

  async copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle> {
    const target_dir = await this.resolve(target);
    const result = await opfs.copy_file(source, target_dir, new_name);
    await this.changed(target_dir);
    return result;
  }

  async move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle> {
    const from = await this.resolve(source_parent);
    const to = await this.resolve(target);
    const result = await opfs.move_file(from, source, to, new_name);
    await this.changed(from);
    await this.changed(to);
    return result;
  }

  async move_directory(
    source_parent: FileSystemDirectoryHandle | null,
    source: FileSystemDirectoryHandle,
    target: FileSystemDirectoryHandle | null,
    new_name?: string
  ): Promise<FileSystemDirectoryHandle> {
    const from = await this.resolve(source_parent);
    const to = await this.resolve(target);
    const result = await opfs.move_directory(from, source, to, new_name);
    await this.changed(from);
    await this.changed(to);
    return result;
  }

  async upload_files(target: FileSystemDirectoryHandle | null, options?: UploadOptions): Promise<File[]> {
    const target_dir = await this.resolve(target);
    const result = await opfs.upload_files(target_dir, options);
    if (result.length > 0) await this.changed(target_dir);
    return result;
  }

  async import_entries(target: string, entries: (File | FileSystemHandle)[]): Promise<string[]> {
    const target_path = join_path(split_path(target));
    const target_dir = await this.get_directory(target_path);
    if (!target_dir) throw new Error(`${target} doesn't exist`);

    const imported: string[] = [];
    try {
      for (const entry of entries) {
        const handle =
          entry instanceof File
            ? await opfs.store_file(target_dir, entry)
            : entry.kind === "file"
              ? await opfs.store_file(target_dir, await (entry as FileSystemFileHandle).getFile())
              : await opfs.copy_directory(entry as FileSystemDirectoryHandle, target_dir);
        imported.push(join_path([...split_path(target_path), handle.name]));
      }
    } finally {
      if (imported.length > 0) await this.changed(target_dir);
    }
    return imported;
  }

  async move_paths(paths: string[], target: string, on_conflict?: ConflictHandler): Promise<string[]> {
    return this.transfer("move", paths, target, on_conflict);
  }

  async copy_paths(paths: string[], target: string, on_conflict?: ConflictHandler): Promise<string[]> {
    return this.transfer("copy", paths, target, on_conflict);
  }

  private async transfer(mode: "move" | "copy", paths: string[], target: string, on_conflict?: ConflictHandler): Promise<string[]> {
    const target_path = join_path(split_path(target));
    const target_dir = await this.get_directory(target_path);
    if (!target_dir) throw new Error(`${target} doesn't exist`);

    const result: string[] = [];
    for (const path of paths) {
      const segments = split_path(path);
      const name = segments.at(-1);
      if (!name) continue;
      const source_path = join_path(segments);
      const parent_path = join_path(segments.slice(0, -1));
      const parent = await this.get_directory(parent_path);
      if (!parent) continue;

      const directory = await this.get_directory(source_path);
      if (directory && (target_path === source_path || target_path.startsWith(`${source_path}/`))) {
        throw new Error(`Can't put "${name}" into itself`);
      }

      const same_folder = parent_path === target_path;
      // Moving into the folder it's already in is a no-op, not a conflict with itself.
      if (mode === "move" && same_folder) {
        result.push(source_path);
        continue;
      }

      // Copying into its own folder always keeps both: "Replace" would delete the very thing being copied.
      if (on_conflict && !same_folder && (await this.exists(target_dir, name))) {
        const choice = await on_conflict(name);
        if (choice === "skip") continue;
        if (choice === "replace") await this.delete_entry(target_dir, name, { recursive: true });
      }

      let new_name: string;
      if (mode === "move" && this.volume_of(source_path) !== this.volume_of(target_path)) {
        // Native moves stay inside one file system; across the OPFS/disk boundary it's copy, then delete.
        const copied = directory ? await this.copy_directory(directory, target_dir, name) : await this.copy_file(await parent.getFileHandle(name), target_dir, name);
        await this.delete_entry(parent, name, { recursive: true });
        new_name = copied.name;
      } else if (directory) {
        const moved =
          mode === "copy" ? await this.copy_directory(directory, target_dir, name) : await this.move_directory(parent, directory, target_dir, name);
        new_name = moved.name;
      } else {
        const file = await parent.getFileHandle(name).catch(() => null);
        if (!file) continue;
        const moved = mode === "copy" ? await this.copy_file(file, target_dir, name) : await this.move_file(parent, file, target_dir, name);
        new_name = moved.name;
      }
      result.push(join_path([...split_path(target_path), new_name]));
    }
    return result;
  }

  async export_to_disk(path: string): Promise<string | null> {
    const segments = split_path(path);
    const name = segments.pop();
    const parent = name ? await this.get_directory(join_path(segments)) : null;
    if (!name || !parent) throw new DOMException(`"${path}" doesn't exist`, "NotFoundError");
    const handle = (await opfs.exists(parent, name, "file")) ? await parent.getFileHandle(name) : await parent.getDirectoryHandle(name);
    return opfs.export_to_disk(handle);
  }

  async get_storage_estimate(): Promise<{ usage: number; quota: number }> {
    return opfs.get_storage_estimate();
  }

  async get_directory_size(handle: FileSystemDirectoryHandle | null): Promise<number> {
    return opfs.get_directory_size(await this.resolve(handle ?? null));
  }

  async size_tree(path: string, depth?: number): Promise<SizeNode> {
    const handle = await this.get_directory(path);
    if (!handle) throw new DOMException(`"${path}" isn't a folder`, "NotFoundError");
    this.sizes ??= import("./size-tree").then(({ SizeCache }) => new SizeCache((at) => this.cell(at).value));
    return (await this.sizes).tree(handle, path, depth);
  }

  /** Wipes OPFS, then rebuilds the empty hierarchy so the OS keeps its folders. */
  async clear(): Promise<void> {
    await opfs.clear_opfs();
    const root = await this.get_root();
    await ensure_hierarchy(root);
    for (const revision of this.revisions.values()) revision.bump();
    await this.changed(root);
  }
}

export class DirectoryHandler {
  readonly segments: string[];
  readonly path: string;
  readonly handle: FileSystemDirectoryHandle;
  readonly service: FilesService;

  items = $state.raw<FileSystemItem[]>([]);
  loading = $state(true);
  /** Turns false once the folder is deleted or moved away; the handler then disposes itself. */
  exists = $state(true);

  private reload_id = 0;
  private listing: { revision: number; promise: Promise<void> } | null = null;
  private dispose_watch: (() => void) | null;

  /** Watches its own revision (re-lists) and every ancestor's (checks it still exists) until `dispose()`. */
  constructor(service: FilesService, handle: FileSystemDirectoryHandle, segments: string[]) {
    this.service = service;
    this.handle = handle;
    this.segments = segments;
    this.path = "/" + segments.join("/");

    this.dispose_watch = $effect.root(() => {
      $effect(() => {
        this.service.revision(this.path);
        untrack(() => this.reload()).catch((error) => console.error(`[FilesService] Failed to list ${this.path}`, error));
      });

      if (this.is_root) return;
      let first = true;
      $effect(() => {
        // Deleting or moving a folder bumps only its parent, and a gone grandparent only the one above that.
        for (let depth = 0; depth < this.segments.length; depth++) this.service.revision(join_path(this.segments.slice(0, depth)));
        if (first) {
          first = false;
          return;
        }
        untrack(() => this.check_exists()).catch((error) => console.error(`[FilesService] Failed to check ${this.path}`, error));
      });
    });
  }

  dispose(): void {
    this.dispose_watch?.();
    this.dispose_watch = null;
  }

  get name(): string {
    return this.segments.length === 0 ? "/" : this.segments[this.segments.length - 1];
  }

  get is_root(): boolean {
    return this.segments.length === 0;
  }

  /**
   * Lists the folder. A mutation and the revision watcher both call this after the same bump; the second call joins
   * the listing already running for that revision instead of starting another.
   */
  reload(): Promise<void> {
    const revision = this.service.revision(this.path);
    if (this.listing?.revision === revision) return this.listing.promise;

    const promise = this.list().finally(() => {
      if (this.listing?.promise === promise) this.listing = null;
    });
    this.listing = { revision, promise };
    return promise;
  }

  private async check_exists(): Promise<void> {
    const current = await this.service.get_directory(this.path);
    if (current && (await current.isSameEntry(this.handle))) return;
    this.exists = false;
    this.dispose();
  }

  private async list(): Promise<void> {
    const id = ++this.reload_id;
    this.loading = true;
    try {
      const items = await this.service.list_at(this.path, this.handle);
      // An older listing resolving after a newer one would show stale contents.
      if (id === this.reload_id) this.items = opfs.keep_unchanged(this.items, items);
    } finally {
      if (id === this.reload_id) this.loading = false;
    }
  }

  async create_directory(name: string): Promise<FileSystemDirectoryHandle> {
    const result = await opfs.create_directory(this.handle, name);
    await this.service.changed(this.handle);
    await this.reload();
    return result;
  }

  async create_file(name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle> {
    const result = await opfs.create_file(this.handle, name, options);
    await this.service.changed(this.handle);
    await this.reload();
    return result;
  }

  async rename_entry(name: string, new_name: string): Promise<void> {
    await opfs.rename_entry(this.handle, name, new_name);
    await this.service.changed(this.handle);
    await this.reload();
  }

  async delete_entry(name: string, options?: { recursive?: boolean }): Promise<void> {
    await opfs.delete_entry(this.handle, name, options);
    await this.service.changed(this.handle);
    await this.reload();
  }

  async upload_files(options?: UploadOptions): Promise<File[]> {
    const result = await opfs.upload_files(this.handle, options);
    if (result.length > 0) {
      await this.service.changed(this.handle);
      await this.reload();
    }
    return result;
  }

  async open_directory(name: string, handle: FileSystemDirectoryHandle): Promise<DirectoryHandler> {
    return this.service.directory([...this.segments, name], handle);
  }
}

// createSubscriber rather than $state: a cell made lazily inside the reading effect would count as that effect's own
// state, which Svelte doesn't track, so the first reader would never re-run.
class Revision {
  value = 0;
  private notify: (() => void) | null = null;
  private subscribe = createSubscriber((update) => {
    this.notify = update;
    return () => {
      this.notify = null;
    };
  });

  read(): number {
    this.subscribe();
    return this.value;
  }

  bump(): void {
    this.value++;
    this.notify?.();
  }
}
