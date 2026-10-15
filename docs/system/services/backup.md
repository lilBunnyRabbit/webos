# BackupService

Key `backup` · Depends on: files, dialogs, notifications, windows · ADR: [ADR-037](../../adrs/037-backups.md) · Source: `src/lib/core/api/services/backup/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Gets all WebOS data out of the browser in one piece and back in. A backup is one zip saved to the device, never to OPFS: it exists for when OPFS is gone (site data cleared, another site on the shared github.io origin clearing localStorage). Restore replaces what the zip holds and reloads. Same service on desktop and mobile.

## Areas

| Area | `BackupArea` | OPFS folder | In the zip | Also |
|------|--------------|-------------|------------|------|
| Files | `files` | `/home` | `home/…` | |
| Settings | `settings` | `/etc` | `etc/…` | |
| App data | `apps` | `/var/lib` | `var/lib/…` | every `app.*` localStorage key, in `backup.json` |

`BACKUP_AREAS` in `type.ts` lists them with label, path and zip prefix. `/tmp`, `/var` outside `/var/lib`, the service worker caches and non-`app.*` localStorage never go in.

## Format

```
webos-backup-YYYY-MM-DD.zip          (local day; the save picker may rename it)
  backup.json   { format: 1, version, created, areas, local_storage }
  home/…        etc/…        var/lib/…
```

`backup.json` (`manifest.ts`, pretty-printed): `format` is `BACKUP_FORMAT` (`1`); `version` is the WebOS build (`__VERSION_INFO__.version`); `created` an ISO datetime; `areas` the areas it holds, at least one; `local_storage` the `app.*` keys and raw string values (empty unless `apps` is in `areas`). Folders get their own entries, so empty folders survive. Entries are deflated by the zip engine (`core/utils/zip`), which stores incompressible files as they are.

`parse_manifest` checks `format` first: higher than `BACKUP_FORMAT` → "This backup comes from a newer WebOS (format N). Update WebOS, then restore it." Then the zod schema (`BackupManifestSchema`); any mismatch, including a non-`app.` key in `local_storage`, is "This backup is damaged: …". A migration only gets written once a format 2 exists.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `activity` | `BackupActivity \| null` | `$state`: `creating` or `restoring` while one runs. One at a time: starting another throws |
| `last` | `BackupSaved \| null` | The last backup saved in this tab: `{ name, size, areas, at }` |
| `sizes` | `() => Promise<Record<BackupArea, number>>` | Bytes per area now: each folder's `get_directory_size`, App data plus the UTF-8 size of its `app.*` keys and values |
| `create` | `(areas: BackupArea[]) => Promise<BackupSaved \| null>` | See [Create](#create). `null` when the picker is cancelled |
| `restore` | `() => Promise<boolean>` | See [Restore](#restore). `false` when the picker or the question is cancelled; on success the page reloads |

`BackupError` (`type.ts`) carries a message the user reads as is. The Settings section toasts it, the shell turns it into a `ShellError`.

## Create

1. `normalize_areas`: known areas, each once, in `BACKUP_AREAS` order. None → `BackupError`.
2. **Pick the target first**, while the click or key press still counts as a user activation: `showSaveFilePicker({ suggestedName, startIn: "downloads", types: zip })`. Without the picker (mobile, Firefox, Safari) the target is a download. A cancel resolves `null`.
3. `build_backup` walks each area's folder with `opfs.list_directory` and **copies each file into memory** (`arrayBuffer()`): a zip of OPFS `File`s would turn unreadable as soon as anything rewrote one of them (session.json changes whenever a window moves) before the zip reached the device.
4. Saves: `createWritable()` on the picked file, or an `<a download>` click with an object URL revoked a minute later. `last` is set and an `info` toast "Backup saved · name · size" goes out (sender `backup`, shown as System).

## Restore

1. A window with unsaved changes → `BackupError` before anything opens. The reload at the end would otherwise bring up the browser's "Leave site?", and staying would leave a page whose writes are held.
2. Picks the file: `showOpenFilePicker` (zip type), else `pick_device_files({ accept: [".zip"] })`. Cancel → `false`.
3. `open_backup`: `read_zip`, find `backup.json`, `parse_manifest`, and reject the file if an entry inside an area is encrypted or uses an unsupported method. Nothing has changed yet, so every rejection leaves the data as it was.
4. Asks with `ConfirmDialog` (`danger`, `dismissible: false`): "Replace your data with this backup?", with the backup's date and version and the areas it replaces ("Files (/home), Settings (/etc)"); confirm label "Replace and reload". The unsaved-changes check runs again after the answer.
5. `restore_backup`:
   - `hold_writes()` (files, [Writes can be held](files.md#behaviour--invariants)): waits for writes under way, then every write through `opfs.ts` (FilesService, DirectoryHandler, `LatestWriter`, `json_file`) rejects.
   - For each area in `areas`: remove the folder recursively and recreate it, through **native handles**, so no revision is bumped and no watcher (desktop, `json_file`, File Explorer) reloads and writes its defaults back.
   - Writes every zip entry of those areas, streaming each one (`entry_stream` → `createWritable()`).
   - App data: removes every `app.*` key, then sets the backup's `local_storage`.
   - On failure part way it releases the hold and throws. The areas may be half replaced; the backup file is untouched, so restoring again fixes it.
6. `location.reload()`, with the hold still on. Areas the zip doesn't hold are never touched, on disk or in localStorage.

### Why the hold

The running OS keeps state in memory that it writes back on change or on a timer: SessionService on every window change, SettingsService and the desktop layout on change, `json_file` cells (game play time every 30 s, Pomodoro, Clock), app stores. Any of those landing between the wipe and the reload would put pre-restore data back over the restored files. Holding writes at the one place they all pass through covers every writer without each service knowing about backups, and the reload makes the hold permanent for that page.

## Picker activation

`showSaveFilePicker`, `showOpenFilePicker` and `<input type=file>` need a transient user activation. A click in Settings has one; so does Enter in the Terminal or the palette, and a shortcut's key press. Before opening a picker the service checks `navigator.userActivation.isActive` (the `<input>` fallback would otherwise never open and never resolve), and a `SecurityError` / `NotAllowedError` from a picker becomes the same `BackupError`: "The file picker only opens right after a click or a key press. Try again from a button or the Terminal." The `<a download>` path needs no activation.

## State

`activity`, `last`. Nothing else; no effects, no timers.

## Lifecycle

No `init` or `destroy`. Everything heavy (`backup.ts`: the zip engine, the pickers, `ConfirmDialog`; `manifest.ts`) is `import()`ed on first use, so the boot path only carries the class, `type.ts` and `shell.ts`.

## Persistence

None of its own. It reads and replaces other services' files: see [persistence](../persistence.md#backups).

## Shell

Contributed by `shell.ts` through `IService.shell()`; bodies call the service, which loads its logic lazily. Both are `available()` only while no backup runs.

| Command | Does | Yields |
|---------|------|--------|
| `backup create [--files] [--settings] [--apps]` | Opens the save picker and saves the flagged areas; no flags = every area | `saved webos-backup-2026-10-15.zip · 48 MB`, or `cancelled` |
| `backup restore` | Opens the device file picker, validates, asks, replaces, reloads | `restored, reloading…`, or `cancelled` |

No OPFS path arguments: a backup lives on the device. A `BackupError` comes out as `backup create: <message>`. See [shell](shell.md#contributions).

## Inspector

Basic: activity and the last backup's name and size. Detailed: a table of area, folder and size (`sizes()` when opened).

## Known gaps

- Create holds every file of the chosen areas in memory (the copies, plus the deflated zip) before saving: fine for tens of MB, heavy for GBs. A streaming writer to the picked file would fix it; the download fallback needs a Blob either way.
- Restore is replace-only. Merge with conflict rules was rejected for now (ADR-037).
- The browser may still clear OPFS data that isn't persisted; a backup is manual, nothing schedules one.
- A crash or tab close between wipe and the last write leaves the areas half restored until the user restores again.
