/**
 * File System API - OPFS (Origin Private File System) operations
 * 
 * This module provides a comprehensive API for interacting with the browser's
 * Origin Private File System (OPFS).
 */

import type {
  FileSystemItem,
  StorageEstimate,
  DirectoryListOptions,
  CreateFileOptions,
  DeleteEntryOptions,
  UploadFilesOptions,
} from "./file.types";

/**
 * Get the root directory handle of the OPFS
 */
export async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

/**
 * List all items in a directory
 */
export async function listDirectory(
  dirHandle: FileSystemDirectoryHandle,
  options: DirectoryListOptions = {}
): Promise<FileSystemItem[]> {
  const { includeMetadata = true, sort } = options;
  const items: FileSystemItem[] = [];

  for await (const [name, handle] of dirHandle.entries()) {
    const item: FileSystemItem = {
      name,
      kind: handle.kind,
      handle,
    };

    // Get file metadata
    if (includeMetadata && handle.kind === "file") {
      try {
        const file = await handle.getFile();
        item.size = file.size;
        item.lastModified = file.lastModified;
      } catch (err) {
        console.warn(`Failed to get file metadata for ${name}:`, err);
      }
    }

    items.push(item);
  }

  // Sort items
  if (sort) {
    items.sort(sort);
  } else {
    // Default sort: directories first, then files, both alphabetically
    items.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return items;
}

/**
 * Get or create a directory handle
 */
export async function getDirectoryHandle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(name, options);
}

/**
 * Get or create a file handle
 */
export async function getFileHandle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemFileHandle> {
  return await parent.getFileHandle(name, options);
}

/**
 * Create a new directory
 */
export async function createDirectory(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(name, { create: true });
}

/**
 * Create a new file with optional content
 */
export async function createFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: CreateFileOptions = {}
): Promise<FileSystemFileHandle> {
  const { content = "", overwrite = false } = options;

  // Check if file exists
  if (!overwrite) {
    try {
      await parent.getFileHandle(name);
      throw new Error(`File "${name}" already exists`);
    } catch (err) {
      // File doesn't exist, proceed with creation
      if (err instanceof Error && !err.message.includes("already exists")) {
        // Expected error when file doesn't exist
      }
    }
  }

  const fileHandle = await parent.getFileHandle(name, { create: true });
  
  if (content) {
    await writeFile(fileHandle, content);
  }

  return fileHandle;
}

/**
 * Write content to a file
 */
export async function writeFile(
  fileHandle: FileSystemFileHandle,
  content: string | Blob | BufferSource
): Promise<void> {
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Read a file as a File object
 */
export async function readFile(fileHandle: FileSystemFileHandle): Promise<File> {
  return await fileHandle.getFile();
}

/**
 * Read a file as text
 */
export async function readFileAsText(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return await file.text();
}

/**
 * Read a file as ArrayBuffer
 */
export async function readFileAsArrayBuffer(fileHandle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await fileHandle.getFile();
  return await file.arrayBuffer();
}

/**
 * Read a file as Blob
 */
export async function readFileAsBlob(fileHandle: FileSystemFileHandle): Promise<Blob> {
  const file = await fileHandle.getFile();
  return new Blob([file], { type: file.type });
}

/**
 * Delete a file or directory
 */
export async function deleteEntry(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: DeleteEntryOptions = {}
): Promise<void> {
  const { recursive = false } = options;
  await parent.removeEntry(name, { recursive });
}

/**
 * Delete a file or directory using its handle
 * Note: This requires the handle's parent to be available
 * Use deleteEntry instead if you have access to the parent directory
 */
export async function deleteHandle(
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  options: DeleteEntryOptions = {}
): Promise<void> {
  const { recursive = false } = options;
  // @ts-expect-error - remove() is available but not in all TypeScript definitions
  await handle.remove({ recursive });
}

/**
 * Check if a file or directory exists
 */
export async function exists(
  parent: FileSystemDirectoryHandle,
  name: string,
  kind?: "file" | "directory"
): Promise<boolean> {
  try {
    if (kind === "file") {
      await parent.getFileHandle(name);
    } else if (kind === "directory") {
      await parent.getDirectoryHandle(name);
    } else {
      // Try both
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        await parent.getDirectoryHandle(name);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage estimate (usage and quota)
 */
export async function getStorageEstimate(): Promise<StorageEstimate> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage || 0,
    quota: estimate.quota || 0,
  };
}

/**
 * Download a file from OPFS to the user's local file system
 */
export async function downloadFile(
  fileHandle: FileSystemFileHandle,
  fileName?: string
): Promise<void> {
  const file = await fileHandle.getFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Upload files from the user's local file system to OPFS
 * Returns a promise that resolves when the file picker is opened
 */
export async function uploadFiles(
  targetDir: FileSystemDirectoryHandle,
  options: UploadFilesOptions = {}
): Promise<File[]> {
  const { multiple = true, accept } = options;

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) {
      input.accept = accept;
    }

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }

      try {
        const uploadedFiles: File[] = [];
        for (const file of Array.from(files)) {
          const fileHandle = await targetDir.getFileHandle(file.name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(file);
          await writable.close();
          uploadedFiles.push(file);
        }
        resolve(uploadedFiles);
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => {
      resolve([]);
    };

    input.click();
  });
}

/**
 * Copy a file from one directory to another
 */
export async function copyFile(
  sourceHandle: FileSystemFileHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string
): Promise<FileSystemFileHandle> {
  const file = await sourceHandle.getFile();
  const targetName = newName || file.name;
  const targetHandle = await targetDir.getFileHandle(targetName, { create: true });
  await writeFile(targetHandle, file);
  return targetHandle;
}

/**
 * Move a file from one directory to another
 */
export async function moveFile(
  sourceParent: FileSystemDirectoryHandle,
  sourceHandle: FileSystemFileHandle,
  targetDir: FileSystemDirectoryHandle,
  newName?: string
): Promise<FileSystemFileHandle> {
  const file = await sourceHandle.getFile();
  const targetName = newName || file.name;
  
  // Copy to target
  const targetHandle = await copyFile(sourceHandle, targetDir, targetName);
  
  // Delete from source
  await deleteEntry(sourceParent, file.name);
  
  return targetHandle;
}

/**
 * Get the size of a directory (recursively)
 */
export async function getDirectorySize(dirHandle: FileSystemDirectoryHandle): Promise<number> {
  let totalSize = 0;
  const items = await listDirectory(dirHandle);

  for (const item of items) {
    if (item.kind === "file" && item.size) {
      totalSize += item.size;
    } else if (item.kind === "directory") {
      totalSize += await getDirectorySize(item.handle as FileSystemDirectoryHandle);
    }
  }

  return totalSize;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Clear all contents of OPFS (use with caution!)
 * This removes all files and directories in the OPFS root
 */
export async function clearOPFS(): Promise<void> {
  const root = await getOPFSRoot();
  const items = await listDirectory(root, { includeMetadata: false });
  
  for (const item of items) {
    await deleteEntry(root, item.name, { recursive: true });
  }
}

