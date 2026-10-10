import type { FilesService as IFilesService, FileSystemItem, ListOptions, CreateFileOptions, UploadOptions } from "./type";
import * as opfs from "./opfs";
import { split_path } from "./path";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "OPFS file system";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return "FilesService";
  }

  private _root: Promise<FileSystemDirectoryHandle> | null = null;

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
    return opfs.create_directory(await this.resolve(handle), name);
  }

  async create_file(handle: FileSystemDirectoryHandle | null, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle> {
    return opfs.create_file(await this.resolve(handle), name, options);
  }

  async write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void> {
    return opfs.write_file(handle, content);
  }

  async read_file(handle: FileSystemFileHandle): Promise<File> {
    return opfs.read_file(handle);
  }

  async get_file(path: string): Promise<File | null> {
    return opfs.get_file_at(await this.get_root(), split_path(path));
  }

  async delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void> {
    return opfs.delete_entry(await this.resolve(handle), name, options);
  }

  async exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean> {
    return opfs.exists(await this.resolve(handle), name, kind);
  }

  async copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle> {
    return opfs.copy_file(source, await this.resolve(target), new_name);
  }

  async move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle> {
    return opfs.move_file(await this.resolve(source_parent), source, await this.resolve(target), new_name);
  }

  async upload_files(target: FileSystemDirectoryHandle | null, options?: UploadOptions): Promise<File[]> {
    return opfs.upload_files(await this.resolve(target), options);
  }

  async download_file(handle: FileSystemFileHandle, file_name?: string): Promise<void> {
    return opfs.download_file(handle, file_name);
  }

  async get_storage_estimate(): Promise<{ usage: number; quota: number }> {
    return opfs.get_storage_estimate();
  }

  async get_directory_size(handle: FileSystemDirectoryHandle | null): Promise<number> {
    return opfs.get_directory_size(await this.resolve(handle ?? null));
  }

  async clear(): Promise<void> {
    return opfs.clear_opfs();
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
    return this.segments.length === 0 ? "~" : this.segments[this.segments.length - 1];
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
    await this.reload();
    return result;
  }

  async create_file(name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle> {
    const result = await opfs.create_file(this.handle, name, options);
    await this.reload();
    return result;
  }

  async delete_entry(name: string, options?: { recursive?: boolean }): Promise<void> {
    await opfs.delete_entry(this.handle, name, options);
    await this.reload();
  }

  async upload_files(options?: UploadOptions): Promise<File[]> {
    const result = await opfs.upload_files(this.handle, options);
    if (result.length > 0) {
      await this.reload();
    }
    return result;
  }

  async open_directory(name: string, handle: FileSystemDirectoryHandle): Promise<DirectoryHandler> {
    return this.service.directory([...this.segments, name], handle);
  }
}
