# Inbox

Unsorted ideas and bugs. Organize into ROADMAP / brainstorm / ADRs later.

## Bugs

### Windows stranded off-screen after browser resize — 2026-10-12

Shrinking the browser width leaves windows outside the visible area, unreachable.

Notes:
- `WindowsHelper.clamp_bounds()` (`src/lib/core/api/services/windows/helper.ts:42`) already exists, but is only used on session restore (`service.svelte.ts:200`), not when the container shrinks.

Options (lightest first):
1. **Clamp on container resize.** When `container.bounds` changes, run `clamp_bounds` on every window. Simple, but permanent: grow the browser back and the windows stay squeezed/moved.
2. **Keep a grab handle reachable.** Clamp only so at least N px of the title bar stays on screen (macOS/Windows behaviour). Window size untouched, less destructive, still always draggable.
3. **Render-time clamp, stored bounds untouched.** Display position = clamp(stored, container); stored bounds only change when the user drags. Growing the browser back restores the original layout. Needs a split between "stored" and "displayed" bounds.
4. **Recovery action instead of auto-fix.** Taskbar/window menu "Move to screen" or "Gather windows" (Windows: Alt+Space → Move). Zero auto-magic, but user has to know it exists. Combines well with 2.
5. **Maximized/snapped windows** should re-fit to the new size regardless (they track the container, not free bounds) — check whether they already do.

## Ideas

### File Explorer: drag and drop files into folders — 2026-10-12

Drag one or more files onto a folder to move them. Already on ROADMAP ("Drag-and-drop file operations", must auto-rename via `available_name()`). Pairs with Explorer multi-select.

### Desktop: multi-select — 2026-10-12

Already on ROADMAP (ADR-011: marquee, Ctrl+Click, Shift+Click).

### File Explorer: multi-select — 2026-10-12

Ctrl/Shift+Click, marquee, Ctrl+A. Bulk copy/cut/delete/drag. Not on ROADMAP yet. Should probably share selection behaviour with Desktop multi-select.
