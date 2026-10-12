# ADR-030: Text Editor
**Date:** 2026-10-13
**Status:** Accepted

## Context

Text Viewer can only read. The ROADMAP's Text Editor was waiting on the close guard (ADR-029) and on whether to take a code-editor dependency. [Brainstorm](../brainstorm/2026-10-13_text-editor.md).

## Decision

- **Text Viewer becomes Text Editor**: id `text-editor`, same associations, no alias for the old id.
- **CodeMirror 6** (`codemirror`, `@codemirror/lang-javascript`, `-json`, `-markdown`, `-css`, `-html`, `-yaml`), loaded with the app chunk; the language extension is picked from the file name and loaded on demand. Theme built from the theme tokens (CSS variables), so derived themes work.
- **Always editable.** Untitled buffer without a path; Save on an untitled buffer is Save as.
- **Files like Paint:** `pick_file` / `pick_save`, `set_title(file name)`, `set_dirty(dirty, { save })`.
- **Disk changes like code editors:** watch `files.revision(parent folder)`; when the file's `lastModified` is newer than the loaded one, a clean buffer reloads (cursor and scroll kept) and a dirty one shows a banner with Reload / Keep mine. Save checks `lastModified` first and asks before overwriting.
- **Keys through ShortcutsService**, window-scoped: Save (Mod+S), Save as (Mod+Shift+S), Open (Mod+O). This is the convention for app commands; continuous game input stays on the app root.

## Alternatives Considered

1. **Separate editor app, viewer stays default** — no rename, but two apps doing one job on `text/*`.
2. **`<textarea>`** — no dependency; no highlighting, and line numbers only line up with wrap off.
3. **Last save wins / banner only** — less code, silently loses or nags.
4. **Alias for `text-viewer`** — keeps old sessions and defaults, at the cost of a permanent special case.

## Consequences

### Positive
- Text files are editable everywhere they open today, with highlighting, search and undo from CodeMirror.
- Two windows on one file stay in sync without new infrastructure.

### Negative
- First third-party UI dependency; the app chunk grows (lazy, but real) and CodeMirror's styling must be kept on tokens.
- Saved sessions lose open Text Viewer windows once; a custom `text-viewer` file default resets.
