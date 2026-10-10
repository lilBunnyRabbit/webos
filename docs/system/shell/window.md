# Window

Source: `src/lib/core/components/window/` · Services: [windows](../services/windows.md) · ADRs: [ADR-003](../../adrs/003-app-context.md) (app context), [ADR-014](../../adrs/014-window-enhancements.md) (accepted)

| File | Role |
|------|------|
| `window.svelte` | The window frame: positioning, chrome classes, snap preview, resize handles |
| `window-titlebar.svelte` | Icon, name, zoom controls, min/max/close buttons |
| `window-content.svelte` | Sets the app context, awaits the lazy component, renders it |
| `window.handler.svelte.ts` | `WindowGeometryHandler`: drag, resize, snap detection, `get_snap_position()` |

One `<Window id>` per entry in `windows.list()`, rendered by the [window manager](window-manager.md).

## Responsibilities

- Turn a `WindowInstance` into CSS `left/top/width/height/z-index`.
- Run drag and resize through pointer events, preview the change with a transform, and commit to `instance.bounds` on release.
- Detect snap zones while dragging and draw the preview.
- Provide the app context and mount the app component.

## Geometry rendering

`window.svelte` derives each of `left`, `top`, `width` and `height` with this precedence:

1. **Drag/resize active**: `move.start.left/top` + `move.width/height`, with `transform: translate3d(dx, dy, 0)` for the movement. During a drag only the transform changes, which keeps it cheap.
2. **Maximized**: `0, 0, 100%, 100%`.
3. **Snapped**: `WindowGeometryHandler.get_snap_position(zone)`, which is CSS `calc()` percentages of the container with an 8px gap (`SNAP_PADDING`).
4. Otherwise `instance.bounds` in px.

`z-index` is `instance.order`. The frame also gets `contain: size layout paint style` and `backface-visibility: hidden`. The content area uses `content-visibility: auto` with `contain-intrinsic-size` set to the bounds.

Visual states (all theme tokens):

- normal: `bg-foreground border-foreground`, titlebar text `text-background`
- maximized: no border or radius
- snapped: `bg-primary border-primary`
- minimized: `hidden` (`display: none`, the app stays mounted)

## Drag and resize (`WindowGeometryHandler`)

There's one handler per window component. It reads the instance as `$derived(windows.get(id)!)`. Attachments are created by `create_move_attachment(type, handle_move)`:

| Phase | What happens |
|-------|--------------|
| `pointerdown` | Ignored if it hit a `button[data-window-button]` (titlebar buttons). Otherwise `preventDefault` + `stopPropagation`, `windows.focus(id)`, `setPointerCapture`, remember the down event, then `pointermove`/`lostpointercapture` listeners go on the element. Nothing moves yet. |
| `pointermove` | Until the pointer has travelled `DRAG_THRESHOLD` (4px) from the down point, nothing happens. Crossing it calls `init_move()` with the down event. After that, moves are throttled to one `requestAnimationFrame`: each move cancels the pending frame. Drag updates `move.dx/dy` and `snap_zone`. Resize updates `move.width/height` plus `dx/dy` for `n`/`w` edges. |
| `lostpointercapture` | Fires for every way a gesture ends (`pointerup`, `pointercancel`, element removed). Removes listeners and cancels the pending frame. If a move started, it applies the last pending pointer event first, then `apply_move()`. A plain click therefore changes nothing: a maximized or snapped window stays put. |
| attachment teardown | Removes every listener and releases capture if still held. |

`init_move()` when the window is **snapped or maximized**:

- It measures the frame (`element.parentElement.getBoundingClientRect()`) and converts it to container space by subtracting `container.x/y`.
- **Resize**: writes that rect into `instance.bounds`, so the window resizes from where it visibly is.
- **Drag**: keeps the restored `bounds` size. The grab point keeps its relative spot: `grab_offset = (clientX − rect.left) / rect.width × bounds.width`, and the restored window starts at `clientX − container.x − grab_offset`.

`apply_move()`:

- If a snap zone is under the pointer, it sets `instance.snap_zone` and adds a 250ms inline `transition` to the frame, removed on `transitionend`.
- Otherwise it writes `width/height/x/y` into `instance.bounds` and clears `snap_zone`.
- **Always** deletes `MAXIMIZED`, then resets `move`.

Clamping:

- Drag clamps the *pointer* to the container horizontally and keeps the window top ≥ 0. Windows can still hang off the right or bottom edge.
- Resize: `e`/`s` are capped at the container's right/bottom edge. `w`/`n` stop at the container's left/top edge.
- All edges clamp to `constraints.width/height` `min` and `max` (`clamp_width`/`clamp_height`). `min` falls back to `MIN_WIDTH 400` / `MIN_HEIGHT 300`.

Snap detection (`get_snap_zone`): the pointer is within 16px (`EDGE_THRESHOLD`) of a container edge. On an edge, the 200px (`CORNER_SIZE`) closest to a corner snap to that corner's quarter. The rest of the edge snaps to a half. Snap only happens on drag, never on resize.

## Titlebar

| Control | Action |
|---------|--------|
| App icon + `manifest.name` | Static. There's no `set_title`/`set_icon` yet (ROADMAP). |
| Zoom − / % / + | Per-window CSS `zoom` on the content, from 0.25 to 3 in 0.25 steps. The % button resets to 1. The state is local to the component, so it's lost on reload. |
| Minimize | `windows.toggle_minimize(id)` |
| Maximize / Restore | `windows.toggle_maximize(id)`. The icon swaps between `Square` and `Copy`. |
| Close | `windows.close(id)`. Immediate, no veto. |

Every button has `data-window-button` so the drag attachment skips it.

## Content and app context

`window-content.svelte`:

- Calls `set_app_context({ window_id, app_id, window: create_window_handle(id), storage: create_storage_handle(app_id) })` once at init. `app_id` is read under `untrack`. This is the only place an app context is created ([apps/app-context.md](../apps/app-context.md)).
- `{#await instance.app.component}` shows "Loading..." while the chunk loads, then `<Component {...instance.app.props} />`. On failure it prints a plain error string. The promise was started by `AppsService.launch()`, not here.
- The wrapper is `h-full w-full overflow-auto @container`. That container is what apps' `@sm:`/`@md:` queries resolve against ([CONVENTIONS](../../CONVENTIONS.md)).
- With `WindowFlag.DEBUG` it also renders the debug snippet passed from `window.svelte`: `bounds` and `move` as JSON.

## User interactions

| Input | Target | Result |
|-------|--------|--------|
| Pointer drag | Titlebar (not its buttons) | Move. A drop at a container edge or corner snaps. |
| Pointer drag | 8 resize handles (`n s e w ne nw se sw`, 8px edges / 12px corners) | Resize. Handles are hidden when maximized or minimized. |
| Pointer down | Titlebar or resize handle | Focus (raise) |
| Click (no movement) | Titlebar of a maximized/snapped window | **Restores it.** See gaps. |
| Pointer down (capture phase) | Anywhere in the frame, content included | Focus (raise) |
| `focusin` | Anything inside the frame gets DOM focus (Tab, programmatic) | Focus (raise) |
| Click | Titlebar buttons | See the titlebar table |
| Keyboard | — | Nothing. No shortcuts, Escape, or keyboard move/resize. The zoom button titles promise `Ctrl+-` / `Ctrl+0` / `Ctrl++`, which aren't implemented. |
| Double-click | Titlebar | Nothing. The maximize toggle is commented out in `window-titlebar.svelte`. |

## Platform APIs

- Pointer Events with `setPointerCapture` and `touch-action: none` on the titlebar and handles, so touch drag works.
- `requestAnimationFrame` throttling.
- CSS: `zoom`, `contain`, `content-visibility`, `contain-intrinsic-size`, `@container`, `translate3d`.
- Not used: View Transitions (ADR-014 animations), popover/top layer, anchor positioning.

## Known gaps

- The handler mutates the instance directly (bounds, snap_zone, flags) instead of going through the service API.
- No `role`/`aria-*` on the frame. No titlebar `aria-label`s, only `title`.
- ADR-014 open/close/minimize/maximize animations aren't built. The only animation is the 250ms snap transition.
