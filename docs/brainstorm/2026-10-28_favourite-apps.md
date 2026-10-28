# Favourite apps
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
LaxDOTexe: "can I catagorise the apps? there are so many i kinda want to put them in like a sub folder (for example, one to hide the ones i wont use) maybe just a \"my apps\" folder".

Today the start menu shows Recent, then the five fixed `manifest.category` sections (`start-menu-popover.svelte:215`, `search.ts` `group_apps`). Uninstall is the only way to hide an app. Desktop and mobile-home folders hold `.desktop` shortcuts but open File Explorer. The mobile drawer is A to Z (`letter-index.svelte`). Quick launch pins live in `/etc/settings.json` (`taskbar.pinned`). Recent is `/var/lib/apps/recent.json`, an ordered id list owned by AppsService (`recent.ts`).

Options laid out: desktop folders as an app grid (A), favourites and hide (B), start-menu collections in their own JSON (C), folders as real directories under `/home/Apps` (D), user-edited categories (E), tags and smart folders (F).

## Decisions
- **Favourites for now**, on desktop and mobile. Collections, folders and hiding stay on the roadmap under Organising apps.
- **Storage:** `/var/lib/apps/favourites.json`, `{ "version": 1, "ids": AppId[] }`, ordered, zod, the twin of `recent.json`, owned by AppsService. Backed up with `/var/lib`. Rejected: a settings key beside `taskbar.pinned` (settings are preferences; Recent already sits in `/var/lib/apps`).
- **Surfaces:** start menu (a Favourites section above Recent; Add to / Remove from favourites in the right-click menu), mobile drawer (a Favourites section above the letters; the star in its long-press menu), App Library (a Favourites filter, a star on the detail page). Not mobile home: it is already a user-ordered list of shortcuts.
- **Order:** the order you add them; drag to reorder in the start menu (like quick launch) and in the mobile drawer. No hide in this cut; hiding stays uninstall.
- **Shell:** nothing.

## Key takeaways
- Smallest step that gives Lax a "my apps" place on both platforms, with the same shape Recent already uses.

## Action items
- [x] ADR-083, one app-builder agent.

## Next session topics
- Organising apps (roadmap): collections or folders, hiding without uninstall.
