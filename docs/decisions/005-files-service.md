# ADR-005: Files Service API Design
**Date:** 2026-01-27
**Status:** Accepted (implemented 2026-01-27)

## Context

The current FilesService has a minimal implementation: `get_directory()` and `upload_file()` on the service, with a `DirectoryHandler` class that wraps navigation and basic operations. The React version had a comprehensive OPFS API with ~20 functions covering full CRUD, copy/move, storage estimates, upload/download, and a status bar showing quota usage.

Key issues with the current implementation:
1. **Missing operations** — No `create_file()` (from scratch), `write_file()`, `read_file_as_text()`, `copy_file()`, `move_file()`, `exists()`, `get_storage_estimate()`, `download_file()`, `get_directory_size()`
2. **Handle identity problem** — DirectoryHandler instances are cached in an array and looked up via async `isSameEntry()` (O(n) async scan). No stable identity for deduplication.
3. **No file content access** — Can upload a File object but can't create files from strings/blobs or read file contents as text/buffer.
4. **No storage awareness** — No way to check quota or usage.
5. **No cross-instance sync** — Two file explorer windows showing the same directory don't share state. Changes in one don't appear in the other.
6. **File explorer gaps** — No status bar, no create folder button, no upload button (commented out), no file open action.

### React Implementation Reference

The React version had two API iterations:
- **`file.ts`** (~380 lines) — Comprehensive pure functions for all OPFS operations
- **`file-2/api.ts`** (~95 lines) — Simplified version with path tracking
- **`file.hooks.ts`** — TanStack Query wrappers with caching/invalidation (provided cross-instance sync)
- **Status bar** — Item count + storage usage display
- **Navigation** — Back, reload, breadcrumbs, search, new folder, upload buttons

## Decision

### 1. Three-Layer Architecture

```
opfs.ts (pure functions)      → Stateless OPFS operations, testable, no Svelte
    ↑
DirectoryHandler (reactive)   → Shared reactive state per directory, uses $state
    ↑
FilesService (registry)       → Caches DirectoryHandlers by path, provides direct ops
```

### 2. Path Identity System

OPFS handles have no stable identity (`===` fails, `isSameEntry()` is async). Instead, use **paths** as canonical identity.

Path has two representations:
- **`segments: string[]`** (primary) — e.g. `[]` for root, `["documents", "photos"]` for nested
- **`path: string`** (derived) — `"/" + segments.join("/")` — used as cache key

The array form is primary because it's more useful for breadcrumbs, navigation, and building child paths. The string form is derived for Map key lookups.

```typescript
// Service maintains path-string → handler cache
private _directories = new SvelteMap<string, DirectoryHandler>();

// Accepts segments array, derives string key internally
directory(segments: string[], handle: FileSystemDirectoryHandle): DirectoryHandler {
  const key = "/" + segments.join("/");
  let handler = this._directories.get(key);
  if (!handler) {
    handler = new DirectoryHandler(this, handle, segments);
    this._directories.set(key, handler);
  }
  return handler;
}
```

This replaces the current `isSameEntry()` array scan with a sync Map lookup.

### 3. Shared Reactive DirectoryHandler

DirectoryHandler is a **shared reactive object** — multiple file explorer windows viewing the same directory get the same instance. Changes in one are immediately visible in the other via Svelte 5 `$state` reactivity.

```typescript
class DirectoryHandler {
  readonly segments: string[];           // e.g. ["documents", "photos"]
  readonly path: string;                 // derived: "/" + segments.join("/")
  readonly handle: FileSystemDirectoryHandle;
  readonly service: FilesService;

  items = $state<FileSystemItem[]>([]);
  loading = $state(false);

  get name(): string;    // last segment, or "~" for root
  get is_root(): boolean; // segments.length === 0

  // Re-fetch directory contents from OPFS
  async reload(): Promise<void>;

  // Mutations — all call reload() after completing
  async create_directory(name: string): Promise<FileSystemDirectoryHandle>;
  async create_file(name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle>;
  async delete_entry(name: string, options?: { recursive?: boolean }): Promise<void>;
  async upload_files(options?: UploadOptions): Promise<File[]>;

  // Navigate to child — returns shared handler from service cache
  // Builds child segments: [...this.segments, name]
  open_directory(name: string, handle: FileSystemDirectoryHandle): DirectoryHandler;
}
```

**Cross-instance sync flow:**
1. Explorer A and Explorer B both call `files.directory(["documents"], handle)` → same instance
2. Explorer A calls `handler.create_file("notes.txt")` → OPFS write → `reload()` → `items` updates
3. Explorer B is bound to the same `handler.items` → UI updates automatically

### 4. Pure OPFS Functions (`opfs.ts`)

Stateless, no Svelte dependency, testable in isolation. DirectoryHandler and service delegate to these.

```typescript
// Root access
function get_root(): Promise<FileSystemDirectoryHandle>

// Directory operations
function list_directory(dir: FileSystemDirectoryHandle, options?: ListOptions): Promise<FileSystemItem[]>
function create_directory(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle>
function get_directory_handle(parent: FileSystemDirectoryHandle, name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
function get_directory_size(dir: FileSystemDirectoryHandle): Promise<number>

// File operations
function get_file_handle(parent: FileSystemDirectoryHandle, name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
function create_file(parent: FileSystemDirectoryHandle, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle>
function write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void>
function read_file(handle: FileSystemFileHandle): Promise<File>
function read_file_as_text(handle: FileSystemFileHandle): Promise<string>
function read_file_as_array_buffer(handle: FileSystemFileHandle): Promise<ArrayBuffer>
function read_file_as_blob(handle: FileSystemFileHandle): Promise<Blob>

// Delete
function delete_entry(parent: FileSystemDirectoryHandle, name: string, options?: { recursive?: boolean }): Promise<void>

// Check
function exists(parent: FileSystemDirectoryHandle, name: string, kind?: "file" | "directory"): Promise<boolean>

// Copy / Move
function copy_file(source: FileSystemFileHandle, target_dir: FileSystemDirectoryHandle, new_name?: string): Promise<FileSystemFileHandle>
function move_file(source_parent: FileSystemDirectoryHandle, source: FileSystemFileHandle, target_dir: FileSystemDirectoryHandle, new_name?: string): Promise<void>

// Transfer (upload/download to local filesystem)
function upload_files(target_dir: FileSystemDirectoryHandle, options?: UploadOptions): Promise<File[]>
function download_file(handle: FileSystemFileHandle, file_name?: string): Promise<void>

// Storage
function get_storage_estimate(): Promise<{ usage: number; quota: number }>

// Utility
function format_bytes(bytes: number): string
function clear_opfs(): Promise<void>
```

### 5. FilesService

Thin layer that:
- Caches root handle (with `navigator.storage.persist()` on first access)
- Maintains `SvelteMap<string, DirectoryHandler>` for shared handler instances
- Exposes direct OPFS operations (resolving `null` handle → root) for apps that don't need DirectoryHandler
- Exposes `directory(path, handle)` for shared reactive access

```typescript
class FilesService implements IFilesService {
  private _root: Promise<FileSystemDirectoryHandle> | null = null;
  private _directories = new SvelteMap<string, DirectoryHandler>();

  async get_root(): Promise<FileSystemDirectoryHandle>;
  directory(segments: string[], handle: FileSystemDirectoryHandle): DirectoryHandler;

  // Direct operations (delegate to opfs.ts, null → root)
  async list(handle?: FileSystemDirectoryHandle | null, options?: ListOptions): Promise<FileSystemItem[]>;
  async create_directory(handle: FileSystemDirectoryHandle | null, name: string): Promise<FileSystemDirectoryHandle>;
  async create_file(handle: FileSystemDirectoryHandle | null, name: string, options?: CreateFileOptions): Promise<FileSystemFileHandle>;
  async write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void>;
  async read_file(handle: FileSystemFileHandle): Promise<File>;
  async delete_entry(handle: FileSystemDirectoryHandle | null, name: string, options?: { recursive?: boolean }): Promise<void>;
  async exists(handle: FileSystemDirectoryHandle | null, name: string, kind?: "file" | "directory"): Promise<boolean>;
  async copy_file(source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<FileSystemFileHandle>;
  async move_file(source_parent: FileSystemDirectoryHandle | null, source: FileSystemFileHandle, target: FileSystemDirectoryHandle | null, new_name?: string): Promise<void>;
  async upload_files(target: FileSystemDirectoryHandle | null, options?: UploadOptions): Promise<File[]>;
  async download_file(handle: FileSystemFileHandle, file_name?: string): Promise<void>;
  async get_storage_estimate(): Promise<{ usage: number; quota: number }>;
  async get_directory_size(handle: FileSystemDirectoryHandle | null): Promise<number>;
  async clear(): Promise<void>;
}
```

### 6. Types

```typescript
interface FileSystemItem {
  name: string;
  kind: "file" | "directory";
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
}

interface FileSystemFileItem extends FileSystemItem {
  kind: "file";
  handle: FileSystemFileHandle;
  size?: number;
  last_modified?: number;
  type?: string;
}

interface FileSystemDirectoryItem extends FileSystemItem {
  kind: "directory";
  handle: FileSystemDirectoryHandle;
}

interface ListOptions {
  include_metadata?: boolean;
  sort?: (a: FileSystemItem, b: FileSystemItem) => number;
}

interface CreateFileOptions {
  content?: string | Blob | BufferSource;
  overwrite?: boolean;
}

interface UploadOptions {
  multiple?: boolean;
  accept?: string;
}
```

### 7. Default Sort

Directories first, then files, both alphabetically by name (matches React version).

### 8. Storage Persistence

Call `navigator.storage.persist()` on first `get_root()` call to request persistent storage (avoids browser eviction under storage pressure).

### 9. File Explorer Updates

Navigation state lives in the file explorer component (not the service):
- `handler: DirectoryHandler` — current directory (shared reactive object)
- `path_stack: DirectoryHandler[]` — breadcrumb trail for back navigation
- `search: string` — filter term

Navigation functions:
- `navigate_to(handler)` — push current to stack, set new handler
- `navigate_back()` — pop stack
- `navigate_to_index(i)` — truncate stack to index

New UI elements:
- **Status bar** — Item count + storage usage via `get_storage_estimate()`
- **Create folder button** — Prompts for name, calls `handler.create_directory()`
- **Upload button** — Calls `handler.upload_files()`
- **File open action** — Double-click files to open in appropriate app

## Alternatives Considered

### Remove DirectoryHandler entirely (stateless service)
Rejected — Without shared reactive state, two file explorers viewing the same directory wouldn't stay in sync. Would need a separate reactive invalidation layer (version counters + effects), which is more complex than shared instances.

### Keep current `isSameEntry()` cache scan
Rejected — O(n) async comparison is slow and awkward. Path strings provide O(1) sync lookup via Map.

### Path-string API everywhere (no handles)
Rejected — OPFS API is handle-based. Converting between paths and handles on every call adds overhead. Handles are the primary identifier for OPFS operations; paths are used only for caching/identity.

### Full reactive cache (service caches items per directory)
Considered but DirectoryHandler already does this. The handler IS the reactive cache — it holds `$state` items and exposes `reload()`. No need for a separate cache layer.

## Consequences

- **Breaking change** — DirectoryHandler API changes, file explorer rewrite needed
- **Cross-instance sync** — Multiple explorers on same directory share state automatically
- **Testable** — Pure functions in `opfs.ts` can be unit tested without Svelte
- **Composable** — Apps can use service directly (handle-based) or via DirectoryHandler (reactive)
- **Complete** — Feature parity with React version
- **Path dependency** — Components must track and pass path strings; path must match actual filesystem hierarchy
