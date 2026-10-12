# Mobile shell

Source: `src/lib/core/components/mobile/` · ADR: [ADR-016](../../adrs/016-mobile-support.md) (revision 2026-10-12) · [Brainstorm](../../brainstorm/2026-10-12_mobile-shell.md)

The shell phones and tablets get. `os.svelte` renders it instead of `desktop-shell.svelte` when `kernel.platform` is `mobile`; that's the only platform check in the UI. Everything inside types against the mobile services: [`MobileWindowsService`](../services/windows.md#mobile) and [`MobileDesktopService`](../services/desktop.md#mobile-home). Try it on a desktop with `?platform=mobile`.

## Layout

```
mobile-shell.svelte        flex column, h-dvh, safe-area insets left/right, touch-action: manipulation
├─ DialogsHost anchored="sheet"   menus as bottom sheets
├─ main (stage)           container-type: size; the desktop glow; logo mark watermark in the centre
│  ├─ mobile-home.svelte  pages + page dots + dock
│  ├─ mobile-windows.svelte  every running window; the switcher when open
│  ├─ app-drawer.svelte   when open
│  └─ ToastArea           top, centred, below the safe area
└─ nav-bar.svelte         back, home, running apps
```

No WebOS status bar: the device shows its own. `index.html` sets `viewport-fit=cover`, and the shell pads with `env(safe-area-inset-*)`: the home and each app pad the top, the nav bar the bottom.

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
| Back | In order: closes the drawer or switcher; asks the on-screen app (`windows.back(id)`, its `on_back` handlers, newest first); dismisses the app's top sheet when it's dismissible (a required one stays); sends the app home (it keeps running). Nothing on home. The OS back gesture keeps its browser meaning |
| Home | Closes any layer and goes home |
| Running apps | Opens the switcher, or closes it (or the notification view of it). A `primary` badge shows the count of running apps; a `primary` dot (ringed in the bar colour) on the other corner means unread notifications |

Escape also closes an open layer. Every change runs through `view_transition()` (`$lib/core/utils/view-transition.ts`, shared with the desktop window motion): `document.startViewTransition` + `flushSync`, skipped under `prefers-reduced-motion`. A rejected `ready` (hidden tab, a newer transition) is swallowed.

## Windows and switcher

`mobile-windows.svelte` renders every window in `windows.list()` order, keyed, so switching modes never remounts an app.

- **Normal:** each window is `absolute inset-0`; only the focused one shows (`hidden` otherwise, still mounted, like a minimized desktop window). It runs `animate-pop-in` each time it appears. With nothing focused, the layer is `pointer-events-none` and home takes the taps.
- **Switcher:** the same elements become a horizontal scroll-snap row on the scrim with `backdrop-blur-xl`. Cards are the live windows: a box of `66cqw × 66cqh` holding the window at full stage size (`100cqw × 100cqh`) with `scale: 0.66` (`--card-scale`), `inert`. CSS `order` sorts them by `windows.recent()`, most recent first. Each has a header (icon, name, close button) and a transparent button over the card:
  - tap opens it;
  - a flick up past 96px closes the app (the card follows the finger and fades);
  - sideways is the browser scrolling the row (`touch-action: pan-x`). The first clear direction decides.
- **Notification center** (ADR-006 revision): with any notifications, the switcher opens with `NotificationList` on top (safe-area padded, at most `32cqh`, scrolling), cards on `bg-background-lighter shadow-raised`, and the cards shrink to `0.55`. The row's side padding is `(1 − scale) × 50cqw`, so a card always centres. Showing the list marks everything read and hides the toasts.
- "Close all" under the row; "No running apps" when empty.
- Each card has `view-transition-name: window-{id}`, so opening and closing the switcher morphs between card and fullscreen.

`mobile-window.svelte` is the window body: sets the app context exactly like the desktop window, renders `WindowContent` (zoom 1, error boundary) and `WindowSheets`, pads the top safe area, and makes the app `inert` while a sheet is open. No titlebar.

## Home

`mobile-home.svelte`:

- **Pages:** a horizontal scroll-snap row, one page per `desktop.pages(columns × rows)` chunk. `columns = clamp(floor(width / 88), 4, 8)`, `rows = floor(height / 104)`, measured from the row with `bind:clientWidth/Height`. A phone gets 4 columns; a tablet more; rotation just reflows. `overscroll-x-contain` stops a fling at the last page from turning into browser back. Dots under the pages when there's more than one; tapping one scrolls there.
- **Icons:** `home-icon.svelte`, a 56px `rounded-2xl` tile on `background-light` with `shadow-raised` and a hairline, a 28px glyph (`ShortcutIcon` / `FileIcon`) and a two-line `text-xs` label. Tap opens through `desktop.open`.
- **Dock:** the taskbar's look (`rounded-2xl bg-background-light/90 shadow-popover backdrop-blur-xl`): an All apps button (`SquaresFour`), a separator, then up to four docked items without labels. Empty, it says "Hold an icon, then Add to dock".
- **Long press** (`long-press.ts`): 450ms without moving more than 16px (a still finger on Samsung Internet drifts past 8px). Moving earlier hands the gesture to the browser (page swipe). Once it fires: a short vibration, pointer capture, `touchmove` cancelled so the page doesn't scroll under the finger, and the click after release swallowed. Release without moving → menu; moving after the hold cancels it (home icons pass no drag handlers). Android's own long-press `contextmenu` is suppressed; a mouse right-click opens the menu. `-webkit-touch-callout: none` and `select-none` keep iOS from adding its callout.
  - **Icon menu** (`home-actions.ts`): Open, Add to dock (disabled when full) / Remove from dock, Rename, Delete or Remove shortcut, Properties. Rename, delete and properties are `desktop-actions.ts`'s flows.
  - **Empty space menu:** the desktop's background menu (New folder, Paste, Change theme).
  - **No drag (2026-10-13).** Dragging icons to reorder or dock them was removed: on Samsung Internet the hold fired but the icon never moved, and the cause wasn't found. Docking goes through the menu. `MobileDesktopService.move_item` and the `before` argument of `set_docked` stay, unused by the shell, for when drag comes back.

## App drawer

`app-drawer.svelte`: the start menu's counterpart. A `rounded-t-3xl bg-background-lighter` sheet on the scrim, flying up 48px, below the top safe area plus 2rem. Search field (not auto-focused, so the keyboard stays down; Enter launches the first match), then the apps in auto-fill grids of the home's tiles: sectioned by `group_apps()` with no query, one ranked "Results" grid while searching (`services/apps/search.ts`, shared with the start menu). Tap launches; long press offers "Add to home screen" (`desktop.pin`). Tapping the scrim closes it. So does pulling the top of the sheet (grab bar and search row, `touch-none`) down past 96px; the sheet follows the finger and springs back when released short.

## Services read

`windows` (as `MobileWindowsService`), `desktop` (as `MobileDesktopService`, or the base in the drawer), `apps`, `dialogs`, `notifications` (toasts).

## Known gaps

- Apps aren't adjusted for phone widths yet (second pass). Most assume a desktop-sized window.
- No app-level back (File Explorer up a folder) and no OS back gesture wiring: separate brainstorm.
- No virtual keyboard handling beyond what `h-dvh` gives.
- Centred system dialogs use their desktop sizes (capped to the screen); context menus and Open with are bottom sheets.
- Home icons can't be reordered, and dock order is the order items were docked in. Drag is to be revisited.
