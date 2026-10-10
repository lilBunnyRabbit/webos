# ADR-022: Desktop Folder and Shortcuts
**Date:** 2026-10-11
**Status:** Accepted

## Context

The desktop is an in-memory grid of `{ app_id, props }` that resets to two hardcoded icons on every reload. The owner: desktop icons are permanent user data, not session state, and belong in the file system. Brainstorm: [2026-10-11 Session persistence](../brainstorm/2026-10-11_session-persistence.md), rounds 2 and 4.

## Decision

### 1. The desktop is `/home/Desktop`

Every entry in the folder is a desktop item. Dotfiles are hidden.

| Entry | Icon | Double-click |
|-------|------|--------------|
| `Name.desktop` (shortcut) | Target app's icon, label `Name` | Launch the target |
| Any other file | File icon, file name | `apps.open(path)` (ADR-018) |
| A folder | Folder icon | File Explorer at that folder |

### 2. Shortcut files: `.desktop`, JSON

```json
{ "app_id": "text-viewer", "props": { "path": "/home/notes.md" } }
```

The body is validated with zod (`{ app_id: string, props?: unknown }`). `apps.open(path)` checks for `.desktop` before association matching, parses the file and calls `launch(app_id, props)`, so a shortcut works the same in File Explorer. A shortcut is an OS concept, not an app.

### 3. Positions: `/home/Desktop/.layout.json`

```json
{ "version": 1, "positions": { "Settings.desktop": { "x": 0, "y": 0 } } }
```

DesktopService builds its `layout` from the folder entries and these positions. An entry with no position takes the first free cell, and that position is written back. Positions of entries that no longer exist are dropped on the next write. `DesktopHelper.fit` (ADR-011 revision) still derives the visible grid.

### 4. Behaviour

- **First boot** (the folder was just created): write `Settings.desktop` and `File Explorer.desktop`.
- **Pin to Desktop** (start menu) creates `{App name}.desktop`, auto-renamed on clash.
- **Delete on the desktop** deletes a shortcut file. Real files and folders aren't deleted from the desktop until the window overlays (ADR-003 `confirm`) exist.
- **Refresh:** DesktopService re-reads the folder when `files.revision("/home/Desktop")` changes (ADR-021).
- DesktopService depends on `files` and `apps`.

## Alternatives Considered

- **Layout JSON in a system folder** (`/etc/desktop.json`): simpler, but files can't live on the desktop.
- **localStorage `webos.desktop`**: not file-system data.
- **A Shortcut app associated with `.desktop`**: no special case in `open()`, but an app that only bounces to another, and Open-with could offer Text Viewer.
- **Freedesktop INI format**: truest to Linux, but needs an INI parser, and props don't fit naturally.

## Consequences

### Positive
- The desktop survives reloads and holds real files.
- File Explorer and the desktop show the same thing.

### Negative
- Desktop load is async (folder plus layout file) and happens in `init()`.
- Renaming an entry in File Explorer loses its position (it falls back to the first free cell).
- Changes from other tabs only show up after a reload.

## Related
- ADR-011 (desktop enhancements), ADR-018 (file associations), ADR-021 (hierarchy)
