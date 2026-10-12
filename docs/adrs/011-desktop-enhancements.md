# ADR-011: Desktop Enhancements

**Date:** 2026-02-01
**Status:** Accepted

> **Revision 2026-10-12: selection shared with File Explorer** (owner's inbox). File Explorer wants the same multi-select (Ctrl/Shift+Click, marquee, Ctrl+A) for bulk copy/cut/delete and drag-to-folder. The selection model should be one behaviour for both surfaces; its shape (a shared helper, a kit component, or state per surface) is decided when block 6 starts.

> **Revision 2026-10-11: layout vs visible grid**
> - DesktopService keeps the user's arrangement (`layout`) as the source of truth and derives the visible `grid` for the current container size (`DesktopHelper.fit`). Items in range keep their cell. Out-of-range items take the first free cell. Items with no free cell are hidden but never deleted, and they return to their own cells when the grid grows.
> - Before this, shrinking the grid deleted icons that didn't fit, and a 0×0 grid at startup could delete all of them.
> - The desktop arrangement isn't persisted yet. When persistence lands, `layout` is what gets saved.

## Context

The current desktop supports placing app icons on a grid and dragging them. However, it lacks features expected in a desktop environment: multi-selection, wallpapers, context menus, and icon management. These were planned in the legacy React version but not yet carried over.

## Decision

### Desktop Icon Multi-Selection

Support selecting multiple desktop icons for bulk operations.

**Selection methods:**
- **Marquee selection** — drag on empty desktop area to draw a selection rectangle. Icons within the rectangle are selected.
- **Ctrl/Cmd+Click** — toggle individual icon selection
- **Shift+Click** — range selection (grid-order between last selected and clicked)
- **Ctrl+A** — select all desktop icons
- **Escape** — clear selection
- **Click on empty area** — clear selection

**Bulk operations on selection:**
- **Group drag** — move all selected icons together
- **Delete** — remove selected icons from desktop (Delete key)
- **Context menu** — applies to all selected items

**Visual feedback:**
- Selected icons show accent color outline/highlight
- Marquee rectangle rendered as semi-transparent overlay during drag

### Desktop Wallpapers

Managed by SettingsService. Stored in settings (OPFS for images).

**Wallpaper types:**
- Solid color (color picker)
- Gradient (direction + color stops)
- Image — upload from local filesystem, stored in OPFS

**Image options:**
- Fit modes: fill, fit, stretch, tile, center
- Blur intensity (0-20px)
- Overlay tint color + opacity
- Brightness/contrast adjustments

**Settings UI:** Dedicated section in Settings app under Appearance.

### Desktop Context Menu

Right-click on empty desktop area shows:
- **Sort by** — name, date added (submenu)
- **Auto-arrange icons** — snap all icons to grid from top-left
- **Refresh desktop** — re-render
- **Change wallpaper** — opens Settings > Appearance
- **New folder** — create folder on desktop (if desktop-as-folder concept is adopted)

Right-click on desktop icon shows:
- **Open** — launch app
- **Remove from desktop**
- **Properties** (future)

### Icon Auto-Arrange

A function that repositions all desktop icons to a clean grid layout, filling from top-left, column by column.

### Desktop Icon Settings (via SettingsService)

- Icon size: small (48px), medium (64px), large (80px)
- Label visibility: show/hide icon labels
- Grid spacing: compact, normal, wide

## Alternatives Considered

1. **No multi-selection** — simpler but feels incomplete. Multi-selection is expected desktop behavior.
2. **Wallpaper as separate service** — Rejected. It's a setting, belongs in SettingsService.
3. **No context menu, use toolbar instead** — Rejected. Right-click context menus are fundamental to desktop UX.

## Consequences

### Positive
- Desktop feels like a real OS environment
- Wallpapers add significant personalization
- Multi-selection enables efficient icon management
- Context menus provide discoverability

### Negative
- Marquee selection requires careful coordinate math relative to scroll and grid
- Wallpaper images in OPFS add storage usage
- Context menu system needs to be built (reusable for other areas too)
