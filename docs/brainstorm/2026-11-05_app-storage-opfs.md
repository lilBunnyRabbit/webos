# App storage off localStorage (4.0)

**Date:** 2026-11-05
**Participants:** owner, lead agent (#main-webos)

## Context

The owner asked what a v4 release needs. The only break already scheduled for 4.0 was removing the deprecated manifest fields (`author`, `license`, `repository`, `AppDefinition.version`), and no app uses them. The bigger gap: the app `StorageHandle` (ADR-003) still writes `get`, `set` and `persisted` to localStorage keys `app.{id}.*` (`core/contexts/app/storage-handle.svelte.ts:61`). Uses across apps: `persisted` 93, `get` 108, `set` 104, `file()` 20. About 70 apps rely on it. A few also call `localStorage` directly (Clock, Dev Tools, QR Reader).

The owner's rule since 2026-10-29: everything persists in OPFS. localStorage is only for values needed before OPFS is up (the analytics answer, browser warnings).

Root cause of the difficulty: `get` is synchronous and the handle is built during render (`window.svelte:50`). OPFS reads are async, so the API can't simply be pointed at OPFS.

## Topics and decisions

1. **How apps move.** Options were: A, keep `persisted`/`get`/`set` with an OPFS backend loaded before mount; B, every app moves to `storage.file()`; C, A now and deprecate later. Lead recommended C. **Owner: a one-time migration. Every app moves to `storage.file()` in one release, and `get`/`set`/`persisted` are removed.** One storage API, no gradual move.
2. **v4.** **4.0 is this migration** plus the removal of the deprecated manifest fields. Moving app data is a storage-location break, so it's a major by `app-api.md`'s rule.
3. **The copy step.** Options: core copies keys verbatim; each app folds its own keys (Tight Spot `legacy.ts` style); a manifest `migrate` map. **Owner: core copies verbatim.** At boot, every `app.{id}.{key}` goes into `/var/lib/apps/{id}/storage.json` as `{ key: value }`, then the keys are deleted. An app that keeps its key names reads `storage.json` and needs no migration code. An app that wants another shape folds from `storage.json` once. Risk noted: apps settle on one bag-of-keys file.
4. **Shell.** **Nothing.** The copy runs on its own, and `ls`/`cat` on `/var/lib/apps` already show the result.
5. **Bad values.** **Per-field fallback:** every field in an app's schema gets `.catch(default)`, so one bad value resets only that field. No core change for this.

## Lead's implementation calls (inside the decisions)

- The copy runs when any `app.*` key exists, not behind a done flag. A restore of an older backup sets `app.*` keys and reloads, so the next boot folds them in. Keys from localStorage overwrite matching keys already in `storage.json`. A key is deleted only after its file is written.
- Out-of-window code (shell commands, players) uses the stable `json_file(app_data_path(id, "storage.json"), …)` and `release()`. No new API.

## Key takeaways

- 4.0 = all app data in OPFS, one storage API (`file()`), deprecated manifest fields gone.
- localStorage keeps only pre-OPFS values.

## Action items

- [x] ADR-094
- [x] Core: boot copy, backup, Activity Monitor and Docs storage views, then remove `get`/`set`/`persisted` and the deprecated fields; `app-api.md`, persistence, manifest, backup pages
- [x] Apps: move every `storage.get/set/persisted` and direct `localStorage` use to `storage.file()`
- [x] Release 4.0.0

## Next session topics

- None yet.
