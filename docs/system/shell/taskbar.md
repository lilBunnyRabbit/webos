# Taskbar

Source: `src/lib/core/components/taskbar/` · Services: [windows](../services/windows.md), [settings](../services/settings.md), [apps](../services/apps.md), [desktop](../services/desktop.md) · ADRs: [ADR-014](../../adrs/014-window-enhancements.md), [ADR-015](../../adrs/015-customization-theming.md) (accepted)

| File | Role |
|------|------|
| `taskbar.svelte` | Bar layout per `settings.taskbar.position`. Three slots: start, window items, (empty) tray. |
| `taskbar-item.svelte` | One button per open window |
| `start-menu.svelte` | Start button + `popover` element |
| `start-menu-popover.svelte` | Popover contents: logo header, app list, pin buttons |

## Responsibilities

- Show a start button, one item per window, and an empty tray slot. `<DateTime />` is commented out, so there's no clock (ROADMAP).
- Lay itself out for the taskbar position. `os.svelte` decides which grid area the taskbar gets. The taskbar only switches between a `vertical` layout (`left`/`right`) and a `horizontal` one (`top`/`bottom`), plus the border side and item alignment.
- Styling: `bg-background/40 backdrop-blur-xl`, a `foreground/20` border on the side facing the desktop.

The position comes from [settings](../services/settings.md) (`taskbar.position`: `top | bottom | left | right`, persisted there). The bar re-renders when it changes, and the [window manager](window-manager.md) re-measures its container.

## Window items

- The list is `windows.sorted_list()` by `created_at`, so it's in open order and stable under focus changes.
- One item per window, no grouping by app (ADR-014).
- Each item renders `instance.app.manifest.icon` only. There's no label, `title` or `aria-label`.

States:

| State | Style |
|-------|-------|
| not minimized | `bg-primary/10` |
| focused and not minimized | also `text-primary` |
| minimized | plain |

## Start menu

- The start button is `popovertarget="start-menu-popover" popovertargetaction="toggle"` and shows the `LogoMark` in `text-primary`.
- The menu is a `popover` (auto) element. The browser handles the top layer, light dismiss (outside click, Escape) and toggling.
- `ontoggle` mirrors the open state into local `open`, so `StartMenuPopover` only mounts while it's open.
- It's centered on screen with `margin: auto`, up to 40rem × 40rem. The `::backdrop` is `background` at 80% with a 3px blur. It isn't anchored to the button.
- Contents: a sticky header (`LogoLockup` + "WebOS"), then every registered app from `apps.list()` in registry order. There's no search, categories, pinning or recents.

## User interactions

| Input | Target | Result |
|-------|--------|--------|
| Click | Window item, minimized | `windows.toggle_minimize(id)`. Restores and focuses it in one click. |
| Click | Window item, focused | `windows.toggle_minimize(id)`. Minimizes it; focus moves to the next visible window. |
| Click | Window item, visible but not focused | `windows.focus(id)`. Raises it. |
| Click | Start button | Toggle the start menu |
| Click | App row in the menu | `apps.launch(id)` with no props, and close the menu (`popovertargetaction="hide"`) |
| Click | `+` ("Pin to Desktop") | `desktop.add_item(id)`. The menu stays open. |
| Escape / outside click | Open menu | Close it (native light dismiss) |
| Keyboard | Bar | Native button Tab/Enter only. No shortcuts (ADR-017 not built). |

## Platform APIs

- Popover API: `popover`, `popovertarget`, `popovertargetaction`, the `toggle` event, `:popover-open`, `::backdrop`.
- `backdrop-filter`, `color-mix(in oklch, …)`.
- Not used: anchor positioning (the menu is centered rather than anchored to the start button).

## Known gaps

- "Pin to Desktop" can pin duplicates and gives no feedback when the grid is full (`desktop.add_item` returns `null` with only a `console.warn`).
- `data-[state=open]:bg-primary/10` on the start button and the items is dead. Nothing sets `data-state`; it's left over from a component-library era.
- The app row has `hover:bg-foreground/10` on both the wrapper and the button, which doubles the tint.
- Taskbar items have no accessible name (icon-only, no `title`/`aria-label`).
- No clock, no notification-center entry, no grouping, no context menus, no auto-hide or size options (ROADMAP "Taskbar Enhancements").
