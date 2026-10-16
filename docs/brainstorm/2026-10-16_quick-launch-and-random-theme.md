# Quick launch, drag to pin and a random theme

**Date:** 2026-10-16
**Participants:** owner, agent

## Context

Two roadmap items the owner added the same day: "drag and drop apps to pin" and "random theme generator, not 100% random, still some logic to it". Pinning existed only as menu entries that write a desktop shortcut (`desktop.pin`). The taskbar shows one item per window and can't pin anything; "Quick launch area" was an open roadmap line. A theme is five base colours (`ThemeBase`) that `derive_theme` expands.

## Topics discussed

### Where an app can be dropped
- Options: desktop only; desktop plus a taskbar quick launch; quick launch only.
- **Decision: desktop and a new taskbar quick launch.** Owner's note: the taskbar needs a moving animation while you decide where to drop; the other icons move and make space.

### Quick launch shape
- **Separate zone** between Start and the window list, icon only, a dot when the app has a window open. Window items stay one per window (grouping stays parked, ADR-014).
- **Click:** focus the app's most recent window (restoring it if minimized), else launch. Shift-click or middle-click opens a new window.
- **Unpin:** drag it off the taskbar, or right-click › Unpin from taskbar. **Pin:** drag, or "Pin to taskbar" in the start menu tile menu, App Library details, and a new right-click menu on a window's taskbar item.
- **Shell:** `taskbar pin <app>`, `taskbar unpin <app>`, `taskbar list`.
- Agent defaults the owner didn't object to: stored as `settings.taskbar.pinned` in `/etc/settings.json` (backups cover it), empty by default, uninstall unpins, hidden on mobile.

### Mobile
- **Decision: menus only.** Touch doesn't fire native drag and drop; the drawer's long press already has Add to home screen.

### Random theme
- **Rules: keep the current light or dark mode, harmonic hues.** One base hue, a harmony (analogous, complementary, triadic, split complementary) for primary, secondary and accent, a low-chroma background, a near-neutral foreground, and lightness gaps checked so text and accents stay readable.
- **Ways in:** a Shuffle button in Settings › Appearance and `theme random`.

## Key takeaways
- The `taskbar` commands come from AppsService's shell, not SettingsService's: they need the app registry and install state, and settings can't depend on apps (apps depends on settings).
- Drag off to unpin is decided at dragend by where the drag last was: outside the taskbar unpins. Desktop drops ignore quick-launch drags so dragging an icon onto the desktop unpins rather than pins there.

## Action items
- [x] ADR-042, build, docs.
- [x] ADR-015 revision for the random theme.

## Next session topics
- Window extraction.
