# ADR-005: Files Service API Design
**Date:** 2026-01-27
**Status:** Accepted (implemented 2026-01-27, revised 2026-02-07, 2026-10-10, 2026-10-12)

> **Revision 2026-10-12: path-based moves** (owner, [brainstorm](../brainstorm/2026-10-12_multi-select.md))
> - `move_paths(paths, target, on_conflict?)` and `copy_paths(...)` move or copy entries by absolute path into the folder at `target`. Without `on_conflict` a clash keeps both (`available_name()`), which is what drag and drop uses. Moving a folder into itself throws; moving into the folder it's already in is a no-op.
> - `clipboard.paste_files` delegates to them with its conflict question, so the rules exist once.
> - `import_entries(target, entries)` brings in files and folders from outside WebOS (dropped from the OS): a `File` or file handle is stored under a free name, a directory handle is copied recursively. The picker upload and the drop share `opfs.store_file`.

> **Revision 2026-10-12: handlers stay fresh** (owner, [brainstorm](../brainstorm/2026-10-12_explorer-sync.md))
> - `DirectoryHandler` watches its own revision (ADR-021) and re-lists, and watches its ancestors' revisions to notice when it's deleted or moved (`exists` turns `false`). It gains `dispose()`; whoever creates a handler disposes it.
> - `reload()` joins a listing already in flight for the same revision, so a mutation and the watcher list once.

> **Revision 2026-10-10: review pass**
> - **Nothing user-facing overwrites or merges** (owner decision). `create_file`, `create_directory`, `copy_file`, `move_file` and `upload_files` pick a free name via `available_name()`: `name (1).ext`, `name (2).ext`, and so on. Any future drag-and-drop or paste must do the same. Exact-name writes exist only through `create_file({ overwrite: true })` and `get_*_handle({ create: true })`. `create_file` used to throw on a clash; it now renames. `move_file` now returns the moved handle.
> - `move_file` onto the same entry is a no-op. Copy-then-delete used to destroy the file.
> - `write_file` aborts the writable on failure, which releases the file lock.
> - `create_file` with `content: ""` and `overwrite: true` now truncates.
> - Directory listing reads file metadata in parallel and sorts in natural numeric order.
> - `DirectoryHandler.reload()` ignores stale results when reloads overlap.
> - A failed `get_root()` is no longer cached forever. `persist()` no longer blocks the first access.
> - Explorer errors surface as notifications (ADR-006). Search is a plain substring. Back navigation reloads the directory.
> - Cross-instance sync is still open. It gets its own brainstorm (owner decision).

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
DirectoryHandler (reactive)   → Reactive state per directory, uses $state
    ↑
FilesService (factory)        → Creates DirectoryHandlers, provides direct ops
```

### 2. Path Identity System

OPFS handles have no stable identity (`===` fails, `isSameEntry()` is async). Instead, use **paths** for identity and navigation.

Path has two representations:
- **`segments: string[]`** (primary) — e.g. `[]` for root, `["documents", "photos"]` for nested
- **`path: string`** (derived) — `"/" + segments.join("/")` — used for display and keying

The array form is primary because it's more useful for breadcrumbs, navigation, and building child paths.

### 3. DirectoryHandler (No Cross-Instance Caching)

DirectoryHandler is a **reactive object** with `$state` items that auto-loads on construction.

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

  // Navigate to child — creates new handler via service
  async open_directory(name: string, handle: FileSystemDirectoryHandle): Promise<DirectoryHandler>;
}
```

**Note on cross-instance sync:** An earlier design cached DirectoryHandlers in a `SvelteMap<string, DirectoryHandler>` keyed by path, so two file explorers viewing the same directory would share state. This was removed because renaming/moving directories invalidates path-based keys, leading to stale cache entries. Each file explorer now gets its own handler instances. Cross-instance sync can be revisited later via event-based invalidation if needed.

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

// Clear
function clear_opfs(): Promise<void>
```

### 5. FilesService

Thin layer that:
- Caches root handle (with `navigator.storage.persist()` on first access)
- Creates DirectoryHandler instances via `directory(segments, handle?)` (async, defaults to root)
- Exposes direct OPFS operations (resolving `null` handle → root) for apps that don't need DirectoryHandler

```typescript
class FilesService implements IFilesService {
  private _root: Promise<FileSystemDirectoryHandle> | null = null;

  async get_root(): Promise<FileSystemDirectoryHandle>;
  async directory(segments: string[], handle?: FileSystemDirectoryHandle | null): Promise<DirectoryHandler>;

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
- `handler: DirectoryHandler` — current directory
- `path_stack: DirectoryHandler[]` — breadcrumb trail for back navigation
- `search: string` — filter term

Navigation functions:
- `navigate_to(handler)` — push current to stack, set new handler
- `navigate_back()` — pop stack
- `navigate_to_index(i)` — truncate stack to index

New UI elements:
- **Status bar** — Item count + storage usage via `get_storage_estimate()`
- **Create folder button** — Prompts for name, calls `handler.create_directory()`
- **Upload button** — Extracted component, calls `handler.upload_files()`
- **Delete confirmation** — `confirm()` dialog before destructive operations

## Alternatives Considered

### Remove DirectoryHandler entirely (stateless service)
Rejected — DirectoryHandler provides a convenient reactive wrapper with `$state` items. Without it, every component would need to manage loading state and item lists manually.

### Keep current `isSameEntry()` cache scan
Rejected — O(n) async comparison is slow and awkward. Path segments provide identity without async overhead.

### Path-string API everywhere (no handles)
Rejected — OPFS API is handle-based. Converting between paths and handles on every call adds overhead. Handles are the primary identifier for OPFS operations; paths are used for identity and display.

### Cache DirectoryHandlers by path in SvelteMap
Initially implemented but removed — path-based cache keys become stale when directories are renamed or moved. The complexity of cache invalidation outweighed the benefit of cross-instance sync. Can be revisited with event-based invalidation if multiple-explorer sync becomes a priority.

## Consequences

- **Breaking change** — DirectoryHandler API changes, file explorer rewrite needed
- **No cross-instance sync** — Each file explorer gets independent handler instances (trade-off for correctness over stale cache)
- **Testable** — Pure functions in `opfs.ts` can be unit tested without Svelte
- **Composable** — Apps can use service directly (handle-based) or via DirectoryHandler (reactive)
- **Complete** — Feature parity with React version (except file open action, deferred)
- **Auto-loading** — DirectoryHandler loads items on construction, callers don't need to call `reload()`
