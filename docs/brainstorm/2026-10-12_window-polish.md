# Window polish: opening, motion, reopen

**Date:** 2026-10-12
**Participants:** owner, Claude

## Context

Roadmap block 3, second half (ADR-014: cascade, animations, closed-window stack). The owner: new windows "still kinda feel off compared to the native OS experience", cause unknown. Diagnosis from the code, before any decision:

| Symptom | Cause | Where |
|---------|-------|-------|
| Every window is 600×400 (or its min), tiny on a large screen, and forgets the size you gave it | Fixed size; no per-app preferred or remembered size | `WindowsHelper.legacy_calculate_bounds` |
| New windows land in the top-left, not where you look | Fixed origin (100, 100), cascade by **window count**, not relative to the focused window | same |
| Two windows open at exactly the same spot | Cascade index is `count % 15`; closing one and opening another reuses a slot; reset jumps back to (100, 100), on top of the first | same |
| Cascade resets too early | `max_y` subtracts 80px for a taskbar the container already excludes | same |
| Window pops in, vanishes, minimizes and maximizes with no motion | No animations (ADR-014 not built) | `window.svelte` |
| Blank frame with a spinner on every first open | The app component is a lazy import; the spinner shows from frame one | `window-content.svelte` |
| Typing right after opening goes nowhere | The new window is raised but never gets DOM focus | `window.svelte` (`tabindex=-1`, nothing calls `focus()`) |

Fixed without a decision (bugs): focus the window when it becomes focused, delay the loading spinner, drop the 80px taskbar subtraction.

## Topics

### 1. Placement and size
- **Remember per app** (chosen). The frame an app's window had when it closed is reused for the next one. A second window of an app that's already open cascades 28px from that app's frontmost window. No frame yet: centred, 62% × 70% of the window area, clamped to the app's constraints.
- Owner: "remember can go offscreen". So every placement ends fully inside the area: a remembered frame from a bigger screen shrinks and moves back in, and a cascade that would overflow wraps to the top-left of the area.
- Rejected: smart default with no memory (forgets your resizing); ADR-014's literal +30px from the last window (keeps the tiny fixed size).

### 2. Who stores frames
- **Windows holds, session saves** (chosen). `WindowsService` keeps `frames` in memory and uses them in `open()`; `SessionService` loads them into windows at init and saves them in `session.json` v2 (`{ version, windows, frames }`). Windows keeps zero dependencies. A v1 file still parses, with no frames. Mobile holds them untouched, so a phone visit doesn't erase the desktop's frames.
- Rejected: a separate frames file (two writers); windows owning files (breaks "depends on none", mobile inherits I/O).

### 3. When a frame is recorded
- **On close only** (chosen; owner overrode the every-move recommendation). `instance.bounds` is the normal frame even while maximized or snapped (those are a flag and a zone on top), so it's recorded as is.
- Cost accepted: closing the tab with windows open records nothing; session restore covers that path.

### 4. Motion
- **CSS + View Transitions** (chosen). Open and close: Svelte `in`/`out` on the window (fade + scale from 0.96, `scale` property so it doesn't fight the drag `transform`). Minimize/restore morph between the window and its taskbar button, maximize and snap morph between frames: View Transitions, the API the mobile shell already uses. The window carries `view-transition-name: window-{id}` while visible; its taskbar button carries it while minimized, so the names never clash.
- Cost accepted: a view transition snapshots the page, so content freezes ~250ms and clicks during the morph are lost.
- Reduced motion: no transitions.

### 5. Reopen closed windows
- **SessionService owns the stack, Alt+Shift+T** (chosen). Ctrl+Shift+T belongs to the browser. Session already snapshots windows; it diffs consecutive snapshots, so a window that disappears is pushed onto `closed` (newest first, max 10, memory only). `reopen_closed()` restores the newest through `windows.restore()`, un-minimized.
- Rejected: WindowsService holding dead `AppInstance`s; parking it.

## Key takeaways

- The "feels off" was mostly size and position: a fixed 600×400 at (100, 100), no memory. Then no motion, a spinner blink and no keyboard focus.
- Session's file changes shape (v2). No new service, no new file.

## Action items

- [x] ADR-014 revision, ADR-023 revision
- [x] Placement + frames, session v2, closed stack + Alt+Shift+T
- [x] Open/close transitions, view-transition morphs for minimize/maximize/snap
- [x] Focus on open, spinner delay
- [x] System reference, design docs, roadmap, changelog

## Next session topics

- Tasks service (ADR-013), block 4.
