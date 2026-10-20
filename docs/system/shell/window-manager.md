# Window manager

Source: `src/lib/core/components/window-manager/window-manager.svelte` · Services: [windows](../services/windows.md), [settings](../services/settings.md)

## Responsibilities

- Render one [`<Window>`](window.md) per id in `windows.list()`, using a keyed `{#each}`. Removing an id unmounts that window and its app.
- Keep `windows.container` in sync with its own element. It's the coordinate space every window is positioned in.

That's all it does. It owns no state.

## Placement

[desktop-shell.svelte](../overview.md) mounts it in the same grid cell as the desktop and the toast area, the one the taskbar doesn't occupy (the whole screen while the taskbar auto-hides). Its classes are `relative z-0 pointer-events-none`. A live wallpaper's overlay layer comes after it in the same cell, so it paints above every window ([desktop](desktop.md#live-wallpapers)). Windows set `pointer-events-auto`, so clicks on empty space fall through to the desktop underneath. Windows are `position: absolute` against this element. Maximized means `100%` of it, and snap percentages are relative to it.

## Container measurement

An inline attachment calls `windows.set_container(element)`:

- from a `ResizeObserver` on the element, and
- from an `$effect` that reads `settings.taskbar.position`, `size` and `auto_hide` and defers the call by one `requestAnimationFrame`. Moving the taskbar changes the element's *offset* without necessarily changing its size, and ResizeObserver only reports size (`// TODO: revisit`).

The observer disconnects on teardown. Nothing calls `set_container(null)`.

## Props

`SvelteHTMLElements["div"]`, spread onto the root. `desktop-shell.svelte` passes `class` for the grid area.

## User interactions

None of its own. Everything happens in [window.md](window.md).

## Platform APIs

`ResizeObserver`, `requestAnimationFrame`.

## Known gaps

- Windows render in `list()` (insertion) order and stack by `z-index`. DOM order doesn't follow z-order, so Tab order between windows is open order.
- When the container shrinks, nothing clamps existing windows back inside it.
- Moving the container without a resize or a taskbar change (for example, a layout change elsewhere) isn't observed, so `container.bounds.x/y` goes stale.
