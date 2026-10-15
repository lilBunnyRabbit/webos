# ADR-026: Release Notes and First-Run Introduction
**Date:** 2026-10-11
**Status:** Implemented

> **Revision 2026-10-16: app tags and announcements** ([ADR-038](038-app-announcements.md)). `Change` gains `apps?: AppId[]` and `Release` gains `introduces?: AppId[]`. After an update, the apps the unseen releases introduce are announced in a dialog once Restore is answered, so VersionService now also depends on `session`. The seen marker is unchanged.

## Context
ADR-004 planned a `CHANGELOG.md` rendered in Settings and an "update available" toast. Neither was built. `package.json` stayed at `0.0.0`, so there was no notion of a release. There was also no record of what a user has already seen. The owner wants to hear about changes, see every release in Settings (including history), and get an introduction on first use. Discussion: [2026-10-11 release notes](../brainstorm/2026-10-11_release-notes.md).

## Decision

### Releases
- A release is a semver bump of `package.json` plus an entry in `src/lib/core/api/services/version/changelog.ts`. The top entry's version equals `package.json`.
- Entries are typed and hand-written: `{ version, date, title, changes: { kind: "new" | "improved" | "fixed", text }[] }`, newest first. The wording is user-facing, not commit titles.
- History is backfilled as 0.1.0 to 0.7.0. This feature is 0.8.0.

### Seen state
- VersionService owns it. `/var/lib/version/state.json` holds `{ "version": 1, "seen": "0.8.0" }`.
- At boot:
  - No file: show the introduction. `seen` is written when it closes.
  - `seen` < current: toast "Updated to vX" with a "What's new" action, which opens Settings › What's new. `seen` is written right away.
  - Otherwise: nothing.
- `unseen` (releases newer than the old `seen`) is kept in memory for the session, so Settings can mark them.

### Update available
- When `check()` finds a newer build, there's one sticky toast per build: "A new version is ready" with an "Update and reload" action calling `apply_update()`. It's skipped in development.

### Introduction
- A full-screen, paged takeover shown through DialogsService (`dismissible: false`):
  - Hello
  - Your files
  - Getting around
  - Make it yours: theme and taskbar, applied live
  - Ready
- Skip is on every page. Settings › About can replay it, and replaying doesn't touch `seen`.
- VersionService is registered after SessionService, so at boot the introduction stacks above the Restore dialog.

### Dependencies
VersionService now depends on `files`, `notifications`, `dialogs` and `apps`.

## Alternatives Considered
- **`CHANGELOG.md` fetched at runtime (ADR-004).** It needs a markdown renderer: a new dependency or a hand-rolled parser. Kinds would only exist by convention.
- **Generated from conventional commits.** No upkeep, but commit titles are dev-speak and the pre-2026-10 history is noise.
- **New ChangelogService.** It keeps VersionService dependency-free, but adds a whole service, inspector and docs page for one feature.
- **Seen marker in `/etc/settings.json`.** It isn't a setting, and "Reset settings" would bring the introduction back.
- **Welcome card, welcome app window, or toasts only.** The owner wants a real OS first-run experience.

## Consequences
- Every user-visible release needs a version bump and an entry. The agent rule is in CLAUDE.md. A push without a bump is silent.
- A tab learns a release's notes only after reloading into it, since the changelog is in the bundle.
- With two tabs open, the first to boot marks the release seen.
- Swapping VersionService now means providing the changelog, seen state and introduction too.
