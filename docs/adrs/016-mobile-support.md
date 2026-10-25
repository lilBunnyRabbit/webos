# ADR-016: Mobile Support

**Date:** 2026-02-01
**Status:** Implemented 2026-10-12 (core shell, apps pass, OS back 2026-10-14)

> **Revision 2026-10-25: list home** (owner, [brainstorm](../brainstorm/2026-10-25_niagara-home.md)). The grid home is replaced by a Niagara-style list: clock, recent apps, the pinned entries and widgets in order, an All apps row, and a letter rail that shows one letter's apps while held. The dock and pages are gone: `MobileDesktopService` drops `pages()`, `dock()`, `set_docked`, `dock_full` and `HomeSlot`, and keeps `resize_widget` (owner, PR review: an edit-mode handle changes the height in rows, `w` stays as the desktop set it); a saved dock is appended to the end of the home order once on load and `home-layout.json` keeps only `order`. The full app list is the letter panel's browse mode and is `UiOverlay.LAUNCHER` on mobile, so Back, Home and an app taking focus close it (ADR-028); its filter matches like the old drawer (names, keywords, Related), plus a Not installed section. `ui launcher` sends an open app home, since the list lives in the home under the windows. The mobile app drawer is deleted.

> **Revision 2026-10-15: shared base class** ([brainstorm](../brainstorm/2026-10-15_code-quality-pass.md)). `WindowsService` and `MobileWindowsService` both extend the abstract `BaseWindowsService` (`windows/base.svelte.ts`), which holds the members they had byte-identical: back handlers, the close guard, `set_title`, `set_dirty`, `has_dirty` and `page_hidden`. Platform behaviour stays in each class; the public interface and registration are unchanged.

> **Revision 2026-10-15: lazy platform modules** ([ADR-036](./036-boot-loading-screen.md)). The platform's shell (`load_shell()` in `components/platform-shell.ts`) and its `WindowsService` / `DesktopService` classes (`kernel/init.ts`) are `import()`ed for `kernel.platform` only, so a phone never downloads the desktop shell and the other way round. `main.ts` awaits the shell during boot and hands it to `os.svelte` as a prop, so it renders with the first paint.

> **Revision 2026-10-19: home edit mode and widgets** (owner, [brainstorm](../brainstorm/2026-10-19_mobile-home-widgets.md)). Icons move again, inside an edit mode where items carry `touch-action: none`, so a drag never competes with the browser's scroll (the cause of the 2026-10-13 removal on Samsung Internet). Widgets show on the home, spanning cells in the ordered flow (`paginate_spans`); `MobileDesktopService.pages(columns, rows)` replaces `pages(capacity)` and gains `home()` and `resize_widget`.

> **Revision 2026-10-14: OS back** (owner, [brainstorm](../brainstorm/2026-10-14_os-back.md)). The device's back gesture now runs the same back as the nav bar, through a history guard in UiService (ADR-028 revision). Sheets now come before the app's own back. Desktop browser Back gets the same guard.

> **Revision 2026-10-12: groundwork** (owner, [brainstorm](../brainstorm/2026-10-12_mobile-groundwork.md))
> - Built early, before the mobile shell: `kernel.platform` and the interface split. Everything else waits for the last roadmap block.
> - **Detection:** `?platform=mobile|desktop` wins; otherwise `(pointer: coarse) and (hover: none)` means mobile. *Revision 2026-10-12:* or `navigator.userAgentData.mobile` (Client Hints), because Samsung Internet on Galaxy phones reports `hover: hover` and got the desktop shell. A plain readonly value, not reactive (it never changes).
> - **Interfaces:** the sketch below is outdated. The base keeps the name `WindowsService` and holds what shared code calls, including `toggle_maximize` and `container.element`. `DesktopWindowsService extends WindowsService` adds `container.bounds`, `set_container`, `snap`. Shared callers were checked one by one (apps, dialogs, session, window handle, Activity Monitor).
> - Until a mobile shell exists, `platform` is read by nothing: mobile devices still get the desktop services and shell.

> **Revision 2026-10-12: mobile shell** (owner, [brainstorm](../brainstorm/2026-10-12_mobile-shell.md)). Replaces the Mobile UX Model and the service sketch below.
> - Phones and tablets share one shell. `init.ts` registers `MobileWindowsService` and `MobileDesktopService` on mobile; `os.svelte` renders `MobileShell` or `DesktopShell` once.
> - **Windows:** every app stays mounted. The focused one is fullscreen; home is "nothing focused". The switcher scales the live windows into cards. Maximize and bounds are no-ops. Switcher and drawer state are local to the shell.
> - **Navigation:** a three-button bar (back, home, running apps). No WebOS gesture starts at a screen edge: those belong to the device. Back closes the drawer or switcher, then sends the app home; the OS back gesture keeps its browser meaning (apps claiming back and history wiring: separate brainstorm).
> - **Home:** the `/home/Desktop` items in an ordered flow (no gaps), paged by measured capacity, plus a dock. Order and dock live in `/var/lib/desktop/home-layout.json`. An app drawer with search replaces the start menu. Long press opens the item menu; long press and move reorders.
> - **Desktop service split:** base `DesktopService` addresses items by name; `GridDesktopService` (desktop) and `MobileDesktopService` extend it. Both own a `DesktopFolder` for the folder logic.
> - No WebOS status bar: the device has one. Safe-area insets pad the shell. Sessions use the same file; mobile ignores geometry.

> **Revision 2026-10-12: apps pass** (owner, [brainstorm](../brainstorm/2026-10-12_mobile-apps-pass.md))
> - Apps read `kernel.platform` where behaviour differs (tap to open instead of double-click). Layout still adapts through container queries.
> - Back is an app concept on mobile: `WindowHandle.on_back(handler)` (ADR-003 revision). The shell's Back asks the on-screen app first.
> - Each shell renders its own `DialogsHost`; the mobile one shows context menus as bottom sheets.

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
