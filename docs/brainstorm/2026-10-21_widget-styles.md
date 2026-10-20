# Widget styles

**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
LaxDOTexe: with a timer running, the Clock window could go transparent and leave only the numbers ("bit more immersive"). An investigation looked at "ghost windows" (an option on the core window API) and an always-on-top layer. Owner reframed it: "just a widget request to have multiple opacities/states".

Today every widget gets the same OS card (`desktop-widget.svelte`: `bg-background-light`, shadow, ring, title strip). A `.widget` file stores the app, label, props and size, but no look.

## Decisions
- **Styles:** Card (today), Glass (translucent background with a backdrop blur, no shadow) and Clear (no background, ring or shadow; the title strip hidden until hover or focus, so only the content floats on the wallpaper).
- **The app knows:** `WidgetProps.style`, so an app can adapt. Clock gives its digits a soft shadow and drops its inner panels on Clear. Apps that ignore it still work. Revises ADR-034.
- **Storage:** an optional `style` field in the `.widget` file (missing means card), set from the widget context menu (Style › Card / Glass / Clear). `DesktopService.set_widget_style(name, style)` mirrors `resize_widget`. Travels with the file and backups.
- **Mobile:** the mobile home renders the same styles (long-press menu › Style).
- **Shell:** none.
- Rejected: ghost windows on the core window API (a window API change for what a widget covers); an opacity slider; one global setting.

## Action items
- Build; ADR-034 revision note; `docs/system` desktop, mobile and app-api pages; Clock's widget adapts.
