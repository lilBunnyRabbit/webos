# ADR-037: Backups
**Date:** 2026-10-15
**Status:** Implemented

## Context

All WebOS data lives in the browser: OPFS (`/home`, `/etc`, `/var/lib`, `/tmp`) and app `storage` in localStorage under `app.{id}.*`. Clearing site data wipes it, and on a shared origin like github.io another site can clear localStorage. Nothing gets the data out in one piece ([brainstorm](../brainstorm/2026-10-15_v1-release.md)).

## Decision

A kernel service `backup` (`BackupService`, depends on files, dialogs, notifications) creates and restores one zip, built on the zip engine in `core/utils/zip`.

```
webos-backup-YYYY-MM-DD.zip
  backup.json   { format: 1, version, created, areas: ["files", "settings", "apps"], local_storage: { "app.x.k": "…" } }
  home/…        files
  etc/…         settings
  var/lib/…     apps (with the app.* localStorage in backup.json)
```

- **Areas.** Files = `/home`. Settings = `/etc`. App data = `/var/lib` plus `app.*` localStorage. The user picks areas; `/tmp` and caches never go in.
- **Create** writes to the device, never OPFS: `showSaveFilePicker`, else an `<a download>` (mobile has no picker).
- **Restore** reads a device file, validates `backup.json` with zod (rejects a newer `format`), confirms, replaces each area present in the zip (wipe, then write), and reloads. Areas missing from the zip are left alone.
- **UI.** Settings › Backup: area toggles with sizes, Download backup, Restore….
- **Shell.** `backup create [--files] [--settings] [--apps]`, `backup restore`. Both open device pickers; no OPFS paths.

## Alternatives Considered

- **Merge restore** keeps newer data but needs conflict rules for every file.
- **Folder mirror via File System Access** could run on a schedule, but it's Chromium-only and needs a persisted handle.
- **Pure module + Settings, no service.** Rejected by the owner; the service owns the shell commands and the inspector.

## Consequences

- A fifteenth service with an inspector.
- Restore must stop services that write in the background (session, desktop layout) from writing stale state over the restored files before the reload.
- `format` is versioned from day one; a migration runs only when a format 2 exists.

## Revision 2026-10-15 (implementation)

- **Dependencies:** files, dialogs, notifications **and windows**. Restore refuses while a window has unsaved changes (`windows.has_dirty()`): the reload would raise the browser's "Leave site?", and staying would leave a page whose writes are held.
- **Stopping background writers:** `files/opfs.ts` gained `hold_writes()`, a module-level gate every mutating OPFS function passes through (so FilesService, DirectoryHandler, `LatestWriter`, `json_file`). Restore holds writes, wipes and writes the areas through native handles (no revision bumps, so no watcher reloads and writes defaults back), and reloads with the hold still on. On a failure part way it releases the hold and throws. No service interface changed.
- **Create** copies each file into memory while collecting: a zip referencing OPFS `File`s turns unreadable once a file changes (session.json does constantly) before the zip is saved.
- **Pickers** need a user activation; without one the service throws a `BackupError` instead of a picker that never opens. Restore's fallback picker is `pick_device_files` (`<input type=file>`).


## Revision 2026-10-16 (backups as tasks)

Decided with the owner ([brainstorm](../brainstorm/2026-10-16_backup-as-tasks.md)).

- **Dependencies:** add **tasks**. Create and restore run through TasksService: progress toast with Cancel, a row in Activity Monitor › Tasks, Retry.
- **Pickers and the restore question stay before the job**, since a picker needs the click's user activation. `activity` still gates a second backup until the job settles.
- **Create:** a sequential group, one task per picked area (copying the area's files, then adding them to one `ZipWriter`), then "Save to device" (adds `backup.json`, finishes, saves).
- **Restore: stage, then swap.** One task per area unpacks into `/tmp/restore`; Cancel or a failure there clears the stage and nothing live has changed. "Replace and reload" then holds writes, wipes each area, moves the staged files in with native `move()`, applies `app.*` localStorage and reloads from inside the task. It ignores Cancel. It costs the unpacked size in OPFS while it runs; a crash during the swap still leaves a half state, as before.
- **Shell unchanged** by choice: no Ctrl+C wiring. The yields gained `not saved` / `not restored` for a cancelled or failed task.
