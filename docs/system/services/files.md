# FilesService

Key `files` · Depends on: none · ADR: [ADR-005](../../adrs/005-files-service.md), [ADR-018](../../adrs/018-file-associations.md) (path lookup), [ADR-021](../../adrs/021-file-system-hierarchy.md) (hierarchy, native moves, revisions), [ADR-044](../../adrs/044-folder-mounts-and-sources.md) (mounts, sources) · Source: `src/lib/core/api/services/files/`, UI in `src/lib/core/components/files/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The filesystem. Everything lives in the browser's Origin Private File System (OPFS), apart from real folders the user mounts at `/mnt/<name>` ([Mounts](#mounts-adr-044)). There's no backend. Besides mounts, the real disk is reached only through the upload pickers and "Save to disk…" (`export_to_disk`). OPFS itself lives inside the browser profile as numbered blobs, so it can never be shown in Finder or Explorer.

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
| `type.ts` | `FilesService` interface, `FileSystemItem` union, option types, `SizeNode`, `Mount`, `MountState`, `ConflictChoice`, `ConflictHandler` |
| `opfs.ts` | All OPFS calls, `available_name`, `default_sort`, `move_directory`, `store_file`, the write gate (`hold_writes`), `can_pick_folders`, `pick_disk_folder` |
| `path.ts` | `split_path`, `join_path`, `resolve_path`, `tilde_path`, `base_name`, `parent_path`, `file_stem`, `file_extension` |
| `hierarchy.ts` | `PATHS`, `SYSTEM_DIRECTORIES`, `is_system_path`, `is_read_only_path`, `is_locked_path`, `mount_point_of`, `ensure_hierarchy` (ADR-021, ADR-044) |
| `mounts-store.ts` | `load_mounts`, `save_mount`, `delete_mount`: mounted handles in IndexedDB (database `webos-mounts`, store `mounts`, keyed by name). The only IndexedDB in WebOS (ADR-044) |
| `latest-writer.ts` | `LatestWriter`: serialized, newest-wins text writes for OS state files (settings, session, shell history, version state, installed apps) and `json_file`, optionally debounced. `busy` and `idle()` tell whether a write is still on its way; `flush_writers()` saves every delayed one now |
| `file-system.d.ts` | Declares `FileSystemFileHandle.move()` and `FileSystemHandle.queryPermission()` / `requestPermission()`, which Chrome ships but TypeScript's DOM lib doesn't |
| `service.svelte.ts` | `FilesService` class and `DirectoryHandler` class |
| `size-tree.ts` | `SizeCache`, behind `size_tree` (imported on first use), see [Size tree](#size-tree) |
| `rename-pattern.ts`, `rename-batch.ts` | `plan_renames`, `compile_rule`, `PatternError`, `RenameRule` / `RenameSource` / `RenameStep` / `RenamePlan`; `apply_renames`. See [Bulk rename](#bulk-rename) |
| `shell.ts`, `shell-run.ts` | The shell contribution and its lazy bodies, see [Shell](#shell) |
| `index.ts` | `export * from "./type"` |

## Paths

Handles are what OPFS operates on. Paths exist for identity, display, and anything that has to be JSON (app props, ADR-018).

- Absolute, `/`-separated, rooted at the OPFS root: `/home/Documents/a.txt`. Root is `/`, displayed as `/`. `/mnt/<name>/…` resolves inside a mounted folder instead.
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
│                wallpaper/ (SettingsService), games/plays.json, apps/installed.json
│                (AppsService), apps/{id}/ (app storage.file())
├ tmp/           emptied at every boot; device/ holds the picker's "This device…" copies
└ mnt/           empty in OPFS; lists the mount table, one entry per mounted real folder (ADR-044)
```

| Export | What |
|--------|------|
| `PATHS` | `as const` map: `home`, `desktop`, `documents`, `downloads`, `etc`, `var`, `var_lib`, `tmp`, `mnt` → the paths above |
| `SYSTEM_DIRECTORIES` | `["/etc", "/var", "/tmp"]`, the OS-owned top-level folders |
| `is_system_path(path)` | `true` for a system directory or anything under one. Plain string prefix check, so pass a normalised path |
| `is_read_only_path(path)` | `is_system_path`, or `/mnt` itself: nothing is created there, its entries are mounts. Explorer's New folder and Upload, drops, the picker's Save and the shell's writes check it |
| `is_locked_path(path)` | `is_system_path`, one of the `PATHS` folders themselves (`/home`, `/home/Desktop`, `/mnt`, …), or a mount point (`/mnt/Photos`). File Explorer won't cut, rename, delete or drag these; a mount point goes with Unmount. UI rule only: the service still writes anywhere |
| `mount_point_of(path)` | `/mnt/Photos` for anything at or under it, else `null` |
| `ensure_hierarchy(root)` | The bootstrap below. Called by `FilesService.init()` and `clear()` |

`ensure_hierarchy(root)`, in order:

1. Creates `/home`, `/etc`, `/var/lib` (and `/var` on the way), `/tmp`, `/mnt` if missing, in parallel.
2. If `/etc/hierarchy.json` doesn't exist, migrates the old flat root: every root entry except a **directory** named `home`, `etc`, `var`, `tmp` or `mnt` moves into `/home`, auto-renamed on a clash (`available_name`). Files use `move_file`, folders `move_directory`. Then it writes the marker, `{"version":1}`. The marker goes last, so a migration interrupted mid-way runs again on the next boot and picks up whatever is still at the root.
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
interface SizeNode { name; path; size: number /* bytes */; children?: SizeNode[] }
```

`SizeNode` is what `size_tree` returns. Within the asked depth a folder always has `children` (biggest first, possibly empty) and a file never does, so `children !== undefined` tells them apart there; past the depth a folder has only its `size`.

`size`, `last_modified` and `type` come from `handle.getFile()` and are missing when `include_metadata` is false or the read failed (logged with `console.warn`, the item stays in the list).

## Public API

Every directory parameter typed `FileSystemDirectoryHandle | null` means the root when `null`.

| Member | Signature | Notes |
|--------|-----------|-------|
| `init` | `() => Promise<void>` | Kernel hook. `ensure_hierarchy(await get_root())`, then loads the mounts. See [Lifecycle](#lifecycle) |
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
| `get_directory_size` | `(handle) => Promise<number>` | Recursive byte sum. Sequential, so slow on deep trees. Files whose metadata failed count as 0. Uncached; `size_tree` is the cached way |
| `size_tree` | `(path, depth?) => Promise<SizeNode>` | Sizes of the folder at `path` and everything under it in one walk, with `children` `depth` levels down (all by default; `0` gives the total only). Listings are cached per folder by revision, so asking again re-lists only folders changed since ([Size tree](#size-tree)). Throws `NotFoundError` when `path` isn't a folder. Used by `du` and Activity Monitor › Storage |
| `mounts` | `readonly Mount[]` (`$state.raw`) | `{ name, path, handle, state }`, `state` `MountState.CONNECTED` or `LOCKED`. See [Mounts](#mounts-adr-044) |
| `can_mount` | `readonly boolean` | `showDirectoryPicker` exists. `false` on Android and iOS: Mount, "Folder on disk…" and `mount` are hidden |
| `mount` | `(handle) => Promise<string>` | Mounts a directory handle at `/mnt/<name>` (`name (1)` when taken; the same folder again resolves its existing path), asks for `readwrite` if not granted, saves it in IndexedDB, bumps `/mnt` |
| `pick_mount` | `() => Promise<string \| null>` | `showDirectoryPicker({ mode: "readwrite" })` then `mount`. `null` on cancel. Must run from a click or keypress |
| `unmount` | `(path) => Promise<void>` | Forgets the mount at its mount point: IndexedDB, table, bumps `/mnt` and the mount path. The real folder is untouched. `NotFoundError` for anything else |
| `reconnect` | `(path) => Promise<boolean>` | `requestPermission({ mode: "readwrite" })` for the mount holding `path`; updates `state`, bumps the mount path when granted. Needs a click |
| `list_at` | `(path, handle) => Promise<FileSystemItem[]>` | DirectoryHandler's listing: the mount table at `/mnt`, `opfs.list_directory(handle)` elsewhere. On the class, not the interface |
| `clear` | `() => Promise<void>` | Deletes every entry under root, recursively, then runs `ensure_hierarchy` again (so it also writes a fresh marker), bumps every revision cell, then `/`. No confirmation |

### Bulk rename

Many entries renamed by one pattern ([brainstorm](../../brainstorm/2026-10-17_app-wave-7.md#decided-disk-usage-and-bulk-rename)). Not service members: two modules beside the service that File Explorer and the `rename` command share, so they go through `get_directory` and `rename_entry` and work on whatever those reach.

- **`rename-pattern.ts`** (pure, `rename-pattern.test.ts`). `plan_renames(sources, rule, siblings)` → `{ steps, error, changed, blocked }`. `sources` are `{ path, modified }` (the counter follows their order; a path given twice counts once), `siblings` maps each parent folder to its current names. A `RenameRule` is `{ pattern, find?, replace?, match_case?, start?, step? }`:
  - `pattern` tokens: `{name}` (stem), `{ext}` (with the dot, case kept; a dotfile is all stem), `{n}` and `{n:3}` (counter from `start`, default 1, plus `step` per entry, zero-padded to the width), `{date}` / `{date:yyyy-MM-dd}` (modified time, local; parts `yyyy yy MM dd HH mm ss`), `{parent}` (folder name). `{name:lower}`, `:upper`, `:title` (also on `ext` and `parent`) change case. `{{` and `}}` are literal braces. Empty means `{name}{ext}`.
  - A pattern starting with `/` is `/regex/replacement/flags` on the whole name: `$1` for groups, tokens allowed in the replacement (their values stay literal, so a `$` in a folder name isn't a group).
  - `find` / `replace` then runs on the result: plain text, every match, case-insensitive unless `match_case`; the replacement is literal.
  - `error` is a broken rule (unknown token, bad width, invalid regex), which blocks everything. Per step, `problem` is: an empty name, `name_problem` (`.`/`..`, `/`), a folder using `{date}` (folders have no modified time), a name an entry outside the batch keeps ("Something here already has that name."), or two entries getting one name, counting entries that keep theirs ("Another item gets the same name."). Names freed by the batch are fine, so swaps plan clean. `blocked` is any problem.
- **`rename-batch.ts`**. `apply_renames(files, steps)` runs a plan and returns the steps that changed; a plan with problems throws. A step whose new name another step still holds goes to `.rename-{tag}-{i}` first and to its final name after every other step has moved (two phases), so swaps and rotations work; the rest rename straight away. A failure renames every finished step back in reverse and throws `Couldn't rename "x": … Nothing was renamed.`, or names the entries it couldn't put back. No undo afterwards. Not a task: each step is one `rename_entry`, folders included (which recreate-and-move).

`changed(directory)` is public on the class but not on the interface. It's the internal hook DirectoryHandler calls after a mutation. See [Revisions](#revisions).

`opfs.ts` also exports functions the service doesn't wrap: `get_directory_handle`, `get_file_handle` (both take `{ create }`, the only exact-name open-or-create path), `get_file_at`, `get_directory_at`, `read_file_as_text`, `read_file_as_array_buffer`, `read_file_as_blob`, `available_name`, `default_sort`, `keep_unchanged`, `move_directory`, `hold_writes`, `can_pick_folders`, `pick_disk_folder` (Explorer's Upload a folder), `clear_opfs`. Outside the service, `hierarchy.ts` uses `available_name`, `list_directory`, `move_file` and `move_directory`; DesktopService, Web App's store, Image Tools' poster section and the Image Editor, Image Tools, QR Studio and PDF Tools `shell.ts` import `available_name`. `PATHS` is imported widely: the file components, the desktop components, the OS services' persistence files, the shell session, and apps that write to a default folder (Forms, Recipe Box, Algorithms, API Client, P2P Transfer, Brackets, Settings › Theme, Getting started). `is_read_only_path` is checked by `file-list.svelte`, `file-list.handler.svelte.ts`, `file-explorer-navigation.svelte`, the picker footer and `files/shell.ts`; `is_system_path` by `files/shell.ts` and the Save as of Text Editor, Paint, Image Editor, Markdown PDF, Diff, Forms, Algorithms, API Client, Hopsprite, Font Maker and Funky; `is_locked_path` by `file-list.svelte` and `files/shell-run.ts`.

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
| Size listings | `FilesService.sizes` (`SizeCache` in `size-tree.ts`, imported on the first `size_tree` call to keep it out of the boot bundle): per folder path, the revision it was read at, its files with sizes and its subfolder handles | Page lifetime. Not reactive, not persisted |
| Mount table | `FilesService.mounts`, `$state.raw<Mount[]>` | Loaded from IndexedDB at `init()`, replaced on mount, unmount and reconnect |
| File contents and metadata | never cached | Re-read on every call |

The revision cells and the mount table are the service's only reactive state.

## Lifecycle

Construction sets fields only. There's no `destroy()`.

`init()` calls `get_root()` and awaits `ensure_hierarchy` ([Hierarchy](#hierarchy)), so boot now does async OPFS work, and every later service sees the folders in place. If OPFS is unavailable (for example in private browsing) or the bootstrap throws, `init()` rejects and the whole boot fails with the splash error ([kernel.md](../kernel.md#failed-init)). Before ADR-021 that failure was lazy and only File Explorer showed it.

The first `get_root()`, which is now the one inside `init()`:

1. Caches the `navigator.storage.getDirectory()` promise. If it rejects (for example, no OPFS in private browsing), the cache is cleared so the next call retries.
2. Fires `navigator.storage.persist()` without awaiting it. A refusal is a `console.warn`, an error a `console.error`. It runs again only if the root cache was cleared.

## Persistence

The data lives in OPFS, so it survives reloads, and with `persist()` granted it's exempt from eviction under storage pressure. `/tmp` is the exception: it's emptied on every boot. The service itself writes only the migration marker `/etc/hierarchy.json` (`{"version":1}`). Other services write their OS files through it: `/etc/settings.json` and `/var/lib/wallpaper/` ([settings](settings.md#persistence)), `/var/lib/desktop/*.json` and `.desktop` / `.widget` files in `/home/Desktop` ([desktop](desktop.md#persistence)), `/var/lib/session/session.json` ([session](session.md#persistence)), `/var/lib/version/state.json` ([version](version.md)), `/var/lib/shell/history` ([shell](shell.md#persistence)), `/var/lib/apps/installed.json` ([apps](apps.md#persistence)). Apps write `/var/lib/apps/{id}/` through `storage.file()` and games `/var/lib/games/plays.json`. Revisions are in memory. The service writes nothing to localStorage. Mounted folder handles live in IndexedDB ([Mounts](#mounts-adr-044)); the folders themselves stay on the disk. Remembered "open with" choices live in settings (`file_defaults`, see [settings](settings.md)), not here.

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

### Size tree

`size_tree(path, depth)` resolves `path` with `get_directory`, then `SizeCache.tree` walks from that handle: subfolders in parallel, each through its child handles, so it works on any `FileSystemDirectoryHandle` a path resolves to (mounts included, once `get_directory` knows them). The walk always goes to the bottom to sum sizes; `depth` only decides where `children` stop.

- **Cache.** One entry per folder path: the folder's revision when it was listed, its files as `SizeNode`s and its subfolder handles. A walk reuses an entry while `revision(path)` still equals it and re-lists otherwise, so an unchanged tree costs no OPFS reads, and a file written in `/home/Documents` re-lists only that folder.
- **Reading revisions.** The cache reads the cell's value directly, without subscribing, so a walk started in an effect doesn't track every folder it passes. It creates the cell when missing, so `clear()` (which bumps existing cells) invalidates every walked folder.
- **Re-listing drops descendants.** Deleting or moving a folder bumps only its parent, and a folder made again under the same name keeps its old revision (`isSameEntry` compares OPFS paths too, so it can't tell them apart). So when a folder is re-listed, every cached entry below it is dropped. The cost: a change directly in `/home` re-lists all of `/home` on the next walk.
- **Staleness.** Same limits as revisions: changes from other tabs, from raw `opfs.*` calls or through a handle outside FilesService aren't seen until the folder's revision moves.

**Sort.** Directories first, then `localeCompare` with `numeric: true, sensitivity: "base"`, so `file2` sorts before `file10` and case is ignored.

**Gotcha: `directory(segments, handle)` trusts the pair.** Without a handle, `files.directory(["home"])` resolves `/home` from the root (it never creates it). With a handle, it doesn't check that `segments` describes that handle's path, so a mismatched pair gets a wrong label. File Explorer does `directory(split_path(path))` for its start folder, `directory(segments)` for breadcrumb and Places jumps, and `open_directory(name, handle)` to enter a folder, which always pass a matching pair.

### LatestWriter

`new LatestWriter(files: () => FilesService, path, label, { delay? })`, then `write(text)`. For state files that change often (ADR-023 revision; used by SettingsService, SessionService, ShellService history, VersionService state, AppsService's installed list and app `storage.file()`). Settings, session and `storage.file()` pass `delay: 300`; shell history, version state and installed apps save at once (performance pass, [brainstorm](../../brainstorm/2026-10-17_performance-pass.md)).

- `write(text)` replaces the pending text. Without a delay it starts a flush unless one is running; with one it (re)starts a `delay` ms timer, so a burst (focus clicks, slider steps, typing) saves once, after the last change. Never awaits, never throws.
- **Leaving the page.** Writers with a pending timer sit in a module-level set. One `visibilitychange` listener (on `hidden`) and one `pagehide` listener (capture phase, so it runs before `main.ts` shuts the kernel down) flush them all; they're added on the first delayed write. The flush only *starts* the write: OPFS is async, and a tab closed within the delay can still lose that change, since the page is torn down before the write commits (measured: also true without a delay when the tab closes within a few ms). Switching tabs or hiding the window saves normally.
- `busy` is true while a timer waits, text is queued or a write runs. `idle()` saves a delayed write now and resolves once nothing is queued or being written. `flush()` starts the save at once. `flush_writers()` does `idle()` for every delayed writer; backup calls it before reading areas and restore before `hold_writes()`.
- `seed(text)` records what the file already holds (settings, session and `json_file` read it first), and the writer remembers the last text it wrote: writing that same text again is skipped, so a boot with unchanged state writes nothing.
- The flush loop takes the pending text and calls `create_file(parent, name, { content, overwrite: true })`. The parent handle is walked once and cached: one `getDirectoryHandle` per segment, falling back to `create_directory` on `NotFoundError` so creation still bumps the folder's revision. A `NotFoundError` on write (the folder was removed: backup restore, `clear()`) drops the cache, walks again and retries once. It repeats while new text arrived meanwhile (unless a new delay is running), so writes never overlap and only the newest of a burst lands.
- Errors → `console.error("Failed to save {label}:")`, and the loop continues with the next text.
- Every write bumps the parent's revision; created folders bump theirs.
- `create_directory` auto-renames, so a **file** squatting on a folder name makes it create `name (1)` and write there.
- Skipping identical text trusts the writer's memory: if something else deletes the file (`clear()`) and the state hasn't changed, it isn't recreated until the next change.

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

## Mounts (ADR-044)

A folder on the real disk, picked with `showDirectoryPicker`, shown at `/mnt/<name>`. The handle is the same `FileSystemDirectoryHandle` type OPFS hands out, so `opfs.ts` and `DirectoryHandler` work on it unchanged and every path consumer (Explorer, the shell, apps through `get_file` / `get_directory`) reaches it by path.

- **Path walks.** `get_file`, `get_directory` and `directory(segments)` start from the mount's handle for `/mnt/<name>/…` and from the OPFS root otherwise. An unknown mount is `null` (or `NotFoundError` from `directory()`).
- **`/mnt` itself** is an empty OPFS folder created by `ensure_hierarchy`, so the root lists it. `list()` and DirectoryHandler (`list_at`) list the mount table there instead of OPFS. It's read-only (`is_read_only_path`).
- **Revisions.** `changed(handle)` maps a handle back to a path by asking each mount's `resolve()` first, then the OPFS root, so writes through FilesService inside a mount bump `/mnt/<name>/…`. Edits made outside the browser bump nothing: a mount is fresh whenever it's listed (opening the folder, Reload).
- **Moves.** `move_paths` across the OPFS/mount boundary, or between two mounts, is copy plus delete (`copy_file` / `copy_directory`, then `delete_entry`), since native `move()` stays inside one file system. Moves within one mount use the normal path.
- **Persistence.** Handles go into IndexedDB (`mounts-store.ts`), because a handle survives structured clone but not JSON. `init()` loads them and calls `queryPermission({ mode: "readwrite" })`: granted is `connected`, anything else `locked`. A locked mount keeps its place; Explorer shows a Reconnect screen inside it and a lock in Places, and `reconnect()` from that click asks Chrome again. A store failure at boot is logged and leaves no mounts.
- **Deletes** under `/mnt` hit the real disk with no undo. Explorer's confirm names the folder ("Delete 3 items from Photos on your disk?"); the shell's `rm` refuses without `-f`.
- **Not in** backups (they cover `/home`, `/etc`, `/var/lib`, [backup](backup.md)) or the session: a window whose props hold a `/mnt/…` path isn't saved ([session](session.md)).

## Upload flow

1. `upload_files(target, { multiple = true, accept })` calls `pick_device_files` (`$lib/core/utils/device-file`, ADR-031), which creates a detached `<input type="file">` and `click()`s it.
2. `cancel` or an empty selection resolves `[]`.
3. Each chosen file in turn goes through `opfs.store_file`: `available_name` → `getFileHandle(name, { create: true })` → `write_file(handle, file)`. Dropped OS files use the same function (`import_entries`).
4. The first failure rejects. Files already written stay written.
5. It resolves with the stored files (`file_handle.getFile()` after each write), so `.name` is the saved name after any auto-rename.

`DirectoryHandler.upload_files` reloads only when the result isn't empty. If the picker is dismissed in a way that fires neither `change` nor `cancel`, the promise never settles.

Explorer's Upload is a menu (ADR-044): **Upload files…** (above), **Upload a folder…** and, where `can_mount`, **Mount a folder (no copy)…** (`pick_mount`, then opens the mount). Upload a folder (`upload-folder.ts`) reads the folder with `showDirectoryPicker({ mode: "read" })`, or a `webkitdirectory` input where there's none (Android; empty folders are lost there), into a flat `PickedFolder` (`folder-tree.ts`). It copies it as a task (ADR-013): a "Create folder" step (the folder's name, `name (1)` on clash), then one task per top-level file or folder, tree kept. The done toast has Show folder.

---

## File explorer components

`src/lib/core/components/files/`, shared OS UI built from the [UI kit](../../design/components.md). The [File Explorer app](../system-apps.md#file-explorer) is a thin wrapper that passes its `path` prop to `file-explorer.svelte`.

| File | Responsibility |
|------|----------------|
| `file-explorer.svelte` | Root. Owns navigation state: `handler`, `history` and `forward` (paths as `string[][]`, `$state.raw`), `search`. Only the current folder has a live `DirectoryHandler`; a replaced one is disposed. Freshness is the handler's job; the explorer only reacts to `handler.exists` going `false` (see Navigation). It disposes the current handler on destroy, and a handler that resolves after destroy is disposed on arrival. Prop `path` (default `PATHS.home`), read once: `files.directory(split_path(path))`. Layout: `grid-rows-[auto_1fr_auto]` with the toolbar, then Places + list side by side, then the status bar. A centered `Spinner` ("Opening folder") while the start folder resolves; an error `EmptyState` ("Couldn't open this folder" + message) if it fails, for example when the folder or `/home` was deleted this session |
| `file-explorer-history.ts` | `open_latest(files, stack)`: Back / Forward's walk to the newest folder that still exists (see [Navigation](#navigation-model)). Tested in `file-explorer-history.browser.test.ts` |
| `file-explorer-navigation.svelte` | `Toolbar`: Back and Reload `IconButton`s, the breadcrumb, a filter `Input` (`bind:search`, always visible: `w-28`, `w-40` from `@lg`), a vertical `Separator`, New folder, Upload |
| `file-explorer-places.svelte` | Sidebar, only at `@3xl` and up (`w-44`, `bg-background-light`, hairline right). "Places": Home, Desktop, Documents, Downloads (`PATHS`). "System": every `SYSTEM_DIRECTORIES` entry (`/etc`, `/var`, `/tmp`) by path. "On disk", when anything is mounted: each mount by name, `HardDrives` icon, or `LockSimple` when locked, where a click reconnects first and opens the mount once allowed. The entry equal to the current path is active (`foreground/10` fill, `primary` filled icon, `aria-current="page"`); clicking it does nothing |
| `file-list.svelte` | The scrolling list: a `role="grid"` with a sticky overline header row (Name, Size, Modified) and a row per item. Filtering, open, menus and keys. Passes `system` to a folder row that is itself one of `SYSTEM_DIRECTORIES`. Skeleton, empty and no-match states (below). Rows use `content-visibility: auto` (`contain-intrinsic-size: auto 2rem`, `2.75rem` on coarse pointers), so off-screen rows skip layout and paint. That containment turns subgrid off, so rows carry their own `grid-cols-[0.75rem_1fr_auto_auto]` with `gap-x-3`, matching the header's columns |
| `file-list.handler.svelte.ts` | `FileListHandler`: the list's selection (names + range anchor), marquee and native drag and drop, exposed as `marquee_attachment()` and `drop_attachment()` like `window.handler.svelte.ts`. Takes getters for the directory, the visible items and the `multi` / accepts-drop flags |
| `drag.ts` | Native drag and drop shared with the desktop: `PATHS_TYPE` (`application/x-webos-paths`, JSON paths), `set_drag_paths`, `has_drag_paths` (types only, for `dragover`), `read_drag_paths`, `drop_paths(paths, target)` (`files.move_paths`, keep both on clash, error toast "Couldn't move …"). OS drops: `has_os_files` (`Files` type), `read_os_entries` (must run synchronously in `drop`; `getAsFileSystemHandle()` when the browser has it, else `getAsFile()`, so folders need Chromium), `import_dropped(entries, target)` (`files.import_entries`, error toast "Couldn't import the dropped items") |
| `file-row.svelte` | File cells: icon (duotone, `foreground/80`), name (`text-ui`), size (`format_bytes`, `—` when missing), modified date (`format_date`, medium date; `format_datetime` as `title`, 24-hour; `—` when missing). Size and date are mono `text-2xs` `foreground/80` `tabular-nums`. A `.desktop` row reads and parses the file and shows `ShortcutIcon` with the target app's icon (generic glyph while loading, on error, or for a broken shortcut) |
| `shortcut-icon.svelte` | `ShortcutIcon { app_id: AppId \| null, class? }`: the app's manifest icon, or Phosphor `AppWindow` when unknown, with an `ArrowUpRight` badge in the bottom-right corner. Also used by the desktop (ADR-022) |
| `directory-row.svelte` | Folder cells: `primary` filled folder icon, name, `—` for size, empty date. With `system`, a neutral `Badge` "system" after the name (`/etc`, `/var`, `/tmp` themselves, not what's inside) |
| `file-explorer-status-bar.svelte` | `StatusBar` (single line, `nowrap`, each child truncates): "N items" for the unfiltered directory, plus "· x folders, y files" when both kinds are present (from `@sm`). On the right, from `@md`, a storage meter: a 64px `primary` bar (at least 2% wide) and "{usage} of {quota}", percentage in the `title` |
| `file-upload-button.svelte` | Upload `IconButton` opening the Upload menu: Upload files…, Upload a folder… (both disabled in read-only folders), Mount a folder (no copy)… when `can_mount` |
| `folder-tree.ts`, `upload-folder.ts` | Upload a folder: `PickedFolder` from a handle or `webkitdirectory` files, `top_level_groups`, and the copy task (`copy_folder_in`). Tested in `folder-tree.test.ts` |
| `file-explorer.errors.ts` | `report_file_error(title, error)`: `console.error`, then an `error` notification from source `"file-explorer"` ([notifications](notifications.md)) |
| `file-actions.ts` | The actions rows and menus share: `create_folder`, `delete_items` (permanent wording inside a mount), `upload`, `upload_folder_into`, `mount_folder`, `unmount`, `reconnect`, `rename_item`, `rename_items` (one item → `rename_item`, several → the bulk rename sheet, then `apply_renames`; a failure toasts `Could not rename N items` with the rollback message), `show_properties`, `open_with_items`, `open_with`, `open_terminal(cwd)`, `compress_items`, `extract_here` (zip code imported lazily), `copy_items`, `cut_items`, `paste`, `save_to_disk`, `set_wallpaper` |
| `bulk-rename-dialog.svelte` | Bulk rename sheet (`{ folder, sources, taken }`, resolves the planned steps or `null`): a mono "New name" pattern field (starts `{name}{ext}`, focused), token chips that insert at the caret (`{name} {ext} {n:3} {date:yyyy-MM-dd} {parent}`), a regex hint or the rule's error, Find and Replace with (side by side from `@md`), Match case, and Start / Step only while the pattern has a counter. Below, a live preview (`plan_renames` on every keystroke): old → new per entry, changed names `font-medium`, problems in `error` under the new name; stacked old over "→ new" below `@md`. Footer: "N of M change · K problems", Cancel, Rename (disabled while blocked or nothing changes; Enter submits). Sized `min(40rem, 100cqw - 2rem)` and at most the window's height: the preview gives up height first down to `min-h-32`, then the fields scroll |
| `name-rules.ts` | `name_problem(name, taken, except?)`: the error for a new name (empty, `/`, `.`/`..`, taken), or `null`. Tested in `name-rules.test.ts` |
| `picker.ts` | `PickerMode` and `accepts(picker, item)` for [Picker mode](#picker-mode-adr-025); `DEVICE_PATH` (`/tmp/device`), `import_device_files(accept, multiple)` and `store_device_files(files, picked)` for "This device…" |
| `file-picker-dialog.svelte` | The window sheet behind `pick_file` / `pick_directory` / `pick_save`: File Explorer in picker mode |
| `file-picker-footer.svelte` | The picker's footer in place of the status bar: the other sources ("This device…", "Folder on disk…"), chosen path and buttons, or the Save form |
| `properties-dialog.svelte` | Properties sheet (`{ path, kind }`): kind, size, folder contents, modified, location ([dialogs](dialogs.md#context-menus-adr-025)) |
| `file-icon.svelte` | Phosphor icon by MIME type first, then extension. Generic fallback |

### Multi-select and drag and drop

ADR-011 revision ([brainstorm](../../brainstorm/2026-10-12_multi-select.md)). Desktop pointer only (`multi = !picker && !mobile`): the picker keeps its single `selected`, mobile keeps tap to open and long press for one row's menu.

- **Selection** is the list's own state, held by `FileListHandler`: a set of names plus a range anchor, cleared when the folder changes, pruned to the visible (filtered) rows. Click rules come from `$lib/core/utils/selection.ts` (`click_select`): click selects one, Ctrl/Cmd+click toggles, Shift+click selects the range from the anchor in list order, Ctrl+Shift adds the range. Ctrl/Cmd+A selects all (not inside the filter input), Esc clears. Selected rows are `primary/14`; keyboard focus shows only the ring.
- **Marquee:** a drag from empty space in the list draws a `primary/12` rectangle with a `primary/60` hairline; rows whose rect intersects it are selected (Ctrl keeps the existing selection). Rows are one fixed height with no gap, so the hit-test is index math: the first row's offset, the row height and the row's left/right edges are measured once when the marquee starts, and each frame maps the rectangle to a row range (scroll position read per frame). Pointer moves are coalesced to one hit-test per `requestAnimationFrame`, and the selection is only replaced when its members change. While the marquee runs, `selectstart` is cancelled: a stray text selection would otherwise swallow the focus of the next row click.
- **Acting on the selection:** a right-click or key on a selected row applies to the whole selection; on an unselected row it first selects just that row. Open (`Open N items`: files open in their apps, the first folder is entered), Cut, Copy, Delete (one confirm, "Delete N items?") and Rename (`Rename N items…`, F2: the [bulk rename](#bulk-rename) sheet) take many; Open with, Save to disk and Properties appear only for one.
- **Drag:** rows are `draggable`. Dragging an unselected row selects it first; the drag carries every selected path (`drag.ts`). Dragged rows fade to 40%. A folder row under the drag (not one being dragged) highlights `primary/18` with a `primary/70` ring and takes the drop; anywhere else in the list drops into the current folder (a no-op for entries already there). Drops from the desktop or another Explorer window work the same. Clashes keep both.
- **Files from the OS** (any platform, not in the picker): dropping real files or folders onto the list or a folder row imports them there (`import_dropped`, drop effect `copy`). Folders come along recursively in Chromium.

### Navigation model

- **The breadcrumb shows the real path, not the history.** Crumbs are `/` (mono) plus one per segment of `handler.segments`. A small `CaretRight` (`foreground/65`) separates segments, but not right after `/`: `/ home › Documents`. The current folder is `font-medium`, `disabled`, and `aria-current="location"`. The whole trail is a `<nav aria-label="Path">` that scrolls horizontally when it overflows.
- Clicking a crumb or an inactive Places entry calls `navigate_path(segments)`: `files.directory(segments)` resolves a fresh handler from the root, which then goes through `navigate_to`. A failure is reported as `Could not open /{segments}`.
- `navigate_to(next)` (also used when entering a folder from the list) pushes the current folder's segments onto `history`, clears `forward`, shows `next` (disposing the old handler) and **clears `search`**.
- **Back / Forward** keep paths, not handlers, so visited folders don't keep watching and re-listing. `open_latest(files, stack)` (`file-explorer-history.ts`) pops the stack until a folder that still exists (`get_directory`), drops the gone ones, and opens a fresh handler for it. The current folder moves onto the other stack. Back and Forward are enabled while their stack is non-empty; a stack holding only gone folders empties on the first press without moving. A newer navigation wins over a Back or Forward still resolving.
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
| F2 | Focused row | Rename: prompt sheet with the stem pre-selected, validated (no clash, no `/`). With several selected, the bulk rename sheet |
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
| Bulk rename | `Could not rename N items` (message says what failed and that the finished steps were undone) |
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
- ADR-044 puts "This device…" and "Folder on disk…" in the picker's Places list. Places shows only at `@3xl` (48rem) and the picker sheet is at most 46rem wide, so they sit in the picker footer instead.
- ADR-021 §4 says a revision is `0` "until something under `path` changes". The code bumps only the directory a mutation touched, not its ancestors, so it's "in `path`", not "under".
- [CONVENTIONS](../../CONVENTIONS.md#services) says `index.ts` exports types only and that only `init.ts` imports service classes. `type.ts` imports `DirectoryHandler` from the implementation file, so `FilesService.directory()` returns the concrete class, and `DirectoryHandler.service` is the concrete `FilesService`, not the interface. The UI components import the type from `service.svelte` directly. Swapping the files service (ADR-016) would have to keep this exact class.

## Shell

Contributes `ls cd pwd cat cp mv rename rm mkdir touch du df mount umount mounts`, the `path` completer and the `file` / `rename` / `storage` / `mount` value types (`files/shell.ts`, bodies and the `path` completer in the lazy `files/shell-run.ts`). Writes into system folders need `sudo`. `rename <pattern> [paths…] [--find] [--replace] [--match-case] [--start] [--step] [--dry]` plans with [bulk rename](#bulk-rename) over the paths or the piped files: `--dry` yields `rename` rows (from, to, problem) for changed or blocked entries and touches nothing; otherwise any problem fails the run listing up to five (nothing renamed), and success yields the renamed files as `file` values. A regex needs single quotes (`'/IMG_(\d+)/trip-$1/'`): double quotes eat backslashes. `du [paths…]` yields one `file` value per path with its size (from `size_tree(path, 0)` for a folder); `du -d N` instead yields a row for everything inside each folder down to `N` levels, folders with their total, biggest first per folder, so `du ~ -d 1 | sort size -r` ranks what's in home. It asks `size_tree` for `N + 1` levels, because only a folder within the asked depth carries `children`, which is how a row knows it's a folder. `rm` under `/mnt` needs `-f` (`--force`). `mount` opens the folder chooser from the Enter keypress and yields the mount as a `file`; hidden without `can_mount`. `umount <path>` takes a mount point (completed from the table) and moves the session out of it; hidden with no mounts. `mounts` yields `mount` values (columns `path`, `state`). `mkdir` / `touch` refuse a new entry directly in `/mnt`. See [shell](shell.md#contributions).

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

`<FileExplorer picker={{ kind, accept, name?, multiple?, onchoose, oncancel }} />` turns the explorer into a picker (`picker.ts`, used by `file-picker-dialog.svelte` for `window.pick_file` / `pick_directory` / `pick_save`). `kind` is `"file"`, `"directory"` or `"save"`:

- Sources (ADR-044): the footer starts with "This device…" (file pickers only) and "Folder on disk…" (when `can_mount`). "This device…" opens the browser's file chooser (several files when `multiple`), copies the pick into `/tmp/device/` (`store_device_files`, free names) and chooses their paths, so `onchoose(paths)` keeps its shape; `/tmp` is emptied at boot. "Folder on disk…" mounts a folder and opens it in the picker.
- Click selects (`aria-selected`), double-click or Enter on a file chooses it, folders still navigate on double-click. On mobile a tap on a folder navigates into it and a tap on a file selects it.
- `multiple` (file pickers, `pick_file({ multiple: true })`): the grid is `aria-multiselectable`; Ctrl/Cmd-click toggles, Shift-click selects a range and Mod+A selects all, among the files `accept` allows only; on touch a tap toggles. Double-click or Enter on a selected file chooses the whole selection, otherwise just that file. The selection is the explorer's `selected: string[]` (names in the open folder), cleared on navigation, so one pick comes from one folder. The footer shows "3 files" and "Open 3". `onchoose` always takes `string[]`: one path for every other kind.
- Files that don't match `accept` (association syntax, checked with `association_tier`) are dimmed and `aria-disabled`; a directory picker disables all files.
- No context menus, rename, delete or clipboard keys.
- A footer replaces the status bar: the chosen path (or count), Cancel, and Open / Select folder (a directory picker can take the open folder itself).
- Save mode: the footer is a form with a name field (autofocused, seeded from `name`), Cancel and Save. Clicking or double-clicking a file copies its name into the field, without choosing it. Typing overrides that name until the next click: the field is a writable `$derived` of the selection. If a file in the open folder has the name, the button becomes a red **Replace** with a "Replaces the existing file" hint. If a folder has it, saving is disabled ("A folder has this name"). An empty name, `.`, `..` or a name with `/` disables it too. Inside a system folder (`is_read_only_path`: `/etc`, `/var`, `/tmp`, and `/mnt` itself with "Open a mounted folder first") saving is disabled with "System folders are read-only", so no app's Save as can overwrite an OS file. Resolves the full path. The picker writes nothing; the caller writes with `files.get_directory(folder)` + `create_file(dir, name, { content, overwrite: true })`.
