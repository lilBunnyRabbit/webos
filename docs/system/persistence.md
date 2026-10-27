# Persistence

Every place the OS stores data in the browser, as of the current code. There's no backend, so this is the whole picture. Verified by grepping `src/` for `localStorage`, `sessionStorage`, `indexedDB`, `navigator.storage` and `caches`.

## Storage map

| Store | Key / path | Owner | Format | Version | Load: sanitize / migrate | When written |
|-------|-----------|-------|--------|---------|--------------------------|--------------|
| OPFS | `/etc/settings.json` | SettingsService (`settings/persistence.ts`) | JSON `{ version, theme, taskbar, file_defaults, wallpaper, saved_themes, appearance, live_options, analytics, speech }`, pretty-printed | `1` | Wrong version → discarded (no migration). Theme merged over Brand Dark, known token keys with string values only. Surface tokens a save predates come from the matching brand palette, else `derive_surfaces()`. Bad taskbar position → `bottom`; `taskbar.pinned` keeps unique strings (ADR-042). `file_defaults` keeps only `".ext" → string` entries. `wallpaper` invalid or missing, or a live id not in the registry → grid preset. `live_options` keeps registered ids, each parsed by its wallpaper's schema field by field. `saved_themes` keeps entries with a non-empty name, first of each name (case ignored), each theme merged like `theme`; missing → `[]`. `speech` missing or bad per field → `voice: null`, `rate: 1`. Parse error → defaults. | `$effect` after every change, 300 ms debounced, plus once right after init when the file differs from what was read, through a write queue (no overlapping writes, newest wins). [Details](services/settings.md#persistence) |
| localStorage | `webos.settings` (legacy) | SettingsService (`take_legacy_settings`) | Same JSON as above | `1` | Imported only when `/etc/settings.json` doesn't exist | Never written. Removed on every boot |
| localStorage | `settings` (v0 React, zustand) | SettingsService (`take_v0_settings`) | `{ state: { theme, taskbar } }` | zustand `0` | Taskbar position; theme only if changed from v0 defaults | Never written. Removed on every boot |
| localStorage | `desktop` (v0 React, zustand) | DesktopService (`take_v0_pins`) | `{ state: { items: { [app_id]: { grid: { x, y } } } } }` | zustand `0` | zod; invalid → default seed | Never written. Read and removed when the desktop is seeded |
| OPFS | `/home/Desktop/*` | DesktopService (reads), the user, `pin()` and seeding (write) | Any file or folder. `.desktop` files are shortcut JSON `{ app_id, props? }` | none | Shortcut zod-validated on read; invalid → shown as a plain file, "Broken shortcut" on open | Seeding on first boot, "Pin to Desktop", and anything the user saves there. [Details](services/desktop.md#persistence) |
| OPFS | `/var/lib/session/session.json` | SessionService (`session/persistence.ts`) | JSON `{ version, windows: [{ app_id, props?, bounds, flags, snap_zone, state? }], frames: { [app_id]: bounds } }`, windows oldest-first in z-order, pretty-printed | `2` (v1 loads without frames) | zod; anything invalid → no session (no dialog) and no frames, overwritten on first save. Unknown app or invalid props → that window skipped at restore, one toast | `$effect` on every window change, through `LatestWriter` (300 ms debounce), but only after the boot restore decision. [Details](services/session.md#persistence) |
| OPFS | `/var/lib/scheduler/jobs.json` | SchedulerService (`scheduler/persistence.ts`, `store.ts`) | JSON `{ version, jobs: [Job] }`, pretty-printed; a job carries its own `armed_at`, `last_fired` and `missed_at` | `1` | zod; missing, broken or another version → empty; an invalid job is dropped alone, a duplicate id keeps the first, unknown keys dropped | Every `schedule`/`update`/`cancel`, a full tab dropping an uninstalled app's jobs, and every leader pass that fires or misses something: read-modify-write under the `webos:scheduler-store` Web Lock through `LatestWriter`, then a BroadcastChannel ping. [Details](services/scheduler.md#registry-and-cross-tab) |
| OPFS | `/etc/offline.json` | StoreService (`store/persistence.ts`) | Before 3.74.0: apps kept offline, `{ version, apps }` | `1` | Read once (not in solo): its apps join `installed.json`, then the file is deleted (ADR-077) | Never written now |
| OPFS | `/var/lib/store/state.json` | StoreService (`store/persistence.ts`) | JSON `{ build, apps: [app id] }`: installed apps whose whole file list is in this build's cache | none (the build stamp) | zod; missing → the old `/var/lib/offline/state.json` once (then `/var/lib/offline` is deleted); invalid or another build → nothing saved, rewritten for this build | After each app is saved (sync task), on uninstall, and at the first boot of a build |
| OPFS | `/var/lib/version/state.json` | VersionService (`version/persistence.ts`) | JSON `{ version, seen }`: the last release this device was told about, pretty-printed | `1` | zod; missing or invalid → first boot, the introduction shows | When the introduction closes (first boot), or at boot when `seen` is older than the running version. Through `LatestWriter`. [Details](services/version.md#persistence) |
| OPFS | `/var/lib/apps/installed.json` | AppsService (`apps/installed.ts`) | JSON `{ version, installed: [app id], system: true }`, sorted, every installed app but the core ones, pretty-printed. `system` says the list covers system apps (ADR-077); a list without it names user apps only, from when every system app was installed | `1` | zod; missing or invalid → not decided yet, so `init()` works out the list again ([apps](services/apps.md#persistence), ADR-040). Unknown ids dropped on load. A list without `system` keeps the system apps past use points to, once; offline that waits, and saves meanwhile omit `system` | Every install and uninstall, and once the full catalogue drops unknown ids, through `LatestWriter` |
| OPFS | `/var/lib/shell/history` | ShellService | Plain text, one command line per line, oldest first | n/a | Empty lines dropped; capped at the last 1000 on read | Every line typed into a session (not shortcut or palette runs), through `LatestWriter`. [Details](services/shell.md#persistence) |
| OPFS | `/var/lib/wallpaper/` | SettingsService (`set_wallpaper_image`) | The current wallpaper image, copied in as `{base36 time}-{name}` | n/a | Anything but the current image is deleted at boot and after each new image | Choosing an image. [Details](services/settings.md) |
| OPFS | `/etc/fonts/` | SettingsService (`use_font`, `remove_font`) | Font files chosen as the UI or code font, copied in under their own name (`.ttc .ttf .otf .woff .woff2`) | n/a | Read when a role loads; a missing or unreadable file puts the role back on the default with a notification. Never pruned | "Use as app font" in Settings, Font Viewer or Font Maker; removed in Settings › Fonts. [Details](services/settings.md#fonts) |
| OPFS | `/var/lib/desktop/additions.json` | DesktopService (`desktop/additions.ts`) | JSON `{ version, applied: [id] }`: default widgets already placed | `1` | zod; invalid → none applied, so the defaults are placed again | After placing default widgets at boot (ADR-034, owner 2026-10-14) |
| OPFS | `/var/lib/desktop/layout.json` | DesktopService (`desktop/layout.ts`) | JSON `{ version, positions: { [entry name]: { x, y } } }`, pretty-printed | `1` | zod: wrong version or shape → no positions (icons take free cells). Stale names pruned on the next move | Seeding, and every icon move |
| OPFS | `/var/lib/desktop/home-layout.json` | MobileDesktopService (`desktop/home-layout.ts`), mobile only | JSON `{ version, order: [entry name] }`, pretty-printed. A legacy `dock` array is appended to the order on load and the file rewritten without it (2026-10-25) | `1` | zod: wrong version or shape → folder order. Stale names pruned on the next change | Seeding on mobile, every reorder and rename, the one-time dock migration. [Details](services/desktop.md#mobile-home) |
| OPFS | `/var/lib/desktop/pew.json` | Pew Pew live wallpaper, Dodge mode (`desktop/live/turrets/dodge.ts`, `dodge.svelte.ts`) | JSON `{ version, best_ms, at }`: the best survival time and when it was set (epoch ms), pretty-printed | `1` | zod; missing or invalid → no best yet. Read when Dodge starts | When a run beats the best: once a second during it and at its end, through `LatestWriter` (500 ms debounce). [Details](shell/desktop.md#dodge) |
| localStorage | `webos.compat.dismissed` | Browser support check (`core/compat/storage.ts`, ADR-067) | JSON array of sorted feature ids | none | Anything but an array of strings reads as empty | Don't show again on the warning screen; cleared by Settings › About › Show the warning. localStorage because OPFS may be the missing feature ([compat](compat.md#dismissal)) |
| localStorage | `app.{app_id}.{key}` | App storage handle (`contexts/app/storage-handle.svelte.ts`), one per window | `JSON.stringify(value)` | none | Optional zod schema on `get()` / `persisted()`. Invalid or corrupt → `null` / `initial`. Without a schema, anything parsed is returned unchecked. | `set()` writes immediately, or updates the live cell. `persisted()` writes via `$effect` on every change, not on creation. |
| OPFS | root of `navigator.storage.getDirectory()`, whole tree: `/home` (user files, with `Desktop`, `Documents`, `Downloads`, `Templates`), `/etc` (OS config), `/var/lib` (OS component state), `/tmp` (with `/tmp/device/`, the picker's "This device…" copies), `/mnt` (empty; mounts are listed there) | FilesService (`files/opfs.ts`, layout in `files/hierarchy.ts`) | Files and folders, as is | n/a | Every boot, `FilesService.init()` recreates missing folders and empties `/tmp`. Once, a flat pre-hierarchy root is moved into `/home` | User and app file operations ([services/files.md](services/files.md)) |
| OPFS | `/tmp/restore/` | BackupService (`backup/backup.ts`, `STAGE_PATH`) | A backup's areas unpacked under their zip paths (`home/`, `etc/`, `var/lib/`) | none | Cleared before staging; a cancel or failure clears it, and the `/tmp` sweep at boot catches anything left | During a restore, before the staged areas are swapped in ([backup](services/backup.md)) |
| OPFS | `/tmp/p2p-transfer/{size}-{name}.part` | `user/p2p-transfer` (`transfer.ts`) | Raw bytes of a half-received file | none | Its size is the resume offset; bigger than the announced size → restart from 0 | While receiving. Moved to `/home/Downloads` when complete; anything left is removed by the `/tmp` sweep at boot |
| OPFS | `/var/lib/apps/catalogue.json` | StoreService writes, AppsService reads at boot (`apps/catalogue.ts`, ADR-077) | Minified JSON `{ version, core, build, release, commit, branch, apps: [catalogue entry] }`: the entries of the installed apps, every system app, and the recent and taskbar-pinned apps (installed or not), sorted by id | `1`, plus `build` | `parse_catalogue`; another build's (every new release, a restored backup) or a missing one makes boot fetch `store/catalogue.json`, and offline the old entries are listed but don't open ([apps](services/apps.md#catalogue-adr-077)) | On every install and uninstall, and on the first boot of a release once this build's catalogue is known, through `LatestWriter` (skipped when the text is the same) |
| OPFS | `/var/lib/apps/usage.json` | AppsService (`apps/active-time.ts`) | Minified JSON `{ version, apps: { [id]: { seconds, last, days } } }`, ids sorted | `1` | zod; missing or invalid → `{}`, an entry without `days` counts one ([apps](services/apps.md#active-time)) | When a stretch of use ends (focus moves, the page hides) and every minute while one runs, 2 s later, re-reading the file and adding this tab's time onto it, through `LatestWriter`. Never leaves the device |
| OPFS | `/var/lib/apps/{app-id}/*.json` | Apps through `storage.file()` / `json_file()` (`contexts/app/json-file.svelte.ts`) | The app's own JSON, pretty-printed | the app's | zod per app; invalid → `initial` + `error`, file kept until the next change | Every change, newest wins via `LatestWriter`, 300 ms debounce (ADR-035). [Details](apps/app-context.md#file-adr-035) |
| OPFS | `/var/lib/apps/warren/history/{doc id}/{epoch ms}-{words}.warren` | `user/warren` (`history-files.ts`) | A whole `.warren` document per snapshot, as saved | the file's own `version` | Names not matching the pattern are ignored; a snapshot is checked by `parse_document` when opened | Every save and every 5 minutes of edits in a saved document; thinned after each write (all of today, one a day for 30 days, one a week after). Removed with the app's data on uninstall. [Details](../apps/warren.md#version-history) |
| OPFS | `/var/lib/games/plays.json` | Game kit (schema in `kit/games/plays.ts`, tracking in `plays.svelte.ts`) | JSON `{ version, games: { [id]: { ms, sessions, last } }, daily: { [day]: { [id]: { ms, score? } } } }`; a per-mode daily keys as `{id}/{mode}` (ADR-050); `score` only from games whose manifest sets `daily_rank` to a score | `1` | zod; invalid → empty, kept until the next change | While a game is visible: every 30 s and on unmount (ADR-035) |
| IndexedDB | database `webos-mounts`, store `mounts` | FilesService (`files/mounts-store.ts`) | `{ name, handle }` per mounted folder, keyed by name; `handle` is a `FileSystemDirectoryHandle` (structured clone, not JSON) | DB version `1` | Read at boot; each handle's `queryPermission` decides connected or locked. A failed load → no mounts, logged | `mount` and `unmount` (ADR-044). [Details](services/files.md#mounts-adr-044) |
| OPFS | `/home/Journal/{name}/` (`journal.json`, `index.bin`, `entries/*.bin`, `media/*.bin`, `inbox/`) | `user/moonrabbit` (`store.ts`, `session.svelte.ts`) | Plain JSON header; every `.bin` is one version byte, a 12-byte IV and AES-GCM ciphertext | `1` (header `version`, `.bin` first byte) | zod on the header and on each decrypted index and entry; a failed GCM tag is "doesn't open" | Made on the first journal (not at boot). Entries and the index on save; the header on create, phrase or recovery change and an iteration upgrade; `inbox/*.bin` (version byte, ephemeral X25519 key, IV, ciphertext) from the widget and capture box while locked, merged into entries and deleted on the next unlock. [Details](../apps/moonrabbit.md) |
| IndexedDB | database `webos.moonrabbit`, stores `keys` (`device`) and `quick` (keyed by journal id) | `user/moonrabbit` (`device.ts`) | A non-extractable HMAC `CryptoKey` (structured clone); quick-unlock records `{ method, wrapped, salt, iterations, credential_id?, shuffle?, attempts, master_at, header_stamp }` | DB version `1` | Read on unlock; a missing record means no quick unlock | Device key on the first quick-unlock setup; a record on setup, each wrong try, each master unlock; deleted on Remove or the fifth wrong try. Never in backups ([details](../apps/moonrabbit.md#quick-unlock-per-device)) |
| OPFS | `/etc/hierarchy.json` | FilesService (`files/hierarchy.ts`) | JSON `{ version }` | `1` | Its absence triggers the root → `/home` migration. The version isn't read | Once, after the migration finishes, and again after `clear()` |
| Storage persistence | `navigator.storage.persist()` | FilesService, requested on first `get_root()` (during `init()`) | Browser permission | n/a | `false` → `console.warn("[FilesService] Storage not persisted")` | Once per page load |
| Cache Storage + service worker | Workbox precache (`sw.js`, `workbox-*.js`, `registerSW.js`): the core only, the files listed in `offline/core.json` (ADR-065, ADR-077: no app, system apps included), plus `index.html`, the icons and the manifest | vite-plugin-pwa (`vite.config.ts`, `registerType: "autoUpdate"`), production only | Workbox-managed | Workbox revisions | Workbox handles it | On SW install/update. `VersionService.apply_update()` installs the new worker before reloading ([services/version.md](services/version.md#service-worker)) |
| Cache Storage | `webos-assets` | The service worker's last `CacheFirst` rule, every other `/webos/assets/` file (`vite.config.ts`, `ignoreVary`), production only; StoreService writes installed apps' files into it too | Apps' chunks (system apps included), CSS and workers as they load, and content (Docs' pages) once read | one cache for every release (ADR-077 stage 3); the per-build `webos-assets-{build}` caches from before are deleted | After a sync, files no installed app and nothing running in the tab lists are deleted ([store](services/store.md#sync)) | On first load of a file, and by StoreService's sync; an uninstall deletes the files only that app's list holds |
| Cache Storage | `webos-wasm` | The service worker's `CacheFirst` runtime rule for `*.wasm` and `*.onnx` (`vite.config.ts`), production only | The codec wasm responses (AVIF, JPEG XL), ONNX Runtime's wasm and Shopping List's two PP-OCRv5 text models | none | Workbox handles it | The first time an app fetches each file; at most 16 entries, oldest evicted. Not deleted by `apply_update()`'s fallback (the name doesn't contain the scope) |
| Cache Storage | `webos-store` | The service worker's `NetworkFirst` rule for `/webos/store/` (`vite.config.ts`), production only | The last `store/catalogue.json`, `store/icons.svg` and `store/changelog.json` fetched | none | Workbox handles it; AppsService ignores a catalogue of another build for running apps | Whenever the full catalogue or the sprite is fetched; at most 4 entries. Not precached |
| Cache Storage | `webos-dictionaries` | The service worker's `CacheFirst` rule for `*.aff` and `*.dic` (`vite.config.ts`), production only | Warren's English Hunspell dictionary (`index.dic`, 186 KB gz; the `.aff` is inlined in the app) | none | Workbox handles it | When Warren's spelling list is first switched on; at most 8 entries. Not precached ([details](../apps/warren.md#spelling-list)) |
| Cache Storage | `webos-fonts` | The service worker's `CacheFirst` rule for `*.ttf` and `*.ttc` (`vite.config.ts`), production only | The built-in Burrow faces, at content-hashed URLs (`src/assets/fonts/burrow/`, `?url` imports) | none (the hash is in the URL) | Workbox handles it | When a built-in font is first chosen; 200 responses only, at most 8 entries. Not deleted by `apply_update()`'s fallback |
| Cache Storage | `webos-mammoth` | The service worker's `CacheFirst` rule for `assets/mammoth-*.js` (`vite.config.ts`), production only | Warren's `.docx` import chunk, left out of the precache by `globIgnores` | none (hashed name) | Workbox handles it | The first `.docx` import; 200 responses only, at most 2 entries. Not deleted by `apply_update()`'s fallback |

Not used anywhere in OS code: `sessionStorage`, cookies. In OS code IndexedDB holds mounted folder handles only (ADR-044); Moonrabbit keeps its device key and quick-unlock records in its own database, outside backups. The URL holds no state: RouterService reads a `#/app/{id}?{props}` deep link once and clears the hash ([router](services/router.md)). A `#/solo/{id}?{props}` link is kept, so a reload reopens the same app (ADR-047); `?platform=` only overrides platform detection.

App storage keys in use today (from a grep of `storage.persisted` / `get` / `set` in `src/lib/apps`):

| Key | App | Value |
|-----|-----|-------|
| `app.calculator.history` | `system/calculator` | Past calculations, capped at 50 |
| `app.alibi.case` | `user/alibi` | Case in progress or last finished: seed, transcript (questions and answers, stopped flags) and accusations; written once the case has a question or an accusation |
| `app.archive.method` | `user/archive` | Compression method (`deflate` / `store`) |
| `app.blocks.{mode,stats}` | `user/blocks` | Last mode; marathon and sprint stats, top five marathon scores |
| `app.calendar.sources` | `user/calendar` | Which sources show on the calendar |
| `app.clock.stopwatch` | `user/clock` | Legacy: the stopwatch before it moved into `/var/lib/apps/clock/clock.json` (2026-10-21). Copied in once when the file has none, then removed |
| `app.color-recall.{level,space,daily}` | `user/color-recall` | Last practice level; the slider space (HSB or OKLCH); the daily attempt `{ day, state }`, so a daily is played once. Before the split (ADR-071) these were `app.color-games.*`, which stay unread |
| `app.colour-atlas.{dex,daily}` | `user/colour-atlas` | Collected models, model id → best ΔE2000; the daily attempt `{ day, state }` (each submitted round's slider values and the time), so a daily is played once |
| `app.crack-the-code.{stats,daily,game,length}` | `user/crack-the-code` | Stats per code length; daily case; case in progress; last length |
| `app.dev-tools.state` | `user/dev-tools` | Last section and inputs (texts over 20,000 characters skipped; a JWT secret is never saved) |
| `app.diff.{collapse,ignore-whitespace,wrap}` | `user/diff` | View toggles |
| `app.doodlehop.best` | `user/doodlehop` | Best round `{ recognised, ms }`: most words, then least drawing time |
| `app.example.count` | `user/example` | Counter (`number`) |
| `app.futoshiki.{stats,daily,game,size}` | `user/futoshiki` | Stats; daily puzzle; game in progress; last size |
| `app.game-hub.sort` | `user/game-hub` | Library sort |
| `app.gradient-sort.{level,daily}` | `user/gradient-sort` | Last practice level; the daily attempt `{ day, state }` |
| `app.hex-guess.daily` | `user/hex-guess` | The daily attempt `{ day, state }` |
| `app.hop.{stats,daily,game,size}` | `user/hop` | Stats per size; daily puzzle; path in progress; last size |
| `app.image-editor.quality` | `user/image-editor` | Export quality (10–100) |
| `app.image-tools.sprite-settings` | `user/image-tools` | Sprites section grid settings |
| `app.image-tools.test-image` | `user/image-tools` | Test image section: pattern, markings, size and format |
| `app.image-tools.fit` | `user/image-tools` | Fit section: size limit (preset or custom), format, max side |
| `app.image-tools.poster` | `user/image-tools` | Poster print section: paper, orientation, sheets across, overlap, margin, crop marks, map |
| `app.hutches.{stats,daily,game,size,auto-cross}` | `user/hutches` | Stats per size; daily puzzle; game in progress; last size; auto-cross switch |
| `app.jigsaw.{game,pieces}` | `user/jigsaw` | Puzzle in progress (picture path, seed, piece positions, time; only for a picture from WebOS files); last piece count |
| `app.kakuro.{stats,daily,game,size}` | `user/kakuro` | Stats; daily puzzle; game in progress; last size |
| `app.markdown-pdf.settings` | `user/markdown-pdf` | Page and print settings |
| `app.maze.{prefs,best_ms}` | `user/maze` | Last algorithm/size/speed/solver; best play time per size |
| `app.moonrabbit.{journal,idle-minutes,hidden-seconds}` | `user/moonrabbit` | Last journal's folder name; auto-lock after idle (minutes, 0 = never) and when hidden (seconds) |
| `app.minesweeper.{difficulty,custom,stats}` | `user/minesweeper` | Last difficulty, last custom board, played/won/best times |
| `app.music-visualizer.{mode,volume,smoothing,sensitivity}` | `user/music-visualizer` | Visualizer settings |
| `app.nonogram.{stats,stats-color,size,mode,game}` | `user/nonogram` | Stats per mode; last size and mode; game in progress |
| `app.nurikabe.{stats,daily,game,size}` | `user/nurikabe` | Stats; daily puzzle; game in progress; last size |
| `app.odd-one-out.daily` | `user/odd-one-out` | The daily attempt `{ day, state }` |
| `app.paint.{tool,size,tolerance,fill_mode,primary,secondary,recent}` | `user/paint` | Tool settings, colours, 8 recent colours |
| `app.plots.{stats,daily,game,size}` | `user/plots` | Stats per size; daily puzzle; plots in progress; last size |
| `app.pdf-tools.{sign,export,images,test-pdf}` | `user/pdf-tools` | Sign ink and date option; Export, Images and Test PDF section settings |
| `app.qr-reader.entries` | `user/qr-reader` | Scanned codes with PNG thumbnails, the 50 newest |
| `app.quick-notes.notes-status` | `user/quick-notes` | Notes status filter |
| `app.recorder.{screen_mic,photo_format}` | `user/recorder` | Mic with screen recording; photo format |
| `app.rng-tools.{section,number,dice.notation,list,password,coin.tally,draws}` | `user/rng-tools` | Last section and per-section settings; coin tally; Draws presets |
| `app.snake.{speed,wrap,high_scores}` | `user/snake` | Last mode; high score per speed and wall mode |
| `app.solitaire.{stats,draw}` | `user/solitaire` | Stats; draw one or three |
| `app.soundboard.{volume,mode}` | `user/soundboard` | Volume and play mode |
| `app.speed-reader.{settings,positions}` | `user/speed-reader` | WPM, context words, pause; reading position per file path (50) |
| `app.sudoku.{stats,stats-6x6,daily,daily-6x6,game,difficulty,size}` | `user/sudoku` | Stats per size (9×9 keeps the unsuffixed key); daily puzzle per size; game in progress (with its size); last difficulty and size |
| `app.tic-tac-toe.{stats,mode}` | `user/tic-tac-toe` | Win/loss/draw counts; last mode |
| `app.time-since.sort` | `user/time-since` | Counter sort |
| `app.twenty-forty-eight.{best,game}` | `user/twenty-forty-eight` | Best score; game in progress with its undo step |
| `app.unsaid.best` | `user/unsaid` | Lowest round score (`number` or `null`) |
| `app.unit-converter.last` | `user/unit-converter` | Last quantity and units per quantity |
| `app.warren.{groups,smart,units,marks,spelling,ignored,dictionary}` | `user/warren` | Open sidebar groups; smart punctuation on or off; margin units; ¶ marks; the spelling list on or off; words ignored in every document (lower case); the personal dictionary, also fed to the spell checker ([details](../apps/warren.md#spelling-list)) |
| `app.word-search.{stats,daily,game,difficulty}` | `user/word-search` | Stats; daily puzzle; game in progress; last difficulty |
| `app.letterer.{stats,variant,game,daily}` | `user/letterer` | Stats per mode and length; last mode, length, boards and hard mode; game in progress; daily word |
| `app.work-hours.last_target` | `user/work-hours` | Last monthly target, offered as the default |

Keys read through `storage.persisted()` share one live value across every window of the app. Keys read once with `get` and written with `set` (Dev Tools, Unit Converter, Image Tools Sprites, RNG Tools section, the puzzle games' size, difficulty and saved game, Letterer's mode and saved game, Maze prefs, Minesweeper and Snake picks) seed a new window from the last one but don't sync open windows. Per-window state (`storage.window()`) is saved with the session, not here.

## App storage handle

Created per window by the window frame (`window.svelte`, `mobile/mobile-window.svelte`, `solo/solo-window.svelte`: `create_storage_handle(app_id, instance.app.state)`) and exposed as `get_app_context().storage` (ADR-003). Every key is prefixed `app.{app_id}.`. The key belongs to the app, not the window.

```ts
interface StorageHandle {
  get<T>(key: string, schema?: ZodType<T>): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  /** Must be called during component init: it uses `$effect` to save. */
  persisted<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
  /** This window only; saved with the session, not in localStorage. */
  window<T>(key: string, initial: T, schema?: ZodType<T>): { value: T };
  /** `/var/lib/apps/{app_id}/{name}`, shared by every window (ADR-035). */
  file<T>(name: string, initial: T, schema: ZodType<T>): Omit<JsonFile<T>, "release">;
}
```

- **Shared cells.** A module-level `Map<fullKey, PersistedCell>` holds one reactive cell per key. All windows of an app that call `persisted("x")` get the **same** `{ value }` object, so they stay in sync live. The first caller's `initial` and schema win. Each call retains the cell, and the caller's `$effect` teardown releases it. The last release disposes the cell's save effect and removes it from the map.
- **Save.** The cell's `$effect.root` saves `$state.snapshot(value)` whenever it changes. The first run compares the value with the JSON it loaded (`initial` when the key was missing or invalid) and writes only if it differs, so opening a window writes nothing; a change made before that run is still saved. After that, every change writes.
- `set(key, v)` goes through the live cell if there is one, so the cell's effect saves it. Otherwise it writes straight to localStorage.
- `get(key)` always reads localStorage, **not** the live cell. Right after a `cell.value = …`, before effects flush, `get()` returns the previous value.
- `remove(key)` removes the localStorage entry and resets a live cell to a `structuredClone` of its `initial` without writing it, so every window shows `initial` and the key stays absent until the next change. The cell keeps its own clone of `initial` from creation, so edits to the live value never leak into the reset target.
- Write and remove failures go to `console.error` (`Failed to save app.x.y:` / `Failed to remove app.x.y:`).
- No cross-tab sync. There's no `storage` event listener.
- Uninstalling a user app keeps its `app.{id}.*` keys unless the user also asks to delete its data (`apps.uninstall(id, { data: true })`, ADR-040), which removes them and `/var/lib/apps/{id}/` except its `achievements.json` (ADR-078). Removing an app from the code leaves its keys behind.

## What survives a reload

| Thing | Survives? | Notes |
|-------|-----------|-------|
| Theme, saved themes, taskbar position and pins, Open-with defaults, wallpaper, live wallpaper options, app fonts, speech voice and speed | Yes | `/etc/settings.json`, the image in `/var/lib/wallpaper/`, the font files in `/etc/fonts/` |
| App data stored via `storage` | Yes | `app.{id}.*` |
| Files and folders | Yes | OPFS. Lasts longer if `persist()` was granted. The browser may evict it otherwise. |
| `/tmp` contents | **No** | Emptied at every boot, `/tmp/device/` included |
| Mounted folders | Yes, locked | The handle survives in IndexedDB; access must be granted again with Reconnect (a click). The folder's files are on the disk, not in WebOS |
| Directory revisions | **No** | In-memory `SvelteMap` in FilesService |
| Open windows: app, props, bounds, z-order, maximized/minimized, snap zone | Yes, if the user picks Restore | `/var/lib/session/session.json`, offered by a dialog at boot. Apps with manifest `restore: false` are left out. Window ids, `created_at` and the `debug` flag aren't kept; bounds are clamped to the current container |
| Where each app's windows open (its last closed window's frame) | Yes, always | `frames` in `/var/lib/session/session.json`, recorded on close (ADR-014 revision) |
| Recently closed windows (Alt+Shift+T) | No | SessionService memory, last 10 |
| Desktop icons | Yes | They're the entries of `/home/Desktop` |
| Desktop icon positions | Yes, once moved | `/var/lib/desktop/layout.json`. Icons never moved take the first free cells again |
| Scheduled alarms, timers and reminders | Yes | `/var/lib/scheduler/jobs.json`. What came due while every tab was closed is summed up as missed at the next boot; the in-memory `missed` list and the app badge count don't survive ([scheduler](services/scheduler.md#missed)) |
| Notification history | **No** | NotificationsService `all` is in-memory |
| Clipboard contents | **No** | ClipboardService is in memory, like a real OS clipboard |
| Open dialogs | **No** | DialogsService `stack` is in-memory |
| File Explorer location, filter, window zoom | **No** | In-component state |
| App UI state | Per window, through session restore | `storage.window()`: Settings, Activity Monitor and Style Guide section, Kernel open cards, Text Editor wrap and Markdown view, saved as `state` in `/var/lib/session/session.json`. SessionService's `init()` removes the old shared keys (`app.settings.section`, `app.activity-monitor.section`, `app.style-guide.section`, `app.kernel.expanded`, `app.text-viewer.wrap`; `LEGACY_VIEW_KEYS` in `session/persistence.ts`) on every boot |
| bfcache restore (`pagehide` with `persisted`) | Everything | Services aren't shut down, so the page comes back as it was |

## Conventions

The rule for persisted service state ([CONVENTIONS → Services](../CONVENTIONS.md#services)) is the file system (ADR-021): config in `/etc/{service}.json`, state in `/var/lib/{service}/`, versioned JSON written through FilesService, with parse and serialize as pure functions beside the service. Always validate on load. Today that's `/etc/settings.json`, `/etc/fonts/` (font files), `/var/lib/desktop/{layout,home-layout,additions,pew}.json`, `/var/lib/session/session.json`, `/var/lib/version/state.json`, `/var/lib/scheduler/jobs.json`, `/var/lib/store/state.json`, `/var/lib/apps/installed.json`, `/var/lib/apps/catalogue.json`, `/var/lib/apps/usage.json`, `/var/lib/apps/{id}/achievements.json` ([achievements](services/achievements.md#persistence)), `/var/lib/shell/history` (plain text), `/var/lib/wallpaper/` (the image itself) and `/var/lib/games/plays.json`; app data lives in `/var/lib/apps/{id}/`. Frequently written files go through `LatestWriter`. Only app storage (`app.{id}.*`) stays in localStorage. App data bigger than settings goes in `/var/lib/apps/{app-id}/` through `storage.file()` (ADR-035).

## Backups

BackupService (ADR-037, [backup](services/backup.md)) zips three areas into one `webos-backup-YYYY-MM-DD.zip` on the device, never in OPFS: Files (`/home` → `home/`), Settings (`/etc` → `etc/`) and App data (`/var/lib` → `var/lib/`, plus every `app.*` localStorage key in `backup.json`). `/tmp`, `/mnt` (mounted folders and their handles), the service worker caches and the legacy localStorage keys never go in. Restore replaces each area the zip holds and leaves the rest alone, then reloads. `backup.json` carries `format: 1`; a newer format is refused.

## Wiping

| What | How |
|------|-----|
| Settings | Delete `/etc/settings.json` in File Explorer + reload, or Settings → Backup & reset → Reset… (asks first; resets taskbar, theme, `file_defaults`, wallpaper, appearance and `live_options`, keeps saved themes, fonts and files, no reload). Settings → Default apps clears `file_defaults` alone (one entry or all). Deleting the file without a reload does nothing: the next change rewrites it. |
| Session | Start fresh in the boot dialog, which saves an empty session. Deleting `/var/lib/session/session.json` in File Explorer doesn't stick: the next window change rewrites it. |
| Desktop | Delete shortcuts from the desktop, or anything in `/home/Desktop` from File Explorer. Delete `/var/lib/desktop/layout.json` to forget positions; with an empty `/home/Desktop` too, the next boot seeds the two default shortcuts again. |
| App data | Uninstall a user app with its data (Uninstall… in the App Store, the start menu, the desktop, or the phone home and its app list): its `app.{id}.*` keys and `/var/lib/apps/{id}/`, achievements kept ([apps](services/apps.md#public-api)). System apps' keys have no UI |
| Restore a backup | Settings → Backup & reset → Restore…, or `backup restore`: replaces `/home`, `/etc`, `/var/lib` and the `app.*` keys for each area the backup holds, then reloads ([backup](services/backup.md)) |
| Files | `kernel.service("files").clear()` (→ `opfs.clear_opfs()`, then rebuilds the empty hierarchy and marker; no UI caller), or DevTools → Application → Storage (the hierarchy comes back on the next boot) |
| Scheduled jobs | `sched rm <job>` one at a time, or each app's own delete (Clock's alarms and timers, Recipe Box's Stop, Pomodoro's Reset and Skip, Calendar's Delete and removing an event's reminder). Uninstalling an app drops its jobs. Deleting `/var/lib/scheduler/jobs.json` empties the registry on the next re-read ([scheduler](services/scheduler.md#registry-and-cross-tab)) |
| SW / caches | No UI. DevTools → Application → Storage. `apply_update()` replaces the precache with the new build's, it doesn't wipe it. |
