# Brainstorm: Taskbar polish

**Date:** 2026-10-16
**Participants:** owner, agent

## Context

Roadmap Taskbar block: grouping by app (ADR-014, parked), auto-hide and size options (ADR-015 sketch, not built), remaining context menus. Today the bar is a floating dock in its own grid track (`desktop-shell.svelte`), one item per window ordered by `created_at`, hardcoded `h-13` bar and `size-10` items, settings `taskbar { position, pinned }`. Shell has only `taskbar pin|unpin|list`. Mobile has no taskbar (ADR-016), so none of this applies there.

## Topics discussed

### Grouping

- **Always group, quick launch stays separate** (chosen). Groups derived by app id inside the taskbar; a group of one looks like today. Several windows: click opens a list of titles through `dialogs.menu` at the item; right-click adds Close all (ADR-014). Minimize flies into the group button for the most recent window only (two elements can't share a view-transition name); the rest fade.
- Group + merge with quick launch (revises ADR-042). Rejected for now: the double icon for a running pinned app stays until the merge is picked up.
- Grouping as a setting. Rejected: two render paths.

### Auto-hide

- **Overlay with CSS reveal** (chosen). With auto-hide on, the bar leaves the grid, goes `position: fixed`, slid off except a 4 px strip. `:hover`, `:focus-within`, `:has(:popover-open)` reveal; `transition-delay: 2s` hides. One `dragenter` handler reveals during drag-to-pin. Windows and maximize get the full screen; flush mode is off under auto-hide. Minimizing while hidden reveals first.
- Reserved 4 px track, JS `revealed` state: rejected.
- Reveal on `request_attention` waits on that API.

### Size

- **S/M/L through one CSS variable** (chosen). Persisted `taskbar.size`, default `medium` = today. `--taskbar-item` 32/40/48 px; bar, items, icons, separators and the show-desktop strip derive from it. Additive settings field, no version bump.

### Shell

- `taskbar position [top|bottom|left|right]`, `taskbar size [small|medium|large]`, `taskbar autohide [on|off]`. No argument prints the current value.

## Key takeaways

- All three are taskbar UI plus additive settings fields; WindowsService unchanged.
- Settings › Taskbar gets a control per new field.

## Action items

- [x] Implement grouping, auto-hide, size, the three commands
- [x] ADR-014 / ADR-015 revision notes; docs/system taskbar + settings pages; ROADMAP

## Next session topics

- Merging quick launch with groups (ADR-042)
- Auto-hide reveal on `request_attention`
