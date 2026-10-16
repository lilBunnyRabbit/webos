# ADR-041: Getting Started and Sample Files
**Date:** 2026-10-16
**Status:** Accepted

## Context
The intro (ADR-026) covers files, getting around and the theme. Nothing points to the shell, the palette, shortcuts, widgets, tasks, file associations, deep links or backup, and with installed apps (ADR-040) fewer apps are in view. Only Hopsprite fills the manifest `highlights` (ADR-038). Discussion: [2026-10-16 installed apps and showcasing](../brainstorm/2026-10-16_installed-apps-and-showcasing.md).

## Decision

### Getting started app
- A system app, `getting-started`, with one card per feature: what it is, how to reach it, and a **Try it** button that runs a shell command or opens the thing.
- Cards declare their platforms: phones skip snap, Mod+K and shortcuts, and show home pages, the dock, the switcher and Back instead.
- Progress ("3 of 9 tried") ticks on Try it, stored in `storage.file("progress.json")` (`/var/lib/apps/getting-started/`, ADR-035).
- A desktop shortcut (home icon on phones) on first boot; Settings › About links it.
- Shell: a `tour [topic]` command in the manifest (completion: topic ids) and a `topic` prop, so the palette and deep links (`#/app/getting-started?topic=widgets`) open at a card.

### Sample files
- First boot only. VersionService's first-boot branch lazily imports `seed_samples()`, which writes a few files to `/home/Documents/Samples` from bundled assets (a welcome note, a `.hopsprite`, a `.kanban` board, an image), each opening in a different app. Off the boot budget. Existing users get nothing.

### Highlights
- Write manifest `highlights` for about ten flagship apps now (Terminal, File Explorer, Hopsprite, Kanban, PDF Tools, Image Tools, Archive, Calendar, Game Hub, Settings); the rest as they're touched.

## Alternatives Considered
- **Contextual first-time tips.** Reach everyone at the right moment, but need a core tips registry and a seen set, timing heuristics, and can nag. Could come later and link to cards.
- **A richer intro.** Already seven pages with the interests page; front-loaded information is forgotten.
- **Samples written by the app on first open, or opt-in on the intro's last page.** A user who never opens the app gets none; the opt-in adds a decision to a first boot.
- **localStorage progress.** Outside the file backup areas unless `app.*` is picked.

## Consequences
- One more system app, one more first-boot duty for VersionService, and bundled sample assets.
- Each new OS feature should get a card, the same way new apps join an interest in `apps/suggestions.ts`.
