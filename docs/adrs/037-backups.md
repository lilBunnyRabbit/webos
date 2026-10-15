# ADR-037: Backups
**Date:** 2026-10-15
**Status:** Accepted

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
