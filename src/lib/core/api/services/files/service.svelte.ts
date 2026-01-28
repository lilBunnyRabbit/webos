import { SvelteMap } from "svelte/reactivity";
import type { FilesService as IFilesService, FileSystemItem, ListOptions, CreateFileOptions, UploadOptions } from "./type";
import * as opfs from "./opfs";

export class FilesService implements IFilesService {
  name = "FilesService";
  description = "FilesService";

  to_string(): string {
    return "FilesService";
  }

  private _root: Promise<FileSystemDirectoryHandle> | null = null;
  private _directories = new SvelteMap<string, DirectoryHandler>();

  async get_root(): Promise<FileSystemDirectoryHandle> {
    if (!this._root) {
      this._root = opfs.get_root();

      try {
        const persisted = await navigator.storage.persist();
        if (!persisted) {
          console.warn("FilesService: Failed to persist storage");
        }
      } catch (error) {
        console.error("FilesService: Failed to persist storage", error);
      }
    }

    return await this._root;
  }

  private async resolve(handle: FileSystemDirectoryHandle | null): Promise<FileSystemDirectoryHandle> {
    return handle ?? (await this.get_root());
  }

  directory(segments: string[], handle: FileSystemDirectoryHandle): DirectoryHandler {
    const key = "/" + segments.join("/");
    let handler = this._directories.get(key);
    if (!handler) {
      handler = new DirectoryHandler(this, handle, segments);
      this._directories.set(key, handler);
    }
    return handler;
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

  async delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void> {
    return opfs.delete_entry(await this.resolve(handle), name, options);
  }

  async exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean> {
    return opfs.exists(await this.resolve(handle), name, kind);
  }

  async copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle> {
    return opfs.copy_file(source, await this.resolve(target), new_name);
  }

  async move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<void> {
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

  constructor(service: FilesService, handle: FileSystemDirectoryHandle, segments: string[]) {
    this.service = service;
    this.handle = handle;
    this.segments = segments;
    this.path = "/" + segments.join("/");
  }

  get name(): string {
    return this.segments.length === 0 ? "~" : this.segments[this.segments.length - 1];
  }

  get is_root(): boolean {
    return this.segments.length === 0;
  }

  async reload(): Promise<void> {
    this.loading = true;
    try {
      this.items = await opfs.list_directory(this.handle);
    } finally {
      this.loading = false;
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

  open_directory(name: string, handle: FileSystemDirectoryHandle): DirectoryHandler {
    return this.service.directory([...this.segments, name], handle);
  }
}
