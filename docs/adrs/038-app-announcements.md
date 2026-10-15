# ADR-038: New-App Announcements and App History
**Date:** 2026-10-16
**Status:** Implemented

## Context
ADR-026 gives WebOS a typed changelog, an "Updated to vX" toast and Settings › What's new. A new app gets one line among the rest, which undersells it. The owner wants new apps announced in a more prominent way (a dialog that says what the app is and does) and a per-app record of when each app was added and what changed since, backfilled for every existing app. The first app announced this way is the Hopsprite pixel editor. Discussion: [2026-10-16 app announcements](../brainstorm/2026-10-16_app-announcements.md).

## Decision

### One source: the changelog
- `Change.apps?: AppId[]`: the apps whose own UI or own commands a line is about. Shell-wide, launcher, desktop and service lines stay untagged.
- `Release.introduces?: AppId[]`: the apps first shipped in that release. It's explicit, not "the oldest mention", because some apps are older than the notes (Example, Style Guide) and are never announced.
- Retired apps' lines are tagged with their successor: the five old image apps go to `image-tools`, Text Viewer to `text-editor`. A `RETIRED` list in the test covers ids that have no successor; it's empty today.
- The history of every app was backfilled from git and the existing notes.
- Pure helpers in `version/history.ts`: `app_history`, `introduced_apps`, `updated_apps`, `recency`. A unit test checks that every id is an app folder, that each app is introduced once, and that each introduced app has a tagged line in its release.
- The manifest `version` field stays as it is. The App Library shows "Added v… · Updated v…" from the notes instead, and falls back to `v{version}` when the notes don't mention the app.

### What an app is: the manifest
- New optional manifest fields: `highlights?: AppHighlight[]` (`{ icon, title, text }`, three or four cards) and `preview?: () => Promise<{ default: string }>` (a lazy image URL). This is a minor addition to the 1.x app API.
- No backfill for old apps: their description is the fallback.

### The announcement
- `VersionService.announced = introduced_apps(unseen)`, limited to installed apps.
- When it isn't empty, VersionService waits for `session.status !== PENDING` (RouterService's `$effect.root` pattern), then shows `components/announcement/app-announcement.svelte` once through DialogsService. The dialog is dismissible.
- VersionService now depends on `session`.
- First boot (the introduction) announces nothing. The "Updated" toast stays.
- No new persistence: the seen marker already makes it once per release.
- Layout:
  - **1–4 apps:** a page per app with dots, Later (next page or close) and Open {name} (launch, then next or close).
  - **More than 4:** one list with an Open per row.
- It's a centred card with container queries, so the same component works on phones.

### Where history shows
- **App Library details:** a History section, plus the New / Updated badge.
- **App Library sort:** `LibrarySort.RECENT` ("Recently added / updated") groups apps by the release that last introduced or changed them.
- **New / Updated badges** on tiles and rows come from `version.unseen`, last for the session only, and appear in the App Library only.

### Shell
- `changelog --apps` yields one `new-app` row per introduced app (id, name, added, date); clicking it launches the app.
- It's its own value type, because `app`'s columns would hide the release.

### App authors
Added the same day (owner):
- `AppManifest.authors?: AppAuthor[]` with `interface AppAuthor { name; github?; url? }`. Omitted or empty means `OWNER = { name: "lilBunnyRabbit", github: "lilBunnyRabbit" }`, so built-in apps credit the owner.
- `services/apps/authors.ts` holds `app_authors`, `author_link` (GitHub first, else `url`), `author_names` and `credits` (grouped by GitHub handle, url or name; owner first).
- Shown in four places:
  - "By …" in the App Library details
  - the announcement byline
  - Settings › About › Credits
  - `app info`'s `author` field and `app list`'s `authors` column
- The older `author?: string` field stays stable and unread. Only the Example template sets it.

## Alternatives Considered
- **Per-app `history` in `define_app`.** The same sentence would be written twice, about 51 manifests' strings would sit in the boot chunk, and removed apps would take their history with them.
- **A separate apps changelog file.** Two files have to agree on versions.
- **Changelog entries holding the announcement content.** `changelog.ts` would import icons and images, and the App Library couldn't reuse them.
- **A lazy per-app announcement component.** Every app would draw its own dialog with no shared look, and the details pane couldn't reuse it.
- **Showing the announcement at once, stacked over Restore.** Needs no dependency, but Open would launch a window that Restore then buries.
- **Only a toast action.** It wasn't prominent enough for the ask.
- **Persistent badges, or a "remind me" state.** Both need new state that nothing requires today.
- **A Settings section for history.** It would duplicate What's new filtered by app, away from where apps are browsed.
- **`changelog --app <id>` and `app announce <id>`.** The owner declined both.

## Consequences
- Every user-visible line that's about an app gets an `apps` tag, and a release that adds an app lists it in `introduces`. The rule for agents is in `docs/system/services/version.md`.
- A device that skipped many releases sees one list rather than many pages.
- Swapping VersionService means providing the announcement too.
- `changelog --apps` keeps `yields: "release"`, so `where` after it completes release columns.
- With two tabs open, only the first to boot announces (same as the toast).
