# FilesService

Key `files` · Depends on: none · ADR: [ADR-005](../../adrs/005-files-service.md), [ADR-018](../../adrs/018-file-associations.md) (path lookup) · Source: `src/lib/core/api/services/files/`, UI in `src/lib/core/components/files/`

## Purpose

The filesystem. Everything lives in the browser's Origin Private File System (OPFS). There's no backend and no access to the user's real disk, apart from the upload picker and downloads.

It's built in three layers, the reference split from [CONVENTIONS](../../CONVENTIONS.md#three-layers-of-logic):

```
opfs.ts            pure async functions over FileSystem*Handle, no Svelte
   ↑
DirectoryHandler   reactive snapshot of one directory ($state items, loading)
   ↑
FilesService       caches the root handle, makes DirectoryHandlers, exposes direct ops (null → root)
```

| File | Contents |
|------|----------|
| `type.ts` | `FilesService` interface, `FileSystemItem` union, option types |
| `opfs.ts` | All OPFS calls, `available_name`, `default_sort` |
| `path.ts` | `split_path`, `join_path` |
| `service.svelte.ts` | `FilesService` class and `DirectoryHandler` class |
| `index.ts` | `export * from "./type"` |

## Paths

Handles are what OPFS operates on. Paths exist for identity, display, and anything that has to be JSON (app props, ADR-018).

- Absolute, `/`-separated, rooted at the OPFS root: `/docs/a.txt`. Root is `/`, displayed as `~`.
- Two forms. `segments: string[]` is primary (`[]` is root, `["docs", "photos"]`). `path` is derived as `"/" + segments.join("/")`.
- No `.`/`..` handling, no escaping. Names are whatever OPFS accepts.

| Helper | Signature | Notes |
|--------|-----------|-------|
| `split_path` | `(path: string) => string[]` | Drops empty segments: `"//docs/"` → `["docs"]` |
| `join_path` | `(segments: string[], name?: string) => string` | `(["docs"], "a.txt")` → `"/docs/a.txt"`, `([])` → `"/"` |

Only `get_file(path)` takes a path. Every other method takes handles.

## Types

```ts
type FileSystemItem = FileSystemFileItem | FileSystemDirectoryItem;

interface FileSystemFileItem { name; kind: "file"; handle: FileSystemFileHandle; size?; last_modified?; type? }
interface FileSystemDirectoryItem { name; kind: "directory"; handle: FileSystemDirectoryHandle }

interface ListOptions { include_metadata?: boolean /* default true */; sort?: (a, b) => number /* default default_sort */ }
interface CreateFileOptions { content?: string | Blob | BufferSource; overwrite?: boolean }
interface UploadOptions { multiple?: boolean /* default true */; accept?: string }
```

`size`, `last_modified` and `type` come from `handle.getFile()` and are missing when `include_metadata` is false or the read failed (logged with `console.warn`, the item stays in the list).

## Public API

Every directory parameter typed `FileSystemDirectoryHandle | null` means the root when `null`.

| Member | Signature | Notes |
|--------|-----------|-------|
| `get_root` | `() => Promise<FileSystemDirectoryHandle>` | Cached. See [Lifecycle](#lifecycle) |
| `directory` | `(segments, handle?) => Promise<DirectoryHandler>` | Wraps `handle` (root if omitted) in a new handler that starts listing straight away. `segments` is only a label, see [gotchas](#behaviour--invariants) |
| `list` | `(handle?, options?) => Promise<FileSystemItem[]>` | One-shot listing, sorted |
| `create_directory` | `(handle, name) => Promise<FileSystemDirectoryHandle>` | Auto-renames on a clash |
| `create_file` | `(handle, name, options?) => Promise<FileSystemFileHandle>` | Auto-renames unless `overwrite`. Writes `content` if given (`""` with `overwrite` truncates) |
| `write_file` | `(handle, content) => Promise<void>` | Replaces contents. Aborts the writable on failure so the lock is released |
| `read_file` | `(handle) => Promise<File>` | |
| `get_file` | `(path) => Promise<File \| null>` | Path lookup (ADR-018). `null` for missing, a directory at that path, or an invalid name. Other errors throw |
| `delete_entry` | `(handle, name, { recursive? }) => Promise<void>` | `recursive` defaults to `false`; a non-empty directory throws without it |
| `exists` | `(handle, name, kind?) => Promise<boolean>` | Without `kind`, tries file then directory. Any error is `false` |
| `copy_file` | `(source, target, new_name?) => Promise<FileSystemFileHandle>` | Auto-renames. Read the result's `name` |
| `move_file` | `(source_parent, source, target, new_name?) => Promise<FileSystemFileHandle>` | Copy then delete. Auto-renames. Same name into the same directory is a no-op that returns `source` |
| `upload_files` | `(target, options?) => Promise<File[]>` | Opens the native file picker. See [Upload flow](#upload-flow) |
| `download_file` | `(handle, file_name?) => Promise<void>` | Object URL + `<a download>`. Revokes the URL after 40 s, since revoking at once cancels the download in Firefox and Safari |
| `get_storage_estimate` | `() => Promise<{ usage; quota }>` | `navigator.storage.estimate()`, missing values become `0`. Covers the whole origin, not only OPFS |
| `get_directory_size` | `(handle) => Promise<number>` | Recursive byte sum. Sequential, so slow on deep trees. Files whose metadata failed count as 0 |
| `clear` | `() => Promise<void>` | Deletes every entry under root, recursively. No confirmation |

`opfs.ts` also exports functions the service doesn't wrap: `get_directory_handle`, `get_file_handle` (both take `{ create }`, the only exact-name open-or-create path), `get_file_at`, `read_file_as_text`, `read_file_as_array_buffer`, `read_file_as_blob`, `available_name`, `default_sort`, `clear_opfs`. Nothing outside the files folder imports them today.

## DirectoryHandler

A reactive snapshot of one directory. Defined in `service.svelte.ts`, not exported through the barrel. Consumers import the type from `$lib/core/api/services/files/service.svelte`.

| Member | Type | Notes |
|--------|------|-------|
| `segments` | `readonly string[]` | As passed to `directory()` |
| `path` | `readonly string` | `"/" + segments.join("/")` |
| `handle` | `readonly FileSystemDirectoryHandle` | What every operation actually uses |
| `service` | `readonly FilesService` | The concrete class |
| `items` | `$state<FileSystemItem[]>` | Last listing, with metadata, `default_sort` |
| `loading` | `$state<boolean>` | True while a reload is in flight |
| `name` | getter | Last segment, or `"~"` at root |
| `is_root` | getter | `segments.length === 0` |
| `reload()` | `Promise<void>` | Re-lists. Overlapping reloads: only the newest one writes `items` and clears `loading` |
| `create_directory(name)` | | `opfs.create_directory`, then `reload()` |
| `create_file(name, options?)` | | `opfs.create_file`, then `reload()` |
| `delete_entry(name, options?)` | | `opfs.delete_entry`, then `reload()` |
| `upload_files(options?)` | | Reloads only if something was uploaded |
| `open_directory(name, handle)` | `Promise<DirectoryHandler>` | `service.directory([...segments, name], handle)`. A new handler each time |

The constructor fires `reload()` itself. That's a side effect in a constructor, but it's intended (ADR-005 "auto-loading"). If that first listing fails, it's only `console.error`ed. `items` stays `[]` and nothing notifies.

There's no handler cache and no cross-instance sync. Two handlers on the same directory are independent snapshots. Changes made through one, or through the direct service ops, or in another window, don't appear in the other until it reloads. ADR-005 records why the path-keyed cache was removed.

## State

| What | Where | Lifetime |
|------|-------|----------|
| Root handle promise | `FilesService._root` | Until a rejection clears it |
| Directory listings | each `DirectoryHandler.items` | Owner's lifetime. Re-read on reload only |
| File contents and metadata | never cached | Re-read on every call |

The service has no `$state` of its own.

## Lifecycle

No `init()` or `destroy()`. Construction sets fields only. The first `get_root()`, called directly or through any `null` handle:

1. Caches the `navigator.storage.getDirectory()` promise. If it rejects (for example, no OPFS in private browsing), the cache is cleared so the next call retries.
2. Fires `navigator.storage.persist()` without awaiting it. A refusal is a `console.warn`, an error a `console.error`. It runs again only if the root cache was cleared.

## Persistence

The data lives in OPFS, so it survives reloads, and with `persist()` granted it's exempt from eviction under storage pressure. The service writes nothing to localStorage. Remembered "open with" choices live in settings (`file_defaults`, see [settings](settings.md)), not here.

## Behaviour & invariants

**Nothing user-facing overwrites.** `create_directory`, `create_file`, `copy_file`, `move_file` and `upload_files` all go through `available_name(dir, name)`:

- Returns `name` if it's free.
- Otherwise it splits at the last dot (a dot at index 0 doesn't count, so dotfiles keep their name as the stem) and tries `stem (1).ext`, `stem (2).ext`, and so on, until `exists()` says free.
- `exists()` without `kind` checks both kinds, so a file can't take a folder's name or the reverse.
- Check-then-create isn't atomic. Two concurrent writers to the same name can both pick the same candidate. The upload loop is sequential, so a single upload is safe.

Exact-name writes exist only through `create_file({ overwrite: true })` and `opfs.get_*_handle({ create: true })`.

**Move is copy + delete.** It copies only files, there's no directory move or copy. The copy gets a new `lastModified`. `source_parent` is trusted: it deletes whatever is named `source.name` there. Rename is `move_file(parent, file, parent, "new.txt")`. If `new.txt` is taken, you get `new (1).txt`.

**Sort.** Directories first, then `localeCompare` with `numeric: true, sensitivity: "base"`, so `file2` sorts before `file10` and case is ignored.

**Gotcha: `directory(segments)` doesn't resolve segments.** `files.directory(["docs"])` returns a handler on the root that's labelled `/docs`. Callers must pass the matching handle. File Explorer only ever does `directory([])` and `open_directory(name, handle)`, so it's consistent.

### Errors

The service has no error types of its own. Native `DOMException`s and `TypeError`s propagate:

| Situation | What happens |
|-----------|--------------|
| Missing entry | `NotFoundError`, except `get_file` → `null` and `exists` → `false` |
| Wrong kind at path | `TypeMismatchError`, except `get_file` → `null` |
| Invalid name (`/`, `..`, empty) | `TypeError`. `exists` swallows it, so `available_name` returns the name unchanged and the create throws |
| Non-empty directory without `recursive` | `InvalidModificationError` |
| Write failure | Writable aborted, error rethrown |
| No OPFS | `get_root` rejects, then retries on the next call |

Reporting is the caller's job. File Explorer turns errors into notifications through `report_file_error` (below).

## Upload flow

1. `upload_files(target, { multiple = true, accept })` creates a detached `<input type="file">` and `click()`s it.
2. `cancel` or an empty selection resolves `[]`.
3. On `change`, each file in turn goes `available_name` → `getFileHandle(name, { create: true })` → `write_file(handle, file)`.
4. The first failure rejects. Files already written stay written.
5. It resolves with the picked `File` objects. Their `.name` is the original name, **not** the name they were saved under after an auto-rename.

`DirectoryHandler.upload_files` reloads only when the result isn't empty. If the picker is dismissed in a way that fires neither `change` nor `cancel`, the promise never settles. In File Explorer that leaves the upload button disabled.

---

## File explorer components

`src/lib/core/components/files/`, shared OS UI. The [File Explorer app](../system-apps.md#file-explorer) is a four-line wrapper around `file-explorer.svelte`.

| File | Responsibility |
|------|----------------|
| `file-explorer.svelte` | Root. Owns navigation state: `handler`, `path_stack: DirectoryHandler[]`, `search`. Starts at `files.directory([])`. Layout: navigation / list / status bar. Shows "Failed to load filesystem" if the root fails |
| `file-explorer-navigation.svelte` | Toolbar: back, reload, breadcrumbs, search input (`bind:search`), new folder, upload |
| `file-list.svelte` | Header row plus a row per item. Filtering, open, delete. Shows 5 skeleton rows while `handler.loading`, "No files found" when empty |
| `file-row.svelte` | File cells: icon, name, `format_bytes(size)`, `last_modified` as a local date (`-` when missing) |
| `directory-row.svelte` | Folder cells: icon, name, `-`, caret. No date |
| `file-explorer-status-bar.svelte` | "N items (x folders, y files)" for the unfiltered directory, plus origin storage usage/quota/% |
| `file-upload-button.svelte` | Calls `handler.upload_files()`, disabled while it runs |
| `file-explorer.errors.ts` | `report_file_error(title, error)`: `console.error`, then an `error` notification from source `"file-explorer"` ([notifications](notifications.md)) |
| `file-icon.svelte` | Phosphor icon by MIME type first, then extension. Generic fallback |

### Navigation model

- `navigate_to(child)` pushes the current handler onto `path_stack`. The child is a fresh handler and lists itself.
- Back pops the stack. Clicking breadcrumb `i` truncates the stack to `i`. Both call `show()`, which **reloads** the target, because stacked handlers aren't watched.
- Breadcrumbs show stack entries by `name`, root as `~`. The current directory is a disabled entry in `text-accent`.
- There's no forward history. Back is disabled at root.
- `search` survives navigation. It filters the current directory only, as a case-insensitive substring of the name.

### Interactions

| Input | Target | Effect |
|-------|--------|--------|
| Double-click | File row | `apps.open(join_path(segments, name), { anchor: cursor })` |
| Double-click | Folder row | Navigate into it |
| Enter | Focused file row | `apps.open`, with the anchor at the row's bottom-left |
| Enter | Focused folder row | Navigate into it |
| Delete, or Backspace with `metaKey` (Cmd on macOS; Ctrl doesn't count) | Focused row | `confirm()`, then delete (folders recursively, "and all its contents") |
| Tab | Rows | Rows are `<button>`s, so Tab moves between them. There's no arrow-key movement or selection model |
| Click | Back / Reload / New folder / Upload | As labelled. New folder uses `prompt()` |
| Click | Breadcrumb | Jump to that ancestor |
| Click × | Search | Clears it |

A single click only focuses the row. There are no context menus, rename, drag-and-drop or multi-select.

### Opening files

`file-list.svelte` builds the absolute path with `join_path(handler.segments, item.name)` and calls `apps.open(path, { anchor })`. Everything else, from the remembered default to tier matching to the "Open with" chooser, lives in AppsService ([file associations](../apps/file-associations.md)). A rejection is reported as `Could not open "{name}"`. "Not found" and "no app" are notified by AppsService itself and resolve `null`.

### Status bar refresh

The `$effect` reads `handler.items`, so it re-fetches the storage estimate on every listing change and directory change, and also every 30 s while mounted.

### Error surfacing

| Action | Reported as |
|--------|-------------|
| Create folder | `Could not create folder "{name}"` |
| Upload | `Upload failed` |
| Delete | `Could not delete "{name}"` |
| Open file / enter folder | `Could not open "{name}"` |
| Back / breadcrumb reload | `Could not open {path}` |
| Initial listing in `DirectoryHandler` constructor | console only |
| Storage estimate | console only |

## Divergence from ADR

- ADR-005 §5 lists `move_file(...): Promise<void>`. The code returns the moved handle. The 2026-10-10 revision note records this, so it's only the body that's stale.
- ADR-005 §6 types `FileSystemItem` as a base interface with `kind: "file" | "directory"`. The code uses a discriminated union, which is better and matches CONVENTIONS.
- ADR-005 §9 specifies `confirm()`/`prompt()`. That's still true, but ADR-019 dialogs exist now and the explorer doesn't use them.
- [CONVENTIONS](../../CONVENTIONS.md#services) says `index.ts` exports types only and that only `init.ts` imports service classes. `type.ts` imports `DirectoryHandler` from the implementation file, so `FilesService.directory()` returns the concrete class, and `DirectoryHandler.service` is the concrete `FilesService`, not the interface. The UI components import the type from `service.svelte` directly. Swapping the files service (ADR-016) would have to keep this exact class.

## Known gaps

- No cross-instance sync, and no watching for external changes (ROADMAP, needs its own brainstorm). `FileSystemObserver` is a candidate platform API for it.
- No rename UI, no directory move or copy, no context menu, no drag-and-drop, no file properties.
- `get_file` returns a `File`, not a handle. A path-based app can read but can't write back without walking the tree itself.
- `upload_files` reports original names, not the saved names.
- Every mutation reloads through the `loading` branch, which swaps the whole list for skeletons. Focus is lost after a keyboard delete, and the list flickers.
- The `DirectoryHandler` constructor's listing failure is invisible to the user.
- No tests, despite `opfs.ts` being shaped for them.
