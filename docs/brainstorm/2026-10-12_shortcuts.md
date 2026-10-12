# Brainstorm: Shortcuts service

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

Block 2 of the [agreed order](2026-10-12_roadmap-order.md). ADR-012 (service) and ADR-017 (key scheme) are from February, before the Svelte rewrite, so both were checked against the code first.

Today there is no global shortcut. Every key handler is local to a focused element: File Explorer rows (Enter, F2, Del, Ctrl+C/X/V), desktop icons, Tic-Tac-Toe's Ctrl+Z, Sprite Extract and GIF Player keys, menus, the mobile shell's Escape. `MenuItem.shortcut` is a hint string.

ADR-017's table was wrong in places, checked against Chrome and the OSes:

| ADR-017 binding | Problem |
|-----------------|---------|
| Ctrl+Shift+W, close window | Closes the whole browser window; not interceptable |
| Ctrl+Shift+T, closed-window stack (roadmap) | Reopens a closed tab; not interceptable |
| Ctrl+Shift+Esc, Activity Monitor | Windows' own Task Manager, OS level |
| Ctrl+Space, launcher | macOS input source switch |
| Ctrl+Shift+arrows | Text selection in every field; Ctrl+arrows are macOS Spaces |

## Topics discussed

### Scope of v1

- **OS plus window scope; focus keys stay local** (chosen). The service is a registry and one `keydown` dispatcher. A shortcut is global, or bound to a window and live only while it's focused. ADR-012's "app" scope is dropped: window covers it. Keys that act on a focused element (an Explorer row, a desktop icon) stay on that element.
- Everything through the service. Rejected: focused-row actions need context the service doesn't have.
- Global only. Rejected: apps couldn't list their keys in the cheat sheet.

### Who registers the OS defaults

- **The service, in `init()`** (chosen). One list.
- Each shell registers its own. Rejected by the owner.

That left two defaults with nothing to reach: Mod+K opens the start menu (the popover's own state) and, on mobile, the drawer and switcher were local `$state` in the shell ([mobile shell](2026-10-12_mobile-shell.md): "the service owns focus only").

- **A new `ui` service** (chosen) holds the shell's overlay state: which launcher or switcher is open. The start menu and the mobile shell read and write it. This reverses the mobile-shell decision that kept the switcher local. The name `shell` is taken by ADR-007's terminal.
- Launcher on DesktopService, switcher on MobileWindowsService. Rejected: UI state next to folder logic.
- Everything on the windows service. Rejected: the launcher isn't about windows.

### Keys

- **Alt+Shift** (chosen; Option+Shift on macOS). Free in Chrome, Firefox and Safari, and it doesn't fight text selection.

| Action | Keys |
|--------|------|
| Close window | Alt+Shift+W |
| Maximize / restore | Alt+Shift+↑ |
| Minimize | Alt+Shift+↓ |
| Snap left / right | Alt+Shift+← / → |
| Show desktop | Alt+Shift+D |
| Next / previous window | Alt+\` / Alt+Shift+\` |
| Launcher | Mod+K |
| Shortcuts cheat sheet | Mod+/ |
| Settings | Mod+, |

Mod is Cmd on macOS, Ctrl elsewhere. Against: Alt+Shift switches keyboard layout on some Windows setups (on release with no other key, so usually safe).

- Ctrl+Shift (ADR-017 with the broken ones replaced). Rejected: window keys would stop working while typing.
- A leader key (Alt+Space, then a key). Rejected: two keystrokes for everything.

### Remapping

- **Not in v1** (chosen). Fixed bindings and a cheat sheet. Against: ADR-017's "all shortcuts must be configurable"; a layout where Alt+Shift switches language can't be fixed yet.

## Key takeaways

- Shortcuts are data in one registry; local focus keys stay local.
- Shell overlays are now service state (`ui`), so anything can open the launcher or switcher.

## Action items

- [x] ADR-012 and ADR-017 revisions, ADR-028 (`ui` service)
- [x] `UiService`, `ShortcutsService` with defaults, cheat sheet dialog, inspectors
- [x] Start menu and mobile shell on `ui`
- [x] System docs, design docs, roadmap, changelog

## Next session topics

- Remapping, once a binding clashes for someone.
- Closed-window stack (block 3): Ctrl+Shift+T is the browser's, so it needs another key.
