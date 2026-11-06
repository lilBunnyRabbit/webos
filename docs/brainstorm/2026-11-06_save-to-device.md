# Save to device

**Date:** 2026-11-06
**Participants:** owner, lead

## Context
Owner: saving from Image Tools and other apps can't go straight to the device, and "Folder on disk…" always fails with Chrome's "use a different folder". What they need: edit something, then save it straight to a folder on the device.

## Topics discussed
- **Why "Folder on disk…" fails.** Chrome's File System Access blocklist refuses Downloads, Desktop and the home folder themselves; folders inside them mount fine. WebOS can't override it.
- **Options.** (A) "This device…" in the save picker, FilesService delivers writes in a staging folder to the native Save dialog's file or a download; (B) a kit helper and a Download button per app; (C) a hint only.
- **Decision (owner):** A. Every `pick_save` caller gets it with no app changes. [ADR-095](../adrs/095-save-to-device.md).

## Key takeaways
- The picker keeps returning a path; the staging folder is a real OPFS folder, so every write style apps use works.
- Staged files are writable, so Save again goes to the same device file.

## Action items
- [x] Implement ADR-095 (4.1.0).

## Next session topics
- None.
