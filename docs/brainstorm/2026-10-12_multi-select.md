# Multi-select and drag to folder

**Date:** 2026-10-12
**Participants:** owner, Claude

## Context

Roadmap block 6 (ADR-011) plus two inbox items. Owner: "click drag and the rectangle shows and you can select all of it with it - like any desktop os works. then i can move/delete/etc on all the selected". Today there is no selection anywhere: a desktop icon or Explorer row looks selected only while it has DOM focus. The desktop drags one icon with a custom mouse handler (`ItemHandler`) and `desktop.move_item(from, to)`; Explorer rows can't be dragged. The only "move these paths into a folder" logic is inline in `clipboard.paste_files`.

## Topics

### 1. Where selection lives
- **Local state in each surface + a pure helper** (chosen). `desktop.svelte` and `file-list.svelte` each own a set of names; the click rules (plain, Ctrl toggle, Shift range) and rectangle hit-testing are pure functions shared by both. UI state, not persisted, services untouched.
- Rejected: on DesktopService (UI state in a domain service, the mobile service would need it), a shell context (new state layer, one consumer).

### 2. Group move on the desktop
- **Keep the shape; icons landing on a taken or off-grid cell take the nearest free one** (chosen, Windows behaviour). A new `GridDesktopService.move_items(moves)` writes the layout once; moving one at a time would collide with the group's own cells.
- Rejected: block the whole drop; pack into a block.

### 3. Scope
- **Desktop and File Explorer together** (owner overrode "desktop first").
- **Group actions:** Delete / Cut / Copy, Open all, drop onto a folder. Arrow-key selection not in v1.
- **Mobile:** unchanged for v1 (tap opens, long press menus). A touch selection mode is its own design.

### 4. How drags work
- **Native HTML drag and drop** (chosen). `draggable`, a WebOS data type carrying the paths. Works desktop ↔ any Explorer window and between windows, and can later accept files dragged in from the OS. The desktop's own mouse drag is replaced: grid repositioning runs on `dragover`/`drop`.
- Cost accepted: the browser draws the drag ghost.
- Rejected: pointer events per surface (no cross-surface drops), a custom drag controller with shared state (reimplements native DnD).

### 5. Name clashes on drop
- **Auto-rename, no question** (chosen; the roadmap already said so): `photo (1).png`. Paste keeps asking.

### 6. Where the move logic lives
- **`FilesService.move_paths(paths, target)`** (owner's pick over extracting a function or a clipboard method). Path-based, on the files service. `copy_paths` sits beside it, and `clipboard.paste_files` delegates to both with its conflict question, so the self-paste and same-folder rules exist once.

## Key takeaways

- One selection behaviour, two surfaces, no new state layer.
- Native DnD is what makes Explorer ↔ desktop drops possible at all.
- Files service grows path-based moves; GridDesktopService grows `move_items`.

## Action items

- [x] ADR-011 and ADR-005 revisions
- [x] `files.move_paths` / `copy_paths`, clipboard delegates
- [x] Selection helper, `desktop.move_items`
- [x] Desktop: marquee, click rules, group actions, native drag
- [x] Explorer: same, plus folder rows and the list as drop targets
- [x] System reference, design docs, roadmap, changelog

## Next session topics

- Dropping real files from the OS (upload by drop).
- Touch selection mode on mobile.
- Arrow-key selection.
