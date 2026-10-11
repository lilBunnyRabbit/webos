# Persistence

Every place the OS stores data in the browser, as of the current code. There's no backend, so this is the whole picture. Verified by grepping `src/` for `localStorage`, `sessionStorage`, `indexedDB`, `navigator.storage` and `caches`.

## Storage map

| Store | Key / path | Owner | Format | Version | Load: sanitize / migrate | When written |
|-------|-----------|-------|--------|---------|--------------------------|--------------|
| OPFS | `/etc/settings.json` | SettingsService (`settings/persistence.ts`) | JSON `{ version, theme, taskbar, file_defaults }`, pretty-printed | `1` | Wrong version → discarded (no migration). Theme merged over Brand Dark, known token keys with string values only. Surface tokens a save predates come from the matching brand palette, else `derive_surfaces()`. Bad taskbar position → `bottom`. `file_defaults` keeps only `".ext" → string` entries. Parse error → defaults. | `$effect` after every change, plus once right after init, through a write queue (no overlapping writes, newest wins). [Details](services/settings.md#persistence) |
| localStorage | `webos.settings` (legacy) | SettingsService (`take_legacy_settings`) | Same JSON as above | `1` | Imported only when `/etc/settings.json` doesn't exist | Never written. Removed on every boot |
| OPFS | `/home/Desktop/*` | DesktopService (reads), the user, `pin()` and seeding (write) | Any file or folder. `.desktop` files are shortcut JSON `{ app_id, props? }` | none | Shortcut zod-validated on read; invalid → shown as a plain file, "Broken shortcut" on open | Seeding on first boot, "Pin to Desktop", and anything the user saves there. [Details](services/desktop.md#persistence) |
| OPFS | `/var/lib/session/session.json` | SessionService (`session/persistence.ts`) | JSON `{ version, windows: [{ app_id, props?, bounds, flags, snap_zone }] }`, oldest-first in z-order, pretty-printed | `1` | zod; anything invalid → no session (no dialog), overwritten on first save. Unknown app or invalid props → that window skipped at restore, one toast | `$effect` on every window change, through `LatestWriter`, but only after the boot restore decision. [Details](services/session.md#persistence) |
| OPFS | `/var/lib/desktop/layout.json` | DesktopService (`desktop/layout.ts`) | JSON `{ version, positions: { [entry name]: { x, y } } }`, pretty-printed | `1` | zod: wrong version or shape → no positions (icons take free cells). Stale names pruned on the next move | Seeding, and every icon move |
| localStorage | `app.{app_id}.{key}` | App storage handle (`contexts/app/storage-handle.svelte.ts`), one per window | `JSON.stringify(value)` | none | Optional zod schema on `get()` / `persisted()`. Invalid or corrupt → `null` / `initial`. Without a schema, anything parsed is returned unchecked. | `set()` writes immediately, or updates the live cell. `persisted()` writes via `$effect` on every change, including once on creation. |
| OPFS | root of `navigator.storage.getDirectory()`, whole tree: `/home` (user files, with `Desktop`, `Documents`, `Downloads`), `/etc` (OS config), `/var/lib` (OS component state), `/tmp` | FilesService (`files/opfs.ts`, layout in `files/hierarchy.ts`) | Files and folders, as is | n/a | Every boot, `FilesService.init()` recreates missing folders and empties `/tmp`. Once, a flat pre-hierarchy root is moved into `/home` | User and app file operations ([services/files.md](services/files.md)) |
| OPFS | `/etc/hierarchy.json` | FilesService (`files/hierarchy.ts`) | JSON `{ version }` | `1` | Its absence triggers the root → `/home` migration. The version isn't read | Once, after the migration finishes, and again after `clear()` |
| Storage persistence | `navigator.storage.persist()` | FilesService, requested on first `get_root()` (during `init()`) | Browser permission | n/a | `false` → `console.warn("[FilesService] Storage not persisted")` | Once per page load |
| Cache Storage + service worker | Workbox precache (`sw.js`, `workbox-*.js`, `registerSW.js`) | vite-plugin-pwa (`vite.config.ts`, `registerType: "autoUpdate"`), production only | Workbox-managed | Workbox revisions | Workbox handles it | On SW install/update. `VersionService.apply_update()` installs the new worker before reloading ([services/version.md](services/version.md#service-worker)) |

Not used anywhere in OS code: `sessionStorage`, IndexedDB, cookies, the URL (no hash/query state; ADR-010 is only accepted).

App storage keys in use today:

| Key | App | Value |
|-----|-----|-------|
| `app.settings.section` | Settings | Open section: `appearance`, `taskbar`, `files` or `about` (zod enum) |
| `app.kernel.expanded` | Kernel | Registry keys of the open inspector cards (`string[]`) |
| `app.text-viewer.wrap` | Text Viewer | Line wrap on or off (`boolean`, default `true`) |
| `app.style-guide.section` | Style Guide | Open section: `colour`, `type`, `surfaces`, `actions`, `inputs` or `feedback` (zod enum) |
| `app.example.count` | `user/example` | Counter (`number`) |

All are `storage.persisted()` cells, so every window of the app shares one live value.

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
| Theme, taskbar position, Open-with defaults | Yes | `/etc/settings.json` |
| App data stored via `storage` | Yes | `app.{id}.*` |
| Files and folders | Yes | OPFS. Lasts longer if `persist()` was granted. The browser may evict it otherwise. |
| `/tmp` contents | **No** | Emptied at every boot |
| Directory revisions | **No** | In-memory `SvelteMap` in FilesService |
| Open windows: app, props, bounds, z-order, maximized/minimized, snap zone | Yes, if the user picks Restore | `/var/lib/session/session.json`, offered by a dialog at boot. Apps with manifest `restore: false` are left out. Window ids, `created_at` and the `debug` flag aren't kept; bounds are clamped to the current container |
| Desktop icons | Yes | They're the entries of `/home/Desktop` |
| Desktop icon positions | Yes, once moved | `/var/lib/desktop/layout.json`. Icons never moved take the first free cells again |
| Notification history | **No** | NotificationsService `all` is in-memory |
| Clipboard contents | **No** | ClipboardService is in memory, like a real OS clipboard |
| Open dialogs | **No** | DialogsService `stack` is in-memory |
| File Explorer location, filter, window zoom | **No** | In-component state |
| App UI state | Only what the app persists | Settings and Style Guide section, Kernel open cards, Text Viewer wrap (`app.{id}.*`) |
| bfcache restore (`pagehide` with `persisted`) | Everything | Services aren't shut down, so the page comes back as it was |

## Conventions

The rule for persisted service state ([CONVENTIONS → Services](../CONVENTIONS.md#services)) is the file system (ADR-021): config in `/etc/{service}.json`, state in `/var/lib/{service}/`, versioned JSON written through FilesService, with parse and serialize as pure functions beside the service. Always validate on load. Today that's `/etc/settings.json`, `/var/lib/desktop/layout.json` and `/var/lib/session/session.json`. Frequently written files go through `LatestWriter`. Only app storage (`app.{id}.*`) stays in localStorage.

## Wiping

| What | How |
|------|-----|
| Settings | Delete `/etc/settings.json` in File Explorer + reload, or Settings → About → Reset (theme, taskbar and `file_defaults`, no reload). Settings → Default apps clears `file_defaults` alone (one entry or all). Deleting the file without a reload does nothing: the next change rewrites it. |
| Session | Start fresh in the boot dialog, which saves an empty session. Deleting `/var/lib/session/session.json` in File Explorer doesn't stick: the next window change rewrites it. |
| Desktop | Delete shortcuts from the desktop, or anything in `/home/Desktop` from File Explorer. Delete `/var/lib/desktop/layout.json` to forget positions; with an empty `/home/Desktop` too, the next boot seeds the two default shortcuts again. |
| App data | `localStorage` keys `app.{id}.*` (no UI) |
| Files | `kernel.service("files").clear()` (→ `opfs.clear_opfs()`, then rebuilds the empty hierarchy and marker; no UI caller), or DevTools → Application → Storage (the hierarchy comes back on the next boot) |
| SW / caches | No UI. DevTools → Application → Storage. `apply_update()` replaces the precache with the new build's, it doesn't wipe it. |
