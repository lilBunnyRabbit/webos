# ADR-083: Favourite Apps
**Date:** 2026-10-28
**Status:** Implemented

## Context
With 90-odd apps, users want a "my apps" place (LaxDOTexe, [brainstorm](../brainstorm/2026-10-28_favourite-apps.md)). The start menu and mobile drawer only group by the fixed manifest category; quick launch pins are desktop-only and limited by taskbar room.

## Decision
- AppsService owns an ordered favourites list persisted in `/var/lib/apps/favourites.json` as `{ "version": 1, "ids": AppId[] }`, validated with zod; unreadable or invalid files read as empty. Same shape and module layout as Recent (`recent.ts`).
- Service API: reactive `favourites` (ordered, installed apps only), `favourite(id, on)`, `move_favourite(id, index)`.
- An uninstalled app leaves the visible list; whether its id is dropped from the file follows what quick launch pins do on uninstall.
- Surfaces: start menu Favourites section above Recent with drag to reorder and Add to / Remove from favourites in the context menu; mobile drawer Favourites section above the letters, star in its menu, reorder; App Library Favourites filter and a star on the detail page. Mobile home is unchanged.
- No shell commands.

## Alternatives Considered
- Settings key beside `taskbar.pinned`: settings are preferences, app registry data lives in `/var/lib/apps`.
- Collections, folders as directories, user categories, tags: bigger than the ask; kept on the roadmap.
- A hidden flag: hiding stays uninstall for now.

## Consequences
- A second "pin" concept next to quick launch pins, each with its own home.
- Backup carries favourites with `/var/lib`.

## Revision 2026-10-28: as built
- Uninstall drops the id from `favourites.json`, as it unpins the taskbar (`uninstall()` filters `taskbar.pinned`). `favourite(id, true)` ignores an app that isn't installed.
- `move_favourite(id, index)`: `index` counts the shown `favourites` without `id`; a saved id that isn't shown (known but not installed in this tab yet) keeps its neighbours (`moved_favourite()` in `favourites.ts`).
- Start menu: Alt+Left / Alt+Right on a focused favourite moves it, so reordering has a keyboard path. Dragging a favourite keeps the menu open (other tiles close it to reach the desktop) and still pins when dropped on the desktop or the quick launch.
- Mobile drawer: the favourites reuse the home's `home_gesture` and `home-drag.ts` (hold and move reorders, hold and let go opens the app menu); `AppRow`'s `on_menu` became optional so those rows have no second long press.
- The add/remove item lives in the shared `app_menu`, so the mobile home's Recent rows offer it too. Solo mode keeps favourites empty and writes nothing.

## Revision 2026-10-28: review fixes
- Every change (add, remove, move, the uninstall drop) re-reads `favourites.json` under the Web Lock `webos.apps.favourites`, applies itself to that list and writes it back, as `jobs.json` and the achievement files do; a tab re-reads the file when it becomes visible. Two tabs no longer overwrite each other's favourites.
- A replaced id (ADR-071) in the favourites, the recent list or the taskbar pins is mapped again once the full catalogue arrives, not only when boot already had it; booted from the installed slice, a favourite of a replaced app used to vanish.
