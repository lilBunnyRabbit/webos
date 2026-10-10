# WindowsService

Key `windows` · Depends on: none · ADR: [ADR-014](../../adrs/014-window-enhancements.md) (accepted, mostly unbuilt), [ADR-016](../../adrs/016-mobile-support.md) · Source: `src/lib/core/api/services/windows/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Owns every open window: its geometry, flags, snap zone and z-order. It's pure state. Rendering, drag and resize live in the shell ([shell/window.md](../shell/window.md), [shell/window-manager.md](../shell/window-manager.md)).

The service doesn't know about app lifecycles. A window is just a record holding an `AppInstance`; [AppsService](apps.md) builds that record and calls `open()`.

| File | Contents |
|------|----------|
| `type.ts` | `WindowsService` interface (JSDoc reference for the repo), `WindowInstance`, `WindowFlag`, `SnapZone`, `WindowConstraints`, `WindowOptions` |
| `service.svelte.ts` | Implementation |
| `helper.ts` | `WindowsHelper`: initial-bounds math |

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
  app: AppInstance;              // { id, manifest (minus component), component: Promise, props }
}
```

| Concept | Values | Notes |
|---------|--------|-------|
| `WindowFlag` | `minimized`, `maximized`, `debug` | `debug` makes the window render its debug children (bounds + drag state JSON). Only the `example` user app sets it. |
| `SnapZone` | `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right` | Halves and quarters of the container. The geometry is CSS, computed in the shell (`WindowGeometryHandler.get_snap_position`). |
| `WindowOptions` | `{ constraints?, flags?, snap_zone? }` | Comes from the manifest's `defaults` (ADR-001). That's the only way to influence a new window. |

`bounds` always holds the restored geometry. Maximized and snapped windows keep their old `bounds`; the shell overrides position and size in CSS. That's why restore is just removing the flag or the zone.

Precedence when the shell renders: active drag/resize > `maximized` > `snap_zone` > `bounds`.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `container` | `readonly { bounds: Bounds; element: HTMLElement \| null }` | `$state.raw`. Bounds are **viewport** coordinates of the window-manager element. Starts as `0,0,innerWidth,innerHeight` (read in the constructor). |
| `set_container` | `(element?: HTMLElement \| null) => Bounds` | Measures `element` with `getBoundingClientRect()`. A falsy element zeroes the bounds. Doesn't touch existing windows (TODO at `service.svelte.ts:70`). Called by the window manager. |
| `open` | `(app: AppInstance) => WindowId` | New uuid. `order = ++max_order`, so it opens in front. Flags, snap zone and constraints come from `app.manifest.defaults`. Bounds come from `WindowsHelper.legacy_calculate_bounds`. |
| `close` | `(id) => boolean` | Deletes the record. Resets `max_order` to 0 when it was the last window. `false` if the id doesn't exist. |
| `close_all` | `() => void` | Empties the index and resets `max_order`. Nothing calls it. |
| `exists` | `(id) => boolean` | |
| `get` | `(id) => WindowInstance \| null` | Returns the live, reactive proxy. Callers mutate it directly (the shell does, see below). |
| `list` | `() => WindowId[]` | Insertion order. The window manager renders in this order. |
| `sorted_list` | `(compare?) => [WindowId, WindowInstance][]` | `Object.entries` + `sort(compare)`. The taskbar sorts by `created_at`. |
| `focus` | `(id) => boolean` | `order = ++max_order`. Returns `false` if the id is missing **or the window is already on top**. Doesn't un-minimize. |
| `is_focused` | `(id) => boolean` | `order === max_order`. |
| `get_focused` | `() => WindowId \| null` | Linear scan with `is_focused`. Used by [DialogsService](dialogs.md) to anchor dialogs. |
| `snap` | `(id, zone \| null) => boolean` | Sets `snap_zone`. Nothing calls it; the drag handler writes `instance.snap_zone` directly. |
| `toggle_maximize` | `(id) => boolean` | Adding the flag also focuses. Removing it doesn't. Returns the new state (`false` for a missing id too). |
| `toggle_minimize` | `(id) => boolean` | Removing the flag also focuses. Minimizing the focused window hands focus to the next one (see below). Returns the new state. |
| `name`, `description`, `to_string()` | IService | `to_string()` lists `id: app name`. |

Not on the interface: private `index: Record<WindowId, WindowInstance>` (`$state`), private `max_order: number` (`$state`), `reset_state()`.

## State

- `index`: a deep `$state` record. `WindowInstance` objects are deep proxies, so `instance.bounds.x = …` from anywhere is reactive.
- `max_order`: the highest `order` handed out. It only grows, and resets to 0 only when the last window closes. Orders are never compacted, so `z-index` climbs without bound over a long session. That's harmless in practice.
- `container`: `$state.raw`, replaced wholesale on every `set_container`.

## Lifecycle

No `init()` or `destroy()`. The constructor sets fields and reads `window.innerWidth/innerHeight` for the initial container. Nothing to tear down: no timers or listeners.

## Persistence

None. A reload loses every window. Session restore is ADR-014 (accepted, not built).

## Behaviour & invariants

**Z-order and focus.** Focus is just "has the highest `order`". There's no separate focused id.

- Opening focuses the new window.
- Closing or minimizing the focused window calls the private `focus_next()`. It raises the topmost window that isn't minimized. When every remaining window is minimized, it bumps `max_order` without giving it to any window, so **nothing is focused** and `get_focused()` returns `null`.
- A minimized window is therefore never the focused one. DialogsService gets either a visible window or `null`, and falls back to the container center.

**Initial bounds** (`WindowsHelper.legacy_calculate_bounds`):

- Size is 600×400, clamped to the manifest's `constraints` (`min`/`max`), then capped at the container size.
- Position cascades from `(100,100)` by 40px per already-open window (count mod 15). If that would push the window past `container − size − (20, 80)`, it resets to `(100,100)`. The `80` assumes a bottom taskbar.
- **Coordinate spaces.** `bounds` is container-relative: it's rendered as `left/top` inside the window-manager element. `container.bounds.x/y` is the container's viewport offset, and it's only used to convert pointer `clientX/Y` into container space.
- `WindowsHelper.calculate_bounds` is an unimplemented stub that returns zeros. Nothing calls it.

**Constraints.** `min` and `max` apply to the initial size and to resizing. The resize fallback minimum is 400×300 (`WindowGeometryHandler.MIN_WIDTH/MIN_HEIGHT`).

**Maximize / minimize / restore.** These are flags only. Maximized renders at `0,0,100%,100%` of the container. Minimized renders with `display: none`, but the app **stays mounted** and keeps its state. The WindowHandle's `maximize()` and `restore()` compose these toggles ([apps/app-context.md](../apps/app-context.md)).

**Snapping.** `snap_zone` is set by the drag handler on drop. Any non-snapped drop clears it, and so does any resize. A snapped window keeps its pre-snap `bounds`. Maximize and snap aren't mutually exclusive in state, but maximize wins when rendering, and any drag or resize clears both.

**Close.** `close()` only deletes the record. The keyed `{#each}` in the window manager unmounts the window, and the app's component and `$effect`s tear down with it. That includes `storage.persisted` cells, which release their refcount. There's no close hook, no "unsaved changes" veto, no closed-window stack, and AppsService doesn't track which windows belong to which app (`AppInstance.window_ids` is commented out).

**Who mutates instances directly.** The service doesn't own every write. `WindowGeometryHandler` (`components/window/window.handler.svelte.ts`) writes `instance.bounds`, `instance.snap_zone` and `instance.flags.delete(MAXIMIZED)` itself, without going through `snap()` or `toggle_maximize()`. Swapping in a different WindowsService (ADR-016) would have to keep returning mutable proxies from `get()`.

## Divergence from ADR

ADR-014 is *Accepted*, not implemented, so most of it just doesn't exist yet: single-instance, animations, taskbar grouping, session persistence, the closed-window stack. One part already exists in a different form: **cascading**. ADR-014 says to offset +30px from the *last opened* window. The code offsets 40px × *the number of open windows*, so closing windows makes positions repeat.

## Known gaps

- Container shrink doesn't re-clamp windows, so they can end up off-screen after a resize or a taskbar move.
- `snap()`, `close_all()` and `calculate_bounds()` are unused.
- The container is measured by a ResizeObserver plus an rAF after taskbar moves. Both are paused in hidden tabs, so a tab that starts hidden keeps the `window.innerWidth/innerHeight` default until it's shown.
- Cascade is 40px per open window from `(100,100)`. ADR-014 specifies +30px from the last opened window (roadmap item).
- `index` is a plain record (`// TODO: map?`). `list()` order is insertion order, not z-order.
