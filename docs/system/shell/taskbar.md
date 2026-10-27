# Taskbar

Source: `src/lib/core/components/taskbar/` · Services: [windows](../services/windows.md), [settings](../services/settings.md), [apps](../services/apps.md), [desktop](../services/desktop.md), [version](../services/version.md) · ADRs: [ADR-014](../../adrs/014-window-enhancements.md), [ADR-015](../../adrs/015-customization-theming.md) (size, auto-hide), [ADR-042](../../adrs/042-quick-launch.md), [ADR-024](../../adrs/024-design-system.md) · Design: [docs/design/shell.md](../../design/shell.md#taskbar)

| File | Role |
|------|------|
| `taskbar.svelte` | The floating dock, laid out per `settings.taskbar.position`, sized by `taskbar.size`, auto-hidden by `taskbar.auto_hide`: start button, separator, quick launch, window groups, tray |
| `quick-launch.svelte` | Pinned apps (`settings.taskbar.pinned`) with drag to pin, reorder and unpin ([Quick launch](#quick-launch)) |
| `taskbar-item.svelte` | One button per app with open windows: a plain window item for one window, a group with a count and a window list for more |
| `terminal-button.svelte` | The Terminal button, just before the tray |
| `tasks-indicator.svelte` | A spinner between the Terminal button and the tray while background tasks run ([tasks](../services/tasks.md)) |
| `taskbar-tray.svelte` | The tray button (bell, unread badge, clock) and the notification center popover |
| `show-desktop-button.svelte` | The show desktop sliver at the far end, after the tray |
| `taskbar-clock.svelte` | Time and short date, rendered inside the tray button |
| `start-menu.svelte` | Start button + anchored `popover` element |
| `start-menu-popover.svelte` | Popover contents: search, Recent row, app tile grid, pin buttons, footer |
| `command-mode.svelte` | The `>` command palette inside the start menu ([Command mode](#start-menu)) |

## Responsibilities

- Show a start button, one item per app with open windows and the tray.
- Lay itself out for the taskbar position. `desktop-shell.svelte` decides which grid area the taskbar gets. The taskbar only switches between a `vertical` layout (`left`/`right`) and a `horizontal` one (`top`/`bottom`).
- Styling: a floating dock. The outer strip is transparent and pads only its screen-edge sides by 8px (bottom bar: `px-2 pb-2`, and so on). The side facing the windows gets its 8px from the window area's own snap inset, so every gap (screen edge, between snapped windows, window to dock) is 8px. Inside the strip, `<nav aria-label="Taskbar" class="taskbar-dock">` is a `rounded-2xl bg-background-light/90 backdrop-blur-xl shadow-popover` bar with a `p-1.5` inset and `gap-1`, `--taskbar-item` + 0.75rem thick ([Size](#size)). **Flush mode:** while any non-minimized window is maximized and auto-hide is off, the strip drops its padding and the bar drops its radius and shadow, becoming an edge bar with a `foreground/8` hairline on the window side, so the maximized window's square edge joins it instead of meeting the dock's rounded corners. `anchor-name: --taskbar-dock` sits on an absolute inner box (`inset-0`, or inset 8px along the bar in flush mode), so the start menu and notification center keep 8px off the screen corners either way. The bar has `view-transition-name: taskbar-dock`, so going flush or back morphs inside the maximize, restore and minimize view transitions together with the window. Closing a clean maximized window (the titlebar's Close, `win close`) runs in a view transition too; a dirty one asks first and switches instantly.
- Order: start button, a hairline separator (`foreground/12`, `role="separator"`), the quick launch and its own separator (only while something is pinned or an app drag is over the page), the window items (`flex-1`, scrolling along the bar's axis when they overflow), the Terminal button, the tasks indicator (only while tasks run), the tray, then the show desktop sliver at the far end.
- **Terminal button**: one item (`--taskbar-item`) `rounded-xl` like the start button, `TerminalWindow` icon (`fill` while a Terminal runs, `bold` otherwise), `bg-foreground/10` while one is focused. A click toggles like a window item on the newest Terminal: focused or minimized → `toggle_minimize` in a view transition; open behind → `focus`; none → `apps.launch("terminal")`. Desktop only: the phone has no taskbar.
- **Show desktop sliver**: Windows 11 style. A `rounded-md` button 30% of an item wide (horizontal) or tall (vertical), filling the bar's height, holding a 1px line half an item long (`foreground/20`, `foreground/45` on hover, `primary` while `windows.showing_desktop`). `aria-label` "Show desktop", `aria-pressed` while shown, title with Alt+Shift+D. A click runs `toggle_desktop()` in a `window_transition` naming every window, the same as `win desktop`, so unfocused windows morph too ([window motion](window.md#motion)).

The position comes from [settings](../services/settings.md) (`taskbar.position`: `top | bottom | left | right`, persisted there). The bar re-renders when it changes, and the [window manager](window-manager.md) re-measures its container (it also re-measures on `size` and `auto_hide`).

## Size

ADR-015 revision, [brainstorm](../../brainstorm/2026-10-16_taskbar-polish.md). `settings.taskbar.size` (`small | medium | large`, default `medium`) sets one variable on the `<nav>`: `--taskbar-item` = 2rem, 2.5rem or 3rem. Everything on the bar derives from it, so medium is the 40px dock from before:

| Part | Size |
|------|------|
| Bar thickness | `--taskbar-item` + 0.75rem (the `p-1.5` inset) |
| Start, window, quick launch, Terminal and tasks buttons, quick launch placeholder | `--taskbar-item` square |
| App icons | 55% of the item; logo 60%, Terminal 50%, bell and tasks spinner 45% |
| Separators | 60% of the item long |
| Show desktop sliver | 30% of the item across, its line 50% long |

Badges, the PiP mark, the indicator and the clock keep their fixed sizes.

## Auto-hide

ADR-015 revision, [brainstorm](../../brainstorm/2026-10-16_taskbar-polish.md). With `settings.taskbar.auto_hide` on, the bar overlays the screen instead of taking a grid track:

- `desktop-shell.svelte` puts the desktop, the window manager and the toast area in one full-screen cell, so windows (and maximize) get the whole screen. The window manager re-measures through its ResizeObserver and its settings effect.
- The strip (the outer `div`, with its screen-edge padding) goes `position: fixed` at its edge and is translated off-screen except for 4px, which is the bar's inner edge: a sliver of the dock stays visible and is the hover target.
- CSS reveals it (`.auto-hide` in `taskbar.svelte`): `:hover`, `:focus-within`, `:has(:popover-open)` (the start menu or notification center, so Mod+K and Alt+Shift+N show it), `[data-reveal]` on the strip or inside it. Revealing slides in at once (200ms); hiding waits `transition-delay: 2s`.
- **Drag to pin:** a drag never hovers, so one `dragenter` on the strip sets `data-reveal`; `dragleave` out of it, `drop` and `dragend` clear it.
- **Minimize while hidden:** a window item sets `data-reveal` on itself for 400ms when one of its windows becomes minimized, inside the same flush as the minimize view transition. `:has([data-reveal])` reveals with no slide, so the new snapshot has the bar in place: the dock morphs in as the window flies into its button.
- A window item also sets `data-reveal` while its menu is open, so the bar doesn't slide away under it.
- Flush mode is off: a maximized window sits under the floating dock.
- The start menu and notification center still anchor to `--taskbar-dock`, which is on screen whenever they're open.


## Window items

- Windows are grouped by app id inside `taskbar.svelte`, always (ADR-014 revision); there's no setting. Groups are in the order of their first window's `created_at`, so the bar is in open order and stable under focus changes. The quick launch stays its own zone (ADR-042): a pinned app with windows still shows twice.
- Each group is one `taskbar-item.svelte`, keyed by app id: a `--taskbar-item` `rounded-xl` button with the app icon (55%).
- **One window** behaves as before: `aria-label` and `title` "{title} — {app}" when the window has a title, else the app name, and `aria-pressed` when it's the focused, visible window.
- **Several windows:** `aria-label` "{app}, N windows", `aria-haspopup="menu"`, and a count in its bottom-right corner (a `foreground` pill with `text-background` digits and a `background-light` ring, clear of the app badge top-right and the PiP mark bottom-left).
- A minimized window's item carries `view-transition-name: window-{id}`, and minimize/restore from it run in `view_transition()`, so the window flies into and out of the button ([window motion](window.md#motion)). A group carries the name of one member only, since two elements can't share a name: the one that minimized last (tracked by an effect in the item), else the minimized member with the highest `order`. The other members fade.

States:

| State | Style |
|-------|-------|
| focused and not minimized (a group: any member) | `bg-foreground/10`, `fill` icon, a 16px `primary` bar on the edge facing the desktop |
| open, not focused | `duotone` icon, a small dot |
| minimized (a group: every member) | icon dimmed, dot |
| menu open | `bg-foreground/10` |
| hover | `bg-foreground/10` |

The indicator sits under the button when horizontal and to its left when vertical, so it's on the same side whether the bar is at the top or the bottom (left or right). It animates between bar and dot over 200ms.

While an app-only update waits for the app's windows and its new version can load (`can_update` in `components/apps/app-actions.ts`: `apps.update_ready`, and its files saved or the device online; ADR-077 stage 3), the item carries a small `primary` `ArrowCircleUp` in its bottom-left corner, its label ends in ", update ready", and its menu starts with **Update ready**, which runs `apps.restart(id)`. Right-click a one-window item (ADR-042) for **Pin to taskbar** (or Unpin from taskbar when its app is pinned), first **Install** when its app isn't installed (`install_items` in `components/apps/app-actions.ts`, ADR-077), then, on desktop with Picture-in-Picture, **Bring back** while the window is popped out or **Pop out** otherwise (disabled while dirty, [extract](../services/extract.md)), then **Close window** (`windows.close`, so the close guard still asks). Right-click a group for Install (not installed), Pin/Unpin, then **Close all** (`windows.close` on each member, so each dirty one asks).

Click a group for its window list: `dialogs.menu` anchored beside the item, 8px off it, away from the screen edge, one entry per member in open order, labelled with the window title or the app name, with the app icon (a popped-out member shows the PiP icon). Choosing one restores it in a view transition when it's minimized (the button first takes that member's view-transition name, so the picked window is the one that flies out), focuses it plus the mini window (`extract.focus()`) when it's popped out, else focuses it. Per-window actions (Pop out, Close) stay on the windows themselves.

An item shows a small filled `PictureInPicture` mark in its bottom-left corner while its window (a group: any member) is popped out. Clicking a one-window item then focuses the window and the mini window (`extract.focus()`) instead of minimizing.

## Quick launch

ADR-042, [brainstorm](../../brainstorm/2026-10-16_quick-launch-and-random-theme.md). `quick-launch.svelte`, a `role="toolbar"` "Quick launch" between the start separator and the window items, laid out along the bar. Desktop only: the phone has no taskbar.

- **Icons:** `settings.taskbar.pinned` in order, skipping ids the registry doesn't know. 40px `rounded-xl` buttons, duotone icon, the app badge, and a small `foreground/45` dot (under, or left of, the icon) while the app has a window. `aria-label` is the app name; `title` adds "Shift-click for a new window".
- **Click:** focus the app's window with the highest `order` (`toggle_minimize` in a view transition when it's minimized), else `apps.launch(id)`. Shift-click and middle-click always launch.
- **Right-click:** Open, New window, Unpin from taskbar.
- **Drag in:** any drag carrying `application/x-webos-app` (`components/apps/drag.ts`): start menu tiles, App Store cards, its own icons. On `dragover` the insertion index is the number of shown icons whose middle is before the pointer; a `primary/12` placeholder opens there and the icons slide with `animate:flip` (160 ms). An empty zone shows a dashed `+` slot while any app drag is over the page (a `document` `dragenter` sets it; `dragend` and `drop` clear it). The drop installs the app if needed (ADR-040) and stores `with_pin(pinned, id, index)`.
- **Reorder:** dragging an own icon sets `application/x-webos-quick-launch` too. A frame after `dragstart` the icon goes `absolute opacity-0` (hiding the source inside `dragstart`, or removing it, cancels the drag in Chromium) and the placeholder takes its place.
- **Drag off:** a `document` `dragover` listener records whether the own drag is over the taskbar `nav`; a `dragend` outside it unpins. The desktop ignores quick-launch drags, so dropping one there unpins it too.

## Clock

`taskbar-clock.svelte` keeps a local `now` and re-reads it with a `setTimeout` aimed at the next minute boundary (the next second while `settings.taskbar.seconds` is on), so the time never lags. It renders a `<time datetime>`: mono `text-ui` time, always 24-hour `HH:MM` (`hourCycle: "h23"`) in every locale, `HH:MM:SS` horizontally with seconds on (tabular digits, so the width holds); a vertical dock keeps `HH:MM` and puts `:SS` on its own mono `text-2xs` line, since the dock's width is fixed. Off by default; Settings › Taskbar › Clock and `taskbar seconds on|off` switch it. The time sits over a `text-2xs` date at 80% (`weekday day month` horizontally, `day month` vertically). It's the label half of the tray button and has no action of its own.

## Tray and notification center

ADR-006 revision, [brainstorm](../../brainstorm/2026-10-12_notification-center.md). No tray registry. Tasks (ADR-013) has its own indicator before the tray: `tasks-indicator.svelte` renders only while `tasks.active_count > 0`, a spinning `CircleNotch` in `primary` with a count badge from two jobs up. Clicking it launches Activity Monitor on its Tasks section.

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

1. A large `Input` ("Search apps, or > for commands") with an **All apps** button (`quiet`, `lg`, `SquaresFour` icon) at the end of the row. It launches [App Store](../system-apps.md#app-library) and closes the menu. The field is focused by an `$effect` on mount (`autofocus` doesn't fire, because the content mounts after the popover opened). It runs `search_apps()` ([manifest](../apps/manifest.md#launcher-search-and-sections-searchts)): every query word must match name, id, keywords, description or category label, ranked, with one-typo tolerance for long words. Below that, a `SentenceSearch` ([apps](../services/apps.md#sentence-search)) over every listing adds what the sentence search finds and on-device AI suggests; neither runs in command mode (it gets an empty query after `>`).
2. With no query, a **Recent** row first (`components/apps/recent-apps.svelte`): the apps in `apps.recent` ([apps](../services/apps.md#recent-apps)), four tiles per page in the same tile look. Only one row tall: an invisible, `inert` copy of a tile sets the height, and the pages scroll inside it (`contain-size`, `snap-y snap-mandatory`, each page `snap-start snap-always`, scrollbar hidden), so a wheel tick or a swipe moves exactly one page. With more than one page, dots below it (the current one a `primary` pill, like the mobile home), driven by `onscroll` (`round(scrollTop / clientHeight)`); a dot scrolls to its page. The row isn't shown while searching, in command mode, or when the list is empty. Then one section per `group_apps()` entry (Productivity … Games, then System) of the **installed** apps (`apps.list({ installed: true })`, ADR-040), each an overline and a grid. While searching, a "Results" grid of installed matches in rank order, then a "Not installed" grid of the other matches, then a **Related** grid (the sentence search's apps the first two don't show, best first), then an **AI suggests** grid (up to 4, its overline led by a filled `primary` `Sparkle`) once on-device AI has rewritten a sentence of three words or more, about a second after typing stops. Any tile of an app that isn't installed has an **Install** button under it (`Button` `sm`, `pressed`, `apps.install`; the menu stays open and the tile moves to Results with its download ring) and no pin button; clicking the tile opens the app without installing it (`launch`, ADR-077). Enter opens the first result, else the first not-installed match, else the first Related app. "No apps match" waits while the sentence search's module is still loading. Grids are 4 columns of app tiles: a 44px icon tile (`bg-background`, `shadow-raised`, duotone glyph) over a one-line `text-2xs` name. No matches shows an `EmptyState` ("No apps match"). Every icon tile carries `AppProgress`, the download ring ([store](../services/store.md#ui)).
3. A pin `IconButton` in each installed tile's top-right corner, invisible until the tile is hovered or the pin has keyboard focus. Tiles are `draggable`: dragging one sets `application/x-webos-app` and closes the menu a frame later, so it can land on the desktop (pins it at that cell) or the quick launch. Right-click a tile for its menu: Open, Pin to desktop, Pin to taskbar (or Unpin from taskbar), on a Recent tile **Clear recent** (`CLEAR_RECENT_ITEM` in `components/apps/app-actions.ts`, calls `apps.clear_recent()`) and, for user apps, **Uninstall…** (`uninstall_app()`, [apps](../services/apps.md#public-api)); a not-installed tile's menu has Open and Install (`OPEN_ITEM`, `INSTALL_ITEM`).
4. **Command mode** (ADR-033). A query starting with `>` swaps the grids for `command-mode.svelte`. It keeps one [shell](../services/shell.md) session while the menu is open and calls `shell.load()` on open, so the apps' commands list too (a "Loading commands…" row until they're in; [lazy parts](../services/shell.md#lazy-parts)), and the field forwards its keys to the component:
   - **Naming** (the words typed don't resolve to a command yet): rows list every available command, matched by id or description with prefix matches first. Each row shows its description and its bound keys as `Kbd` chips. ↑ ↓ move, Tab fills the name. Enter runs a command that needs no args; a command with required positionals fills `> id ` instead, so its args come next.
   - **Args:** rows are `shell.complete()` for the end of the line, shown unescaped (`Brand Dark`) and inserted escaped. Enter runs the line unless a row was picked with the arrows; then Enter applies it.
   - **Result:** a run with no output and no error closes the menu. Otherwise a card on the field surface shows the line, a spinner while it runs, the error, or the first 8 values in text form ("… N more"), plus **Open in Terminal**. That button, or Mod+Enter, launches the Terminal with `{ run: line }`.
   - The footer hint reads `↵ run`. The mobile app list has no command mode.
5. A footer on `bg-background`: the logo lockup and "WebOS", a `↵ open` hint while a query has a first match, otherwise a `Mod+/ shortcuts` button that closes the launcher and runs `shortcuts sheet`, and `v{version} · {commit}` in mono.

## User interactions

| Input | Target | Result |
|-------|--------|--------|
| Click | Group (several windows) | Opens the window list; an entry restores, focuses or brings up that window |
| Right-click | Group | Update ready (an update waits), Install (not installed), Pin to taskbar / Unpin, Close all |
| Click | Window item, minimized | `windows.toggle_minimize(id)`. Restores and focuses it in one click. |
| Click | Window item, focused | `windows.toggle_minimize(id)`. Minimizes it; focus moves to the next visible window. |
| Click | Window item, visible but not focused | `windows.focus(id)`. Raises it. |
| Click | Quick launch icon | Focus the app's latest window, else launch it; Shift or middle click launches a new one |
| Drag | App tile / App Store card onto quick launch | Pin at the gap |
| Drag | Quick launch icon | Reorder within the zone; out of the taskbar unpins |
| Right-click | Window item (one window) | Update ready (an update waits), Install (not installed), Pin to taskbar / Unpin, Pop out / Bring back, Close window |
| Hover / focus | Auto-hidden bar's 4px edge | Reveal; hides 2s after leaving |
| Drag | Anything over the auto-hidden bar's edge | Reveal while the drag is over it |
| Click | Start button | Toggle the start menu |
| Click | Tray | Toggle the notification center |
| Click | Show desktop sliver | `windows.toggle_desktop()` in a view transition: minimizes every visible window, or brings back the ones it hid |
| Click | Entry's close button / action | Run the action, then `notifications.dismiss(id)` |
| Click | Clear all | Dismiss every notification |
| Type | Search field | Filter the tiles |
| Enter | Search field | With a non-empty query, launch the first match (`apps.launch(id)`) and close the menu. Nothing with an empty query |
| Click | App tile | `apps.launch(id)` with no props, then `hidePopover()` |
| Click | All apps | `apps.launch("app-library")`, then `hidePopover()` |
| Click | Pin button ("Pin {name} to desktop") | `desktop.pin(id)`: writes `{App name}.desktop` into `/home/Desktop`, which appears on the desktop in the first free cell. Errors go to `console.error`. The menu stays open. |
| Escape / outside click | Open menu | Close it (native light dismiss) |
| Keyboard | Bar | Native button Tab/Enter. Mod+K start menu, Alt+Shift+N notification center ([shortcuts](../services/shortcuts.md)). No arrow-key movement in the tile grid. |

## Platform APIs

- Popover API: `popover`, `popovertarget`, `popovertargetaction`, `hidePopover()`, the `toggle` event, `:popover-open`.
- CSS anchor positioning: `anchor-name`, `position-anchor`, `position-area`, `position-try-fallbacks`. `::backdrop` on the popover.
- Auto-hide: `:has()`, `:popover-open`, a `translate` transition with `transition-delay`. Size: one CSS variable, `--taskbar-item`.
- `backdrop-filter`, `color-mix(in oklch, …)`.

## Known gaps

- "Pin to desktop" can pin duplicates (`Settings (1).desktop`) and gives no feedback: not on success, not when the grid is full and the new icon is hidden, not on failure.
- Groups don't merge with the quick launch (ADR-042), and a group's list has no per-window actions.
- A group of untitled windows lists the app name several times.
- Auto-hide doesn't reveal when an app asks for attention: there's no `request_attention` API yet.
- Toasts stay in the screen corner under auto-hide, so a revealed bar can cover the newest one.
- A pinned app with a window open shows twice: its launcher and its window item (ADR-042).
- Drag off also unpins when a drag cancelled with Esc ends outside the taskbar.
- Touch can't drag to pin (no native drag and drop); phones use the app list's long-press menu.
