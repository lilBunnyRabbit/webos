# Persistence

Every place the OS stores data in the browser, as of the current code. There's no backend, so this is the whole picture. Verified by grepping `src/` for `localStorage`, `sessionStorage`, `indexedDB`, `navigator.storage` and `caches`.

## Storage map

| Store | Key / path | Owner | Format | Version | Load: sanitize / migrate | When written |
|-------|-----------|-------|--------|---------|--------------------------|--------------|
| localStorage | `webos.settings` | SettingsService (`settings/persistence.ts`) | JSON `{ version, theme, taskbar, file_defaults }` | `1` | Wrong version → discarded (no migration). Theme merged over Brand Dark, known token keys with string values only. Bad taskbar position → `bottom`. `file_defaults` keeps only `".ext" → string` entries. Parse error → defaults. | `$effect` after every change, plus once right after init. [Details](services/settings.md#persistence) |
| localStorage | `app.{app_id}.{key}` | App storage handle (`contexts/app/storage-handle.svelte.ts`), one per window | `JSON.stringify(value)` | none | Optional zod schema on `get()` / `persisted()`. Invalid or corrupt → `null` / `initial`. Without a schema, anything parsed is returned unchecked. | `set()` writes immediately, or updates the live cell. `persisted()` writes via `$effect` on every change, including once on creation. |
| OPFS | root of `navigator.storage.getDirectory()`, whole tree: `/home` (user files, with `Desktop`, `Documents`, `Downloads`), `/etc`, `/var`, `/tmp` | FilesService (`files/opfs.ts`, layout in `files/hierarchy.ts`) | Files and folders, as is | n/a | Every boot, `FilesService.init()` recreates missing folders and empties `/tmp`. Once, a flat pre-hierarchy root is moved into `/home` | User and app file operations ([services/files.md](services/files.md)) |
| OPFS | `/etc/hierarchy.json` | FilesService (`files/hierarchy.ts`) | JSON `{ version }` | `1` | Its absence triggers the root → `/home` migration. The version isn't read | Once, after the migration finishes, and again after `clear()` |
| Storage persistence | `navigator.storage.persist()` | FilesService, requested on first `get_root()` (during `init()`) | Browser permission | n/a | `false` → `console.warn("[FilesService] Storage not persisted")` | Once per page load |
| Cache Storage + service worker | Workbox precache (`sw.js`, `workbox-*.js`, `registerSW.js`) | vite-plugin-pwa (`vite.config.ts`, `registerType: "autoUpdate"`), production only | Workbox-managed | Workbox revisions | Workbox handles it | On SW install/update. `VersionService.apply_update()` installs the new worker before reloading ([services/version.md](services/version.md#service-worker)) |

Not used anywhere in OS code: `sessionStorage`, IndexedDB, cookies, the URL (no hash/query state; ADR-010 is only accepted).

Only one user app uses app storage today: `user/example` (`app.example.count`). No system app persists anything through it.

## App storage handle

Created per window in `window-content.svelte` (`create_storage_handle(app_id)`) and exposed as `get_app_context().storage` (ADR-003). Every key is prefixed `app.{app_id}.`. The key belongs to the app, not the window.

```ts
interface StorageHandle {
  get<T>(key: string, schema?: ZodType<T>): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Must be called during component init: it uses `$effect` to save. */
  persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
}
```

- **Shared cells.** A module-level `Map<fullKey, PersistedCell>` holds one reactive cell per key. All windows of an app that call `persisted("x")` get the **same** `{ value }` object, so they stay in sync live. The first caller's `initial` and schema win. Each call retains the cell, and the caller's `$effect` teardown releases it. The last release disposes the cell's save effect and removes it from the map.
- **Save.** The cell's `$effect.root` saves `$state.snapshot(value)` whenever it changes. So the cell writes once on creation (`initial`, or the loaded value echoed back), then on every change.
- `set(key, v)` goes through the live cell if there is one, so the cell's effect saves it. Otherwise it writes straight to localStorage.
- `get(key)` always reads localStorage, **not** the live cell. Right after a `cell.value = …`, before effects flush, `get()` returns the previous value.
- `remove(key)` removes the localStorage entry and resets a live cell to a `structuredClone` of its `initial` without writing it, so every window shows `initial` and the key stays absent until the next change. The cell keeps its own clone of `initial` from creation, so edits to the live value never leak into the reset target.
- Write and remove failures go to `console.error` (`Failed to save app.x.y:` / `Failed to remove app.x.y:`).
- No cross-tab sync. There's no `storage` event listener.
- Nothing is cleaned up when an app is removed: its `app.{id}.*` keys stay behind.

## What survives a reload

| Thing | Survives? | Notes |
|-------|-----------|-------|
| Theme, taskbar position, Open-with defaults | Yes | `webos.settings` |
| App data stored via `storage` | Yes | `app.{id}.*` |
| Files and folders | Yes | OPFS. Lasts longer if `persist()` was granted. The browser may evict it otherwise. |
| `/tmp` contents | **No** | Emptied at every boot |
| Directory revisions | **No** | In-memory `SvelteMap` in FilesService |
| Open windows, positions, sizes, z-order, maximized/minimized | **No** | WindowsService is in-memory only (ROADMAP "Save/restore open windows and positions", open) |
| Desktop icon layout | **No** | DesktopService `layout` is hardcoded `[[settings, file-explorer]]` at construction |
| Notification history | **No** | NotificationsService `all` is in-memory |
| Open dialogs | **No** | DialogsService `stack` is in-memory |
| File Explorer location, app UI state | **No** | Unless the app uses `storage` |
| bfcache restore (`pagehide` with `persisted`) | Everything | Services aren't shut down, so the page comes back as it was |

## Conventions

The rule for new service state ([CONVENTIONS → Services](../CONVENTIONS.md#services)) is one versioned localStorage key per service, `webos.{service}`, with load and save as pure functions beside the service. Always validate on load. `webos.settings` is the only one so far. Storing larger data or session state (windows, desktop) is an open design question (ROADMAP Session Persistence). Agents don't decide it.

## Wiping

| What | How |
|------|-----|
| Settings | `localStorage.removeItem("webos.settings")` + reload, or the Settings app's Reset (theme, taskbar and `file_defaults`, no reload). |
| App data | `localStorage` keys `app.{id}.*` (no UI) |
| Files | `kernel.service("files").clear()` (→ `opfs.clear_opfs()`, then rebuilds the empty hierarchy and marker; no UI caller), or DevTools → Application → Storage (the hierarchy comes back on the next boot) |
| SW / caches | No UI. DevTools → Application → Storage. `apply_update()` replaces the precache with the new build's, it doesn't wipe it. |
