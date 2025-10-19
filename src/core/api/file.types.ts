/**
 * File System API types and interfaces
 */

export interface FileSystemItem {
  name: string;
  kind: "file" | "directory";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  size?: number;
  lastModified?: number;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

export interface DirectoryListOptions {
  /**
   * Whether to include file metadata (size, lastModified)
   * @default true
   */
  includeMetadata?: boolean;
  /**
   * Custom sort function for items
   */
  sort?: (a: FileSystemItem, b: FileSystemItem) => number;
}

export interface CreateFileOptions {
  /**
   * Initial content for the file
   */
  content?: string | Blob | BufferSource;
  /**
   * Whether to overwrite if file exists
   * @default false
   */
  overwrite?: boolean;
}

export interface DeleteEntryOptions {
  /**
   * Whether to recursively delete directories
   * @default false
   */
  recursive?: boolean;
}

export interface UploadFilesOptions {
  /**
   * Whether to allow multiple files
   * @default true
   */
  multiple?: boolean;
  /**
   * Accept file types (e.g., "image/*", ".pdf")
   */
  accept?: string;
}

