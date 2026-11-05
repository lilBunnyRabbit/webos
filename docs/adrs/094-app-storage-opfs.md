# ADR-094: App storage off localStorage (4.0)
**Date:** 2026-11-05
**Status:** Accepted

## Context
ADR-003's `StorageHandle` keeps `get`, `set` and `persisted` in localStorage keys `app.{id}.*`, and about 70 apps use them (93 `persisted`, 108 `get`, 104 `set`). Only `file()` (ADR-035) writes to OPFS. WebOS persists in OPFS. localStorage is only for values needed before OPFS is up: the analytics answer and browser warnings. A few apps also call `localStorage` directly (Clock, Dev Tools, QR Reader). `get` is synchronous and the handle is built during render, so the API can't be backed by OPFS as it stands ([brainstorm](../brainstorm/2026-11-05_app-storage-opfs.md)).

## Decision
- **One-time migration in 4.0.0.** Every app moves to `storage.file()` (or `json_file` outside a window) in one release. `StorageHandle.get`, `set` and `persisted` are removed. `remove`, `window` and `file` stay.
- **Core copies the keys verbatim.** At boot, before any app window mounts, AppsService's `init()` writes every `app.{id}.{key}` into `/var/lib/apps/{id}/storage.json` as `{ "{key}": value }` and deletes those keys.
  - It runs whenever an `app.*` key exists, with no done flag, so restoring an older backup is folded in on the next boot.
  - Keys from localStorage overwrite matching keys already in `storage.json`.
  - A key is deleted only after its file is written. A key whose value isn't JSON is copied as its raw string.
- **Apps read `storage.json`.** An app that keeps its key names reads `storage.file("storage.json", defaults, Schema)` and needs no migration code. An app that wants another shape folds from `storage.json` once and deletes it.
- **Per-field fallback.** Every field in an app's storage schema has `.catch(default)`, so one bad value resets only that field.
- **Direct `localStorage` in apps** moves to `storage.file()` too. Only pre-OPFS values stay in localStorage, and none of those belong to an app.
- **Backup:** new backups no longer carry `app.*` localStorage (format 1 stays readable, and `local_storage` is written empty). Restoring an old backup sets the keys as before, and the next boot copies them in.
- **Also removed in 4.0:** the deprecated manifest fields `author`, `license`, `repository` and `AppDefinition.version`.
- **Shell:** nothing new.

## Alternatives Considered
- **Keep `persisted`/`get`/`set` with an OPFS backend loaded before mount:** no app changes, but two storage APIs for good, plus an await before every window and handle creation outside windows.
- **Migrate gradually with deprecation:** localStorage gone at once, but the two APIs would linger for releases.
- **Each app folds its own keys:** domain-shaped files from the start, but every app carries legacy code and a localStorage read.
- **Manifest `migrate` map:** a manifest field that exists for one migration.

## Consequences
- All app data is in `/var/lib/apps/{id}/`: one place for backup, Activity Monitor and uninstall-with-data.
- `file()` is async: an app shows its defaults until `ready`, or waits on it.
- Many apps start on a generic `storage.json`. Splitting it into domain files later is an app-local change.
- 4.0.0 is a major: `app-api.md` lists the break and how to move an app across.

## Revisions

- **2026-11-05, core build.** The copy is `copy_app_storage()` in `services/apps/storage-copy.ts`, awaited as the first step of `AppsService.init()`, so it also lands before the installed-list signals read `/var/lib/apps/` and in solo mode through the inherited `init()`. Apps are copied in parallel; one failing is logged and keeps its keys for the next boot. A `storage.json` that is missing, invalid or not an object counts as `{}`, so an unreadable file is replaced by the copied keys. No lock across tabs: two tabs booting at once write the same merge. Measured about 80 ms once for 70 apps of four keys, nothing after. Restore still removes the current `app.*` keys before setting an old backup's. Activity Monitor and Docs had no `get`/`set`/`persisted` uses of their own (only `storage.window()`), so nothing moved there; their views changed instead: Activity Monitor's "App storage" (localStorage per app) became "App data" (each `/var/lib/apps/{id}` folder's size, plus one row for what's left in localStorage), and the Docs storage map lists the app keys under `/var/lib` as `storage.json` keys.
