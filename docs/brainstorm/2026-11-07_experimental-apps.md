# Experimental apps
**Date:** 2026-11-07
**Participants:** owner, Claude

## Context
Owner: "when we release this i would mark it as experimental - we need a system for this". The first user is Harbour, whose handling is still being tuned.

What exists today:
- `AppMeta` (`src/lib/core/api/services/apps/type.ts:279`) has no flag fields. Meta reaches the catalogue through `manifest_data` (`catalogue.ts:92`) and the runtime whitelist `text_of` (`service.svelte.ts:953`).
- The "New" and "Updated" badges come from the changelog `introduces`.
- The kit `Badge` has a `warning` tone.
- Drive Hub has an in-app "Experimental" shelf (ADR-087), but there is no OS-level notion.

## Topics discussed

### Where the flag lives (decided)
`AppMeta.experimental?: true`, in the app's `meta.ts`, carried into the catalogue. Every catalogue surface gets it. Graduating means deleting the line.
- Rejected: a manifest field (it mixes a status into the runtime shape).
- Rejected: changelog-only (the shell, Game Hub and title bar wouldn't know).

### What it does (decided)
A badge everywhere, in the warning tone, reading "Experimental":
- App Store card, list and page;
- Discover;
- Start menu and mobile launcher;
- Game Hub row;
- a small pill in the window title bar.

No first-open notice, no "saves may reset" promise, no feedback link.

### Announcement (decided)
The normal new-app announcement and changelog line, both saying "Experimental". Graduating later is an `improved` line, not "new" again.
- Rejected: Store only, announced at graduation.
- Rejected: opt-in only (a new setting, a filter in `listings()`, and deep links to hidden apps).

### Achievements (decided)
They count normally. No special case.

### Shell (decided)
- `app info <id>` gets an experimental row.
- `app list` gets a boolean `experimental` column, so `app list | where experimental` works.
- No new command.

## Key takeaways
- A status in meta moves only with a release. That's accepted.
- [ADR-097](../adrs/097-experimental-apps.md).

## Action items
- [x] One app-builder: the `AppMeta` field through the catalogue and `text_of`, the badge on every surface, the title-bar pill, shell columns, the announcement label, Harbour marked, docs (system pages, design docs, Style Guide if a new pattern), one test.

## Next session topics
- A feedback link per experimental app.
- A save-reset notice if an experimental app's format changes.
