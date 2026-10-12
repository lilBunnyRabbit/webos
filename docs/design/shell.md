# Shell

The parts of the OS around apps. Source: `src/lib/core/components/`.

## Desktop

- Surface: `background-darkest` with a soft `background-dark` glow from the top (a gradient between shades of one surface), and a dot at every icon-cell corner in `foreground/14`. The dots are the grid icons snap to.
- Cells are 88px. An icon is a 44px `rounded-xl` tile on `background-light` with `shadow-raised` and a hairline, a 24px duotone glyph, and a two-line `text-2xs` label below. Shortcuts show the target app's icon with an arrow badge.
- Hover lifts the tile 2px and tints the cell `foreground/6`; keyboard focus tints `foreground/8` with the cottontail ring. A drag shows a ghost and a `foreground/6` drop cell (`error/10` when blocked).

## Windows

- Frame: `rounded-xl`, `bg-background`, a hairline ring (`foreground/8`, focused `foreground/16`), `shadow-window` / `shadow-window-focused`. Maximized drops the radius, ring and shadow.
- Titlebar: 40px, `bg-background-light`, hairline below. App icon (duotone) and name in `text-ui font-medium`; unfocused windows fade the title to 80%.
- Controls: kit `IconButton`s (28px, quiet); close turns `bg-error text-background` on hover. Zoom is a `− 100% +` group that appears on titlebar hover or focus (always visible when zoom isn't 100%); the percentage is the "Reset zoom" button.
- Double-click the titlebar to maximize or restore. Drag snaps show a `primary/10` preview with a `primary/60` hairline.
- **Where windows open:** where that app's last window was closed. A second window of an open app steps 28px down and right from it. An app's very first window is centred, a little above the middle, at about two thirds of the area. A window never opens partly off screen.
- **Motion:** windows fade and grow from 96% when they open (140ms) and shrink away when they close (100ms). Minimizing flies the window into its taskbar button and restoring flies it back out; maximize and snap morph between frames. A new window takes the keyboard. The loading spinner only appears when an app takes longer than 300ms.

## Taskbar

- A floating dock: a `rounded-2xl` `bg-background-light/90` bar with `backdrop-blur` and `shadow-popover`. It follows the taskbar position setting (horizontal or vertical).
- **One gap everywhere: 8px.** Screen edge to dock, dock to windows, screen edges to snapped windows, and between snapped windows. The dock's strip pads only its screen-edge sides; the side facing the windows takes its 8px from the window area's snap inset.
- Order: start button (the logo mark in `primary`), a hairline separator, running windows, and the tray at the far end.
- Window buttons are 40px `rounded-xl`. The focused window gets a `foreground/10` fill, a filled icon and a 16px `primary` bar; other open windows show a small dot; minimized windows dim their icon.
- The clock shows mono 24-hour `HH:MM` and a short date in `text-2xs`, and ticks on the minute.

## Start menu

- A popover anchored to the dock (CSS anchor positioning): flush with the dock's start edge, 8px off it, opening away from the screen edge the taskbar is on and flipping if it doesn't fit.
- It's a floating layer: `bg-background-lighter`, `shadow-popover`, on the shared scrim, so it reads as on top even over a window.
- A large search field (focused on open) filters apps by name, id and keywords; Enter launches the first match once something is typed.
- Apps are a 4-column grid of icon tiles. A pin button appears on hover or focus.
- Footer: the logo mark, the name, and the build version in mono.

## Introduction

- First boot only, or replayed from Settings › About. A full-viewport takeover, not a window: `background-darkest` with a soft `background-dark` glow at the top. Logo lockup top left, Skip top right.
- One page at a time in a `max-w-3xl` column: an overline step, a `text-2xl` title (the Hello page uses `text-3xl` under the logo mark), a lead at 65%, then content. Display sizes are only used here.
- Content is cards (`background-light`, `ring-foreground/8`, tinted icon tile + title + one or two lines). Warnings get a `warning` tile.
- Footer: page dots (the current one is a `primary` pill), Back (quiet) and Next (primary, `lg`). Pages enter with `animate-pop-in`.
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
- **Long press** is the right-click: 450ms, a short vibration, then the menu. Moving after the hold drags: a ghost tile at `scale-110` with `shadow-popover`, a 2px `primary` bar marking where it lands, the dock tinting `primary/10` with a `primary/60` hairline when it accepts.
- **App drawer:** a `rounded-t-3xl` sheet on `background-lighter` over the scrim, with a small grab bar, the large search field and the home tiles in an auto-fill grid. The grab bar means it: pull the top of the sheet down to close it.
- **Switcher:** the scrim with a strong blur behind a row of live app cards at 66% (55% under notifications), `rounded-2xl`, `shadow-window-focused`, a `foreground/12` hairline, each under a header with the app's icon, name and close button. Flick a card up to close it. "Close all" is a secondary button below. Notifications, when there are any, list above the cards on `background-lighter` tiles; the running-apps button shows a `primary` dot when one is unread.
- **Motion:** shell changes (opening an app, the switcher, going home) run as View Transitions; cards morph to fullscreen. Apps pop in (`animate-pop-in`) when they come on screen. All of it respects reduced motion.
- **Toasts** come from the top, centred.
