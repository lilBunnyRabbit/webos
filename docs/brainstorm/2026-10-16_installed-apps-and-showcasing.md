# Installed apps and showcasing features

**Date:** 2026-10-16 · **Participants:** owner, Claude

## Context

Two P1 roadmap items, taken together because the install model decides what a tour can show.

- **Today:** 52 apps (13 system, 39 user). Every list (start menu, mobile drawer, App Library, `app list`, completion, Open with) shows `apps.list()` unfiltered; Example, Style Guide and Kernel included. No pinned or recent apps anywhere. First boot: Settings, File Explorer, Terminal on the desktop plus the Game Hub widget; mobile gets the same three and an empty dock.
- **Intro (ADR-026):** six pages (hello, install, files, around, yours, ready). Never mentions the shell, palette, shortcuts, widgets, tasks, deep links, backup or any app.
- **Highlights (ADR-038):** manifest `highlights` exist, only Hopsprite fills them; no app sets `preview`.
- **Seeding:** none beyond the folder hierarchy. No sample files, no tips.

## Installed apps

### Decisions

- **Install model.** AppsService holds an installed set. Start menu, drawer, desktop and `app list` show installed apps; search shows the rest under "Not installed" with Get.
- **Persistence:** `/var/lib/apps/installed.json`, owned by AppsService (package databases live in `/var/lib`).
- **Uninstall:** hides the app, removes its desktop shortcuts and widgets, and offers "Also delete its saved data".
- **Gated shell:** an uninstalled app contributes no shell commands and no completion; the error points to the App Library. Rejected: commands keep working and install on use.
- **Implicit installs from the UI:** opening a file, a deep link, an announcement's Open or a Game Hub Play installs silently, with a quiet "Kanban installed" toast. The shell never installs. Rejected: asking first (an extra click on every first open).
- **No new shell commands.** `app list` shows installed apps; `app launch` on an uninstalled app errors with the App Library hint. Rejected: `app install` / `app uninstall [--data]`.
- **Uninstall:** hides the app, removes its desktop shortcuts and widgets, and offers "Also delete its saved data" (`app.{id}.*` localStorage and `/var/lib/apps/{id}/`, never `/home`). System apps can't be uninstalled. Entry points: App Library details, start menu / drawer tile menu, desktop icon menu.
- ~~Starter set~~ and ~~migration installs everything~~: changed mid-implementation, see below.
- **Interests** are a constant in core (`apps/suggestions.ts`), not manifest fields and not categories.

### Revised while building (owner)

- "for new users i would also want to open the apps highlight/suggestions but yea just default to all installed or propose to uninstall unused"
- **First boot installs everything.** The intro's "What are you into?" page suggests apps per interest, with a Pin toggle; it installs nothing.
- "what if we just uninstall the ones they havent used we have that info right": partly. Nothing logs app use, but window frames, saved windows, desktop shortcuts and widgets, `app.{id}.*` localStorage, `/var/lib/apps/{id}/`, shell history and file defaults all persist.
- Options weighed: existing users once plus new users after 30 days; a rolling 30-day tidy; existing users once; a Tidy up review in App Library. Owner: "no after x days. one time thing."
- **Decision:** one automatic tidy for devices from before installed apps, from those signals, with an Undo toast. No usage record is kept afterwards.
- **Game Hub** stays the games store: it lists every game and Play installs. The Games interest installs Game Hub plus a few games.

## Showcasing features

### Decisions

- **Getting started app** (system app): a card per feature with Try it and a tried tick; desktop shortcut on first boot. Rejected for now: contextual first-time tips (new core registry and seen state, can nag), a richer intro (front-loaded, forgotten).
- **Shell:** `tour [topic]` in the manifest, plus a `topic` prop for the palette and deep links.
- **Progress** in `storage.file("progress.json")`.
- **Phones:** cards declare platforms.
- **Sample files:** a small set in `/home/Documents/Samples`, first boot only, written by a lazily imported `seed_samples()` from VersionService's first-boot branch.
- **Highlights:** about ten flagship apps now, the rest when touched.
- Assumed, not asked: system apps can't be uninstalled.

## Key takeaways

- Install hides apps, so discovery has to move somewhere visible: search's "Not installed" group, the App Library store, Getting started and the interests page.
- "Installed" means available in the shell too; the UI installs on intent, the shell never does.

## Action items

- [x] [ADR-040](../adrs/040-installed-apps.md) Installed apps
- [x] [ADR-041](../adrs/041-getting-started.md) Getting started and sample files
- [x] Implement ADR-040
- [ ] Implement ADR-041 (after 040; the intro's interests page is done)

## Next session topics

- Window extraction ([brainstorm](2026-10-16_window-extraction.md))
- Contextual tips that link to Getting started cards
