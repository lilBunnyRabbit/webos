# ADR-076: Paste to Open
**Date:** 2026-10-26
**Status:** Accepted

## Context
Apps that open files take them from the picker, a drop or (in some apps) a paste. Paste is copied per app (18+ handlers, three gate styles), ignored by the picker, impossible on phones, blind in popped-out windows, and unaware of files copied in Explorer ([brainstorm](../brainstorm/2026-10-26_paste.md)).

## Decision
1. **Picker source.** The file picker footer gets **Paste** next to "This device…"; while the picker is open it owns Ctrl+V. Pasted device data becomes files the way "This device…" does (`store_device_files`, `/tmp/device`), then `onchoose(paths)`; WebOS-copied paths go to `onchoose` directly. Filtered by the picker's `accept` (`accepts()`).
2. **Clipboard view.** A kit sheet showing the clipboard as it is now: the system item (from the paste event, or `navigator.clipboard.read()` on the Paste button) and ClipboardService's copied files, each with a thumbnail, name, type and size; items the caller can't accept are dimmed; single or multiple selection per caller. Opened by the Paste button always, and by Ctrl+V when more than one item fits.
3. **`paste_files` kit attachment** (`$kit/utils/paste.ts` or the kit's equivalent):
   ```ts
   <div {@attach paste_files({ win, accept, multiple, onfiles, ontext? })}>
   ```
   Listens on the root's own document (works in a popped-out window), gated on the window being focused and no system or window dialog open, ignores pastes into editable fields unless `ontext` claims them, turns event files, WebOS-copied files and (via the view) choices into `File`s matching `accept`. One usable item goes straight to `onfiles`; several open the view. In-memory files, nothing written to OPFS (patterns.md "Paste and drop").
4. **Explorer copy writes paths.** `ClipboardService.copy_files` / `cut_files` also write the paths, newline-separated, as text to the system clipboard. A paste whose text equals those paths means "the WebOS files"; any other content means the system clipboard is newer.
5. **Shell.** `clip ls` lists the clipboard: WebOS files as `file` values (pipe into `open`), plus one row summarising the system item when readable.
6. **Compat.** `navigator.clipboard.read` gets an entry in `src/lib/core/compat/features.ts` if MDN doesn't mark it Baseline widely available.

## Alternatives Considered
- Per-app copies only: already divergent, PiP stays broken, phones unsolved.
- An OS-level route (`define_app({ paste })`): changes the app API and collides with apps where paste means insert.
- A WebOS clipboard history: a new state layer that only sees WebOS copies; declined.

## Consequences
- Every Open… can paste, on phones too.
- Copying in Explorer overwrites the system clipboard.
- The kit owns the paste gate; existing apps migrate to it.
