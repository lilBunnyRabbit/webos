# ADR-014: Window Enhancements

**Date:** 2026-02-01
**Status:** Implemented (single-instance parked)

> **Revision 2026-10-17: transition names on demand** (owner, [brainstorm](../brainstorm/2026-10-17_performance-pass.md))
> - Only the focused window carries `view-transition-name: window-{id}` at rest, never a minimized or popped-out one. Every named element is snapshotted on every transition: with all 10 windows named, minimize and restore dropped frames (headless, 10 windows: max frame 117–150 ms before, 50–67 ms after).
> - A transition acting on windows that may be unfocused (shell `win minimize` / `maximize` / `snap` / `close`, Show desktop, Gather) names them just before the old state is captured and until it finishes, through `window_transition(ids, change)` in the window component layer, so they still morph into and out of the taskbar. `view_transition()`'s signature is unchanged.
> - Picking a minimized member from a taskbar group menu makes the group button carry that member's name, so the picked window is the one that flies out.

> **Revision 2026-10-16: taskbar grouping built** (owner, [brainstorm](../brainstorm/2026-10-16_taskbar-polish.md))
> - Always on, no setting (two render paths were rejected). Windows group by app id inside the taskbar, in the order of each app's first window. The quick launch stays a separate zone (ADR-042 unchanged).
> - A group of one is the plain window item. Several windows: a count pill, a click opens `dialogs.menu` at the item listing the windows by title (else the app name); an entry restores, focuses, or focuses a popped-out window through `extract.focus()`. Right-click: Pin/Unpin, Close all. Focused and PiP marks show when any member qualifies.
> - Minimize flies into the group button for the most recently minimized member only, since two elements can't share a view-transition name; the others fade.
> - Still a taskbar UI decision: WindowsService is unchanged.

> **Revision 2026-10-12: placement, motion, reopen** (owner, [brainstorm](../brainstorm/2026-10-12_window-polish.md))
> - **Cascading positioning is replaced by remembered frames.** An app's last closed window frame is reused, clamped fully on screen. A second window of an open app cascades 28px from that app's frontmost window, wrapping to the top-left when it would overflow. No frame yet: centred at 62% × 70% of the window area within the app's constraints. Frames are recorded on close only, held by WindowsService and saved by SessionService (ADR-023 revision).
> - **Animations:** open and close are Svelte transitions (fade + scale from 0.96); minimize/restore morph to and from the taskbar button and maximize/snap morph between frames with View Transitions. Not configurable through SettingsService: reduced motion turns them off; a motion setting belongs to ADR-015.
> - **Staying reachable** (owner, from the inbox bug): when the window area shrinks, each window moves just enough to keep 96px of its titlebar on screen, never resized. "Gather windows" (Alt+Shift+G, desktop background menu) moves every visible window fully on screen.
> - **Reopen last closed window:** Alt+Shift+T, not Ctrl+Shift+T (the browser owns it). The stack lives in SessionService: last 10, memory only.

> **Revision 2026-10-12: single-instance parked** (owner, [brainstorm](../brainstorm/2026-10-12_roadmap-order.md))
> - Nothing breaks without it. Settings is one shared store, and per-window state (ADR-003 revision) made several Settings windows behave correctly.
> - The design gap: a relaunch with props (Settings › What's new while Settings is open) needs a way to reach the existing window. Focus-only drops the props; replacing props misses identical repeats. A `window.on_relaunch` hook was the candidate. Revisit only if duplicates become a real complaint.
> - "Task Manager" and "Profiler" in the candidate list no longer exist: both became Activity Monitor.

## Context

The window system handles core operations (drag, resize, snap, minimize, maximize) but lacks several expected desktop behaviors: single-instance enforcement, open/close animations, taskbar grouping, and session persistence. These were planned in the legacy version.

### Related ADRs

- **ADR-001** (App Manifest) — single-instance flag in manifest
- **ADR-002** (Service Lifecycle) — persistence hooks for session restore
- **ADR-003** (App Context) — WindowHandle for title/icon updates

## Decision

### Single-Instance Apps

App manifests can declare `single_instance: true`:

```typescript
define_app({
  id: "settings",
  single_instance: true,
  // ...
});
```

When `AppsService.launch()` is called for a single-instance app that already has an open window:
1. Find the existing window
2. If minimized, restore it
3. Focus it (bring to front)
4. Do NOT open a new window

Default behavior remains multi-instance (any number of windows per app).

**Single-instance candidates:** Settings, Task Manager, Kernel Info, Profiler.

### Window Animations

CSS-based animations for window lifecycle events:

- **Open** — scale from 0.95 + fade in (100ms)
- **Close** — scale to 0.95 + fade out (80ms)
- **Minimize** — scale down toward taskbar position + fade (150ms)
- **Maximize** — smooth bounds transition (100ms, CSS transition on position/size)
- **Restore** — reverse of maximize (100ms)

Implementation: CSS classes toggled on the window element. Use `animationend` / `transitionend` events to clean up. Animation duration configurable via SettingsService (including "no animations" option).

### Window Grouping on Taskbar

When multiple windows of the same app are open, the taskbar can group them:

- Show a single taskbar item with a count badge
- Click to expand: show list of windows for that app
- Each sub-item shows window title
- Click sub-item to focus that window
- Right-click group for "Close all" option

**Note:** This is a taskbar UI decision, not a WindowsService change. The service already tracks which app each window belongs to.

### Session Persistence

> **Superseded 2026-10-11 by [ADR-023](023-session-persistence.md):** SessionService, `/var/lib/session/session.json`, reactive saving, restore dialog, manifest `restore: false` only.

Save and restore open windows across page reloads.

**What is saved:**
- Which apps are open (app IDs)
- Window positions and sizes
- Window flags (minimized, maximized)
- Snap zones
- Z-order
- App props (only if serializable — validated via zod schema)

**When to save:**
- `beforeunload` event (primary)
- Periodic save every 30 seconds (backup)
- On explicit "Save session" action

**Storage:** SettingsService (localStorage). Session data is a serializable snapshot.

**On restore:**
- Parse saved session
- Launch each app with saved props
- Apply saved window geometry
- Restore z-order
- Skip apps whose manifests no longer exist (graceful degradation)

**Opt-out:** Settings toggle to disable session restore. Some apps may opt out via manifest: `restore: false`.

### Reopen Last Closed Window

Maintain a stack of recently closed windows (last 10). Ctrl+Shift+T reopens the most recently closed window with its previous state.

```typescript
interface ClosedWindowRecord {
  app_id: string;
  props?: Record<string, unknown>;
  position: { x: number; y: number };
  size: { width: number; height: number };
  closed_at: Date;
}
```

### Cascading Window Positioning

When opening a new window without explicit position, offset it from the last opened window:
- Offset: +30px x, +30px y
- Reset to origin when cascade would go off-screen
- Prevents all new windows from stacking exactly on top of each other

## Alternatives Considered

1. **No single-instance enforcement** — let users manage windows themselves. Rejected — Settings opening multiple times is confusing.
2. **JavaScript animations instead of CSS** — more control but worse performance. CSS transitions/animations are GPU-accelerated.
3. **No session persistence** — simpler but loses user state on every refresh. Essential for a real desktop feel.
4. **IndexedDB for session storage** — overkill. Session data is small, localStorage is fine.

## Consequences

### Positive
- Desktop feels polished and complete
- Session persistence reduces frustration on accidental refresh
- Single-instance prevents confusing duplicate windows
- Animations make the UI feel responsive and native
- Cascading prevents window stacking

### Negative
- Session restore can be slow with many windows (mitigate with lazy app loading)
- Serializing app props requires all props to be JSON-safe
- Animation timing needs to feel right — too slow feels sluggish, too fast feels jarring
- Closed window stack uses memory (bounded to 10 entries)
