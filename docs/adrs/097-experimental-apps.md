# ADR-097: Experimental apps
**Date:** 2026-11-07
**Status:** Implemented

## Context
The owner wants to release apps that are still being tuned, Harbour first, and to tell users so ([brainstorm](../brainstorm/2026-11-07_experimental-apps.md)). Apps have no status flag today: `AppMeta` holds only text and authors, and the "New" and "Updated" badges are derived from the changelog.

## Decision
- **Field.** `AppMeta.experimental?: true`, set in the app's `meta.ts`. `manifest_data` copies it into the catalogue entry, and `text_of` passes it to `apps.meta(id)` and to the listings. Graduating means deleting the line, in a release.
- **Badge.** A kit `Badge` with `tone="warning"` and the text "Experimental", shown on:
  - App Store cards, list rows and the app page;
  - Discover;
  - the Start menu and the mobile launcher;
  - Game Hub rows;
  - the window title bar, as a small pill read from `apps.meta(id)`.
- **Announcement.** The new-app announcement and the changelog line say "Experimental". Graduating is an `improved` line, not a second `introduces`.
- **Achievements.** No special case.
- **Shell.** `app info` shows `experimental`, and `app list` has a boolean `experimental` column.
- **Not included:** a first-open notice, a saves-may-reset promise, a feedback link, a Settings opt-in.

## Alternatives Considered
- **A manifest field** (`define_app({ experimental })`). It mixes a release status into the runtime shape.
- **Changelog-only** (`introduces: [{ id, experimental }]`). It keeps the history, but the shell, Game Hub and title bar wouldn't know.
- **A Settings opt-in to show experimental apps.** It needs a new persisted setting and a filter in `listings()`, and it breaks deep links to hidden apps.

## Consequences
- The flag changes only with a release, and the catalogue records no history of it. The changelog lines do.
- A new meta key touches `AppMeta`, `CatalogueApp`, `manifest_data` and `text_of`. The catalogue build carries it without a format version bump, because the key is optional.

## Revision 2026-11-07 (build)
- One label, one place: `components/apps/experimental-badge.svelte`. The title bar and the phone switcher's card header use `app-experimental.svelte`, which awaits `apps.meta(id)`; list surfaces read the flag from `listings()`.
- The phone has no window title bar: the pill sits in the switcher's card header instead.
- The start menu's Recent row shows no badge: it is one row tall, sized by its first tile, so a taller tile would be cut off. Desktop icons, taskbar buttons and the phone's pinned home entries don't show it either; the phone's Recent rows and full app list do.
- `where` takes an operator and a value, so the query is `app list | where experimental == true`, not `where experimental`.
