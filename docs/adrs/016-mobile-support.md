# ADR-016: Mobile Support

**Date:** 2026-02-01
**Status:** Accepted (groundwork implemented 2026-10-12)

> **Revision 2026-10-12: groundwork** (owner, [brainstorm](../brainstorm/2026-10-12_mobile-groundwork.md))
> - Built early, before the mobile shell: `kernel.platform` and the interface split. Everything else waits for the last roadmap block.
> - **Detection:** `?platform=mobile|desktop` wins; otherwise `(pointer: coarse) and (hover: none)` means mobile. A plain readonly value, not reactive (it never changes).
> - **Interfaces:** the sketch below is outdated. The base keeps the name `WindowsService` and holds what shared code calls, including `toggle_maximize` and `container.element`. `DesktopWindowsService extends WindowsService` adds `container.bounds`, `set_container`, `snap`. Shared callers were checked one by one (apps, dialogs, session, window handle, Activity Monitor).
> - Until a mobile shell exists, `platform` is read by nothing: mobile devices still get the desktop services and shell.

## Context

The current UI is a desktop OS metaphor — windows, taskbar, desktop grid. Mobile devices need a fundamentally different UX: fullscreen apps, an app switcher, and a paged home screen with a dock. The kernel's service registry was designed to support swapping service implementations per platform.

## Decision

### Platform Detection

- Detect platform **once on load** (runtime, not build-time) using viewport width and/or user agent heuristics
- Expose as `kernel.platform: "mobile" | "desktop"` — a simple reactive value, not a full service
- No dynamic switching between modes at runtime (v1)
- Apps can read `kernel.platform` for platform-specific behavior, but this is opt-in — most apps should rely on Tailwind container queries (`@sm:`, `@md:`, etc.) which already work via `@container` on windows

### Shell-Level Component Split

`os.svelte` renders one of two component trees based on platform:

```svelte
{#if kernel.platform === "mobile"}
  <MobileShell />
{:else}
  <DesktopShell />
{/if}
```

Each shell has its own component tree:

| Desktop | Mobile |
|---------|--------|
| `window-manager.svelte` — positioned windows | Fullscreen app container |
| `window.svelte` — titlebar, drag, resize, snap | Minimal chrome (status bar only) |
| `taskbar.svelte` — window list, system tray | Bottom dock with pinned apps |
| `desktop.svelte` — icon grid | Paged home screen with app search |

### Service Swapping

Conditional registration in `init.ts`:

```typescript
if (kernel.platform === "mobile") {
  register("windows", { instance: MobileWindowsService, dependencies: [] });
  register("desktop", { instance: MobileDesktopService, dependencies: ["apps"] });
} else {
  register("windows", { instance: WindowsService, dependencies: [] });
  register("desktop", { instance: DesktopService, dependencies: ["apps"] });
}
```

Services that **don't change**: `FilesService`, `AppsService`, `SettingsService`, `VersionService`.

### Shared Service Interfaces

Define base interfaces that both desktop and mobile implementations satisfy:

```typescript
interface IWindowsService extends IService {
  open(app: AppInstance): WindowId;
  destroy(id: WindowId): void;
  close_all(): void;
  focus(id: WindowId): void;
  is_focused(id: WindowId): boolean;
  get_focused(): WindowId | null;
  get(id: WindowId): WindowInstance | null;
  list(): WindowInstance[];
}
```

Desktop extends with: `snap()`, `toggle_maximize()`, resize/drag support, `container` bounds.
Mobile extends with: fullscreen-only behavior, gesture hooks.

Desktop-only fields on `WindowInstance` (`bounds`, `snap_zone`, `constraints`) are present but defaulted/ignored on mobile.

### Mobile UX Model

- **Home screen**: Paged grid of app icons + bottom dock with pinned apps + search
- **App launch**: Opens fullscreen, no window chrome
- **App switching**: Horizontal scroll of app cards (triggered by gesture or button)
- **Navigation**: Back gesture (swipe from edge), home gesture (swipe up), app switcher (swipe up and hold)
- **No taskbar**: Navigation is gesture-based with optional on-screen buttons

### What Apps Don't Need to Do

- Apps already use `@container` queries — they're responsive to their container size
- On mobile the container is the full viewport — apps get maximum space automatically
- `constraints` in app manifests are ignored on mobile
- No app code changes required for basic mobile support

## Alternatives Considered

### Build-time platform split
Separate builds for mobile and desktop. Rejected — prevents tablet/responsive scenarios and doubles build complexity.

### Dynamic runtime switching
Detect viewport changes and swap services/shell on the fly. Rejected for v1 — shell switching unmounts all components, losing app state regardless of service-level state transfer. The complexity isn't justified for an edge case.

### Single service implementation with mode flag
One `WindowsService` that behaves differently based on a `mode` flag. Rejected — leads to excessive conditionals inside one class. Separate implementations are cleaner.

### PlatformService
A dedicated service for platform detection and capabilities. Rejected — a simple `kernel.platform` value covers the need. Can promote to a service later if capabilities grow (orientation, PWA mode, touch detection).

## Consequences

### Positive
- Clean separation between desktop and mobile UX without compromising either
- Apps work on both platforms for free via container queries
- Kernel's service registry pattern fulfills its original design goal
- Each platform's components can evolve independently

### Negative
- Two component trees to maintain (desktop shell + mobile shell)
- Shared service interfaces add a layer of abstraction
- No dynamic platform switching — users on tablets must reload to switch modes
- Desktop-only fields on `WindowInstance` are unused baggage on mobile
