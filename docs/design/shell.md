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

## Taskbar

- A floating dock: a `rounded-2xl` `bg-background-light/90` bar with `backdrop-blur` and `shadow-popover`. It follows the taskbar position setting (horizontal or vertical).
- **One gap everywhere: 8px.** Screen edge to dock, dock to windows, screen edges to snapped windows, and between snapped windows. The dock's strip pads only its screen-edge sides; the side facing the windows takes its 8px from the window area's snap inset.
- Order: start button (the logo mark in `primary`), a hairline separator, running windows, and the clock at the far end.
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

## Toasts

- Bottom-right stack, `w-80`, `rounded-xl bg-background-lighter shadow-popover`, sliding in from the right.
- A tinted icon tile per type (`info`, `warning`, `error`, `progress` → primary). Title `text-ui font-semibold`, message at 70%.
- Actions are small buttons: the first is primary, the rest secondary. Progress shows a 4px primary bar.
