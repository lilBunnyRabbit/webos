# ADR-031: Open from Device
**Date:** 2026-10-13
**Status:** Implemented

## Context

Apps open files through `window.pick_file()` (ADR-025), which only browses OPFS. A file on the real device had to be uploaded in File Explorer, or pasted, before an app could open it. Some apps already accepted a raw `File` from drop and paste; the rest only worked with paths. Discussion: [brainstorm](../brainstorm/2026-10-13_open-from-device.md).

## Decision

1. **`pick_device_files(options?)` in `$lib/core/utils/device-file`.** It opens the browser's file chooser through a detached `<input type="file">` and resolves the chosen `File`s in memory, or `[]` on cancel. Options: `accept` (association syntax, joined into the input's `accept`) and `multiple` (default `false`). Nothing is written to OPFS. `opfs.upload_files` uses it and then stores the files.
2. **Every app with Open… gets a secondary "Open from device…" action**: an `IconButton` (`Devices` icon) right after Open… in the toolbar, and a "From device…" `Button` after the primary action in the empty state. The app feeds the files to the loader it already uses for drop and paste.
3. **A device file has no path.** Path-only apps hold `string | File`:
   - Viewers (Media Preview, PDF Viewer, HTML Preview, CSV Viewer) keep `source: string | File`, with `path` derived from it.
   - Paint and Text Editor open the file as untitled under its own name, so Save goes to Save as with that name prefilled.
   - Speed Reader and the Dev Tools hash read the file directly.

## Alternatives Considered

- **"From device…" inside the file picker**, importing into `/tmp` and returning a path. No app changes, and path features keep working. Rejected: it still writes to storage, it's hidden one level down, and a Save in Text Editor would write into `/tmp`, which is emptied at boot.
- **A `WindowHandle.pick_device_files` method.** The app work is the same and it changes the handle's API shape. The only gain is being discoverable next to `pick_file`.
- **Importing on open into `/home/Downloads`.** That's the upload flow made silent, and the copies pile up.

## Consequences

- No OPFS write, no copy to clean up.
- What a device file can't do: disk watch (Text Editor), Save to disk (Media Preview), remembered reading position (Speed Reader), session restore. This matches a dropped file.
- A new app with Open… should add the device action too (design patterns: Toolbars).

## Revision 2026-10-21
`DeviceFileOptions` gains `capture?: "environment" | "user"`, set as the input's `capture` attribute, so phones open the camera. Font Maker and Proposals use it instead of keeping local copies.
