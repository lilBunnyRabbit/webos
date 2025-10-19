# File System API

A comprehensive TypeScript API for interacting with the browser's **Origin Private File System (OPFS)**.

## Overview

This module provides a clean, type-safe interface for all OPFS operations, making it easy to work with files and directories in the browser without dealing with the low-level File System API directly.

## Installation

The API is part of the core module and can be imported as:

```typescript
import * as FileAPI from "@/core/api/file";
import type { FileSystemItem, StorageEstimate } from "@/core/api/file.types";
```

## Core Functions

### Getting Started

#### `getOPFSRoot()`
Get the root directory handle of the OPFS.

```typescript
const root = await FileAPI.getOPFSRoot();
```

**Returns:** `Promise<FileSystemDirectoryHandle>`

---

### Directory Operations

#### `listDirectory(dirHandle, options?)`
List all items in a directory with optional metadata.

```typescript
const items = await FileAPI.listDirectory(dirHandle, {
  includeMetadata: true, // Include size and lastModified for files
  sort: (a, b) => a.name.localeCompare(b.name) // Custom sort function
});
```

**Parameters:**
- `dirHandle`: `FileSystemDirectoryHandle` - Directory to list
- `options`: `DirectoryListOptions` (optional)
  - `includeMetadata`: boolean (default: `true`) - Include file metadata
  - `sort`: Function (optional) - Custom sort function

**Returns:** `Promise<FileSystemItem[]>`

#### `createDirectory(parent, name)`
Create a new directory.

```typescript
const newDir = await FileAPI.createDirectory(root, "my-folder");
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - Name of the new directory

**Returns:** `Promise<FileSystemDirectoryHandle>`

#### `getDirectoryHandle(parent, name, options?)`
Get or create a directory handle.

```typescript
const dir = await FileAPI.getDirectoryHandle(root, "my-folder", { create: true });
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - Directory name
- `options`: `{ create?: boolean }` (optional)

**Returns:** `Promise<FileSystemDirectoryHandle>`

#### `getDirectorySize(dirHandle)`
Get the total size of a directory recursively.

```typescript
const sizeInBytes = await FileAPI.getDirectorySize(dirHandle);
console.log(FileAPI.formatBytes(sizeInBytes)); // "1.5 MB"
```

**Parameters:**
- `dirHandle`: `FileSystemDirectoryHandle` - Directory to measure

**Returns:** `Promise<number>` - Size in bytes

---

### File Operations

#### `createFile(parent, name, options?)`
Create a new file with optional content.

```typescript
// Create empty file
await FileAPI.createFile(root, "notes.txt");

// Create file with content
await FileAPI.createFile(root, "hello.txt", {
  content: "Hello, World!",
  overwrite: false
});

// Create file with binary content
await FileAPI.createFile(root, "data.bin", {
  content: new Uint8Array([1, 2, 3, 4])
});
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - File name
- `options`: `CreateFileOptions` (optional)
  - `content`: string | Blob | BufferSource - Initial content
  - `overwrite`: boolean (default: `false`) - Overwrite if exists

**Returns:** `Promise<FileSystemFileHandle>`

#### `getFileHandle(parent, name, options?)`
Get or create a file handle.

```typescript
const file = await FileAPI.getFileHandle(root, "data.txt", { create: true });
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - File name
- `options`: `{ create?: boolean }` (optional)

**Returns:** `Promise<FileSystemFileHandle>`

#### `writeFile(fileHandle, content)`
Write content to a file.

```typescript
await FileAPI.writeFile(fileHandle, "New content");
await FileAPI.writeFile(fileHandle, new Blob(["Binary data"]));
await FileAPI.writeFile(fileHandle, new Uint8Array([1, 2, 3]));
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File handle
- `content`: string | Blob | BufferSource - Content to write

**Returns:** `Promise<void>`

#### `readFile(fileHandle)`
Read a file as a File object.

```typescript
const file = await FileAPI.readFile(fileHandle);
console.log(file.name, file.size, file.type);
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File handle

**Returns:** `Promise<File>`

#### `readFileAsText(fileHandle)`
Read a file as text.

```typescript
const text = await FileAPI.readFileAsText(fileHandle);
console.log(text);
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File handle

**Returns:** `Promise<string>`

#### `readFileAsArrayBuffer(fileHandle)`
Read a file as ArrayBuffer.

```typescript
const buffer = await FileAPI.readFileAsArrayBuffer(fileHandle);
const bytes = new Uint8Array(buffer);
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File handle

**Returns:** `Promise<ArrayBuffer>`

#### `readFileAsBlob(fileHandle)`
Read a file as Blob.

```typescript
const blob = await FileAPI.readFileAsBlob(fileHandle);
const url = URL.createObjectURL(blob);
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File handle

**Returns:** `Promise<Blob>`

---

### Delete Operations

#### `deleteEntry(parent, name, options?)`
Delete a file or directory.

```typescript
// Delete file
await FileAPI.deleteEntry(root, "old-file.txt");

// Delete directory recursively
await FileAPI.deleteEntry(root, "old-folder", { recursive: true });
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - Name of item to delete
- `options`: `DeleteEntryOptions` (optional)
  - `recursive`: boolean (default: `false`) - Recursively delete directories

**Returns:** `Promise<void>`

#### `deleteHandle(handle, options?)`
Delete using a handle directly.

```typescript
await FileAPI.deleteHandle(fileHandle);
await FileAPI.deleteHandle(dirHandle, { recursive: true });
```

**Parameters:**
- `handle`: `FileSystemFileHandle | FileSystemDirectoryHandle` - Handle to delete
- `options`: `DeleteEntryOptions` (optional)

**Returns:** `Promise<void>`

---

### File Transfer Operations

#### `downloadFile(fileHandle, fileName?)`
Download a file from OPFS to the user's local file system.

```typescript
await FileAPI.downloadFile(fileHandle);
await FileAPI.downloadFile(fileHandle, "custom-name.txt");
```

**Parameters:**
- `fileHandle`: `FileSystemFileHandle` - File to download
- `fileName`: string (optional) - Custom download name

**Returns:** `Promise<void>`

#### `uploadFiles(targetDir, options?)`
Upload files from the user's local file system to OPFS.

```typescript
// Upload multiple files
const files = await FileAPI.uploadFiles(root, {
  multiple: true,
  accept: "image/*" // Only images
});

console.log(`Uploaded ${files.length} files`);
```

**Parameters:**
- `targetDir`: `FileSystemDirectoryHandle` - Target directory
- `options`: `UploadFilesOptions` (optional)
  - `multiple`: boolean (default: `true`) - Allow multiple files
  - `accept`: string (optional) - File type filter (e.g., "image/*", ".pdf")

**Returns:** `Promise<File[]>` - Array of uploaded files

#### `copyFile(sourceHandle, targetDir, newName?)`
Copy a file from one directory to another.

```typescript
const copiedFile = await FileAPI.copyFile(sourceFile, targetDir);
const renamedCopy = await FileAPI.copyFile(sourceFile, targetDir, "copy.txt");
```

**Parameters:**
- `sourceHandle`: `FileSystemFileHandle` - Source file
- `targetDir`: `FileSystemDirectoryHandle` - Target directory
- `newName`: string (optional) - New name for the copy

**Returns:** `Promise<FileSystemFileHandle>`

#### `moveFile(sourceParent, sourceHandle, targetDir, newName?)`
Move a file from one directory to another.

```typescript
await FileAPI.moveFile(sourceDir, fileHandle, targetDir);
await FileAPI.moveFile(sourceDir, fileHandle, targetDir, "moved.txt");
```

**Parameters:**
- `sourceParent`: `FileSystemDirectoryHandle` - Source directory
- `sourceHandle`: `FileSystemFileHandle` - File to move
- `targetDir`: `FileSystemDirectoryHandle` - Target directory
- `newName`: string (optional) - New name after moving

**Returns:** `Promise<FileSystemFileHandle>`

---

### Storage Management

#### `getStorageEstimate()`
Get storage usage and quota information.

```typescript
const { usage, quota } = await FileAPI.getStorageEstimate();
console.log(`Using ${usage} of ${quota} bytes`);
console.log(`${((usage / quota) * 100).toFixed(1)}% used`);
```

**Returns:** `Promise<StorageEstimate>`
- `usage`: number - Bytes used
- `quota`: number - Total bytes available

#### `exists(parent, name, kind?)`
Check if a file or directory exists.

```typescript
const fileExists = await FileAPI.exists(root, "data.txt", "file");
const dirExists = await FileAPI.exists(root, "folder", "directory");
const exists = await FileAPI.exists(root, "something"); // Check both
```

**Parameters:**
- `parent`: `FileSystemDirectoryHandle` - Parent directory
- `name`: string - Name to check
- `kind`: "file" | "directory" (optional) - Type to check for

**Returns:** `Promise<boolean>`

#### `clearOPFS()`
Clear all contents of OPFS (use with caution!).

```typescript
if (confirm("Delete all files?")) {
  await FileAPI.clearOPFS();
}
```

**Returns:** `Promise<void>`

---

### Utility Functions

#### `formatBytes(bytes)`
Format bytes to human-readable string.

```typescript
FileAPI.formatBytes(0);           // "0 B"
FileAPI.formatBytes(1024);        // "1.00 KB"
FileAPI.formatBytes(1536);        // "1.50 KB"
FileAPI.formatBytes(1048576);     // "1.00 MB"
FileAPI.formatBytes(1073741824);  // "1.00 GB"
```

**Parameters:**
- `bytes`: number - Number of bytes

**Returns:** string - Formatted string (e.g., "1.50 MB")

---

## Type Definitions

### `FileSystemItem`
```typescript
interface FileSystemItem {
  name: string;
  kind: "file" | "directory";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  size?: number;          // File size in bytes (files only)
  lastModified?: number;  // Last modified timestamp (files only)
}
```

### `StorageEstimate`
```typescript
interface StorageEstimate {
  usage: number;  // Bytes used
  quota: number;  // Total bytes available
}
```

### `DirectoryListOptions`
```typescript
interface DirectoryListOptions {
  includeMetadata?: boolean;  // Include file metadata (default: true)
  sort?: (a: FileSystemItem, b: FileSystemItem) => number;  // Custom sort
}
```

### `CreateFileOptions`
```typescript
interface CreateFileOptions {
  content?: string | Blob | BufferSource;  // Initial content
  overwrite?: boolean;  // Overwrite if exists (default: false)
}
```

### `DeleteEntryOptions`
```typescript
interface DeleteEntryOptions {
  recursive?: boolean;  // Recursively delete directories (default: false)
}
```

### `UploadFilesOptions`
```typescript
interface UploadFilesOptions {
  multiple?: boolean;  // Allow multiple files (default: true)
  accept?: string;     // File type filter (e.g., "image/*", ".pdf")
}
```

---

## Complete Example

```typescript
import * as FileAPI from "@/core/api/file";

async function fileSystemDemo() {
  // Get root directory
  const root = await FileAPI.getOPFSRoot();
  
  // Create directory structure
  const docsDir = await FileAPI.createDirectory(root, "documents");
  const imagesDir = await FileAPI.createDirectory(root, "images");
  
  // Create a text file
  await FileAPI.createFile(docsDir, "readme.txt", {
    content: "Hello, OPFS!"
  });
  
  // Upload images from user
  const uploadedFiles = await FileAPI.uploadFiles(imagesDir, {
    accept: "image/*"
  });
  
  console.log(`Uploaded ${uploadedFiles.length} images`);
  
  // List all documents
  const docs = await FileAPI.listDirectory(docsDir);
  for (const doc of docs) {
    console.log(`${doc.name} (${FileAPI.formatBytes(doc.size || 0)})`);
  }
  
  // Read a file
  const fileHandle = await FileAPI.getFileHandle(docsDir, "readme.txt");
  const content = await FileAPI.readFileAsText(fileHandle);
  console.log("Content:", content);
  
  // Update the file
  await FileAPI.writeFile(fileHandle, "Updated content!");
  
  // Download a file
  await FileAPI.downloadFile(fileHandle, "readme-download.txt");
  
  // Check storage usage
  const { usage, quota } = await FileAPI.getStorageEstimate();
  console.log(`Storage: ${FileAPI.formatBytes(usage)} / ${FileAPI.formatBytes(quota)}`);
  
  // Copy a file
  await FileAPI.copyFile(fileHandle, root, "readme-copy.txt");
  
  // Clean up
  await FileAPI.deleteEntry(docsDir, "readme.txt");
  await FileAPI.deleteEntry(root, "documents", { recursive: true });
}
```

---

## Browser Compatibility

The OPFS API is available in:
- ✅ Chrome/Edge 86+
- ✅ Firefox 111+
- ✅ Safari 15.2+

Requires:
- 🔒 HTTPS (or localhost for development)
- 🔒 Secure context

---

## Best Practices

1. **Always handle errors**: Wrap API calls in try-catch blocks
2. **Check existence**: Use `exists()` before operations that might fail
3. **Clean up resources**: Delete temporary files and unused directories
4. **Monitor storage**: Check `getStorageEstimate()` before large operations
5. **Use transactions**: Group related operations together
6. **Validate names**: Sanitize file/directory names from user input

---

## Integration

This API is used throughout the WebOS:
- 📁 **File Explorer**: Complete file management UI
- 🖼️ **Media Preview**: Opens files for viewing
- 🗂️ **Other apps**: Can store and retrieve files from OPFS

Import and use in any app:
```typescript
import * as FileAPI from "@/core/api/file";
```

