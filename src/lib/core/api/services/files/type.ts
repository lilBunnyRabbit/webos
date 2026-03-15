import type { IService } from "../../type";
import type { DirectoryHandler } from "./service.svelte";

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
  overwrite?: boolean;
}

export interface UploadOptions {
  multiple?: boolean;
  accept?: string;
}

export interface FilesService extends IService {
  get_root(): Promise<FileSystemDirectoryHandle>;
  directory(segments: string[], handle?: FileSystemDirectoryHandle | null): Promise<DirectoryHandler>;

  list(handle?: FileSystemDirectoryHandle | null, options?: ListOptions): Promise<FileSystemItem[]>;
  create_directory(handle: FileSystemDirectoryHandle | null, name: string): Promise<FileSystemDirectoryHandle>;
  create_file(handle: FileSystemDirectoryHandle | null, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle>;
  write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void>;
  read_file(handle: FileSystemFileHandle): Promise<File>;
  delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void>;
  exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean>;
  copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle>;
  move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<void>;
  upload_files(target: FileSystemDirectoryHandle | null, options?: UploadOptions): Promise<File[]>;
  download_file(handle: FileSystemFileHandle, file_name?: string): Promise<void>;
  get_storage_estimate(): Promise<{ usage: number; quota: number }>;
  get_directory_size(handle: FileSystemDirectoryHandle | null): Promise<number>;
  clear(): Promise<void>;
}
