# App announcements and app history

**Date:** 2026-10-16
**Participants:** owner, agent (investigation and implementation)

## Context

The owner's request: "a new update announcement format where we announce new applications. this should be more highlighted like a modal or something explaining what it is and what it does. new section in settings aswell or maybe better in the app library to keep track when apps were added/updated/what was updated … also for older apps."

What exists (ADR-026):
- a typed `changelog.ts` with `Change { kind, text }` and no app ids
- the seen marker in `/var/lib/version/state.json`
- an "Updated to vX" toast and Settings › What's new
- a full-screen introduction on first boot, stacked above Restore because VersionService is registered last

The manifest `version` field is decorative: 49 apps say `1.0.0`. Hopsprite, a pixel-art editor built in parallel, is the first app to be announced.

## Topics and decisions

1. **Where app history lives.** The changelog, with `Change.apps?: AppId[]` and `Release.introduces?: AppId[]`. Rejected: a manifest `history` (duplicated text, boot weight, lost with removed apps) and a separate file (drift). The manifest `version` field is left alone; the App Library shows "Added v… · Updated v…" from the notes.
2. **Backfill gaps.**
   - Settings is introduced in 0.3.0. Style Guide and Example are never introduced.
   - The retired image apps' lines are tagged `image-tools`, which is introduced in 1.2.0, so its history shows them.
   - Generic lines (pause while minimized, clocks do less work) are untagged.
   - Archive is tagged in 1.3.0: verified, since it uses `utils/zip/operations`, which runs through TasksService.
3. **Announcement content.** The manifest says what the app is (optional `highlights` and lazy `preview`); the changelog says when. No highlights are backfilled for old apps. Hopsprite's highlights are written on its own branch.
4. **Modal shape.**
   - A centred card in the Questions pattern, wider and dismissible.
   - The same component on mobile, one column, capped height.
   - 1–4 apps get a page each with dots; more than 4 get one list with Open per row.
   - Actions: Later (quiet) and Open {name} (primary, autofocus).
   - No App Library prop and no reminder state.
5. **When it shows.** After the Restore answer (RouterService's pattern), which adds a `session` dependency. Announce = `unseen.flatMap(r => r.introduces ?? [])` limited to installed apps. First boot shows none. The Updated toast stays. No new persistence.
6. **History UI.** In the App Library:
   - a History section in the details
   - a `LibrarySort.RECENT` "Recently added / updated" sort
   - session-only New / Updated badges, from `unseen`

   Not in Settings.
7. **Shell.** Only `changelog --apps`. Not `--app <id>`, not `app announce`.
8. **App author highlights** (added later the same session, roadmap P1). Optional manifest `authors?: AppAuthor[]` (`{ name, github?, url? }`); omitted means `OWNER` (lilBunnyRabbit, GitHub `lilBunnyRabbit`, from the repo URL). A pure `app_authors()`. Credited in four places:
   - the App Library details ("By …", linking out in a new tab)
   - the announcement byline
   - Settings › About › Credits (each author with their apps, owner first)
   - `app info` (`author`) and `app list` (an `authors` column)

   The old `author?: string` isn't read. Only Example sets it ("John Doe"), and showing that as a real credit would be wrong.
9. **Records.** ADR-038, the ADR-026 revision note, the roadmap, a 1.5.0 release (master shipped 1.4.0 meanwhile).

## Implementation notes

- `changelog --apps` rows are a `new-app` value type, not `app`. The coordinator's brief asked for the `app` type and also for columns id, name, added version and date. The `app` type's columns are fixed at id, name, category, so the release wouldn't show. `new-app` has the asked-for columns, and clicking a row launches the app the same way.
- The Recently added / updated sort groups by release, labelled "v1.2.0 · Image Tools and project themes", with "Earlier" for apps the notes never mention.
- Later moves to the next app and closes on the last one. The close button closes everything.

## Key takeaways

- The changelog stays the one hand-written record. App history is a filter over it, not a second document.
- Tagging rule: tag the app whose own UI or commands changed. Leave shell-wide, launcher, desktop and service lines untagged.

## Action items

- [x] ADR-038, the ADR-026 revision, docs/system (version, kernel, shell, system apps, manifest, app API), docs/design patterns, Style Guide
- [x] Backfill for every app
- [ ] Hopsprite branch: `introduces: ["hopsprite"]` in its release entry, an `apps` tag on its lines, and manifest `highlights`
- [ ] Owner: add `session` to the VersionService row of the CLAUDE.md service table (the agent doesn't edit CLAUDE.md)

## Next session topics

- Whether big app updates (Text Viewer becoming Text Editor) deserve an announcement too
- Preview images: who makes them and in what format
