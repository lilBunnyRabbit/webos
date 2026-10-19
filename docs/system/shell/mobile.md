# Mobile shell

Source: `src/lib/core/components/mobile/` · ADR: [ADR-016](../../adrs/016-mobile-support.md) (revision 2026-10-12) · [Brainstorm](../../brainstorm/2026-10-12_mobile-shell.md)

The shell phones and tablets get. `load_shell()` (`components/platform-shell.ts`) imports it instead of `desktop-shell.svelte` when `kernel.platform` is `mobile`, and `os.svelte` renders what it loaded. That's the shell's one platform branch; below it, a few components and apps still read `kernel.platform` for touch behaviour (File Explorer's file list, Media Preview, App Library details, Activity Monitor's widgets section and several user apps). Each shell is its own chunk, so a phone never downloads the desktop shell and the other way round (ADR-036). Everything inside types against the mobile services: [`MobileWindowsService`](../services/windows.md#mobile) and [`MobileDesktopService`](../services/desktop.md#mobile-home). Try it on a desktop with `?platform=mobile`.

## Layout

```
mobile-shell.svelte        flex column, h-dvh, safe-area insets left/right, touch-action: manipulation
├─ DialogsHost anchored="sheet"   menus as bottom sheets
├─ main (stage)           container-type: size, isolate; the wallpaper (shell/desktop.md#wallpaper); logo mark watermark in the centre (presets only)
│  ├─ mobile-home.svelte  pages + page dots + dock
│  ├─ mobile-windows.svelte  every running window; the switcher when open
│  ├─ app-drawer.svelte   when open
│  └─ ToastArea           top, centred, below the safe area
└─ nav-bar.svelte         back, home, running apps
```

No WebOS status bar: the device shows its own. `index.html` sets `viewport-fit=cover` and `interactive-widget=resizes-content` (the layout shrinks above the soft keyboard, so fixed rows like the Terminal's key row stay visible), and the shell pads with `env(safe-area-inset-*)`: the home and each app pad the top, the nav bar the bottom.

## State

| What | Where |
|------|-------|
| Which app is on screen | `windows.get_focused()`. `null` = home |
| Drawer or switcher open | [UiService](../services/ui.md) `overlay`: `launcher` (drawer), `switcher` or `notifications` (also the switcher) (ADR-028; was local `$state` until the shortcuts service needed to reach it) |
| Current page | Local in `mobile-home.svelte`, from the scroll position |

An effect closes the overlay whenever a window comes on screen (drawer launch, a card picked, a file opened from elsewhere). Going home leaves it alone, so closing the on-screen app's card keeps the switcher open.

## Navigation

Buttons, not gestures: every screen edge belongs to the device (iOS: left edge back, bottom home indicator, top Control Center; Android: both edges back, bottom home).

| Button | Does |
|--------|------|
| Back | `ui.back()` ([ui](../services/ui.md#back)): closes the drawer or switcher; dismisses the top system dialog or menu, then the app's top sheet, when dismissible (a required one swallows back); asks the on-screen app (`windows.back(id)`, its `on_back` handlers, newest first); sends the app home (it keeps running). Nothing on home. The device's back gesture runs the same chain through the history guard |
| Home | Closes any layer and goes home |
| Running apps | Opens the switcher, or closes it (or the notification view of it). A `primary` badge shows the count of running apps; a `primary` dot (ringed in the bar colour) on the other corner means unread notifications |

Escape also closes an open layer. Every change runs through `view_transition()` (`$lib/core/utils/view-transition.ts`, shared with the desktop window motion): `document.startViewTransition` + `flushSync`, skipped under `prefers-reduced-motion` or Motion off (`motion_reduced()`). A rejected `ready` (hidden tab, a newer transition) is swallowed.

## Windows and switcher

`mobile-windows.svelte` renders every window in `windows.list()` order, keyed, so switching modes never remounts an app.

- **Normal:** each window is `absolute inset-0`; only the focused one shows (`hidden` otherwise, still mounted, like a minimized desktop window). It runs `animate-pop-in` each time it appears. With nothing focused, the layer is `pointer-events-none` and home takes the taps.
- **Switcher:** the same elements become a horizontal scroll-snap row on the scrim with `backdrop-blur-xl`. Cards are the live windows: a box of `66cqw × 66cqh` holding the window at full stage size (`100cqw × 100cqh`) with `scale: 0.66` (`--card-scale`), `inert`. CSS `order` sorts them by `windows.recent()`, most recent first. Each has a header (icon, name, close button) and a transparent button over the card:
  - tap opens it;
  - a flick up past 96px closes the app (the card follows the finger and fades);
  - sideways is the browser scrolling the row (`touch-action: pan-x`). The first clear direction decides.
- **Notification center** (ADR-006 revision): with any notifications, the switcher opens with `NotificationList` on top (safe-area padded, at most `32cqh`, scrolling), cards on `bg-background-lighter shadow-raised`, and the cards shrink to `0.55`. The row's side padding is `(1 − scale) × 50cqw`, so a card always centres. Showing the list marks everything read and hides the toasts. Above the list, while background tasks run, an "N tasks running · Show" line (`NotificationList` `tasks` prop) launches Activity Monitor on its Tasks section; the mobile shell has no taskbar indicator ([tasks](../services/tasks.md)).
- "Close all" under the row; "No running apps" when empty.
- Each card has `view-transition-name: window-{id}`, so opening and closing the switcher morphs between card and fullscreen.

`mobile-window.svelte` is the window body: carries `data-window-id` like the desktop window (Activity Monitor observes it, dialogs anchor to it), sets the app context exactly like the desktop window, renders `WindowContent` (zoom 1, error boundary) and `WindowSheets`, pads the top safe area, and makes the app `inert` while a sheet is open. No titlebar.

## Home

`mobile-home.svelte`:

- **Pages:** a horizontal scroll-snap row, one page per `desktop.pages(columns, rows)` page. `columns = clamp(floor(width / 88), 4, 8)`, `rows = max(1, floor(height / 104))`, measured from the row with `bind:clientWidth/Height`. A phone gets 4 columns; a tablet more; rotation just reflows. Each page is a CSS grid of `columns × rows` cells (104px rows) and every slot is placed at the cell the packer gave it (`grid-column`/`grid-row`), never by auto-placement.
- **Widgets** (2026-10-19): a rounded `background-light` frame over its span, the app's widget component inside (`components/desktop/widget-body.svelte`, shared with the desktop frame). No title strip: holding the frame (outside inputs) opens the item menu. `overscroll-x-contain` stops a fling at the last page from turning into browser back. Dots under the pages when there's more than one; tapping one scrolls there.
- **Icons:** `home-icon.svelte`, the desktop's rule: apps get a 56px `rounded-2xl` tile on `background-light` with `shadow-raised` and a hairline around a 28px `ShortcutIcon` (no badge); files and folders a bare 48px `FileIcon` (`.bare-glyph`, folders `primary` fill). A two-line `text-xs` label below. Tap opens through `desktop.open`.
- **Dock:** the taskbar's look (`rounded-2xl bg-background-light/90 shadow-popover backdrop-blur-xl`): an All apps button (`SquaresFour`), a separator, then up to four docked items without labels. Empty, it says "Hold an icon, then Add to dock".
- **Long press** (`$lib/core/utils/long-press.ts`): 450ms without moving more than 16px (a still finger on Samsung Internet drifts past 8px). Moving earlier hands the gesture to the browser (page swipe). Once it fires: a short vibration, pointer capture, `touchmove` cancelled so the page doesn't scroll under the finger, and the click after release swallowed. Android's own long-press `contextmenu` is suppressed; a mouse right-click opens the menu. `-webkit-touch-callout: none` and `select-none` keep iOS from adding its callout.
  - **Item menu** (`home-actions.ts`): Open, Add to dock (disabled when full; not for widgets) / Remove from dock, Edit home screen, Rename, Delete / Remove shortcut / Remove widget, Properties. Rename, delete and properties are `desktop-actions.ts`'s flows.
  - **Empty space menu:** Edit home screen and Add widget, then the desktop's background menu (`background_menu(point, lead)`: New folder, Paste, Change wallpaper or theme). Sort by isn't offered: the home is an ordered flow.
- **Edit mode** (2026-10-19, [brainstorm](../../brainstorm/2026-10-19_mobile-home-widgets.md)). Local `editing` state in `mobile-home.svelte`. Items wiggle (`animate-wiggle`, off under reduced motion), a top row shows Add widget and Done, Escape also leaves. Each item gets a covering button with `touch-action: none`, so a press is ours from pointer-down and the browser never claims it as a scroll; that's why the hold-then-drag of 2026-10-13 failed on Samsung Internet and this doesn't.
  - Press and move past 8px: drag. A ghost follows the finger, the source dims, the drop target shows a primary bar (home) or a ring (dock). Over an item = just before it; over a page's empty space = the end of that page; over the dock = docked (never widgets, not when full). Holding within 56px of a side for 550ms turns the page. Settles on `pointerup` (the dropped item's element is often gone before its capture would be lost); `lostpointercapture` only clears. Moves go through `move_item` / `set_docked(before)`.
  - Press and release without moving: the item menu.
  - Widgets of apps with a `widget_size` get a 44px corner grip: dragging it snaps to cells measured from the frame, clamped into `widget_size` and to the page from the widget's cell, with a `w × h` chip. Release writes it through `resize_widget` (shared with the desktop: the `.widget` file's `w`/`h`).
  - Add widget (top row or empty-space menu): a menu of installed apps with a widget; the pick is pinned at its default size and lands at the end of the home.

## App drawer

`app-drawer.svelte`: the start menu's counterpart. A `rounded-t-3xl bg-background-lighter` sheet on the scrim, flying up 48px, below the top safe area plus 2rem. Search field (not auto-focused, so the keyboard stays down; Enter launches the first match) with an **All apps** button beside it that launches [App Library](../system-apps.md#app-library) and closes the drawer, then the apps in auto-fill grids of the home's tiles: sectioned by `group_apps()` with no query, a ranked "Results" grid while searching, then "Not installed" matches with a "Get" pill (`services/apps/search.ts`, shared with the start menu). Only installed apps show without a query (ADR-040). Tap launches (a Get tile installs first); long press offers "Add to home screen" (`desktop.pin`) and, for user apps, "Uninstall…", or "Get and open" on a Get tile. Tapping the scrim closes it. So does pulling the top of the sheet (grab bar and search row, `touch-none`) down past 96px; the sheet follows the finger and springs back when released short.

## Services read

`windows` (as `MobileWindowsService`), `desktop` (as `MobileDesktopService`, or the base in the drawer), `apps`, `dialogs`, `notifications` (toasts, the nav bar's unread dot), `ui` (launcher and switcher overlays, `back()`), `settings` (wallpaper).

## Known gaps

- Apps aren't adjusted for phone widths yet (second pass). Most assume a desktop-sized window.
- Two device backs with no tap between them leave WebOS: Chrome skips a history entry pushed without a gesture, so the guard re-arms only on the next tap ([ui](../services/ui.md#back)).
- No virtual keyboard handling beyond what `h-dvh` gives.
- Centred system dialogs use their desktop sizes (capped to the screen); context menus and Open with are bottom sheets.
- Back doesn't leave edit mode; Done, Escape or a reload does.
- Edit mode drag is checked with a mouse in Chromium only; not yet on a Samsung phone.
- A widget that doesn't fit the rest of a page leaves a gap: the packer never backfills, so the order stays the user's.
