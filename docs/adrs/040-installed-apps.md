# ADR-040: Installed Apps
**Date:** 2026-10-16
**Status:** Implemented

## Context
WebOS ships 52 apps (13 system, 39 user), and every list shows all of them: the start menu, the mobile drawer, `app list`, completion, Open with. A first boot opens on a 52-app wall, and every new app makes it longer. Discussion: [2026-10-16 installed apps and showcasing](../brainstorm/2026-10-16_installed-apps-and-showcasing.md).

## Decision

### State
- AppsService owns an installed set, persisted in `/var/lib/apps/installed.json` (`{ "version": 1, "installed": AppId[] }`). Package databases live in `/var/lib`; it's backed up with that area (ADR-037).
- System apps are always installed and can't be uninstalled.
- No `installed.json` and no `/var/lib/version/state.json` (a first boot): only the system apps. The intro adds the picked interests.
- No `installed.json` but the version state exists (a device from before): a one-time tidy. Only apps something points to as used stay installed: window frames and saved windows, desktop shortcuts and widgets, `app.{id}.*` localStorage, `/var/lib/apps/{id}/`, app commands in the shell history, file defaults. A toast says how many went, with Undo and App Library. Nothing records use after that, and nothing is ever uninstalled automatically again.

### Where it shows
- Start menu, mobile drawer, desktop pins and `app list` show installed apps only.
- Search covers everything: installed first, then a "Not installed" group with Get.
- App Library is the store: Get / Open, and Uninstall in the details pane.
- Game Hub stays the games store: it lists every game, and Play installs.

### Installing
- A new intro page, "What are you into?": each picked interest installs its apps (a constant in core, `apps/suggestions.ts`, not manifest fields and not categories) and lists them, and the ones the user marks get pinned to the desktop. Skip keeps what was picked.
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
- **A base set of user apps** on first boot, and later **everything installed** with interests only as suggestions. The owner settled on the system apps plus the picked interests.
- **Tidying on a timer** (unused for 30 days, once or rolling) and a **Tidy up review** in the App Library. The owner wanted one automatic tidy, once, from what the OS already knows.
- **Interests as categories / a manifest field.** Categories aren't interests (Media would install a dozen apps); a field spreads the curation over 52 files.

## Consequences
- New persisted state and an AppsService API change (`installed`, `install`, `uninstall`, `list` filtering).
- Every `apps.list()` consumer must pick installed or all: start menu, drawer, App Library, Game Hub, Open with, Settings credits, shell completion and contributions.
- A new app should join an interest in `apps/suggestions.ts` to reach new users.
- A default widget (Game Hub's) is placed when the desktop boots, so a new user who picks Play sees it from the next visit.
- The tidy can miss an app used only before window frames were recorded, or only through the palette; Undo and Get bring it back.
- Cross-tab: a second tab doesn't see an install until reload (cross-tab sync is open, ROADMAP).
