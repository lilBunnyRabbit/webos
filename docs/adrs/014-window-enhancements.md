# ADR-014: Window Enhancements

**Date:** 2026-02-01
**Status:** Accepted

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
