# ADR-044: Folder Mounts and One Picker for Every Source
**Date:** 2026-10-17
**Status:** Implemented (2026-10-17)

> **Revision 2026-10-17: as built.** The picker's two new sources sit in its footer, not its Places list: Places only shows at 48rem and the picker sheet is at most 46rem wide. "This device…" is offered in file pickers only (not folder or save pickers) and picks one file, since `onchoose(path)` takes one path. `/mnt` is an empty OPFS folder whose listing is the mount table; mount points can't be renamed, moved or deleted, only unmounted. Moves between two different mounts are copy plus delete too, like OPFS and a mount. The session skips a window whose props hold a `/mnt/…` path. Explorer also shows a locked mount as a Reconnect screen when it's opened. Some apps keep their own device button: P2P Transfer, Archive (Create), Dev Tools › Hash and Hex Viewer hold device files in memory, which a copy into `/tmp` would double for big files; Recipe Box and Brackets import device files into their own library folder rather than open them. Several apps lose multi-file device picks (Image Tools Squash, Atlas, Join, Compare and Patch; PDF Tools Merge and Images; Soundboard; Diff): the picker takes one file, so several come in by drop.

## Context

Apps pick files two ways today, and each app draws both buttons itself (37 places): "Open…" shows File Explorer in picker mode (ADR-025) and returns a WebOS path; "From device…" calls `pick_device_files()` (`core/utils/device-file.ts`), reading files in memory without a path. Explorer's Upload copies files only. Nothing reads a real folder on the disk in place, which Disk Usage and Bulk Rename need ([brainstorm](../brainstorm/2026-10-17_app-wave-7.md)).

The owner wants the user offered the same three sources everywhere: WebOS files, the device, and a real folder. `showDirectoryPicker()` returns a `FileSystemDirectoryHandle`, the same type OPFS hands `opfs.ts` and `DirectoryHandler` (ADR-005), so a picked folder can sit inside the file tree.

## Decision

- **Mounts.** FilesService mounts a picked folder at `/mnt/<name>` (`mount(handle): Promise<string>`, `unmount(path)`). Every path consumer works on it unchanged: Explorer, the shell, apps.
- **Persistence.** Mounted handles are kept in IndexedDB, the only use of IndexedDB in WebOS, because a handle can't be serialised to JSON. After a reload a mount shows locked; one click asks Chrome for permission again (it must come from a user gesture). Backup (ADR-037) and the session skip `/mnt`.
- **Picker.** The OS picker sheet (ADR-025) offers all three sources: its Places list gets "This device…" and "Folder on disk…". "This device…" copies the picked files into `/tmp/device/` and returns their paths, so `PickerMode.onchoose(path)` keeps its shape. "Folder on disk…" mounts and opens the mount.
- **Old buttons.** The per-app "From device…" buttons are removed; one Open button per app.
- **Upload.** Explorer's Upload becomes a menu: Upload files…, Upload a folder… (copies the tree in), Mount a folder (no copy)….
- **Delete.** Deleting inside `/mnt` always confirms with permanent wording ("Delete 3 items from Photos on your disk? This can't be undone."); the shell's `rm` needs `-f` there.
- **Shell.** FilesService contributes `mount` (opens the folder chooser from the Enter keypress), `umount <path>` and `mounts` (columns: path, state connected or locked).

## Alternatives Considered

- **A source union returned to apps** (`{ webos paths } | { device files } | { folder handle }`): no FilesService change, but Explorer and the shell never see real folders and every app branches three ways.
- **Per-app `showDirectoryPicker`:** no shared picker, which is what the owner rejected.
- **Picker returning a `File` for device picks:** no copy into `/tmp`, but it changes the public picker API and every caller branches.
- **Session-only mounts:** no new storage, but the folder is picked again on every visit.
- **Read-only mounts:** safe, but Bulk Rename can't work on them.

## Consequences

- IndexedDB enters the codebase, for mount handles only.
- Revision tracking (ADR-021) and change notifications don't see edits made outside the browser; a mount refreshes when listed.
- Moves between OPFS and a mount are copy plus delete, not `move()`.
- `/tmp/device/` fills with device picks; it is cleared at boot like the rest of `/tmp`, if it isn't already.
- Android Chrome has no `showDirectoryPicker`: "Folder on disk…", Mount and `mount` are hidden there (ADR-016).
- Deletes and renames under `/mnt` change the real disk with no undo.
