# Shell

The parts of the OS around apps. Source: `src/lib/core/components/`.

## Desktop

- Surface: the wallpaper. The default Grid preset is `background-darkest` with a soft `background-dark` glow from the top (a gradient between shades of one surface) and a dot at every icon-cell corner in `foreground/14`, the grid icons snap to. Other presets: Glow (no dots), Tint (one `primary` glow from the bottom right), Plain. A user image may be dimmed toward `background-darkest` and blurred; on an image, labels get a `background/72` backing.
- Cells are 88px. An app is a 44px `rounded-xl` tile on `background-light` with `shadow-raised` and a hairline around its 24px glyph. Files and folders have no tile: a bare 40px glyph (files duotone at `foreground/85`, folders `primary` fill) with a soft shadow. So the tile itself says "program", with no shortcut arrow. Every icon has a two-line `text-2xs` label below.
- Hover lifts the tile 2px and tints the cell `foreground/6`; keyboard focus tints `foreground/8` with the cottontail ring. Selected icons are `primary/14` with a `primary/40` inset ring. A drag shows the browser's ghost and a `foreground/6` outline on each target cell; a folder under the drag lights up `primary/18` with a `primary/70` ring. See [Selection](patterns.md#selection-and-drag).

- **Widgets:** an app's live view on the desktop, spanning whole cells (ADR-034). A `rounded-xl` `background-light` card with `shadow-raised` and a `foreground/10` hairline, inset 4px from its cells. A 24px title strip on top (the app's glyph and the widget's name in `text-2xs` at 65%, a hairline below) is the handle: it selects, drags and opens like an icon. Selected: a 2px `primary/40` ring and the strip in `primary/14`. The body is the app's. A Quick Notes sticky is tinted `primary/8`. A resizable widget has a grip in its bottom-right corner: a 10px rounded ◢ in `foreground/40` (`foreground/80` on hover, `primary` while dragging) on a 24px hit area, shown on hover, focus, selection and while resizing; the cursor is `nwse-resize`. A resize shows a 2px outline over the target cells with a `w × h` chip in the corner: `foreground/30` on `foreground/6` with a `background-light` chip when it fits, `error/60` on `error/10` with an `error` chip when it's refused.

## Windows

- Frame: `rounded-xl`, `bg-background`, a hairline ring (`foreground/8`, focused `foreground/16`), `shadow-window` / `shadow-window-focused`. Maximized drops the radius, ring and shadow.
- Titlebar: 40px, `bg-background-light`, hairline below. App icon (duotone) and name in `text-ui font-medium`; unfocused windows fade the title to 80%.
- Controls: kit `IconButton`s (28px, quiet); close turns `bg-error text-background` on hover. Zoom is a `− 100% +` group that appears on titlebar hover or focus (always visible when zoom isn't 100%); the percentage is the "Reset zoom" button.
- Double-click the titlebar to maximize or restore. Drag snaps show a `primary/10` preview with a `primary/60` hairline.
- **Where windows open:** where that app's last window was closed. A second window of an open app steps 28px down and right from it. An app's very first window is centred, a little above the middle, at about two thirds of the area. A window never opens partly off screen.
- **Motion:** windows fade and grow from 96% when they open (140ms) and shrink away when they close (100ms). Minimizing flies the window into its taskbar button and restoring flies it back out; maximize and snap morph between frames. A new window takes the keyboard. The loading spinner only appears when an app takes longer than 300ms.

## Taskbar

- A floating dock: a `rounded-2xl` `bg-background-light/90` bar with `backdrop-blur` and `shadow-popover`. It follows the taskbar position setting (horizontal or vertical). While a window is maximized it goes flush: no margin, no radius or shadow, a hairline toward the window, so the two read as one surface. It morphs into and out of that shape together with the window.
- **One gap everywhere: 8px.** Screen edge to dock, dock to windows, screen edges to snapped windows, and between snapped windows. The dock's strip pads only its screen-edge sides; the side facing the windows takes its 8px from the window area's snap inset.
- Order: start button (the logo mark in `primary`), a hairline separator, running windows, and the tray at the far end.
- **App badges:** an app's manifest `badge` count sits on its icon's top-right corner wherever the icon shows (desktop tile, taskbar button, start menu, mobile tiles and drawer). It's a `primary` pill, 16px high, with mono-width digits in `text-background` and a `background-light` ring that cuts it from the tile. The tray's unread count uses the same pill.
- Window buttons are 40px `rounded-xl`. The focused window gets a `foreground/10` fill, a filled icon and a 16px `primary` bar; other open windows show a small dot; minimized windows dim their icon.
- The clock shows mono 24-hour `HH:MM` and a short date in `text-2xs`, and ticks on the minute.

## Start menu

- A popover anchored to the dock (CSS anchor positioning): flush with the dock's start edge, 8px off it, opening away from the screen edge the taskbar is on and flipping if it doesn't fit.
- It's a floating layer: `bg-background-lighter`, `shadow-popover`, on the shared scrim, so it reads as on top even over a window.
- A large search field (focused on open) finds apps by name, then id, keywords, description and category, best match first; Enter launches the first match once something is typed. Beside it a quiet "All apps" button with the `SquaresFour` glyph opens App Library, the structured view (categories with counts, filters, details).
- With nothing typed, apps are grouped into sections (Productivity, Media, Utilities, Developer, Games, then System), each an overline over a 4-column grid of icon tiles. A pin button appears on hover or focus.
- Typing `>` makes it the command palette: rows of mono command ids with a muted description and their shortcut as `Kbd` chips, then the args' completions. Output appears in a field-surface card above the rows with an "Open in Terminal" quiet button.
- Footer: the logo mark, the name, and the build version in mono.

## Updating

- "Update and reload" covers both shells with a full-viewport takeover like the introduction: `background-darkest` with the `background-dark` glow, the logo mark in `primary`, "Updating WebOS" (`text-base font-semibold`) over `v{old} → v{new}` in mono `text-2xs`.
- Three steps in `text-ui`: done ones get a `primary` check, the current one a spinner, upcoming ones a dot at 65%. It stays until the page navigates away.

## Introduction

- First boot only, or replayed from Settings › About. A full-viewport takeover, not a window: `background-darkest` with a soft `background-dark` glow at the top. Logo lockup top left, Skip top right.
- One page at a time in a `max-w-3xl` column: an overline step, a `text-2xl` title (the Hello page uses `text-3xl` under the logo mark), a lead at 65%, then content. Display sizes are only used here.
- Content is cards (`background-light`, `ring-foreground/8`, tinted icon tile + title + one or two lines). Warnings get a `warning` tile.
- Footer: page dots (the current one is a `primary` pill), Back (quiet) and Next (primary, `lg`). Pages enter with `animate-pop-in`.
- Install is the second page, right after Hello: the one place the intro asks for an action. A single card with a `primary` ring (`ring-2 ring-primary/40`), a larger icon tile and two lines on why, then the state: a `primary` `lg` "Install WebOS" button, "Installed" with a `success` check, or the platform's manual steps in an inset hint box.
- Preferences chosen here (theme, taskbar) apply live and use the same controls as Settings (`ThemeCard`, `Segmented`).

## Tray and notification center

- The tray is one button: a bell (filled when something's unread) with a `primary` count badge, then the clock. It opens the notification center.
- The center is a popover like the start menu, flush with the dock's far end: `rounded-2xl bg-background-lighter shadow-popover` over the scrim, a "Notifications" header with a quiet "Clear all", then the entries. Entries are toasts without the shadow, with the sender and time as a `text-2xs` line above the title. Empty: an `EmptyState` with the bell.
- Looking is reading: the badge counts what arrived since the center was last open.

## Toasts

- Stacked in the desktop corner nearest the tray, `w-80`, `rounded-xl bg-background-lighter shadow-popover`, sliding in from the right.
- A tinted icon tile per type (`info`, `warning`, `error`, `progress` → primary). Title `text-ui font-semibold`, message at 70%.
- Actions are small buttons: the first is primary, the rest secondary. Progress shows a 4px primary bar.

## Mobile

Phones and tablets share one shell ([system reference](../system/shell/mobile.md)). Same tokens, same surfaces; bigger touch targets.

- **No edge gestures.** Every screen edge belongs to the device. Navigation is a three-button bar (back, home, running apps), 40px buttons on `bg-background-light/90` with `backdrop-blur-xl` and a hairline on top, padded by the bottom safe area. The running-apps button carries a `primary` count badge and fills when the switcher is open.
- **No status bar of our own.** The device has one. Apps and home pad the top safe area.
- **Home:** the desktop surface (`background-darkest` with the `background-dark` glow from the top) and the logo mark centred as a watermark in `primary/10`. Icons are 56px `rounded-2xl` tiles on `background-light` with `shadow-raised` and a hairline, a 28px duotone glyph and a two-line `text-xs` label. They flow with no gaps; pages snap sideways, with dots below (the current one a `primary` pill, like the introduction).
- **Dock:** the taskbar's floating dock, centred, fitting its content: an All apps button (`SquaresFour`, duotone), a hairline separator, up to four tiles without labels.
- **Long press** is the right-click: 450ms, a short vibration, then the menu. Icons don't drag for now; the menu docks and undocks them.
- **App drawer:** a `rounded-t-3xl` sheet on `background-lighter` over the scrim, with a small grab bar, the large search field with the same "All apps" button beside it, and the home tiles in auto-fill grids, sectioned like the start menu. The grab bar means it: pull the top of the sheet down to close it.
- **Switcher:** the scrim with a strong blur behind a row of live app cards at 66% (55% under notifications), `rounded-2xl`, `shadow-window-focused`, a `foreground/12` hairline, each under a header with the app's icon, name and close button. Flick a card up to close it. "Close all" is a secondary button below. Notifications, when there are any, list above the cards on `background-lighter` tiles; the running-apps button shows a `primary` dot when one is unread.
- **Motion:** shell changes (opening an app, the switcher, going home) run as View Transitions; cards morph to fullscreen. Apps pop in (`animate-pop-in`) when they come on screen. All of it respects reduced motion.
- **Toasts** come from the top, centred.
