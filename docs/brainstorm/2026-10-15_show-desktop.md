# Show desktop

**Date:** 2026-10-15
**Participants:** owner, Claude

## Context

The owner asked for Windows-style "show desktop". `win desktop` and Alt+Shift+D already existed (ADR-033): they minimized every window on desktop and went home on mobile. Missing: a second press bringing the windows back, and a taskbar button.

## Decisions

| Topic | Decision | Rejected |
|---|---|---|
| Toggle memory | `DesktopWindowsService` keeps a private `peeked` list and exposes `toggle_desktop()` and `showing_desktop`. Any focus change, open or session restore forgets it, like Win+D | Stateless toggle (restores windows you minimized yourself); a module variable in the lazy shell code (nothing clears it on focus) |
| Button | A thin sliver at the far end of the taskbar, after the tray, Windows 11 style. Desktop only | An icon button beside Terminal; no button |
| Shell | `win desktop` stays the command and Alt+Shift+D its binding; it now calls `toggle_desktop()`. Mobile still goes home | — |

## Key takeaways

- Most of the feature was there; the roadmap line was written without checking the shortcut table.

## Action items

- [x] `toggle_desktop`, sliver, tests, docs, 1.1.0
