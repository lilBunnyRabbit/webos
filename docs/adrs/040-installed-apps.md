# ADR-040: Installed Apps
**Date:** 2026-10-16
**Status:** Accepted

## Context
WebOS ships 52 apps (13 system, 39 user), and every list shows all of them: the start menu, the mobile drawer, `app list`, completion, Open with. A first boot opens on a 52-app wall, and every new app makes it longer. Discussion: [2026-10-16 installed apps and showcasing](../brainstorm/2026-10-16_installed-apps-and-showcasing.md).

## Decision

### State
- AppsService owns an installed set, persisted in `/var/lib/apps/installed.json` (`{ "version": 1, "installed": AppId[] }`). Package databases live in `/var/lib`; it's backed up with that area (ADR-037).
- System apps are always installed and can't be uninstalled.
- Migration: no `installed.json` while `/var/lib/version/state.json` exists (not a first boot) means everything is installed. Nothing disappears on update.

### Where it shows
- Start menu, mobile drawer, desktop pins and `app list` show installed apps only.
- Search covers everything: installed first, then a "Not installed" group with Get.
- App Library is the store: Get / Open, and Uninstall in the details pane.
- Game Hub stays the games store: it lists every game, and Play installs.

### Installing
- First boot installs the system apps, a curated base and the interest groups picked on a new intro page ("What are you into?"). Skip installs the base only. Both lists are a constant in core (`apps/starter.ts`), not manifest fields and not categories.
- Implicit installs from the UI: opening a file, a deep link, an announcement's Open or a Game Hub Play installs silently, with a quiet "{App} installed" toast.

### Uninstalling
- From App Library details, the start menu / drawer tile menu and the desktop icon menu.
- Hides the app and removes its desktop shortcuts and widgets. A dialog offers "Also delete its saved data": `app.{id}.*` localStorage and `/var/lib/apps/{id}/`, never `/home`.

### Shell
- Gated: an uninstalled app contributes no commands and no completion. `app launch` on an uninstalled app fails with a hint to the App Library. The shell never installs.
- No new commands (`app install` / `app uninstall` were rejected).

## Alternatives Considered
- **Pinned + recent start menu, no install concept.** Lighter, no migration; but it still needs persisted pins and recents, the drawer and `app list` stay 52 long, and announcements get no Get moment.
- **`/etc/apps.json` or a settings key.** `/etc` holds preferences read by SettingsService; AppsService would depend on settings for its own registry state.
- **Uninstall hides only.** Rejected for an explicit "delete its saved data" choice.
- **Ungated shell** (commands keep working and install on use). Rejected: then "installed" only means "shown".
- **Asking before an implicit install.** An extra click on every first open, and on a friend's deep link.
- **Interests as categories / a manifest field.** Categories aren't interests (Media would install a dozen apps); a field spreads the curation over 52 files.

## Consequences
- New persisted state and an AppsService API change (`installed`, `install`, `uninstall`, `list` filtering).
- Every `apps.list()` consumer must pick installed or all: start menu, drawer, App Library, Game Hub, Open with, Settings credits, shell completion and contributions.
- A new app must be added to a starter group in `apps/starter.ts` to reach new users.
- Existing users keep the full list until they uninstall.
- Cross-tab: a second tab doesn't see an install until reload (cross-tab sync is open, ROADMAP).
