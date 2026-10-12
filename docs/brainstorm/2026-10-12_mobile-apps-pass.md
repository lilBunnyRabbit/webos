# Brainstorm: Mobile apps pass

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

Second pass after the [mobile shell](2026-10-12_mobile-shell.md). The owner: "I can't go into a folder in File Explorer. All apps need a pass." An audit of every app and the shared kit at phone width (360–440px, touch only) found:

| Severity | What |
|----------|------|
| Broken | File Explorer opens on double-click only, its actions sit behind right-click (iOS never fires `contextmenu`), and the picker in every Open/Save sheet can't enter folders. Image Split's toolbar is wider than a phone, so Save is cut off. Sprite Extract: 6–7px grid targets, an HTML5-drag filmstrip, a hover-only remove button. QR Reader has no `BarcodeDetector` on iOS. Example's maximize/restore do nothing |
| Awkward | 28px `sm` buttons and segmented controls, toolbars with no overflow, cramped Activity Monitor grids, no pinch zoom in Media Preview, tiny Background Remove panels, Tic-Tac-Toe stats hidden on phones, CSV values only in hover tooltips, submenus overflowing at 360px |
| Fine | Settings, Kernel, Style Guide, Text Viewer, GIF Player, most dialogs |

Taken without asking (CSS only): bigger touch targets through Tailwind's `pointer-coarse:` variant in the kit recipes, and wrapping where apps squeeze.

## Topics discussed

### How apps tell a tap from a click

- Per event `pointerType` (agent's recommendation): touch opens on one tap, a mouse keeps double-click; no platform read.
- **Apps read `kernel.platform`** (chosen). ADR-016 already allows it as opt-in. A mobile app opens on tap; desktop keeps double-click.
- Single click everywhere. Rejected: changes desktop.

### Back and apps with their own navigation

- **`WindowHandle.on_back(handler)`** (chosen). An app registers a handler that returns `true` when it handled back (File Explorer goes to the previous folder). Unclaimed back falls to the shell: layer, then home. Desktop has no back button, so it never runs there. The OS back gesture stays untouched.
- Shell-only back. Rejected: the nav bar's Back skipping an app's own history feels wrong.

### Toolbars that don't fit

- **Wrap** (chosen): the kit `Toolbar` wraps, crowded apps put secondary controls on a second row or behind container breakpoints.
- A kit overflow menu. Rejected: JS measuring and items as data.

### Depth

The owner picked all four:

- Sprite Extract touch editing: bigger hit areas on touch, pointer-based filmstrip reorder, a visible remove, pinch zoom.
- Media Preview pinch zoom, and fixing the unreachable top/left of a zoomed image.
- QR Reader on iOS: a decoder library. The owner approved the dependency with this pick: `jsqr`, loaded lazily only when `BarcodeDetector` is missing.
- Menus and dialogs sized for phones: context menus as bottom sheets, submenus inline.

To keep the platform check out of shared code, each shell renders its own `DialogsHost`; the mobile shell asks for sheet-style menus.

## Key takeaways

- Platform reads are allowed in apps, as ADR-016 says: opt-in, for behaviour container queries can't express (tap vs double-click).
- Back is now an app-level concept on mobile, through the window handle.

## Action items

- [ ] ADR-016 and ADR-003 revisions
- [ ] Kit: `pointer-coarse:` sizes, wrapping `Toolbar`, `long_press` moved to `$lib/core/utils`
- [ ] `on_back` on the window handle and the windows services; the shell's Back calls it
- [ ] File Explorer: tap opens, long-press menus, picker enters folders, back
- [ ] Dialogs host: menus as sheets on mobile
- [ ] Every app's fixes, Sprite Extract, Media Preview pinch, QR via `jsqr`
- [ ] System docs, design docs, changelog

## Next session topics

- The OS back gesture through history (with ADR-010).
