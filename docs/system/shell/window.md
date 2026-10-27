# Window

Source: `src/lib/core/components/window/` · Services: [windows](../services/windows.md) · ADRs: [ADR-003](../../adrs/003-app-context.md) (app context), [ADR-014](../../adrs/014-window-enhancements.md) (accepted), [ADR-024](../../adrs/024-design-system.md) (chrome) · Design: [docs/design/shell.md](../../design/shell.md#windows)

| File | Role |
|------|------|
| `window.svelte` | The window frame: positioning, chrome classes, snap preview, titlebar strip (drag + double-click), resize handles |
| `window-titlebar.svelte` | Icon, title (`instance.title`, else the app name; tooltip "{title} — {app}"), a `primary` dot when dirty, zoom pill, **Update** (an app-only update waits for this app's windows, ADR-077 stage 3), Copy link, Pop out (desktop, where supported), min/max/close buttons. × calls the guarded `windows.close` (ADR-029) |
| `window-content.svelte` | Awaits the lazy component, renders it inside an error boundary |
| `window-sheets.svelte` | Renders this window's dialog sheets over its content (ADR-025) |
| `window.handler.svelte.ts` | `WindowGeometryHandler`: drag, resize, snap detection, `get_snap_position()` |
| `window-transition.svelte.ts` | `window_transition(ids, change)`: `view_transition()` that names unfocused windows for its duration; `transition_named(id)` |

One `<Window id>` per entry in `windows.list()`, rendered by the [window manager](window-manager.md).

## Responsibilities

- Turn a `WindowInstance` into CSS `left/top/width/height/z-index`.
- Run drag and resize through pointer events, preview the change with a transform, and commit to `instance.bounds` on release.
- Detect snap zones while dragging and draw the preview.
- Provide the app context and mount the app component.

## Geometry rendering

`window.svelte` derives one `rect` (`left`, `top`, `width`, `height` as CSS strings) with this precedence:

1. **Drag/resize active**: `move.start.left/top` + `move.width/height`, with `transform: translate3d(dx, dy, 0)` for the movement. During a drag only the transform changes, which keeps it cheap.
2. **Maximized**: `0, 0, 100%, 100%`.
3. **Snapped**: `WindowGeometryHandler.get_snap_position(zone)`, which is CSS `calc()` percentages of the container with an 8px gap (`SNAP_PADDING`).
4. Otherwise `instance.bounds` in px.

`z-index` is `instance.order`. The frame gets `contain: size layout style` and `backface-visibility: hidden`. It holds two children: an inner `size-full` grid with `overflow-hidden rounded-[inherit]` and `contain: paint`, which clips titlebar and content to the rounded corners, and the resize handles beside it. The handles sit outside the clipped element on purpose: inside it, the corner radius clipped the outer pixels of the corner handles, and a click there fell through to the window behind. The content area uses `content-visibility: auto` with `contain-intrinsic-size` set to the bounds.

Visual states (all theme tokens):

| State | Frame |
|-------|-------|
| unfocused | `rounded-xl bg-background`, `ring-1 ring-foreground/8`, `shadow-window` |
| focused (`windows.is_focused(id)`) | `ring-foreground/16`, `shadow-window-focused`. The box-shadow transitions over 200ms |
| maximized (and not mid-gesture) | `rounded-none shadow-none ring-0` |
| snapped | Same as normal; only the geometry differs |
| minimized | `hidden` (`display: none`, the app stays mounted) |
| popped out | `hidden`, and the content area renders neither `WindowContent` nor `WindowSheets`: the app is mounted in the mini window instead, through `window-mini.svelte` ([extract](../services/extract.md#mounting)) |

The inner grid is `2.5rem` titlebar + `1fr` content. The titlebar strip is `bg-background-light` with a `foreground/8` hairline below; the content area is `bg-background`.

## Motion

ADR-014 revision ([brainstorm](../../brainstorm/2026-10-12_window-polish.md)). Reduced motion, or Settings › Text & interface › Motion off, turns all of it off: `view_transition()` skips, and `pop` gets duration 0 from `motion_reduced()` (Svelte transitions run on the Web Animations API, which the global 1ms rule doesn't reach).

- **Open / close:** the frame has `in:pop|global` (140ms) and `out:pop|global` (100ms): opacity 0→1 and the CSS `scale` property 0.96→1, `cubicOut`. `scale`, not `transform`, so it never fights the drag `translate3d`. `|global` because the frame is the component root inside the window manager's `{#each}`. A restored session animates in too.
- **Minimize, restore, maximize, snap:** View Transitions through `view_transition()` (`$lib/core/utils/view-transition`, shared with the mobile shell). Only the **focused** frame carries `view-transition-name: window-{id}` at rest, and never a minimized or popped-out one: every named element is snapshotted on every transition, and naming all of them cost ~50 ms frames with 10 windows open (performance pass, [brainstorm](../../brainstorm/2026-10-17_performance-pass.md)). Its [taskbar button](taskbar.md#window-items) carries the same name while the window is minimized (an app's group button carries only its last minimized window's; picking a minimized member from the group menu makes it that one first), so minimizing morphs the window into its button and restoring morphs it back out; a restored window is focused, so it is named on the way out.
- **Unfocused targets.** A transition that acts on windows that may not be focused goes through `window_transition(ids, change)` (`window-transition.svelte.ts`): it puts the ids in a module-level `$state.raw` set and `flushSync`s, so those frames are named before the old state is captured, runs `view_transition(change)`, and clears the set when `document.activeViewTransition.finished` settles (a newer `window_transition` replaces the set). `window.svelte` names a frame when it is visible and focused or `transition_named(id)`. Callers: shell `win minimize`, `win maximize`, `win snap`, `win close` (clean maximized), `win gather` and Gather windows on the desktop menu (all windows), Show desktop (the sliver and `win desktop`, all windows, both ways). Titlebar buttons and double-click act on a window the pointer just focused, and taskbar, Terminal button and quick launch restores focus the window, so they keep plain `view_transition()`. Maximize and snap morph between the two frames. Wrapped: the titlebar's minimize and maximize buttons, the titlebar double-click, the taskbar button, and the window shortcuts ([shortcuts](../services/shortcuts.md)). Close is wrapped only for a clean maximized window, so it morphs back into the taskbar; any other close plays its outro, and a dirty one asks first. Not wrapped: a drag that drops into a snap zone (the preview already shows the target).
- During a view transition the page is a snapshot for ~250ms: live content freezes and clicks land on nothing (accepted cost).

**Keyboard focus.** An effect focuses the frame (`tabindex=-1`, `preventScroll`) whenever the window is focused and visible and DOM focus isn't already inside it, so a new window, a taskbar click or Alt+\` hands it the keyboard. A click on a field keeps that field focused; an app that focuses its own input on mount keeps it.

**Snap preview.** While dragging over a snap zone, a sibling div before the frame shows the target: `rounded-xl bg-primary/10 ring-1 ring-primary/60 backdrop-blur-[2px]`, entering with `animate-pop-in` and moving between zones with a 200ms transition.

## Drag and resize (`WindowGeometryHandler`)

There's one handler per window component. It reads the instance as `$derived(windows.get(id)!)`. Attachments are created by `create_move_attachment(type, handle_move)`:

| Phase | What happens |
|-------|--------------|
| `pointerdown` | Ignored if it hit a `button[data-window-button]` (titlebar buttons). Otherwise `preventDefault` + `stopPropagation`, `windows.focus(id)`, `setPointerCapture`, remember the down event, then `pointermove`/`lostpointercapture` listeners go on the element. Nothing moves yet. |
| `pointermove` | Until the pointer has travelled `DRAG_THRESHOLD` (4px) from the down point, nothing happens. Crossing it calls `init_move()` with the down event. After that, moves are throttled to one `requestAnimationFrame`: each move cancels the pending frame. The frame id lives in the attachment's closure, not in the reactive `move`. Drag updates `move.dx/dy`, and `snap_zone` only when the zone under the pointer changes. Resize updates `move.width/height` plus `dx/dy` for `n`/`w` edges. |
| `lostpointercapture` | Fires for every way a gesture ends (`pointerup`, `pointercancel`, element removed). Removes listeners and cancels the pending frame. If a move started, it applies the last pending pointer event first, then `apply_move()`. A plain click therefore changes nothing: a maximized or snapped window stays put. |
| attachment teardown | Removes every listener and releases capture if still held. |

`init_move()` when the window is **snapped or maximized**:

- It measures the frame (`element.closest("[data-window-id]").getBoundingClientRect()`) and converts it to container space by subtracting `container.x/y`.
- **Resize**: writes that rect into `instance.bounds`, so the window resizes from where it visibly is.
- **Drag**: keeps the restored `bounds` size. The grab point keeps its relative spot: `grab_offset = (clientX − rect.left) / rect.width × bounds.width`, and the restored window starts at `clientX − container.x − grab_offset`.

`apply_move()`:

- If a snap zone is under the pointer, it sets `instance.snap_zone` and adds a 250ms inline `transition` to the frame (`closest("[data-window-id]")`), removed on `transitionend`.
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
| App icon (duotone) + title | `instance.title ?? manifest.name`, `text-ui font-medium`; with a title the tooltip is "{title} — {app}". A `primary` dot follows while the window is dirty. The group fades to 80% opacity when the window isn't focused. The icon is always the manifest's (no `set_icon`). |
| Zoom − / % / + | Per-window CSS `zoom` on the content, from 0.5 to 2 in 0.1 steps (rounded to one decimal). − and + are `IconButton`s (Phosphor `Minus` / `Plus`) that disable at the limits. The % button resets to 1; its accessible name is "Reset zoom, now N%". A quiet pill that's invisible until the titlebar is hovered or something in it has focus, and always visible when zoom isn't 100%. The state is local to `window.svelte`, so it's lost on reload and not saved in the session. |
| Update | A `sm` `pressed` `Button` with `ArrowCircleUp` and "Update", shown while `can_update(app_id)` (`components/apps/app-actions.ts`): a newer version of the app arrived without a reload, its windows still run the old one, and its files are saved here or the device is online. Calls `apps.restart(app_id)`: the new version loads first (if it can't, a toast and nothing closes), then every window of the app closes (guarded, dirty ones first) and reopens on it with the same props and frames ([apps](../services/apps.md#app-only-updates-stage-3)) |
| Copy link | Phosphor `Link`. Shown when `router.link_for(id)` isn't `null`, which is every open window: device paths are left out of the link, not the button. Opens a menu: Copy link (`router.copy_link(id)`) or Copy solo link (`router.copy_link(id, RouteKind.SOLO)`, the app alone, [solo](solo.md)); either copies the URL and toasts ([router](../services/router.md)). Not on mobile: there's no titlebar there. |
| Pop out | Phosphor `PictureInPicture`. Shown when the [extract](../services/extract.md) service exists and `supported`. Disabled while dirty, labelled "Save first to pop out": the remount would drop unsaved work. Calls `extract.pop(id)`; the click is the user activation PiP needs |
| Minimize | `windows.toggle_minimize(id)` |
| Maximize / Restore | `windows.toggle_maximize(id)`. The icon swaps between `CornersOut` and `CornersIn`; label and title follow. |
| Close | `windows.close(id)`, guarded (ADR-029): a dirty window asks Save / Don't save / Cancel first. A clean maximized window closes inside a view transition. Hover turns it `bg-error text-background`. |

Controls are kit `IconButton`s (`size="sm"`, quiet; the zoom ones narrowed to `w-6`), so each has its `label` as accessible name and tooltip. Every button carries `data-window-button` so the drag attachment and the double-click handler skip it.

## Content and app context

`window-content.svelte`:

- The app context is set one level up, in `window.svelte` (`set_app_context({ window_id, app_id, window, storage })` once at init, `app_id` under `untrack`), so sheets rendered beside the app share it ([apps/app-context.md](../apps/app-context.md)).
- The content area is a size container (`container-type: size`) so sheets can size against the window (`cqw`/`cqh`), and the app is wrapped in `inert` while sheets are open.
- `{#await instance.app.component}` shows a centered `Spinner` ("Loading app") while the chunk loads, faded in with `pop-in` after a 300ms delay so a fast load never blinks, then `<Component {...instance.app.props} />`. On failure it shows `update/load-failed.svelte` with the app's name, `onretry` and `onclose`. A failed import is usually a deploy (the page asks for chunks the new build replaced), so it runs `version.check()` at once. Every state is an `EmptyState` titled after the app, with **Close window** last and the raw error (`failure_details`: the error line plus the stack) in its collapsed **Details** with a copy button:
  - offline (`store.online` false): "{App} isn't on this device yet", a note that installed apps download while online and apps opened without installing need a connection, and **Close window**, no details; back online, it retries the load by itself;
  - `update_available` set: "{App} didn't load", "WebOS v{x} came out after this page opened…" and **Update and reload** (`apply_update()`);
  - otherwise `load_failure(error)` (`update/load-error.ts`, pure, Node-tested) reads the message. `fetch` (Chrome's, Firefox's and Safari's failed-import wording, Vite's CSS preload): "Its code didn't download…" with **Try again** and **Reload WebOS** (`location.reload()`); `code` (the module threw while evaluating): "It hit an error while starting…" with **Reload WebOS** only, since the browser keeps a module that threw and a second import repeats the error. While the version check runs the line reads "Checking for a newer version of WebOS…" and Try again is disabled.
  - **Try again** sets a local `retried` promise that replaces `instance.app.component` in the `{#await}`. The browser also keeps a failed module fetch in its module map, so importing the same URL again never reaches the network: the retry first asks AppsService again (`apps.get(id).component()`): a window opened before its app's code landed failed on the manifest chunk, and `load()` asks for that afresh ([apps](../services/apps.md#catalogue-sources)). Only if that fails too, it imports the chunk the error names (`failed_module_url`, same origin only) with a fresh `?retry=n` query, which is a new module that is fetched for real (a component chunk the browser already failed). Safari's message names no URL; there only the first step runs.

  Mobile and solo windows reuse this component. Desktop widgets use its `compact` form (one line and a small button, no details). The promise was started by `AppsService.launch()`, not here.
- `<svelte:boundary>` catches errors thrown while the app renders, in its effects and in its `$derived`: the window shows an error `EmptyState` ("{App} crashed", a line saying a restart keeps what it saved, the error and stack in **Details**) with **Restart app** (the boundary's `reset()`, which remounts the app: component state is lost, `persisted()` and `storage.window()` values survive) and **Close window**. The error is logged and posted as an `error` toast from the app's id, so a crash in a minimized window isn't silent. Errors in event handlers and un-awaited promises aren't caught by boundaries (Svelte rule); they still reach the console only.
- The wrapper is `h-full w-full overflow-auto @container`. That container is what apps' `@sm:`/`@md:` queries resolve against ([CONVENTIONS](../../CONVENTIONS.md)).
- With `WindowFlag.DEBUG` it also renders the debug snippet passed from `window.svelte`: `bounds` and `move` as JSON.

## User interactions

| Input | Target | Result |
|-------|--------|--------|
| Pointer drag | Titlebar (not its buttons) | Move. A drop at a container edge or corner snaps. |
| Pointer drag | 8 resize handles (`n s e w ne nw se sw`, 8px edges / 12px corners, unclipped by the rounded corner) | Resize. Handles are hidden when maximized or minimized. |
| Pointer down | Titlebar or resize handle | Focus (raise) |
| Click (no movement) | Titlebar of a maximized/snapped window | Nothing. The window stays put; only a drag past 4px restores it. |
| Pointer down (capture phase) | Anywhere in the frame, content included | Focus (raise) |
| `focusin` | Anything inside the frame gets DOM focus (Tab, programmatic) | Focus (raise) |
| Click | Titlebar buttons | See the titlebar table |
| Keyboard | — | The frame takes DOM focus when the window comes to the front. Window shortcuts are the shortcuts service's; no keyboard move/resize. |
| Double-click | Titlebar (not its buttons) | `windows.toggle_maximize(id)` in a view transition: maximize, or restore a maximized window. On a snapped window it maximizes; the next double-click restores to the snapped spot. The maximize button is the accessible path. |

## Platform APIs

- Pointer Events with `setPointerCapture` and `touch-action: none` on the titlebar and handles, so touch drag works.
- `requestAnimationFrame` throttling.
- CSS: `zoom`, `contain`, `content-visibility`, `contain-intrinsic-size`, `@container`, `translate3d`, `backdrop-filter` (snap preview).
- View Transitions (`view-transition-name`, `document.startViewTransition`), Svelte `in:`/`out:` transitions.
- Not used: popover/top layer, anchor positioning.

## Known gaps

- The handler mutates the instance directly (bounds, snap_zone, flags) instead of going through the service API.
- No `role`/`aria-*` on the frame itself.
- A drag that snaps doesn't morph.
- Closing during the 100ms outro leaves the frame visible but its record is already gone.
