# BackupService

Key `backup` · Depends on: files, dialogs, notifications, windows, tasks · ADR: [ADR-037](../../adrs/037-backups.md) · Source: `src/lib/core/api/services/backup/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Gets all WebOS data out of the browser in one piece and back in. A backup is one zip saved to the device, never to OPFS: it exists for when OPFS is gone (site data cleared, another site on the shared github.io origin clearing localStorage). Restore replaces what the zip holds and reloads. Same service on desktop and mobile.

## Areas

`/tmp` and `/mnt` are never backed up: mounted folders live on the real disk and their handles in IndexedDB, outside every area (ADR-044).

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
| `create` | `(areas: BackupArea[]) => Promise<BackupSaved \| null>` | See [Create](#create). Resolves when the task settles; `null` when the picker is cancelled or the task is cancelled or fails (its toast says which) |
| `restore` | `() => Promise<boolean>` | See [Restore](#restore). `false` when the picker or the question is cancelled, or the task is cancelled or fails; on success the page reloads |

`BackupError` (`type.ts`) carries a message the user reads as is. The Settings section toasts it, the shell turns it into a `ShellError`.

## Create

1. `normalize_areas`: known areas, each once, in `BACKUP_AREAS` order. None → `BackupError`.
2. **Pick the target first**, while the click or key press still counts as a user activation: `showSaveFilePicker({ suggestedName, startIn: "downloads", types: zip })`. Without the picker (mobile, Firefox, Safari) the target is a download. A cancel resolves `null`.
3. Runs `backup_task` (`tasks.ts`) through [TasksService](tasks.md) (sender `backup`, shown as System; title "Backing up files" or "Backing up 3 areas"). A sequential group, since one `ZipWriter` appends entries in order:
   - **One task per picked area** ("Files (/home)"): `area_sources` walks the folder with `opfs.list_directory` and **copies each file into memory** (`arrayBuffer()`), since a zip of OPFS `File`s would turn unreadable as soon as anything rewrote one of them (session.json changes whenever a window moves) before the zip reached the device. Then each source is added with the job's signal and `pace`; progress and the message ("Files: 2 MB of 8 MB") count uncompressed bytes. Logs the file count and size; App data also logs its `app.*` key count.
   - **Save to device**: adds `backup.json` (`manifest_source`), `finish()`es the zip and saves it: `createWritable()` on the picked file, or an `<a download>` click with an object URL revoked a minute later. Sets `last`.
4. The job's toast becomes "Backup saved · name · size", "Backup cancelled" or "Couldn't save the backup". Cancel (toast, Activity Monitor) stops between chunks. Retry rebuilds the zip into the same picked target.

## Restore

1. A window with unsaved changes → `BackupError` before anything opens. The reload at the end would otherwise bring up the browser's "Leave site?", and staying would leave a page whose writes are held.
2. Picks the file: `showOpenFilePicker` (zip type), else `pick_device_files({ accept: [".zip"] })`. Cancel → `false`. Both pickers and the question come before the task, because a picker needs the click's user activation.
3. `open_backup`: `read_zip`, find `backup.json`, `parse_manifest`, and reject the file if an entry inside an area is encrypted or uses an unsupported method. Nothing has changed yet, so every rejection leaves the data as it was.
4. Asks with `ConfirmDialog` (`danger`, `dismissible: false`): "Replace your data with this backup?", with the backup's date and version and the areas it replaces ("Files (/home), Settings (/etc)"); confirm label "Replace and reload". The unsaved-changes check runs again after the answer.
5. Runs `restore_task` (`tasks.ts`) through TasksService, title "Restoring backup", a sequential group in two halves:
   - **Stage** (cancellable, nothing live changes): "Clear /tmp/restore" (`clear_stage`), then one task per area the backup holds ("Unpack Files (/home)"): `stage_area` streams every entry of that area (`entry_stream` → `createWritable()`, with the job's signal) into `STAGE_PATH` (`/tmp/restore`) under its zip path. Progress counts uncompressed bytes. A cancel or failure here clears the stage and toasts "Restore cancelled · Nothing was changed".
   - **Replace and reload** (ignores Cancel): checks unsaved windows once more, then `swap_staged`:
     - `flush_writers()` first, so a debounced `LatestWriter` save (settings, session, app files) lands before the hold. Create does the same before packing the areas.
     - `hold_writes()` (files, [Writes can be held](files.md#behaviour--invariants)): waits for writes under way, then every write through `opfs.ts` (FilesService, DirectoryHandler, `LatestWriter`, `json_file`) rejects.
     - For each area in `areas`: remove the folder recursively and recreate it, then move the staged tree in with native `FileSystemFileHandle.move()` per file (OPFS directories have no `move()`). All through **native handles**, so no revision is bumped and no watcher (desktop, `json_file`, File Explorer) reloads and writes its defaults back.
     - App data: removes every `app.*` key, then sets the backup's `local_storage`.
     - Clears the stage. On failure part way it releases the hold and throws. The areas may be half replaced; the backup file is untouched, so restoring again fixes it.
   - Then `location.reload()` from inside the task, with the hold still on, so a Retry that gets this far reloads too. A Cancel that lands during the swap shows "Too late to stop" and the swap finishes and reloads anyway; the stage isn't cleared under it.
6. Areas the zip doesn't hold are never touched, on disk or in localStorage. The stage costs the backup's unpacked size in OPFS for the length of the restore.

### Why the hold

The running OS keeps state in memory that it writes back on change or on a timer: SessionService on every window change, SettingsService and the desktop layout on change, `json_file` cells (game play time every 30 s, Pomodoro, Clock), app stores. Any of those landing between the wipe and the reload would put pre-restore data back over the restored files. Holding writes at the one place they all pass through covers every writer without each service knowing about backups, and the reload makes the hold permanent for that page.

## Picker activation

`showSaveFilePicker`, `showOpenFilePicker` and `<input type=file>` need a transient user activation. A click in Settings has one; so does Enter in the Terminal or the palette, and a shortcut's key press. Before opening a picker the service checks `navigator.userActivation.isActive` (the `<input>` fallback would otherwise never open and never resolve), and a `SecurityError` / `NotAllowedError` from a picker becomes the same `BackupError`: "The file picker only opens right after a click or a key press. Try again from a button or the Terminal." The `<a download>` path needs no activation.

## State

`activity`, `last`. Nothing else; no effects, no timers. The running job lives in TasksService. `activity` stays set until the job settles, so a second backup can't start meanwhile; a Retry from the toast or Activity Monitor runs outside that gate.

## Lifecycle

No `init` or `destroy`. Everything heavy (`backup.ts`: the zip engine, the pickers, `ConfirmDialog`; `manifest.ts`; `tasks.ts`: the task builders and `@lilbunnyrabbit/task-manager`) is `import()`ed on first use, so the boot path only carries the class, `type.ts` and `shell.ts`.

## Persistence

None of its own. It reads and replaces other services' files: see [persistence](../persistence.md#backups).

## Shell

Contributed by `shell.ts` through `IService.shell()`; bodies call the service, which loads its logic lazily. Both are `available()` only while no backup runs.

| Command | Does | Yields |
|---------|------|--------|
| `backup create [--files] [--settings] [--apps]` | Opens the save picker and saves the flagged areas; no flags = every area | `saved webos-backup-2026-10-15.zip · 48 MB`, or `not saved` (picker cancelled, or the task cancelled or failed; the toast says why) |
| `backup restore` | Opens the device file picker, validates, asks, replaces, reloads | `restored, reloading…`, or `not restored` (picker or question cancelled, or the task cancelled or failed) |

No OPFS path arguments: a backup lives on the device. A `BackupError` comes out as `backup create: <message>`. See [shell](shell.md#contributions).

## Inspector

Basic: activity and the last backup's name and size. Detailed: a table of area, folder and size (`sizes()` when opened).

## Known gaps

- Create holds every file of the chosen areas in memory (the copies, plus the deflated zip) before saving: fine for tens of MB, heavy for GBs. A streaming writer to the picked file would fix it; the download fallback needs a Blob either way.
- Restore is replace-only. Merge with conflict rules was rejected for now (ADR-037).
- The browser may still clear OPFS data that isn't persisted; a backup is manual, nothing schedules one.
- A crash or tab close during the swap leaves the areas half restored until the user restores again. One during staging leaves only `/tmp/restore` behind, cleared by the next restore.
- Ctrl+C in the Terminal doesn't cancel a backup job (the owner kept the commands as they were); Cancel is on the toast and in Activity Monitor.
