# Taskbar

Source: `src/lib/core/components/taskbar/` · Services: [windows](../services/windows.md), [settings](../services/settings.md), [apps](../services/apps.md), [desktop](../services/desktop.md), [version](../services/version.md) · ADRs: [ADR-014](../../adrs/014-window-enhancements.md), [ADR-015](../../adrs/015-customization-theming.md) (accepted), [ADR-024](../../adrs/024-design-system.md) · Design: [docs/design/shell.md](../../design/shell.md#taskbar)

| File | Role |
|------|------|
| `taskbar.svelte` | The floating dock, laid out per `settings.taskbar.position`: start button, separator, window items, tray |
| `taskbar-item.svelte` | One button per open window, with a running indicator |
| `terminal-button.svelte` | The Terminal button, just before the tray |
| `taskbar-tray.svelte` | The tray button (bell, unread badge, clock) and the notification center popover |
| `taskbar-clock.svelte` | Time and short date, rendered inside the tray button |
| `start-menu.svelte` | Start button + anchored `popover` element |
| `start-menu-popover.svelte` | Popover contents: search, app tile grid, pin buttons, footer |

## Responsibilities

- Show a start button, one item per window and the tray.
- Lay itself out for the taskbar position. `os.svelte` decides which grid area the taskbar gets. The taskbar only switches between a `vertical` layout (`left`/`right`) and a `horizontal` one (`top`/`bottom`).
- Styling: a floating dock. The outer strip is transparent and pads only its screen-edge sides by 8px (bottom bar: `px-2 pb-2`, and so on). The side facing the windows gets its 8px from the window area's own snap inset, so every gap (screen edge, between snapped windows, window to dock) is 8px. Inside the strip, `<nav aria-label="Taskbar" class="taskbar-dock">` is a `rounded-2xl bg-background-light/90 backdrop-blur-xl shadow-popover` bar, `h-13` (horizontal) or `w-13` (vertical), with a `p-1.5` inset and `gap-1`. **Flush mode:** while any non-minimized window is maximized, the strip drops its padding and the bar drops its radius and shadow, becoming an edge bar with a `foreground/8` hairline on the window side, so the maximized window's square edge joins it instead of meeting the dock's rounded corners. `anchor-name: --taskbar-dock` sits on an absolute inner box (`inset-0`, or inset 8px along the bar in flush mode), so the start menu and notification center keep 8px off the screen corners either way. The bar has `view-transition-name: taskbar-dock`, so going flush or back morphs inside the maximize, restore and minimize view transitions together with the window. Closing a clean maximized window (the titlebar's Close, `win close`) runs in a view transition too; a dirty one asks first and switches instantly.
- Order: start button, a hairline separator (`foreground/12`, `role="separator"`), the window items (`flex-1`, scrolling along the bar's axis when they overflow), the Terminal button, the tray at the far end.
- **Terminal button**: 40px `rounded-xl` like the start button, `TerminalWindow` icon (`fill` while a Terminal runs, `bold` otherwise), `bg-foreground/10` while one is focused. A click toggles like a window item on the newest Terminal: focused or minimized → `toggle_minimize` in a view transition; open behind → `focus`; none → `apps.launch("terminal")`. Desktop only: the phone has no taskbar.

The position comes from [settings](../services/settings.md) (`taskbar.position`: `top | bottom | left | right`, persisted there). The bar re-renders when it changes, and the [window manager](window-manager.md) re-measures its container.

## Window items

- The list is `windows.sorted_list()` by `created_at`, so it's in open order and stable under focus changes.
- One item per window, no grouping by app (ADR-014).
- Each item is a 40px `rounded-xl` button with the app icon (`size-5.5`), `aria-label` and `title` set to the app name, and `aria-pressed` when it's the focused, visible window.
- While its window is minimized the button carries `view-transition-name: window-{id}`, and minimize/restore from it run in `view_transition()`, so the window flies into and out of the button ([window motion](window.md#motion)).

States:

| State | Style |
|-------|-------|
| focused and not minimized | `bg-foreground/10`, `fill` icon, a 16px `primary` bar on the edge facing the desktop |
| open, not focused | `duotone` icon, a small dot |
| minimized | icon dimmed, dot |
| hover | `bg-foreground/10` |

The indicator sits under the button when horizontal and to its left when vertical, so it's on the same side whether the bar is at the top or the bottom (left or right). It animates between bar and dot over 200ms.

## Clock

`taskbar-clock.svelte` keeps a local `now` and re-reads it with a `setTimeout` aimed at the next minute boundary, so the time never lags. It renders a `<time datetime>`: mono `text-ui` time, always 24-hour `HH:MM` (`hourCycle: "h23"`) in every locale, over a `text-2xs` date at 80% (`weekday day month` horizontally, `day month` vertically). It's the label half of the tray button and has no action of its own.

## Tray and notification center

ADR-006 revision, [brainstorm](../../brainstorm/2026-10-12_notification-center.md). No tray registry: Tasks (ADR-013) will add its indicator here.

- One button: a `BellSimple` (`fill` with unread, `bold` otherwise) with a `primary` count badge (`99+` past 99), then the clock. `aria-label` and `title` are "Notifications" or "Notifications, N unread". `foreground/10` fill while open; bell beside the clock horizontally, above it vertically.
- `popovertarget="notification-center-popover"`. The popover mirrors [UiService](../services/ui.md) `notifications` exactly like the start menu mirrors `launcher`, so Alt+Shift+N opens it and opening one closes the other.
- Anchored to the dock, flush with its **far** end: `top span-left` (bottom bar), `bottom span-left` (top), `right span-top` (left), `left span-top` (right); same 8px margins, fallbacks, scrim, `animate-pop-in`. `min(24rem, 100vw − 1rem)` wide, at most `min(34rem, 100dvh − 5rem)` tall, `p-2`.
- Contents mount only while open: `notifications/notification-list.svelte`, header "Notifications" with a quiet "Clear all" (dismisses every notification), the entries newest first (`animate:flip`), or an `EmptyState` ("No notifications"). Each entry is `notification-item.svelte` with the sender (the app's name, "System" for non-app ids like `apps` and `session`) and time (`HH:MM` today, `format_datetime` otherwise). Its close button and actions `dismiss()` it.
- While the list is mounted an effect marks everything read and hides every toast, new arrivals included.

## Start menu

- The start button (40px `rounded-xl`, `aria-label="Start"`, `LogoMark` in `primary`) is `popovertarget="start-menu-popover" popovertargetaction="toggle"`. It shows a `foreground/10` fill while the menu is open.
- The menu is a `popover` (auto) element. The browser handles the top layer, light dismiss (outside click, Escape) and toggling.
- It's **anchored to the dock**, not the button: `position-anchor: --taskbar-dock` and a `position-area` that opens away from the screen edge the taskbar is on and spans from the dock's start edge (`top span-right` for a bottom bar, `bottom span-right` for top, `right span-bottom` for left, `left span-bottom` for right), so the menu sits flush with the dock's start. An 8px gap comes from a per-position margin (`mb-2` / `mt-2` / `ml-2` / `mr-2`). `position-try-fallbacks: flip-block, flip-inline`. Size: `min(26rem, 100vw − 1rem)` wide, at most `min(34rem, 100dvh − 5rem)` tall. `rounded-2xl bg-background-lighter shadow-popover`, enters with `animate-pop-in`. A `::backdrop` is the shared scrim `--overlay` (`background-darkest` at 60%).
- `ontoggle` mirrors the open state into local `open`, so `StartMenuPopover` only mounts while it's open (search resets every time), and into [UiService](../services/ui.md) (`launcher`). An effect shows or hides the popover when `ui.overlay` changes, so Mod+K opens it ([shortcuts](../services/shortcuts.md)).

Contents (`start-menu-popover.svelte`):

1. A large `Input` ("Search apps, or > for commands"), focused by an `$effect` on mount (`autofocus` doesn't fire, because the content mounts after the popover opened). It runs `search_apps()` ([manifest](../apps/manifest.md#launcher-search-and-sections-searchts)): every query word must match name, id, keywords, description or category label, ranked, with one-typo tolerance for long words.
2. With no query, one section per `group_apps()` entry (Productivity … Games, then System), each an overline and a grid. While searching, one "Results" overline and grid in rank order. Grids are 4 columns of app tiles: a 44px icon tile (`bg-background`, `shadow-raised`, duotone glyph) over a one-line `text-2xs` name. No matches shows an `EmptyState` ("No apps match").
3. A pin `IconButton` in each tile's top-right corner, invisible until the tile is hovered or the pin has keyboard focus.
4. **Command mode** (ADR-033). A query starting with `>` swaps the grids for `command-mode.svelte`. It keeps one [shell](../services/shell.md) session while the menu is open, and the field forwards its keys to the component:
   - **Naming** (the words typed don't resolve to a command yet): rows list every available command, matched by id or description with prefix matches first. Each row shows its description and its bound keys as `Kbd` chips. ↑ ↓ move, Tab fills the name. Enter runs a command that needs no args; a command with required positionals fills `> id ` instead, so its args come next.
   - **Args:** rows are `shell.complete()` for the end of the line, shown unescaped (`Brand Dark`) and inserted escaped. Enter runs the line unless a row was picked with the arrows; then Enter applies it.
   - **Result:** a run with no output and no error closes the menu. Otherwise a card on the field surface shows the line, a spinner while it runs, the error, or the first 8 values in text form ("… N more"), plus **Open in Terminal**. That button, or Mod+Enter, launches the Terminal with `{ run: line }`.
   - The footer hint reads `↵ run`. The mobile app drawer has no command mode.
5. A footer on `bg-background`: the logo lockup and "WebOS", a `↵ open` hint while a query has a first match, and `v{version} · {commit}` in mono.

## User interactions

| Input | Target | Result |
|-------|--------|--------|
| Click | Window item, minimized | `windows.toggle_minimize(id)`. Restores and focuses it in one click. |
| Click | Window item, focused | `windows.toggle_minimize(id)`. Minimizes it; focus moves to the next visible window. |
| Click | Window item, visible but not focused | `windows.focus(id)`. Raises it. |
| Click | Start button | Toggle the start menu |
| Click | Tray | Toggle the notification center |
| Click | Entry's close button / action | Run the action, then `notifications.dismiss(id)` |
| Click | Clear all | Dismiss every notification |
| Type | Search field | Filter the tiles |
| Enter | Search field | With a non-empty query, launch the first match (`apps.launch(id)`) and close the menu. Nothing with an empty query |
| Click | App tile | `apps.launch(id)` with no props, then `hidePopover()` |
| Click | Pin button ("Pin {name} to desktop") | `desktop.pin(id)`: writes `{App name}.desktop` into `/home/Desktop`, which appears on the desktop in the first free cell. Errors go to `console.error`. The menu stays open. |
| Escape / outside click | Open menu | Close it (native light dismiss) |
| Keyboard | Bar | Native button Tab/Enter. Mod+K start menu, Alt+Shift+N notification center ([shortcuts](../services/shortcuts.md)). No arrow-key movement in the tile grid. |

## Platform APIs

- Popover API: `popover`, `popovertarget`, `popovertargetaction`, `hidePopover()`, the `toggle` event, `:popover-open`.
- CSS anchor positioning: `anchor-name`, `position-anchor`, `position-area`, `position-try-fallbacks`. `::backdrop` on the popover.
- `backdrop-filter`, `color-mix(in oklch, …)`.

## Known gaps

- "Pin to desktop" can pin duplicates (`Settings (1).desktop`) and gives no feedback: not on success, not when the grid is full and the new icon is hidden, not on failure.
- No grouping, no context menus, no auto-hide or size options (ROADMAP "Taskbar Enhancements").
