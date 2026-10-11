import type { FilesService as IFilesService, FileSystemItem, ListOptions, CreateFileOptions, UploadOptions } from "./type";
import { SvelteMap } from "svelte/reactivity";
import * as opfs from "./opfs";
import { ensure_hierarchy } from "./hierarchy";
import { join_path, split_path } from "./path";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "OPFS file system";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return "FilesService";
  }

  private _root: Promise<FileSystemDirectoryHandle> | null = null;
  private revisions = new SvelteMap<string, number>();

  async init(): Promise<void> {
    await ensure_hierarchy(await this.get_root());
  }

  revision(path: string): number {
    return this.revisions.get(join_path(split_path(path))) ?? 0;
  }

  /**
   * Bumps the revision of the directory that changed. Internal: called by FilesService and DirectoryHandler after
   * every mutation. `resolve()` maps a handle back to its path, since mutations only get handles.
   */
  async changed(directory: FileSystemDirectoryHandle): Promise<void> {
    const segments = await (await this.get_root()).resolve(directory);
    if (segments !== null) this.bump(join_path(segments));
  }

  private async changed_file(file: FileSystemFileHandle): Promise<void> {
    const segments = await (await this.get_root()).resolve(file);
    if (segments !== null) this.bump(join_path(segments.slice(0, -1)));
  }

  private bump(path: string): void {
    this.revisions.set(path, (this.revisions.get(path) ?? 0) + 1);
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

    let resolved = await this.get_root();
    for (const segment of segments) {
      resolved = await resolved.getDirectoryHandle(segment);
    }
    return new DirectoryHandler(this, resolved, segments);
  }

  async list(handle?: FileSystemDirectoryHandle | null, options?: ListOptions): Promise<FileSystemItem[]> {
    return opfs.list_directory(await this.resolve(handle ?? null), options);
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
    return opfs.get_file_at(await this.get_root(), split_path(path));
  }

  async get_directory(path: string): Promise<FileSystemDirectoryHandle | null> {
    return opfs.get_directory_at(await this.get_root(), split_path(path));
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

  /** Wipes OPFS, then rebuilds the empty hierarchy so the OS keeps its folders. */
  async clear(): Promise<void> {
    await opfs.clear_opfs();
    const root = await this.get_root();
    await ensure_hierarchy(root);
    this.revisions.clear();
    await this.changed(root);
  }
}

export class DirectoryHandler {
  readonly segments: string[];
  readonly path: string;
  readonly handle: FileSystemDirectoryHandle;
  readonly service: FilesService;

  items = $state<FileSystemItem[]>([]);
  loading = $state(false);

  private reload_id = 0;

  constructor(service: FilesService, handle: FileSystemDirectoryHandle, segments: string[]) {
    this.service = service;
    this.handle = handle;
    this.segments = segments;
    this.path = "/" + segments.join("/");
    this.reload().catch((error) => console.error(`[FilesService] Failed to list ${this.path}`, error));
  }

  get name(): string {
    return this.segments.length === 0 ? "/" : this.segments[this.segments.length - 1];
  }

  get is_root(): boolean {
    return this.segments.length === 0;
  }

  async reload(): Promise<void> {
    const id = ++this.reload_id;
    this.loading = true;
    try {
      const items = await opfs.list_directory(this.handle);
      // An older listing resolving after a newer one would show stale contents.
      if (id === this.reload_id) this.items = items;
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
