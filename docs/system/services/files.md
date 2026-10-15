# FilesService

Key `files` · Depends on: none · ADR: [ADR-005](../../adrs/005-files-service.md), [ADR-018](../../adrs/018-file-associations.md) (path lookup), [ADR-021](../../adrs/021-file-system-hierarchy.md) (hierarchy, native moves, revisions) · Source: `src/lib/core/api/services/files/`, UI in `src/lib/core/components/files/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The filesystem. Everything lives in the browser's Origin Private File System (OPFS). There's no backend and no access to the user's real disk, apart from the upload picker and "Save to disk…" (`export_to_disk`). OPFS itself lives inside the browser profile as numbered blobs, so it can never be shown in Finder or Explorer.

It's built in three layers, the reference split from [CONVENTIONS](../../CONVENTIONS.md#three-layers-of-logic):

```
opfs.ts            pure async functions over FileSystem*Handle, no Svelte
   ↑
DirectoryHandler   live view of one directory ($state.raw items, loading, exists), watches revisions
   ↑
FilesService       caches the root handle, builds the hierarchy at init, tracks per-directory revisions,
                   makes DirectoryHandlers, exposes direct ops (null → root)
```

| File | Contents |
|------|----------|
| `type.ts` | `FilesService` interface, `FileSystemItem` union, option types |
| `opfs.ts` | All OPFS calls, `available_name`, `default_sort`, `move_directory` |
| `path.ts` | `split_path`, `join_path`, `resolve_path`, `tilde_path`, `base_name`, `parent_path`, `file_stem`, `file_extension` |
| `hierarchy.ts` | `PATHS`, `SYSTEM_DIRECTORIES`, `is_system_path`, `is_locked_path`, `ensure_hierarchy` (ADR-021) |
| `latest-writer.ts` | `LatestWriter`: serialized, newest-wins text writes for OS state files (settings, session, shell history, version state) and `json_file`. `busy` and `idle()` tell whether a write is still on its way |
| `file-system.d.ts` | Declares `FileSystemFileHandle.move()`, which Chrome ships but TypeScript's DOM lib doesn't |
| `service.svelte.ts` | `FilesService` class and `DirectoryHandler` class |
| `shell.ts`, `shell-run.ts` | The shell contribution and its lazy bodies, see [Shell](#shell) |
| `index.ts` | `export * from "./type"` |

## Paths

Handles are what OPFS operates on. Paths exist for identity, display, and anything that has to be JSON (app props, ADR-018).

- Absolute, `/`-separated, rooted at the OPFS root: `/home/Documents/a.txt`. Root is `/`, displayed as `/`.
- Two forms. `segments: string[]` is primary (`[]` is root, `["home", "Documents"]`). `path` is derived as `"/" + segments.join("/")`.
- Paths carry no `.`/`..` and no escaping. Names are whatever OPFS accepts. Typed shell input goes through `resolve_path` first.

| Helper | Signature | Notes |
|--------|-----------|-------|
| `split_path` | `(path: string) => string[]` | Drops empty segments: `"//docs/"` → `["docs"]` |
| `join_path` | `(segments: string[], name?: string) => string` | `(["docs"], "a.txt")` → `"/docs/a.txt"`, `([])` → `"/"` |
| `resolve_path` | `(cwd: string, input: string) => string` | What the shell does with a typed path: absolute stays, `~` is `/home`, otherwise relative to `cwd`; `.` and `..` resolve, `..` stops at `/` |
| `tilde_path` | `(path: string) => string` | `/home/Pictures` → `~/Pictures`, `/home` → `~`, for prompts |
| `base_name` | `(path: string) => string` | Last segment: `"/docs/a.txt"` → `"a.txt"`, `"/"` → `""` |
| `parent_path` | `(path: string) => string` | `"/docs/a.txt"` → `"/docs"`; anything directly under the root, and the root, → `"/"` |
| `file_stem` | `(name: string) => string` | Drops the last extension: `"a.tar.gz"` → `"a.tar"`. A dotfile is all stem: `".env"` → `".env"` |
| `file_extension` | `(name: string) => string` | Lowercase, with the dot: `"Notes.TXT"` → `".txt"`. A dotfile is its own extension (`".env"`), no dot → `""`. Re-exported from `$lib/core/api` (associations use it, ADR-018) |

Only `get_file(path)`, `get_directory(path)` and `revision(path)` take a path. Every other method takes handles.

## Hierarchy

A Unix-lite layout (ADR-021), defined in `hierarchy.ts`:

```
/
├ home/          the user's space; File Explorer opens here
│ ├ Desktop/
│ ├ Documents/
│ └ Downloads/
├ etc/           OS config: hierarchy.json (migration marker), settings.json (SettingsService)
├ var/
│ └ lib/         OS component state, one folder each: desktop/ (layout.json, home-layout.json,
│                additions.json; DesktopService), session/session.json (SessionService),
│                version/state.json (VersionService), shell/history (ShellService),
│                wallpaper/ (SettingsService), games/plays.json, apps/{id}/ (app storage.file())
└ tmp/           emptied at every boot
```

| Export | What |
|--------|------|
| `PATHS` | `as const` map: `home`, `desktop`, `documents`, `downloads`, `etc`, `var`, `var_lib`, `tmp` → the paths above |
| `SYSTEM_DIRECTORIES` | `["/etc", "/var", "/tmp"]`, the OS-owned top-level folders |
| `is_system_path(path)` | `true` for a system directory or anything under one. Plain string prefix check, so pass a normalised path |
| `is_locked_path(path)` | `is_system_path`, or one of the `PATHS` folders themselves (`/home`, `/home/Desktop`, …). File Explorer won't cut, rename, delete or drag these. UI rule only: the service still writes anywhere |
| `ensure_hierarchy(root)` | The bootstrap below. Called by `FilesService.init()` and `clear()` |

`ensure_hierarchy(root)`, in order:

1. Creates `/home`, `/etc`, `/var/lib` (and `/var` on the way), `/tmp` if missing, in parallel.
2. If `/etc/hierarchy.json` doesn't exist, migrates the old flat root: every root entry except a **directory** named `home`, `etc`, `var` or `tmp` moves into `/home`, auto-renamed on a clash (`available_name`). Files use `move_file`, folders `move_directory`. Then it writes the marker, `{"version":1}`. The marker goes last, so a migration interrupted mid-way runs again on the next boot and picks up whatever is still at the root.
3. Creates `/home/Desktop`, `/home/Documents`, `/home/Downloads` if missing. This runs after the migration on purpose: a user's own root `Documents` folder becomes `/home/Documents` instead of `Documents (1)`.
4. Empties `/tmp` (every entry, recursively). Steps 3 and 4 run in parallel, and so do the `/tmp` removals.

Nothing protects the system folders. They're ordinary OPFS directories, and File Explorer can delete them like any other folder. Whatever is missing gets recreated on the next boot. Deleting the marker re-runs the migration, which is harmless once the root holds only the four top-level folders.

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
| `init` | `() => Promise<void>` | Kernel hook. `ensure_hierarchy(await get_root())`. See [Lifecycle](#lifecycle) |
| `get_root` | `() => Promise<FileSystemDirectoryHandle>` | Cached. See [Lifecycle](#lifecycle) |
| `revision` | `(path) => number` | Reactive change counter for one directory, `0` until something changes. Path is normalised (`split_path` → `join_path`). See [Revisions](#revisions) |
| `directory` | `(segments, handle?) => Promise<DirectoryHandler>` | New handler that starts watching and listing straight away. The caller must `dispose()` it. Without `handle`, walks `segments` from the root (`NotFoundError` / `TypeMismatchError` if a segment is missing or a file). With `handle`, wraps it and `segments` is only a label, see [gotchas](#behaviour--invariants) |
| `list` | `(handle?, options?) => Promise<FileSystemItem[]>` | One-shot listing, sorted |
| `create_directory` | `(handle, name) => Promise<FileSystemDirectoryHandle>` | Auto-renames on a clash |
| `create_file` | `(handle, name, options?) => Promise<FileSystemFileHandle>` | Auto-renames unless `overwrite`. Writes `content` if given (`""` with `overwrite` truncates) |
| `write_file` | `(handle, content) => Promise<void>` | Replaces contents. Aborts the writable on failure so the lock is released |
| `read_file` | `(handle) => Promise<File>` | |
| `get_file` | `(path) => Promise<File \| null>` | Path lookup (ADR-018). `null` for missing, a directory at that path, or an invalid name. Other errors throw |
| `get_directory` | `(path) => Promise<FileSystemDirectoryHandle \| null>` | Path lookup via `opfs.get_directory_at`. `null` for missing, a file at that path, or an invalid name. Other errors throw |
| `rename_entry` | `(handle, name, new_name) => Promise<void>` | In place (`opfs.rename_entry`: native `move()` for files, recreate-and-move for folders). Throws `InvalidModificationError` if `new_name` exists: a rename never auto-renames. Bumps the parent's revision. `DirectoryHandler.rename_entry(name, new_name)` also reloads |
| `move_directory` | `(source_parent, source, target, new_name?) => Promise<FileSystemDirectoryHandle>` | Recursive move (`opfs.move_directory`), auto-renamed on clash. Bumps both folders' revisions |
| `copy_directory` | `(source, target, new_name?) => Promise<FileSystemDirectoryHandle>` | Recursive copy, auto-renamed on clash. Bumps the target's revision |
| `delete_entry` | `(handle, name, { recursive? }) => Promise<void>` | `recursive` defaults to `false`; a non-empty directory throws without it |
| `exists` | `(handle, name, kind?) => Promise<boolean>` | Without `kind`, tries file then directory. Any error is `false` |
| `copy_file` | `(source, target, new_name?) => Promise<FileSystemFileHandle>` | Auto-renames. Read the result's `name` |
| `move_file` | `(source_parent, source, target, new_name?) => Promise<FileSystemFileHandle>` | Native `FileSystemFileHandle.move()`. Auto-renames. Returns `source`, which now points at the new location. Same name into the same directory is a no-op |
| `upload_files` | `(target, options?) => Promise<File[]>` | Opens the native file picker. See [Upload flow](#upload-flow) |
| `move_paths` | `(paths: string[], target: string, on_conflict?) => Promise<string[]>` | Moves entries by absolute path into the folder at `target` (ADR-005 revision). Per entry: a folder into itself or a descendant throws `Can't put "x" into itself`; already in `target` → left alone, path returned unchanged; a taken name → `on_conflict(name)` (`skip`, `replace` deletes the existing entry first, `keep_both`), or keep both when no handler is given (drag and drop). Files via `move_file`, folders via `move_directory`. Returns the new paths |
| `import_entries` | `(target: string, entries: (File \| FileSystemHandle)[]) => Promise<string[]>` | Imports from outside WebOS (an OS drop): a `File` or file handle → `opfs.store_file` (free name, write); a directory handle → `opfs.copy_directory` (recursive, free name). Bumps the target's revision once if anything landed, even when a later entry fails. Missing target throws. Returns the new paths |
| `copy_paths` | same | Same rules through `copy_file` / `copy_directory`, except copying into the entry's own folder always keeps both |
| `export_to_disk` | `(path) => Promise<string \| null>` | Copies the entry at `path` onto the real disk with the File System Access pickers. A file goes through `showSaveFilePicker` (suggested name, starts in Downloads) and `write_file`. A folder goes through `showDirectoryPicker({ mode: "readwrite" })` and `copy_directory`, which works on disk handles too and auto-renames on clash. Resolves the written name; `null` when the picker is cancelled (`AbortError`). Throws `NotFoundError` for a missing path. Bumps no revision: nothing in OPFS changes |
| `get_storage_estimate` | `() => Promise<{ usage; quota }>` | `navigator.storage.estimate()`, missing values become `0`. Covers the whole origin, not only OPFS |
| `get_directory_size` | `(handle) => Promise<number>` | Recursive byte sum. Sequential, so slow on deep trees. Files whose metadata failed count as 0 |
| `clear` | `() => Promise<void>` | Deletes every entry under root, recursively, then runs `ensure_hierarchy` again (so it also writes a fresh marker), bumps every revision cell, then `/`. No confirmation |

`changed(directory)` is public on the class but not on the interface. It's the internal hook DirectoryHandler calls after a mutation. See [Revisions](#revisions).

`opfs.ts` also exports functions the service doesn't wrap: `get_directory_handle`, `get_file_handle` (both take `{ create }`, the only exact-name open-or-create path), `get_file_at`, `get_directory_at`, `read_file_as_text`, `read_file_as_array_buffer`, `read_file_as_blob`, `available_name`, `default_sort`, `keep_unchanged`, `move_directory`, `clear_opfs`. Outside the service, `hierarchy.ts` uses `available_name`, `list_directory`, `move_file` and `move_directory`, and DesktopService and the Image Editor, Image Tools and PDF Tools `shell.ts` import `available_name`. `PATHS` is imported by File Explorer, DesktopService, `desktop/layout.ts` and `settings/persistence.ts`, `is_system_path` by `file-list.svelte`, `file-list.handler.svelte.ts`, `file-explorer-navigation.svelte`, the picker footer, `files/shell.ts`, and the Save as of Text Editor, Paint, Image Editor, Markdown PDF and Diff; `is_locked_path` by `file-list.svelte` and `files/shell-run.ts`.

## DirectoryHandler

A live view of one directory: it owns its own freshness (owner, 2026-10-12, [brainstorm](../../brainstorm/2026-10-12_explorer-sync.md)). Defined in `service.svelte.ts`, not exported through the barrel. Consumers import the type from `$lib/core/api/services/files/service.svelte`.

| Member | Type | Notes |
|--------|------|-------|
| `segments` | `readonly string[]` | As passed to `directory()` |
| `path` | `readonly string` | `"/" + segments.join("/")` |
| `handle` | `readonly FileSystemDirectoryHandle` | What every operation actually uses |
| `service` | `readonly FilesService` | The concrete class |
| `items` | `$state.raw<FileSystemItem[]>` | Last listing, with metadata, `default_sort`. Replaced whole, never mutated. A relist keeps the previous object of every entry whose name, kind, size, `last_modified` and type didn't change (`opfs.keep_unchanged`), so a keyed list re-renders only the rows that changed |
| `loading` | `$state<boolean>` | True while a reload is in flight. Starts `true`: the first listing runs from the watcher |
| `exists` | `$state<boolean>` | Turns `false` once the folder is deleted or moved away. The handler then disposes itself. Never turns back |
| `name` | getter | Last segment, or `"/"` at root |
| `is_root` | getter | `segments.length === 0` |
| `reload()` | `Promise<void>` | Re-lists. A call while a listing for the **same revision** is in flight joins it instead of starting another, so a mutation and the watcher list once. Otherwise overlapping listings: only the newest writes `items` and clears `loading` |
| `dispose()` | `void` | Stops both watchers. Idempotent. Whoever got the handler from `directory()` / `open_directory()` calls it |
| `create_directory(name)` | | `opfs.create_directory`, then `service.changed(handle)`, then `reload()` |
| `create_file(name, options?)` | | `opfs.create_file`, then `service.changed(handle)`, then `reload()` |
| `delete_entry(name, options?)` | | `opfs.delete_entry`, then `service.changed(handle)`, then `reload()` |
| `rename_entry(name, new_name)` | | `opfs.rename_entry`, then `service.changed(handle)`, then `reload()` |
| `upload_files(options?)` | | Bumps and reloads only if something was uploaded |
| `open_directory(name, handle)` | `Promise<DirectoryHandler>` | `service.directory([...segments, name], handle)`. A new handler each time |

The constructor starts an `$effect.root` with two effects (ADR-005 "auto-loading", extended):

- **Own revision.** Reads `service.revision(path)` and calls `reload()`. The first run is the initial listing; every later bump re-lists. Failures are only `console.error`ed.
- **Ancestor revisions** (not at root). Reads the revision of every ancestor, `/` down to the parent: deleting or moving a folder bumps only its parent, and a gone grandparent only the folder above that. The first run only subscribes. Later runs call `get_directory(path)` and `isSameEntry(handle)`; when the path is gone or now holds a different folder, `exists` turns `false` and the handler disposes itself. A sibling change in any ancestor costs one path walk.

A folder rename is recreate-and-move, so a renamed folder counts as gone too.

There's no handler cache. Two handlers on the same directory are independent, but both watch the same [revision](#revisions), so a mutation through either one, or through the direct service ops, re-lists both. ADR-005 records why the path-keyed cache was removed.

## State

| What | Where | Lifetime |
|------|-------|----------|
| Root handle promise | `FilesService._root` | Until a rejection clears it |
| Directory revisions | `FilesService.revisions`, `Map<path, Revision>` (one reactive cell per path) | Page lifetime. `clear()` bumps every cell. Not persisted |
| Directory listings | each `DirectoryHandler.items` | Owner's lifetime. Re-read on reload only |
| File contents and metadata | never cached | Re-read on every call |

The revision cells are the service's only reactive state.

## Lifecycle

Construction sets fields only. There's no `destroy()`.

`init()` calls `get_root()` and awaits `ensure_hierarchy` ([Hierarchy](#hierarchy)), so boot now does async OPFS work, and every later service sees the folders in place. If OPFS is unavailable (for example in private browsing) or the bootstrap throws, `init()` rejects and the whole boot fails with the splash error ([kernel.md](../kernel.md#failed-init)). Before ADR-021 that failure was lazy and only File Explorer showed it.

The first `get_root()`, which is now the one inside `init()`:

1. Caches the `navigator.storage.getDirectory()` promise. If it rejects (for example, no OPFS in private browsing), the cache is cleared so the next call retries.
2. Fires `navigator.storage.persist()` without awaiting it. A refusal is a `console.warn`, an error a `console.error`. It runs again only if the root cache was cleared.

## Persistence

The data lives in OPFS, so it survives reloads, and with `persist()` granted it's exempt from eviction under storage pressure. `/tmp` is the exception: it's emptied on every boot. The service itself writes only the migration marker `/etc/hierarchy.json` (`{"version":1}`). Other services write their OS files through it: `/etc/settings.json` and `/var/lib/wallpaper/` ([settings](settings.md#persistence)), `/var/lib/desktop/*.json` and `.desktop` / `.widget` files in `/home/Desktop` ([desktop](desktop.md#persistence)), `/var/lib/session/session.json` ([session](session.md#persistence)), `/var/lib/version/state.json` ([version](version.md)), `/var/lib/shell/history` ([shell](shell.md#persistence)). Apps write `/var/lib/apps/{id}/` through `storage.file()` and games `/var/lib/games/plays.json`. Revisions are in memory. The service writes nothing to localStorage. Remembered "open with" choices live in settings (`file_defaults`, see [settings](settings.md)), not here.

## Behaviour & invariants

**Nothing user-facing overwrites.** `create_directory`, `create_file`, `copy_file`, `move_file`, `move_directory`, `upload_files` and the root migration all go through `available_name(dir, name)`:

- Returns `name` if it's free.
- Otherwise it splits at the last dot (a dot at index 0 doesn't count, so dotfiles keep their name as the stem) and tries `stem (1).ext`, `stem (2).ext`, and so on, until `exists()` says free.
- `exists()` without `kind` checks both kinds, so a file can't take a folder's name or the reverse.
- Check-then-create isn't atomic. Two concurrent writers to the same name can both pick the same candidate. The upload loop is sequential, so a single upload is safe.

Exact-name writes exist only through `create_file({ overwrite: true })` and `opfs.get_*_handle({ create: true })`.

**Writes can be held.** Every mutating function in `opfs.ts` (`create_directory`, `create_file`, `write_file`, `delete_entry`, `copy_file`, `copy_directory`, `rename_entry`, `move_file`, `move_directory`, `store_file`) runs through a module-level gate. `hold_writes()` closes it: it waits for the writes already under way, then every later one rejects with `NoModificationAllowedError` ("Writes are on hold…") until the returned release runs. FilesService, DirectoryHandler, `LatestWriter` and `json_file` all write through these functions, so the hold covers them. Only backup restore uses it (ADR-037): it replaces folders through native handles, keeps the hold and reloads, so no running service or app can save stale in-memory state over the restored files ([backup](backup.md#restore)). `hierarchy.ts` and `/tmp/p2p-transfer` write natively and aren't held.

**Moves are native.** `move_file` calls `FileSystemFileHandle.move(target_dir, name)`, so the bytes aren't copied and the handle you passed stays valid, now at the new path. `source_parent` only feeds the same-directory no-op check. Rename is `move_file(parent, file, parent, "new.txt")`. If `new.txt` is taken, you get `new (1).txt`.

`opfs.move_directory(source_parent, source, target_dir, new_name?)` exists because OPFS directory handles have no `move()` in Chrome 154. It creates the target folder (auto-renamed), moves each file natively and each subfolder recursively, then removes the now-empty source with a non-recursive `removeEntry`, and returns the new directory handle. It isn't atomic: a failure part-way leaves the tree split between source and target. The migration calls it raw; everything else goes through FilesService's `move_directory` and `copy_directory`, which wrap it and bump revisions.

### Revisions

`revision(path)` is reactive per folder: each path gets its own counter cell (`Revision`, built on `createSubscriber`), created on first read or bump. Read it in an effect, re-list that folder when it changes. It used to be one `SvelteMap`, where reading a path nobody had bumped yet subscribed to the whole map: every untouched folder's watcher re-ran whenever any other folder got its first revision (the desktop re-read itself and its widgets flashed their loaders whenever an app opened). `createSubscriber` rather than `$state`, because a cell created lazily inside the reading effect would be that effect's own state, which Svelte doesn't track. `clear()` bumps every cell instead of resetting them.

- `changed(dir)` maps a handle back to its path with the native `root.resolve(dir)` and bumps that path. A handle outside the root (`resolve` returns `null`) is ignored.
- Every mutation bumps only the directory it touched, never its ancestors:

| Mutation | Bumps |
|----------|-------|
| `create_directory`, `create_file`, `delete_entry`, `rename_entry` | the parent |
| `copy_directory` | the target |
| `write_file` | the file's parent (resolved from the file handle) |
| `copy_file` | the target directory |
| `move_file` | source parent, then target directory |
| `upload_files` | the target, only if something was stored |
| `DirectoryHandler` create, delete, rename, upload | its directory, before its own `reload()` (which the watcher's call then joins) |
| `clear()` | every existing revision cell, then `/` |

- The bump happens after the OPFS call resolves. A failed mutation bumps nothing.
- Readers today: DesktopService watches `/home/Desktop` ([desktop](desktop.md#lifecycle)). Every live `DirectoryHandler` watches its own folder and its ancestors.
- Raw `opfs.*` calls, including `ensure_hierarchy` at boot, bump nothing.

**Sort.** Directories first, then `localeCompare` with `numeric: true, sensitivity: "base"`, so `file2` sorts before `file10` and case is ignored.

**Gotcha: `directory(segments, handle)` trusts the pair.** Without a handle, `files.directory(["home"])` resolves `/home` from the root (it never creates it). With a handle, it doesn't check that `segments` describes that handle's path, so a mismatched pair gets a wrong label. File Explorer does `directory(split_path(path))` for its start folder, `directory(segments)` for breadcrumb and Places jumps, and `open_directory(name, handle)` to enter a folder, which always pass a matching pair.

### LatestWriter

`new LatestWriter(files: () => FilesService, path, label)`, then `write(text)`. For state files that change often (ADR-023 revision; used by SettingsService, SessionService, ShellService history, VersionService state and app `storage.file()`).

- `write(text)` replaces the pending text and starts a flush unless one is running. Never awaits, never throws.
- The flush loop takes the pending text, walks the parent folders from the root (`exists(dir, name, "directory")` → open it, else `create_directory`), then `create_file(parent, name, { content, overwrite: true })`. It repeats while new text arrived meanwhile, so writes never overlap and only the newest of a burst lands.
- Errors → `console.error("Failed to save {label}:")`, and the loop continues with the next text.
- Every write bumps the parent's revision; created folders bump theirs.
- `create_directory` auto-renames, so a **file** squatting on a folder name makes it create `name (1)` and write there on every flush.

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

1. `upload_files(target, { multiple = true, accept })` calls `pick_device_files` (`$lib/core/utils/device-file`, ADR-031), which creates a detached `<input type="file">` and `click()`s it.
2. `cancel` or an empty selection resolves `[]`.
3. Each chosen file in turn goes through `opfs.store_file`: `available_name` → `getFileHandle(name, { create: true })` → `write_file(handle, file)`. Dropped OS files use the same function (`import_entries`).
4. The first failure rejects. Files already written stay written.
5. It resolves with the stored files (`file_handle.getFile()` after each write), so `.name` is the saved name after any auto-rename.

`DirectoryHandler.upload_files` reloads only when the result isn't empty. If the picker is dismissed in a way that fires neither `change` nor `cancel`, the promise never settles. In File Explorer that leaves the upload button disabled.

---

## File explorer components

`src/lib/core/components/files/`, shared OS UI built from the [UI kit](../../design/components.md). The [File Explorer app](../system-apps.md#file-explorer) is a thin wrapper that passes its `path` prop to `file-explorer.svelte`.

| File | Responsibility |
|------|----------------|
| `file-explorer.svelte` | Root. Owns navigation state: `handler`, `history: DirectoryHandler[]` (for Back only), `search`. Freshness is the handler's job; the explorer only reacts to `handler.exists` going `false` (see Navigation). It disposes the current handler and every history entry on destroy, and a handler that resolves after destroy is disposed on arrival. Prop `path` (default `PATHS.home`), read once: `files.directory(split_path(path))`. Layout: `grid-rows-[auto_1fr_auto]` with the toolbar, then Places + list side by side, then the status bar. A centered `Spinner` ("Opening folder") while the start folder resolves; an error `EmptyState` ("Couldn't open this folder" + message) if it fails, for example when the folder or `/home` was deleted this session |
| `file-explorer-navigation.svelte` | `Toolbar`: Back and Reload `IconButton`s, the breadcrumb, a filter `Input` (`bind:search`, always visible: `w-28`, `w-40` from `@lg`), a vertical `Separator`, New folder, Upload |
| `file-explorer-places.svelte` | Sidebar, only at `@3xl` and up (`w-44`, `bg-background-light`, hairline right). "Places": Home, Desktop, Documents, Downloads (`PATHS`). "System": every `SYSTEM_DIRECTORIES` entry (`/etc`, `/var`, `/tmp`) by path. The entry equal to the current path is active (`foreground/10` fill, `primary` filled icon, `aria-current="page"`); clicking it does nothing |
| `file-list.svelte` | The scrolling list: a `role="grid"` with a sticky overline header row (Name, Size, Modified) and a row per item. Filtering, open, menus and keys. Passes `system={is_system_path(path)}` to folder rows. Skeleton, empty and no-match states (below). Rows use `content-visibility: auto` (`contain-intrinsic-size: auto 2rem`, `2.75rem` on coarse pointers), so off-screen rows skip layout and paint. That containment turns subgrid off, so rows carry their own `grid-cols-[0.75rem_1fr_auto_auto]` with `gap-x-3`, matching the header's columns |
| `file-list.handler.svelte.ts` | `FileListHandler`: the list's selection (names + range anchor), marquee and native drag and drop, exposed as `marquee_attachment()` and `drop_attachment()` like `window.handler.svelte.ts`. Takes getters for the directory, the visible items and the `multi` / accepts-drop flags |
| `drag.ts` | Native drag and drop shared with the desktop: `PATHS_TYPE` (`application/x-webos-paths`, JSON paths), `set_drag_paths`, `has_drag_paths` (types only, for `dragover`), `read_drag_paths`, `drop_paths(paths, target)` (`files.move_paths`, keep both on clash, error toast "Couldn't move …"). OS drops: `has_os_files` (`Files` type), `read_os_entries` (must run synchronously in `drop`; `getAsFileSystemHandle()` when the browser has it, else `getAsFile()`, so folders need Chromium), `import_dropped(entries, target)` (`files.import_entries`, error toast "Couldn't import the dropped items") |
| `file-row.svelte` | File cells: icon (duotone, `foreground/80`), name (`text-ui`), size (`format_bytes`, `—` when missing), modified date (`format_date`, medium date; `format_datetime` as `title`, 24-hour; `—` when missing). Size and date are mono `text-2xs` `foreground/80` `tabular-nums`. A `.desktop` row reads and parses the file and shows `ShortcutIcon` with the target app's icon (generic glyph while loading, on error, or for a broken shortcut) |
| `shortcut-icon.svelte` | `ShortcutIcon { app_id: AppId \| null, class? }`: the app's manifest icon, or Phosphor `AppWindow` when unknown, with an `ArrowUpRight` badge in the bottom-right corner. Also used by the desktop (ADR-022) |
| `directory-row.svelte` | Folder cells: `primary` filled folder icon, name, `—` for size, empty date. With `system`, a neutral `Badge` "system" after the name (`/etc`, `/var`, `/tmp` and anything under them) |
| `file-explorer-status-bar.svelte` | `StatusBar` (single line, `nowrap`, each child truncates): "N items" for the unfiltered directory, plus "· x folders, y files" when both kinds are present (from `@sm`). On the right, from `@md`, a storage meter: a 64px `primary` bar (at least 2% wide) and "{usage} of {quota}", percentage in the `title` |
| `file-upload-button.svelte` | Upload `IconButton`, calls `handler.upload_files()`, disabled while it runs |
| `file-explorer.errors.ts` | `report_file_error(title, error)`: `console.error`, then an `error` notification from source `"file-explorer"` ([notifications](notifications.md)) |
| `file-actions.ts` | The actions rows and menus share: `create_folder`, `delete_items`, `upload`, `rename_item`, `show_properties`, `open_with_items`, `open_with`, `open_terminal(cwd)`, `compress_items`, `extract_here` (zip code imported lazily), `copy_items`, `cut_items`, `paste`, `save_to_disk`, `set_wallpaper` |
| `name-rules.ts` | `name_problem(name, taken, except?)`: the error for a new name (empty, `/`, `.`/`..`, taken), or `null`. Tested in `name-rules.test.ts` |
| `picker.ts` | `PickerMode` and `accepts(picker, item)` for [Picker mode](#picker-mode-adr-025) |
| `file-picker-dialog.svelte` | The window sheet behind `pick_file` / `pick_directory` / `pick_save`: File Explorer in picker mode |
| `file-picker-footer.svelte` | The picker's footer in place of the status bar: chosen path and buttons, or the Save form |
| `properties-dialog.svelte` | Properties sheet (`{ path, kind }`): kind, size, folder contents, modified, location ([dialogs](dialogs.md#context-menus-adr-025)) |
| `file-icon.svelte` | Phosphor icon by MIME type first, then extension. Generic fallback |

### Multi-select and drag and drop

ADR-011 revision ([brainstorm](../../brainstorm/2026-10-12_multi-select.md)). Desktop pointer only (`multi = !picker && !mobile`): the picker keeps its single `selected`, mobile keeps tap to open and long press for one row's menu.

- **Selection** is the list's own state, held by `FileListHandler`: a set of names plus a range anchor, cleared when the folder changes, pruned to the visible (filtered) rows. Click rules come from `$lib/core/utils/selection.ts` (`click_select`): click selects one, Ctrl/Cmd+click toggles, Shift+click selects the range from the anchor in list order, Ctrl+Shift adds the range. Ctrl/Cmd+A selects all (not inside the filter input), Esc clears. Selected rows are `primary/14`; keyboard focus shows only the ring.
- **Marquee:** a drag from empty space in the list draws a `primary/12` rectangle with a `primary/60` hairline; rows whose rect intersects it are selected (Ctrl keeps the existing selection). Rows are one fixed height with no gap, so the hit-test is index math: the first row's offset, the row height and the row's left/right edges are measured once when the marquee starts, and each frame maps the rectangle to a row range (scroll position read per frame). Pointer moves are coalesced to one hit-test per `requestAnimationFrame`, and the selection is only replaced when its members change. While the marquee runs, `selectstart` is cancelled: a stray text selection would otherwise swallow the focus of the next row click.
- **Acting on the selection:** a right-click or key on a selected row applies to the whole selection; on an unselected row it first selects just that row. Open (`Open N items`: files open in their apps, the first folder is entered), Cut, Copy and Delete (one confirm, "Delete N items?") take many; Open with, Rename, Save to disk and Properties appear only for one.
- **Drag:** rows are `draggable`. Dragging an unselected row selects it first; the drag carries every selected path (`drag.ts`). Dragged rows fade to 40%. A folder row under the drag (not one being dragged) highlights `primary/18` with a `primary/70` ring and takes the drop; anywhere else in the list drops into the current folder (a no-op for entries already there). Drops from the desktop or another Explorer window work the same. Clashes keep both.
- **Files from the OS** (any platform, not in the picker): dropping real files or folders onto the list or a folder row imports them there (`import_dropped`, drop effect `copy`). Folders come along recursively in Chromium.

### Navigation model

- **The breadcrumb shows the real path, not the history.** Crumbs are `/` (mono) plus one per segment of `handler.segments`. A small `CaretRight` (`foreground/65`) separates segments, but not right after `/`: `/ home › Documents`. The current folder is `font-medium`, `disabled`, and `aria-current="location"`. The whole trail is a `<nav aria-label="Path">` that scrolls horizontally when it overflows.
- Clicking a crumb or an inactive Places entry calls `navigate_path(segments)`: `files.directory(segments)` resolves a fresh handler from the root, which then goes through `navigate_to`. A failure is reported as `Could not open /{segments}`.
- `navigate_to(next)` (also used when entering a folder from the list) pushes the current handler onto `history`, shows `next` and **clears `search`**.
- **Back** drops gone folders from `history`, disposes the current handler and shows the last remaining one, clearing `search`. History handlers keep watching, so no reload is needed. Back is disabled when no history entry still exists, which is the case in every new window. There's no forward history.
- **Gone folder.** When the current handler's `exists` turns `false` (deleted or moved in another window, or `clear()`), the explorer walks up `segments` to the nearest folder that still exists, shows it, and posts an `info` toast from `"file-explorer"`: `"{name}" was moved or deleted` / `Showing {path} instead.` If the user navigated meanwhile, the found handler is disposed and nothing changes.
- A new window opens straight at its `path` prop with an empty history. Ancestors aren't resolved up front; the breadcrumb and Places reach them on demand.
- `search` filters the current directory only, as a case-insensitive substring of the name (trimmed).

### List states

| State | Shows |
|-------|-------|
| `handler.loading` with no items yet | Six skeleton rows (`h-8 bg-foreground/5 animate-pulse`), fading out downward |
| Loaded, folder empty | `EmptyState` "This folder is empty" ("Upload files or create a folder from the toolbar.") |
| Filter matches nothing | `EmptyState` "No matches" (`Nothing here is called "{search}".`) |
| Items | Rows. A reload keeps the current rows on screen until the new listing lands (`DirectoryHandler` only swaps `items` when done), so mutations don't flash skeletons |

Rows are 32px (44px on a coarse pointer) `rounded-md` `<button role="row">`s in a 4-column subgrid (icon, name, size, modified). Hover `bg-foreground/6`; focus `bg-primary/12`, keyboard focus adds an inset 2px `cottontail` ring. The Modified column hides below `@md`.

### Interactions

| Input | Target | Effect |
|-------|--------|--------|
| Double-click (desktop), tap (mobile) | File row | `apps.open(join_path(segments, name), { anchor: cursor })` |
| Double-click (desktop), tap (mobile) | Folder row | Navigate into it |
| Long press (mobile) | A row / empty space | The item menu / the folder menu below, as a bottom sheet. Right-click menus are off on mobile; `long_press` handles a mouse right-click too |
| Back button (mobile nav bar) | | `window.on_back`: the previous folder in this explorer's history; unclaimed when there's none, so the shell takes over |
| Enter | Focused file row | `apps.open`, with the anchor at the row's bottom-left |
| Enter | Focused folder row | Navigate into it |
| Right-click | A row | Item menu: Open, Open with ▸ (files with 2+ associated apps), Cut, Copy, Rename, Save to disk…, Set as wallpaper (one `image/*` file), Compress, Extract here (one `.zip`), Delete, Properties. Cut, Rename and Delete are disabled when any target is locked (`is_locked_path`); Compress and Extract here inside a system folder |
| Right-click | Empty space in the list | Folder menu: New folder, Upload files, Paste (disabled when the clipboard is empty), Reload. In a system folder New folder, Upload and Paste are disabled; drops onto a system folder or into one are refused |
| Ctrl/Cmd+C, Ctrl/Cmd+X | Focused row | Copy or cut to the clipboard (ClipboardService); cut rows are dimmed |
| Ctrl/Cmd+V | Anywhere in the list | Paste into this folder; name clashes ask in a `ConflictDialog` sheet |
| F2 | Focused row | Rename: prompt sheet with the stem pre-selected, validated (no clash, no `/`) |
| Alt+Enter | Focused row | Properties sheet |
| ContextMenu key, Shift+F10 | Focused row | Item menu, anchored under the row |
| Delete, or Backspace with `metaKey` (Cmd on macOS; Ctrl doesn't count) | Focused row | Danger confirm sheet (`window.confirm`, Cancel focused), then delete (folders recursively) |
| Tab | Rows | Rows are `<button>`s, so Tab moves between them. There's no arrow-key movement |
| Click | Back / Reload / New folder / Upload | As labelled (each `IconButton` has a label and tooltip). New folder (toolbar or folder menu; shared `file-actions.ts`) opens a prompt sheet (`window.prompt`, initial "New folder", validated by `name-rules.ts`: not empty, no `/`, not `.`/`..`, not an existing name) |
| Click | Breadcrumb segment | Jump to that folder |
| Click | Places entry | Jump to that folder |
| Click × | Filter field | Clears it |

A single click selects the row (see [Multi-select](#multi-select-and-drag-and-drop)).

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
| Breadcrumb / Places jump | `Could not open /{path}` |
| Start folder | Inline error `EmptyState`, no toast |
| `DirectoryHandler` listings and existence checks | console only |
| Storage estimate | console only |

## Divergence from ADR

- ADR-005 §5 lists `move_file(...): Promise<void>`. The code returns the moved handle. The 2026-10-10 revision note records this, so it's only the body that's stale.
- ADR-005 §6 types `FileSystemItem` as a base interface with `kind: "file" | "directory"`. The code uses a discriminated union, which is better and matches CONVENTIONS.
- ADR-005 §9 specifies `confirm()`/`prompt()`. Superseded by ADR-025: the explorer uses window sheets.
- ADR-021 §2 triggers the migration when `/home` doesn't exist and creates every `PATHS` folder before it. The code creates the four top-level folders first, keys the migration on the `/etc/hierarchy.json` marker (so an interrupted migration resumes), and creates `Desktop`/`Documents`/`Downloads` after it (so a user's own `Documents` merges in by name).
- ADR-021 §4 says a revision is `0` "until something under `path` changes". The code bumps only the directory a mutation touched, not its ancestors, so it's "in `path`", not "under".
- [CONVENTIONS](../../CONVENTIONS.md#services) says `index.ts` exports types only and that only `init.ts` imports service classes. `type.ts` imports `DirectoryHandler` from the implementation file, so `FilesService.directory()` returns the concrete class, and `DirectoryHandler.service` is the concrete `FilesService`, not the interface. The UI components import the type from `service.svelte` directly. Swapping the files service (ADR-016) would have to keep this exact class.

## Shell

Contributes `ls cd pwd cat cp mv rm mkdir touch du df`, the `path` completer and the `file` / `storage` value types (`files/shell.ts`, bodies and the `path` completer in the lazy `files/shell-run.ts`). Writes into system folders need `sudo`. See [shell](shell.md#contributions).

## Known gaps

- Revisions only see mutations made through FilesService and DirectoryHandler in this tab. Raw `opfs.*` calls, other tabs and anything outside the OS don't bump them (cross-tab sync would need its own brainstorm). `FileSystemObserver` is a candidate platform API for it.
- A revision bumps only the directly affected directory. A consumer of `/home` doesn't see a change inside `/home/Documents`.
- The system folders and `/home` aren't protected. Deleting `/home` from File Explorer breaks every new Explorer window ("Couldn't open this folder") until the next boot recreates it. Places entries for a deleted folder report `Could not open …`.
- `move_directory` isn't atomic and has no guard against moving a folder into its own subtree. An interrupted migration resumes on the next boot, but a folder that was half-moved ends up split between `/home/X` and `/home/X (1)`.
- A root **file** named `home`, `etc`, `var` or `tmp` makes `ensure_hierarchy` throw (`TypeMismatchError` on create), which now fails the whole boot.
- The list's icon cell has no `role="gridcell"`, and buttons used as `role="row"` lose button semantics. The grid has no arrow-key model behind the role.
- `get_file` returns a `File`, not a handle. A path-based app can read but can't write back without walking the tree itself.
- Focus is lost after a keyboard delete: the deleted row unmounts and nothing moves focus to a neighbour.
- A `DirectoryHandler` listing failure is invisible to the user.

### Picker mode (ADR-025)

`<FileExplorer picker={{ kind, accept, name?, onchoose, oncancel }} />` turns the explorer into a picker (`picker.ts`, used by `file-picker-dialog.svelte` for `window.pick_file` / `pick_directory` / `pick_save`). `kind` is `"file"`, `"directory"` or `"save"`:

- Click selects (`aria-selected`), double-click or Enter on a file chooses it, folders still navigate on double-click. On mobile a tap on a folder navigates into it and a tap on a file selects it.
- Files that don't match `accept` (association syntax, checked with `association_tier`) are dimmed and `aria-disabled`; a directory picker disables all files.
- No context menus, rename, delete or clipboard keys.
- A footer replaces the status bar: the chosen path, Cancel, and Open / Select folder (a directory picker can take the open folder itself).
- Save mode: the footer is a form with a name field (autofocused, seeded from `name`), Cancel and Save. Clicking or double-clicking a file copies its name into the field, without choosing it. Typing overrides that name until the next click: the field is a writable `$derived` of the selection. If a file in the open folder has the name, the button becomes a red **Replace** with a "Replaces the existing file" hint. If a folder has it, saving is disabled ("A folder has this name"). An empty name, `.`, `..` or a name with `/` disables it too. Inside a system folder (`is_system_path`: `/etc`, `/var`, `/tmp`) saving is disabled with "System folders are read-only", so no app's Save as can overwrite an OS file. Resolves the full path. The picker writes nothing; the caller writes with `files.get_directory(folder)` + `create_file(dir, name, { content, overwrite: true })`.
