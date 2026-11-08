# WindowsService

Key `windows` · Depends on: none · ADR: [ADR-014](../../adrs/014-window-enhancements.md) (placement, frames), [ADR-016](../../adrs/016-mobile-support.md), [ADR-023](../../adrs/023-session-persistence.md) (`restore`), [ADR-085](../../adrs/085-app-guides.md) (`guide` flag), [ADR-101](../../adrs/101-immersive-windows.md) (`immersive` flag) · Source: `src/lib/core/api/services/windows/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Owns every open window: its geometry, flags, snap zone and z-order. It's pure state. Rendering, drag and resize live in the shell ([shell/window.md](../shell/window.md), [shell/window-manager.md](../shell/window-manager.md)).

The service doesn't know about app lifecycles. A window is just a record holding an `AppInstance`; [AppsService](apps.md) builds that record and calls `open()`. [SessionService](session.md) calls `restore()` with instances from `apps.create_instance`.

| File | Contents |
|------|----------|
| `type.ts` | `WindowsService` interface (JSDoc reference for the repo), `WindowInstance`, `WindowFlag`, `SnapZone`, `WindowConstraints`, `WindowOptions`, `WindowSnapshot`, `WindowFrames`, `RestoreResult` |
| `base.svelte.ts` | `BaseWindowsService`, the abstract class both implementations extend: the window index, back handlers, the close guard, `set_title`, `set_dirty`, `has_dirty`, `page_hidden`, `set_immersive` with the page's browser fullscreen, and the `beforeunload` / `visibilitychange` / `fullscreenchange` listeners (`init()` / `destroy()`) |
| `service.svelte.ts` | Desktop implementation |
| `mobile.svelte.ts` | Mobile implementation, see [Mobile](#mobile) |
| `close-guard.ts` | `CloseGuard`: close prompt and per-window save for the dirty path |
| `helper.ts` | `WindowsHelper.place` (where a new window opens), `clamp_bounds`, `keep_reachable`, `CASCADE_OFFSET`, `REACHABLE`. Tested in `helper.test.ts` |
| `shell.ts`, `shell-run.ts` | The shell contribution and its lazy bodies, see [Shell](#shell) |
| `inspector.svelte`, `mobile-inspector.svelte` | Kernel app inspectors for each implementation; the detailed table lists each window's flags, so a shown guide reads `guide` |

## Window model

```ts
interface WindowInstance {
  id: WindowId;                  // uuid v4, string alias
  created_at: Date;              // taskbar sorts by this
  order: number;                 // z-index; higher = in front
  flags: Flags<WindowFlag>;      // SvelteSet subclass
  snap_zone: SnapZone | null;
  constraints: WindowConstraints; // { width?: { min?, max? }, height?: { min?, max? } }
  bounds: Bounds;                // { x, y, width, height } in px, the "restored" geometry
  app: AppInstance;              // { id, manifest (minus component), component: Promise, props, state }
  title?: string;                // window.set_title; app name when absent (ADR-029)
  dirty?: boolean;               // window.set_dirty; never saved with the session
}
```

| Concept | Values | Notes |
|---------|--------|-------|
| `WindowFlag` | `minimized`, `maximized`, `debug`, `guide`, `immersive` | `debug` makes the window render its debug children (bounds + drag state JSON). Only the `example` user app sets it. `guide` shows the app's guide over the content (ADR-085, [window](../shell/window.md#guide)); transient like `debug`: the session keeps only `minimized` and `maximized` (`SESSION_FLAGS`). `immersive` is full screen without the bars (ADR-101, [Immersive](#immersive)), transient too. |
| `SnapZone` | `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right` | Halves and quarters of the container. The geometry is CSS, computed in the shell (`WindowGeometryHandler.get_snap_position`). |
| `WindowOptions` | `{ constraints?, flags?, snap_zone? }` | Comes from the manifest's `defaults` (ADR-001). That's the only way to influence a new window. |

`bounds` always holds the restored geometry. Maximized and snapped windows keep their old `bounds`; the shell overrides position and size in CSS. That's why restore is just removing the flag or the zone.

Precedence when the shell renders: active drag/resize > `maximized` > `snap_zone` > `bounds`.

## Public API

Two interfaces in `type.ts` (ADR-016, owner 2026-10-12, [brainstorm](../../brainstorm/2026-10-12_mobile-groundwork.md)):

- **`WindowsService`**, the platform-neutral base: everything below except `set_container`, `snap`, `gather`, `toggle_desktop`, `showing_desktop` and `container.bounds`. `container` is `{ element }` only. Code outside the desktop shell types against it: AppsService, DialogsService, SessionService, the app's window handle, Activity Monitor, the taskbar.
- **`DesktopWindowsService extends WindowsService`** adds `container.bounds`, `set_container`, `snap`, `gather`, `toggle_desktop` and `showing_desktop`. The desktop shell uses it: `window-manager.svelte`, `window.handler.svelte.ts`, and this service's inspector.

The class `WindowsService` implements `DesktopWindowsService`. On mobile, `init.ts` registers `MobileWindowsService` (`mobile.svelte.ts`) under the same key instead; see [Mobile](#mobile). Maximize and `bounds` stay in the base because shared callers use them (window handle, session snapshots); mobile treats them as no-ops. Members that are identical on both platforms live once in `BaseWindowsService` (`base.svelte.ts`); everything platform-specific (focus, placement, close, minimize) stays in each class.

| Member | Signature | Notes |
|--------|-----------|-------|
| `container` | `readonly { bounds: Bounds; element: HTMLElement \| null }` | `$state.raw`. Bounds are **viewport** coordinates of the window-manager element. Starts as `0,0,innerWidth,innerHeight` (read in the constructor). |
| `set_container` | `(element?: HTMLElement \| null) => Bounds` | Measures `element` with `getBoundingClientRect()`. A falsy element zeroes the bounds. Then runs `WindowsHelper.keep_reachable` on every window, so a shrinking area (browser resize, taskbar move) never strands one. Called by the window manager. |
| `gather` | `() => void` | Desktop only. `clamp_bounds` on every non-minimized window: fully on screen, shrunk if larger than the area. Alt+Shift+G and the desktop's "Gather windows" menu item, both in a view transition |
| `toggle_desktop` | `() => boolean` | Desktop only. Minimizes every visible window and remembers them; called again with nothing focused since, it restores exactly those and focuses the topmost. Windows minimized before stay minimized. Returns `true` when the desktop is now shown. `win desktop`, Alt+Shift+D and the taskbar sliver |
| `showing_desktop` | `boolean` (readonly) | Desktop only. `true` while `toggle_desktop` has windows to bring back |
| `open` | `(app: AppInstance) => WindowId` | New uuid. `order = ++max_order`, so it opens in front. Flags, snap zone and constraints come from `app.manifest.defaults`. Bounds come from `WindowsHelper.place` (see [Placement](#placement)). |
| `restore` | `(windows: WindowSnapshot[], create: (snapshot) => AppInstance \| null) => RestoreResult` | Reopens saved windows with their own bounds, flags and snap zone, in array order (last ends on top). `create` returning `null` skips that snapshot. Ends with `focus_next()`. See [Restore](#restore). |
| `close` | `(id) => Promise<boolean>` | Guarded (ADR-029). A clean window closes synchronously through `force_close`. A dirty one comes forward (un-minimized, focused) and the registered close prompt asks; Cancel, a `save` resolving `false`, or no prompt registered keep it open (`false`). A second request while its sheet is up resolves `false` without stacking another. |
| `force_close` | `(id) => boolean` | The old unguarded close: records the frame (`frames[app.id] = bounds`), deletes the record and its back handlers and save, resets `max_order` when it was the last window. Activity Monitor's End uses it. `false` if the id doesn't exist. |
| `close_all` | `() => Promise<boolean>` | All clean: records every frame (topmost last), empties the index, resets `max_order`. Otherwise clean windows close at once and dirty ones are closed one by one, topmost first; the first that stays open stops the rest (`false`). The mobile switcher's Close all calls it. |
| `set_title` | `(id, title \| null) => void` | Sets `instance.title`; `null` clears it. Titlebar, taskbar tooltip, switcher card and Activity Monitor read it |
| `set_dirty` | `(id, dirty, { save? }) => void` | Sets `instance.dirty`; keeps `save` in a plain map while dirty |
| `has_dirty` | `() => boolean` | Any window dirty. The service's `beforeunload` listener (added in `init()`, removed in `destroy()`) calls `preventDefault()` then, so the browser asks before a tab close or reload |
| `set_close_prompt` | `(prompt) => () => void` | DialogsService registers the sheet at init; the disposer clears it. `CloseGuard` (`close-guard.ts`) holds it and runs the dirty path for both implementations |
| `frames` | `readonly WindowFrames` | `$state.raw` `Record<AppId, Bounds>`: each app's last closed window frame. Base interface, so both implementations hold them |
| `load_frames` | `(frames) => void` | Replaces `frames`. [SessionService](session.md) calls it at init |
| `exists` | `(id) => boolean` | |
| `get` | `(id) => WindowInstance \| null` | Returns the live, reactive proxy. Callers mutate it directly (the shell does, see below). |
| `list` | `() => WindowId[]` | Insertion order. The window manager renders in this order. |
| `sorted_list` | `(compare?) => [WindowId, WindowInstance][]` | `Object.entries` + `sort(compare)`. The taskbar sorts by `created_at`. |
| `focus` | `(id) => boolean` | `order = ++max_order`. Returns `false` if the id is missing **or the window is already on top**. Doesn't un-minimize. |
| `is_focused` | `(id) => boolean` | `order === max_order`. |
| `page_hidden` | `boolean` | `document.hidden`, kept by one `visibilitychange` listener (ADR-035). Reactive |
| `is_visible` | `(id) => boolean` | Desktop: `true` for the window popped out by [ExtractService](extract.md) (looked up per call through the kernel the constructor takes; `undefined` in tests that build it bare), else `!page_hidden` and not minimized; on mobile, `!page_hidden` and on screen (`is_focused`). `WindowHandle.is_visible` reads it |
| `get_focused` | `() => WindowId \| null` | Linear scan with `is_focused`. Used by [DialogsService](dialogs.md) to anchor dialogs. |
| `snap` | `(id, zone \| null) => boolean` | Sets `snap_zone`. The `win snap` command (and through it the Alt+Shift snap keys) calls it; the drag handler writes `instance.snap_zone` directly. |
| `add_back_handler` | `(id, handler: () => boolean) => () => void` | Registers a back handler (the window handle's `on_back`). A plain per-window array, newest last; the disposer removes that handler. `close()` drops the window's handlers. Both implementations |
| `back` | `(id) => boolean` | Closes the window's guide first when it shows (ADR-085; it sits above the app, so it wins whatever order handlers registered in); then leaves immersive (ADR-101); otherwise runs the handlers newest first until one returns `true`. `UiService.back()` calls it on both platforms, after closing dialogs and sheets ([ui](ui.md)) |
| `toggle_maximize` | `(id) => boolean` | Adding the flag also focuses. Removing it doesn't. Returns the new state (`false` for a missing id too). |
| `toggle_minimize` | `(id) => boolean` | Removing the flag also focuses. Minimizing the focused window hands focus to the next one (see below). Returns the new state. |
| `toggle_guide` | `(id) => boolean` | Toggles `WindowFlag.GUIDE` (ADR-085). Showing it also focuses (on mobile: puts the app on screen); it doesn't un-minimize, so `win guide` brings the window back first. Returns the new state (`false` for a missing id too). In `BaseWindowsService`, so both implementations share it. The titlebar and nav bar button, F1 (`win guide`), `app guide` and AppsService's first open call it |
| `set_immersive` | `(id, on) => boolean` | Adds or removes `WindowFlag.IMMERSIVE` ([Immersive](#immersive)). Entering brings the window forward (desktop: un-minimizes too) and asks the browser for fullscreen on the page. `false` for a missing id; a popped-out window (desktop, [extract](extract.md)) refuses and keeps its state. In `BaseWindowsService`. The window handle's `set_immersive`, `win immersive` (F11), the title bar and taskbar menus, the switcher card menu and the exit button call it |
| `name`, `description`, `to_string()` | IService | `to_string()` lists `id: app name`. |

Not on the interface: private `index: Record<WindowId, WindowInstance>` (`$state`), private `max_order: number` (`$state`), `reset_state()`.

## State

- `index`: a deep `$state` record. `WindowInstance` objects are deep proxies, so `instance.bounds.x = …` from anywhere is reactive.
- `max_order`: the highest `order` handed out. It only grows, and resets to 0 only when the last window closes. Orders are never compacted, so `z-index` climbs without bound over a long session. That's harmless in practice.
- `container`: `$state.raw`, replaced wholesale on every `set_container`.
- `peeked`: `$state.raw<WindowId[] | null>`, the windows `toggle_desktop` hid. Any `focus` that changes the order, `open`, session `restore` or `close_all` clears it, like Win+D forgetting once you pick a window. Never persisted.

## Lifecycle

`init()` adds the `beforeunload` guard (ADR-029), the `visibilitychange` listener behind `page_hidden`, the `fullscreenchange` listener and an `$effect.root` that exits the page's fullscreen once no window is immersive ([Immersive](#immersive)); `destroy()` removes them. The constructor reads `window.innerWidth/innerHeight` for the initial container.

## Persistence

None of its own. [SessionService](session.md) snapshots the windows into `/var/lib/session/session.json` and calls `restore()` at boot if the user agrees. Without that, a reload loses every window.

## Behaviour & invariants

**Z-order and focus.** Focus is just "has the highest `order`". There's no separate focused id.

- Opening focuses the new window.
- Closing or minimizing the focused window calls the private `focus_next()`. It raises the topmost window that isn't minimized. When every remaining window is minimized, it bumps `max_order` without giving it to any window, so **nothing is focused** and `get_focused()` returns `null`.
- A minimized window is therefore never the focused one. DialogsService gets either a visible window or `null`, and falls back to the container center.

### Placement

`WindowsHelper.place({ constraints, container, sibling, frame })`, ADR-014 revision ([brainstorm](../../brainstorm/2026-10-12_window-polish.md)). `open()` passes the app's **frontmost** open window (highest `order`) as `sibling` and `frames[app.id]` as `frame`.

| Case | Size | Position |
|------|------|----------|
| The app has a window open | the sibling's | sibling + 28px (`CASCADE_OFFSET`) each way; when that would overflow the container, `(0, 0)` |
| A remembered frame | the frame's | the frame's |
| Neither | 62% × 70% of the container | centred horizontally, 40% of the free height above (optically centred) |

Size is then clamped to the manifest's `constraints` and capped at the container; the result goes through `clamp_bounds`, so a window always opens **fully inside** the area (a frame saved on a bigger screen shrinks and moves in). An unmeasured container (0×0) falls back to 600×400 unclamped.

**Frames** are recorded on close only (owner's call): closing the tab with windows open records nothing; session restore covers that. `bounds` is the normal frame even while maximized or snapped, so it's recorded as is.

- **Coordinate spaces.** `bounds` is container-relative: it's rendered as `left/top` inside the window-manager element. `container.bounds.x/y` is the container's viewport offset, and it's only used to convert pointer `clientX/Y` into container space.

**Staying reachable** (owner's pick of options 2 + 4 from the off-screen bug, 2026-10-12). When the container is measured, `keep_reachable(bounds, container)` moves (never resizes) each window just enough that 96px of its titlebar is inside horizontally and its titlebar's 40px fits vertically (`REACHABLE`), like macOS and Windows. Windows already reachable aren't touched, and growing the browser back doesn't move anything back. Drags can't strand a window: the pointer is clamped to the container and `top` to ≥ 0. Maximized and snapped windows re-fit on their own (CSS percentages); their stored `bounds` are kept reachable too. `gather()` is the explicit recovery.

**Constraints.** `min` and `max` apply to the initial size and to resizing. The resize fallback minimum is 400×300 (`WindowGeometryHandler.MIN_WIDTH/MIN_HEIGHT`).

**Maximize / minimize / restore.** These are flags only. Maximized renders at `0,0,100%,100%` of the container. Minimized renders with `display: none`, but the app **stays mounted** and keeps its state. The WindowHandle's `maximize()` and `restore()` compose these toggles ([apps/app-context.md](../apps/app-context.md)).

**Snapping.** `snap_zone` is set by the drag handler on drop. Any non-snapped drop clears it, and so does any resize. A snapped window keeps its pre-snap `bounds`. Maximize and snap aren't mutually exclusive in state, but maximize wins when rendering, and any drag or resize clears both.

**Close.** `close()` goes through the close guard (ADR-029, `close-guard.ts`): a dirty window asks before it goes, see the `close` row. `force_close()` records the frame and deletes the record. The keyed `{#each}` in the window manager unmounts the window, and the app's component and `$effect`s tear down with it. That includes `storage.persisted` cells, which release their refcount. The closed-window stack lives in [SessionService](session.md), which notices the window missing from its next snapshot. AppsService doesn't track which windows belong to which app.

**Who mutates instances directly.** The service doesn't own every write. `WindowGeometryHandler` (`components/window/window.handler.svelte.ts`) writes `instance.bounds`, `instance.snap_zone` and `instance.flags.delete(MAXIMIZED)` itself, without going through `snap()` or `toggle_maximize()`. Swapping in a different WindowsService (ADR-016) would have to keep returning mutable proxies from `get()`.

### Immersive

ADR-101 ([brainstorm](../../brainstorm/2026-11-08_immersive-windows.md)). Full screen without the bars, per window, never saved: the session snapshot keeps only `minimized` and `maximized`, so a restored window comes back with its bars (a restore has no gesture to ask for fullscreen with).

- **State.** `WindowFlag.IMMERSIVE` on the instance, set and cleared by `set_immersive(id, on)` in `BaseWindowsService`. The window handle reads it as `immersive`. What it looks like is the shells' job: desktop renders the window over the whole window area with no title bar ([window](../shell/window.md#immersive)), mobile hides the nav bar ([mobile](../shell/mobile.md#immersive)), solo hides its header ([solo](../shell/solo.md)); all three draw the exit button and publish its box.
- **Browser fullscreen.** Entering calls `document.documentElement.requestFullscreen()` when `document.fullscreenEnabled` and nothing else is in fullscreen (Music Visualizer's stage is). It's the whole page, so dialogs, menus and toasts still show. It needs user activation, so it works from a click, a key (F11) or a command typed in the terminal or palette; a refusal is swallowed and only the WebOS bars hide. iPhone Safari has no element fullscreen: the same. Entries: `fullscreen` in [compat](../compat.md).
- **Leaving fullscreen leaves immersive.** The `fullscreenchange` listener remembers whether the page itself went fullscreen; when the fullscreen stack is empty again after that (Esc, the system back on Android, the browser's own UI), every window leaves immersive. An app's own element going fullscreen on top (Music Visualizer's stage, a `<video>`'s button) changes nothing, and its exit lands back on the page's fullscreen. Whenever the page is on top with no window immersive (a request that landed late, an element that left after its window stopped being immersive), the page's fullscreen is exited. Nothing exits while another element is on top.
- **Leaving immersive leaves fullscreen.** An effect exits the page's fullscreen whenever no window is immersive: the exit button, `win immersive off`, back, closing the window.
- **Back** (`back(id)`, so the nav bar and the browser's back through `UiService.back()`): the guide first, then immersive, then the app's own handlers.
- **Mobile:** the app leaving the screen leaves immersive: `focus` of another window, a new window opening (a toast action, an alarm, a link, a file open) and `go_home` clear the flag on the window that was on screen, like a phone app sent to the background.
- **Desktop:** several windows may be immersive at once (each covers the window area; the frontmost shows). Minimizing a window, Show desktop included, takes it out of immersive. Popping a window out ([extract](extract.md)) clears it first, and a popped-out window can't enter (`can_immerse`).

### Restore

```ts
interface WindowSnapshot { app_id: AppId; props?: AppProps; bounds: Bounds; flags: WindowFlag[]; snap_zone: SnapZone | null; state?: Record<string, unknown> }
interface RestoreResult { restored: WindowId[]; skipped: WindowSnapshot[] }
```

For each snapshot, in order:

1. `create(snapshot)`. `null` → push the snapshot to `skipped`, continue.
2. Insert a record directly (not through `open()`): new uuid, `created_at = now`, `order = ++max_order`, `flags = new Flags(snapshot.flags)`, `snap_zone` from the snapshot, `constraints` from `manifest.defaults` (manifest `flags`/`snap_zone` defaults are ignored), `bounds = WindowsHelper.clamp_bounds(snapshot.bounds, container.bounds)`.
3. Push the id to `restored`.

Then `focus_next()`: the topmost non-minimized window gets the highest order, so a minimized last window never holds focus. With every restored window minimized, nothing is focused. Restored windows go on top of anything already open.

`WindowsHelper.clamp_bounds(bounds, container)`: width and height capped at the container's, then `x`/`y` clamped to `[0, container − size]`, so the whole window is inside. A container with zero width or height (unmeasured) returns a copy unchanged.

## Mobile

`MobileWindowsService` (`mobile.svelte.ts`, interface `MobileWindowsService extends WindowsService` in `type.ts`, inspector `mobile-inspector.svelte`) backs the [mobile shell](../shell/mobile.md). ADR-016 revision 2026-10-12.

- **Same focus model:** the window holding `max_order` is focused and on screen. **Home** is the state where no window holds it (the one desktop reaches when everything is minimized). `go_home()` bumps `max_order` when something is focused.
- **Every window stays mounted.** Background windows are simply not focused. `recent()` lists ids by `order`, newest first: the switcher's order.
- `open(app)`: new record on top, `snap_zone: null`, `constraints: {}`, `bounds` = the container's size at `0,0`. Manifest `flags` are kept except `minimized` / `maximized`.
- `restore()`: inserts in order like desktop, drops `minimized` / `maximized`, ignores saved geometry, then **goes home**: restored apps wait in the switcher, like a phone after a restart.
- `close(id)`: closing the on-screen app goes home rather than surfacing another one.
- Another app coming on screen, or home, takes the on-screen app out of immersive ([Immersive](#immersive)).
- `toggle_maximize()` → always `false`, does nothing. `toggle_minimize(id)`: on-screen → home (`true`); background → focus it (`false`). The window handle's `is_minimized` / `is_maximized` therefore always read `false`.
- `container` is `{ element }` only; `set_container(element)` stores the stage element (`mobile-windows.svelte`), which dialogs anchor to.
- `frames` / `load_frames` are held but never recorded or used, so a phone visit saves the desktop's frames back unchanged.
- No `snap`, no geometry, no clamping. `bounds` are written only so a session saved on mobile restores sensibly on desktop.

## Divergence from ADR

ADR-014's 2026-10-12 revision records the code: remembered frames instead of plain cascading, 28px from the app's frontmost window, the closed stack in SessionService. Single-instance and taskbar grouping are parked. Its session-persistence section is superseded by ADR-023.

## Shell

Contributes `win list|close|focus|minimize|guide|immersive|previous|cycle|desktop`, plus `maximize|snap|gather` from the desktop service, the `window` completer and value type (`windows/shell.ts`, bodies, the completer and `open` in the lazy `windows/shell-run.ts`). Both implementations call the same `windows_shell(this)`; the shape decides (`is_desktop` / `is_mobile`), and on mobile `win minimize` and `win desktop` describe themselves as "Go home". `win close` takes `--all` (`-a`); `win close|minimize|maximize|guide` take window ids or piped windows, the focused one by default; `win guide` brings each window back (un-minimizes, focuses) and toggles its guide (ADR-085; F1 runs it, [shortcuts](shortcuts.md)); `win snap <zone|none> [id]` snaps, the same zone again unsnaps; `win immersive [toggle|on|off] [id]` (toggle and the focused window by default) sets full screen without the bars (ADR-101; F11 runs it), and fails with "a popped-out window can't go full screen". See [shell](shell.md#contributions).

## Known gaps

- Resizing keeps only a titlebar strip on screen, not the whole window; "Gather windows" is the full fix, on demand.
- The container is measured by a ResizeObserver plus an rAF after taskbar moves. Both are paused in hidden tabs, so a tab that starts hidden keeps the `window.innerWidth/innerHeight` default until it's shown.
- `index` is a plain record (`// TODO: map?`). `list()` order is insertion order, not z-order.
