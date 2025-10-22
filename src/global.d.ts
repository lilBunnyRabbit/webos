/**
 * Global type augmentations for the File System Access API
 * 
 * This extends the existing FileSystemDirectoryHandle interface through
 * TypeScript's declaration merging to add async iteration support.
 */

interface FileSystemDirectoryHandle {
  /**
   * Returns an async iterable iterator over the entries in the directory.
   * Each entry is a [name, handle] pair.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  
  /**
   * Returns an async iterable iterator over the entries in the directory.
   * Each entry is a [name, handle] pair.
   */
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
  
  /**
   * Returns an async iterable iterator over the keys (names) in the directory.
   */
  keys(): AsyncIterableIterator<string>;
  
  /**
   * Returns an async iterable iterator over the values (handles) in the directory.
   */
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

