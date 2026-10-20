# Recent apps in the start menu

**Date:** 2026-10-20
**Participants:** owner, Claude

## Context
LaxDOTexe: "you need a recent apps in your search bar area". Owner sketch: a row of four apps at the top of the start menu; scrolling drops to the next four. Nothing records launches today: `windows.recent()` covers open windows only, and session keeps only the last closed window.

## Decisions
- **Data:** `AppsService.recent: string[]` (newest first, unique, max 16) and `clear_recent()`, saved in `/var/lib/apps/recent.json` (`{ version: 1, ids }`). `launch()` records it. Uninstalled or unknown ids drop out. Shown in the Apps inspector. Solo mode keeps an empty, unsaved list.
- **Counts:** user apps only; system apps (Settings, Explorer, Terminal…) are left out.
- **Row:** "Recent" above the categories, four tiles per page, wheel or swipe moves a page with CSS scroll-snap, and page dots when there's more than one page. Hidden while searching, in `>` mode, or when empty. The context menu has "Clear recent".
- **Mobile:** the app drawer gets the same row.
- **Shell:** `app recent` yields `app` values (click to open); `app recent --clear`.

## Action items
- Build. Update `docs/system/services/apps.md`, `shell.md` and the start-menu and mobile drawer pages.
