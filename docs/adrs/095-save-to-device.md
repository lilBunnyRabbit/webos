# ADR-095: Save to this device from the save picker
**Date:** 2026-11-06
**Status:** Implemented

## Context
The save picker (ADR-025) chooses an OPFS path or a path in a mounted folder (ADR-044), and about 40 apps write the path `pick_save` returns themselves (`get_directory(folder)` + `create_file(dir, name, { content, overwrite: true })`, or `write_file`). Getting an edit onto the device took two steps: save inside WebOS, then Explorer › Save to disk. "Folder on disk…" doesn't fill the gap: Chrome refuses to mount Downloads, Desktop and the home folder themselves ("contains system files"), only folders inside them, and phones have no folder picker at all ([brainstorm](../brainstorm/2026-11-06_save-to-device.md)).

## Decision
- **"This device…" in save mode.** The save picker's footer gets the button file pickers already have. It calls `FilesService.save_to_device(name)`, which opens the native Save dialog (`showSaveFilePicker`, starts in Downloads) where there is one, and resolves a path in a fresh staging folder `/tmp/to-device/<id>/<name>`. The picker chooses that path, so `pick_save` keeps its shape and no app changes.
- **FilesService delivers.** Each staging folder maps (in memory) to the picked file handle, or to "download" where there's no Save dialog (Firefox, Safari, iOS, Android). Every write FilesService sees in that folder (`changed` / `changed_file`, the same hook revisions use) sends each non-empty file that changed since it was last sent: the primary file (the one named as picked, else the first written, since many apps add an extension to the picked name) to the handle, any other file (Image Tools › Sprites writes a JSON beside its PNG) and everything without a Save dialog to the browser's downloads. The write awaits the delivery, so a failure reaches the app's own error handling.
- **Writable.** `is_system_path` excludes a staged file (`is_device_save_path`), so editors keep it writable and a later Save goes to the same device file again (Chromium) or downloads again (elsewhere).
- **Lifetime.** `/tmp` is emptied at boot and the map is memory only, so after a reload the staged path is gone, like `/tmp/device`.
- **Shell:** nothing new.

## Alternatives Considered
- **Kit `save_to_device(blob, name)` per app.** No FilesService change, but ~40 call sites to opt in one by one, and it stays inconsistent.
- **A hint on "Folder on disk…" only.** Explains Chrome's blocklist, but still no direct save, and nothing on phones.

## Consequences
- Every app with Save as gets a direct save to any folder on the device, Downloads included, with no app code.
- A write that bypasses FilesService (raw `createWritable` on a handle the app keeps) isn't delivered. Every current `pick_save` caller writes through FilesService.
- Empty files are never sent, so an app that creates the file empty and writes it after delivers once.
- In Chromium the device file keeps the name picked in the dialog, even when the app adds an extension to it.
- A Save as that starts next to a staged file opens `/home` instead, since the staging folder is read-only in the picker.
- 2026-11-06: mobile Chrome has the Save dialog but refuses to write the file it returns (`NotAllowedError`); `write_picked` downloads instead, and that save downloads from then on.
- Apps that show the saved path ("Image saved") show `/tmp/to-device/<id>/<name>`.
