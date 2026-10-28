# AppsService

Key `apps` · Depends on: `windows`, `notifications`, `files`, `settings`, `dialogs` · ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [022](../../adrs/022-desktop-folder.md) (shortcuts), [023](../../adrs/023-session-persistence.md) (`create_instance`, manifest `restore`), [040](../../adrs/040-installed-apps.md) (installed apps), [047](../../adrs/047-solo-app-open.md) (solo), [049](../../adrs/049-lazy-app-metadata.md) (meta), [077](../../adrs/077-app-store.md) (catalogue, stage 2), [085](../../adrs/085-app-guides.md) (guides, first open) · Source: `src/lib/core/api/services/apps/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The app registry. Holds every app the catalogue names (ADR-077): boot knows only the installed apps' entries, the rest arrive with the full catalogue, and each app's manifest code loads on its own. It holds which apps are installed (the core apps always are), launches an app into a new window with validated props, and resolves a file path to the app that should open it. A `.desktop` shortcut file resolves to the app it points at.

| File | Contents |
|------|----------|
| `type.ts` | `AppsService` interface, `AppManifest`, `AppDefinition`, `AppConfig`, `AppInstance`, `OpenOptions`, `AppsFilter`, `UninstallOptions`, `AppCategory`, `AppProps`, `AppMeta`, `AppListing`, `AppAuthor`, `AppPitch`, `AppHighlight`, `DailyRank` (re-exported by the games kit, ADR-048), `WidgetSize`, `WidgetSizeLimits`, `WidgetProps` |
| `helpers.ts` | `define_app()`, `FILE_PROPS`, `CORE_APPS` and `is_core_app()` (App Store, Settings, File Explorer, Terminal: always installed, never uninstalled, ADR-077) |
| `authors.ts` | `OWNER`, `app_authors()`, `author_link()`, `author_names()`, `credits()`, `Credit`: who made an app (the meta's `authors`, else the owner) |
| `associations.ts` | Pure matching: `file_extension()`, `association_tier()`, `best_apps_for()`, `apps_for()`, `tools_for()` |
| `shortcut.ts` | `.desktop` shortcut files: `SHORTCUT_EXTENSION`, `Shortcut`, `parse_shortcut()`, `serialize_shortcut()`, `shortcut_label()` (ADR-022) |
| `widget.ts` | `.widget` files: `WIDGET_EXTENSION`, `WIDGET_FALLBACK_SIZE`, `WidgetFile`, `widget_size_schema`, `parse_widget()`, `serialize_widget()`, `widget_label()`, `clamp_widget_size()`, `initial_widget_size()` (ADR-034) |
| `search.ts` | App search and grouping for the start menu, the mobile app list and App Store: `search_apps()` (supplies each app's fields to `search_ranked` from `core/utils/search.ts`, the ranker Settings' search shares), `group_apps()`, `APP_CATEGORY_LABELS`, `AppSection`; re-exports `within_one_edit()` |
| `letters.ts` | `LETTERS` (`#`, A–Z) and `group_by_letter()`: the phone's letter rail and full list file each app under its name's first letter, accents folded, anything else under `#` |
| `sentence.ts` | Lazy: the sentence search ([below](#sentence-search)). `build_sentence_index()`, `rank_sentence()`, `query_terms()`, `stem()`, `suggest_keywords()` and `suggest_messages()` (on-device AI). Imported only by `components/apps/sentence-search.svelte.ts` and `app find`, never at boot |
| `shell.ts` | `apps_shell()`: the service's shell contribution (see [Shell](#shell)) |
| `installed.ts` | `INSTALLED_PATH`, `parse_installed()`, `serialize_installed()` (ADR-040); `CATALOGUE_PATH` (ADR-077) |
| `catalogue.ts` | `CatalogueApp`, `Catalogue`, `CatalogueData`, `LAZY_PARTS`, `manifest_data()`, `json_safe()`, `parse_catalogue()`, `parse_catalogue_text()`, `serialize_slice()`. Plain data and functions, no `$lib` imports: `tooling/vite-plugin-catalogue.ts` imports it, so the build, the dev server and tests describe an app with the same function |
| `source.ts`, `glob-source.ts` | `CatalogueSource` and its two implementations: `bundle_source()` (the built site) and `glob_source(manifests)` (dev server and tests, its own module so the dev build stamp it reads never reaches a build); `catalogue_source()` picks one by `import.meta.env.DEV` ([below](#catalogue-sources)) |
| `recent.ts` | `RECENT_PATH`, `RECENT_LIMIT` (16), `parse_recent()` (tolerant: a broken file is `[]`, non-string and repeated entries drop out), `serialize_recent()`, `with_recent(ids, id)` (moves `id` to the front, capped) |
| `favourites.ts` | `FAVOURITES_PATH`, `parse_favourites()` (tolerant like `parse_recent`, no cap), `serialize_favourites()`, `with_favourite(ids, id)` (appends once), `without_favourite()`, `moved_favourite(ids, shown, id, index)` (`index` counts the shown list; saved ids that aren't shown keep their neighbours). Unit tests in `favourites.test.ts` (ADR-083) |
| `usage.ts` | `used_apps(manifests, signals)`: the apps past use points to, for the one-time tidy |
| `active-time.ts` | `USAGE_PATH`, `AppUsage`, `parse_usage()` (tolerant: a broken file is `{}`), `serialize_usage()`, `add_time(usage, id, seconds, now)` (adds a stretch, stamps `last`, counts a new local day once), `format_usage()` ("under a minute", "25 min", "1.5 h", "12 h") (the App Store's goals became AchievementsService's built-in achievements, ADR-078). Unit tests in `active-time.test.ts` |
| `active-time.svelte.ts` | `ActiveTime`, the tracker ([below](#active-time)) |
| `suggestions.ts` | `INTERESTS` and `interest_apps()`: the intro's "What are you into?" groups, installed when picked. The intro hides a group with none of its apps registered |
| `test-apps.ts` | Tests only: `EXAMPLE_APP`, `TEST_APPS` and `TestAppsService`, whose glob source holds the system apps and these, so core tests don't depend on user apps |
| `service.svelte.ts` | The class |
| `solo.svelte.ts` | `SoloAppsService`, registered instead in solo mode (see [Solo mode](#solo-mode)) |

Manifest fields are documented in [apps/manifest.md](../apps/manifest.md). The full launch path, window included, is in [apps/lifecycle.md](../apps/lifecycle.md).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `registry` | `Map<string, AppManifest>` (a `SvelteMap`) | Public on the class, not on the interface. Reactive. Every known app: its manifest once its code loaded, a [stub](#stubs) until then |
| `complete` | `boolean` | Public on the class. `$state`: the full catalogue of this build arrived |
| `list(filter?)` | `(filter?: { installed?: boolean; all?: boolean }): IterableIterator<[AppId, AppManifest]>` | Iterator over `registry`, insertion order. `installed: true` only installed apps (the start menu, the mobile home and app list, `app list`), `false` only the others (search's Not installed group). `all: true` also starts `catalogue()` (in a microtask, since it's read inside `$derived`) when not every app is known; the reactive list grows when it lands (Docs' home map and app atlas) |
| `is_installed(id)` | `(id: AppId): boolean` | The core apps (`CORE_APPS`) always; other system apps like user apps; unknown ids never. Reactive |
| `install(ids)` | `(ids: AppId \| AppId[]): AppId[]` | Adds the ones not installed yet, saves, returns them. No toast |
| `uninstall(id, options?)` | `(id: AppId, options?: { data?: boolean }): Promise<void>` | Throws for core and unknown apps. Unpins it from the taskbar's quick launch (ADR-042) and drops it from the favourites (ADR-083). `data` also deletes `app.{id}.*` localStorage and `/var/lib/apps/{id}/`, except `achievements.json` when there is one (the folder stays with only that file, its `progress` emptied under the achievements lock since the running totals went with the data, ADR-078), then awaits the manifest's `on_uninstall_data` if it has one (a throw is logged and toasted "Some of {App}'s data is left"; the uninstall stands). Windows and desktop entries are the caller's: `uninstall_app()` in `components/apps/app-actions.ts` asks (`uninstall-dialog.svelte`, with the "Also delete its saved data" checkbox), closes the app's windows through the guarded close (a kept dirty window cancels), removes its desktop shortcuts and widgets, then calls this and toasts |
| `get(id)` | `(id: AppId): AppManifest \| undefined` | The manifest, or the stub while its code hasn't loaded. `undefined` for an app the device doesn't know yet: call `catalogue()` first where that matters |
| `catalogue()` | `(): Promise<boolean>` | Fetches the full catalogue once and registers every app in it. `true` when this build's catalogue is known; `false` offline with no copy, or with another build's copy, whose apps are listed but can't open. A later call tries again. [Catalogue](#catalogue-adr-077) |
| `load(id)` | `(id: AppId): Promise<AppManifest \| undefined>` | The manifest with its code (one import per app, shared). Rejects when the chunk can't load or the entry is another build's |
| `refresh(newer_than?)` | `(newer_than?: number): Promise<AppId[]>` | An app-only update ([below](#app-only-updates-stage-3)): fetches the catalogue and takes it when it's a newer build of the running core. Skips the fetch when `newer_than` isn't newer than the catalogue held. Resolves to the apps whose version changed |
| `last_update` | `AppsUpdate \| null` | `$state.raw`: `{ build, changed, swapped }` of the last catalogue taken on this core. StoreService follows it |
| `header` | `CatalogueHeader \| null` | `$state.raw`: the held catalogue of the running core without its apps (`core`, `build`, `release`, `commit`, `branch`), set when one is read or taken, moved by `adopt()`. The running release: VersionService's `info` derives from it, since the bundle carries none (ADR-077 revision 2026-10-27). `null` while only another core's slice is known |
| `update_ready(id)` | `(id: AppId): boolean` | Open windows run an older version than the app's entry. Reactive |
| `restart(id)` | `(id: AppId): Promise<boolean>` | Restart app: loads the new version's manifest and component first (a failure toasts "Couldn't update {App}" / "… It stays on the version it has." and closes nothing, `false`), snapshots the app's windows (`snapshot_window`, the session's), closes them through the guarded close, dirty ones first so every "Save changes?" comes before a clean window closes (a kept one reopens the ones already closed, on the version they had, `false`), then reopens them all on the new version with the same props, frames, flags, window state and order. Never rejects |
| `restarting(window_id)` | `(window_id: WindowId): boolean` | The window was closed by `restart()` to reopen. SessionService leaves it out of the closed list |
| `files_in_use()` | `(): Set<string>` | `files` and `content` of the installed apps' entries and of every app whose code runs here (its old entry while an update waits). StoreService prunes against it |
| `installed_catalogue()` | `(): Catalogue \| null` | The installed apps' entries plus every system app's and those of recent and taskbar-pinned apps (both work without installing), for `/var/lib/apps/catalogue.json`; `null` while an installed one isn't known or is another core's. Another core's system, recent or pinned entries (a core update waits) are left out instead. Reactive. StoreService writes it |
| `register(manifest)` | `(manifest: AppManifest): void` | An app whose code is already here (tests' stand-ins): its entry comes from `manifest_data`, without meta. Same id overwrites silently. No `unregister` |
| `launch(id, props?)` | `(id: AppId, props?: unknown): WindowId \| null` | An id no app has opens the app that [replaces](#replaced-app-ids-adr-071) it; throws `App ${id} not found` when none does. An app that isn't installed opens without installing, quietly (ADR-077); Install is in the App Store, search, and the taskbar item and switcher card menus. Always opens a new window, at once even before the app's code is here, except for another core's app while a core update waits: it toasts "Update WebOS to open {App}", opens nothing, records nothing and returns `null` |
| `create_instance(id, props?, state?)` | `(id: AppId, props?: unknown, state?: Record<string, unknown>): AppInstance \| null` | The instance `launch()` would open, without a window and without toasts; `null` until the app's code has loaded (`load(id)` first). Used by session restore. See below |
| `open(path, options?)` | `(path: string, options?: OpenOptions): Promise<WindowId \| null>` | File → app resolution, below |
| `meta(id)` | `(id: AppId): Promise<AppMeta>` | The app's text from its catalogue entry, `{}` without any; an unknown id fetches the catalogue first. [App text](#app-text) |
| `listings(filter?)` | `(filter?: AppsFilter): AppListing[]` | Every known app (or the installed / not installed ones, like `list`), its manifest or stub merged with its entry's text, `daily` and `achievement_count` (ADR-078). Reactive. [App text](#app-text) |
| `recent` | `readonly AppId[]` (getter) | Apps `launch()` opened lately, newest first, each once, at most 16, except the four core apps (always listed). Installed or not: opening isn't installing (ADR-077), and the boot slice keeps their entries so they stay listed after a reload. Reactive. [Recent apps](#recent-apps) |
| `clear_recent()` | `(): void` | Empties the list and saves it |
| `favourites` | `readonly AppId[]` (getter) | The user's favourite apps in their order, installed ones only. Reactive. [Favourite apps](#favourite-apps-adr-083) |
| `favourite(id, on)` | `(id: AppId, on: boolean): void` | Adds an installed app at the end (an app not installed is ignored), or removes it; saves when the list changed |
| `move_favourite(id, index)` | `(id: AppId, index: number): void` | Moves a favourite to `index` of `favourites` counted without it, and saves |
| `usage(id)` | `(id): AppUsage \| null` | `{ seconds, last, days }`: time the app was in front, when it last was (ISO) and on how many local days. `null` before its first use. Reactive. [Active time](#active-time) |

`OpenOptions` is `{ anchor?: Position }`: the viewport point the "Open with" dropdown anchors to.

Pure helpers, exported from the barrel:

| Function | Behaviour |
|----------|-----------|
| `file_extension(name)` | `"Notes.TXT"` → `".txt"`. Lowercased. A dotfile is its own extension (`.env` → `".env"`). Returns `""` only when there's no dot |
| `association_tier(entry, file)` | `3` exact extension, `2` exact MIME, `1` MIME wildcard (`image/*`), `0` no match. Case-insensitive. Empty `file.type` never matches a MIME entry |
| `best_apps_for(apps, file)` | Every app tied on the highest non-zero tier, in iteration order. `[]` when nothing matches |
| `apps_for(apps, file)` | Every app with a tier above 0, best tier first, then by name. Feeds File Explorer's "Open with" submenu (ADR-025), shown when two or more apps qualify |
| `tools_for(apps, file)` | Apps whose `tools` match the file at any tier and whose `associations` don't, sorted by name. `open_with_items` appends them after a separator. `open()` never looks at `tools` |
| `parse_shortcut(text)` | `Shortcut \| null`. See [Shortcuts](#shortcuts-desktop-files) |
| `serialize_shortcut(shortcut)` | Pretty-printed JSON |
| `shortcut_label(file_name)` | `"Settings.desktop"` → `"Settings"`. Strips the last 8 characters without checking them |

`SHORTCUT_EXTENSION` (`".desktop"`) and the `Shortcut` interface are exported too.

`replaces.ts` (not in the barrel; AppsService, RouterService and StoreService import it):

| Function | Behaviour |
|----------|-----------|
| `resolve_replaced(manifests, id, props)` | `{ id, props } \| null`: the app whose `replaces` entry names `id` and whose entry props all equal the given ones, the entry naming most props winning; an entry without props matches anything. The returned props drop the matched keys (`undefined` when nothing is left). `null` when no entry matches |
| `replacing_apps(manifests, id)` | Every app with a `replaces` entry for `id`, in registry order |
| `current_ids(manifests, ids, known)` | Saved ids as today's: a known id stays, an unknown one becomes `replacing_apps`, deduplicated |

## Shortcuts (`.desktop` files)

A shortcut is a file whose `file_extension()` is `.desktop` (any case) and whose body is JSON:

```ts
interface Shortcut { app_id: AppId; props?: AppProps }
// zod: { app_id: z.string().min(1), props: z.record(z.string(), z.unknown()).optional() }
```

```json
{ "app_id": "text-editor", "props": { "path": "/home/notes.md" } }
```

`parse_shortcut` returns `null` for bad JSON or a failed schema, never throws. Unknown keys are stripped. `app_id` isn't checked against the registry there; `open()` does that. `props` must be an object, and the target app's own schema validates it at launch.

Who reads and writes them: `open()` (below), DesktopService (lists, writes on pin and first-boot seed; [desktop](desktop.md)), and File Explorer's `file-row.svelte`, which parses each `.desktop` row to draw `ShortcutIcon` with the target's icon ([files](files.md#file-explorer-components)).

## State

- `registry`, filled in `init()` from the catalogue ([below](#catalogue-adr-077)), a manifest or stub per entry.
- `entries`, a private `SvelteMap` of `CatalogueApp`, and `code`, a private `SvelteMap` of the manifests whose chunk loaded; `loading` (the import in flight per app), `failed` (a load failed: the tile stops pulsing; coming online retries installed ones), `failures` (failed manifest loads per app, the next load's `attempt`, so it asks for a fresh URL; a failed new version in `restart` counts too) and `foreign` (entries from another build's catalogue, listed and never run).
- `installed`, a private `SvelteSet` of installed app ids other than the core apps (which are never stored), filled by `init()`. `provisional`, a private `SvelteSet`: optional system apps an offline boot counts as installed until the move to core apps can run, never saved.
- `restarted`, a private `Set` of the window ids `restart()` closed (`restarting()`).
- `recent_ids`, a private `$state.raw` `AppId[]`: the recent list as saved, newest first; `recent_listed`, a private `$derived` of it keeping any registered app but the core ones (installed or not, since opening isn't installing), is what `recent` returns.
- `favourite_ids`, a private `$state.raw` `AppId[]`: the favourites as saved, in order; `favourites_listed`, a private `$derived` keeping the installed ones, is what `favourites` returns.
- `active_time`, a private `ActiveTime` holding the usage record (`$state.raw`), read by `usage()` ([Active time](#active-time)).
- `all_listings`, a private `$derived` over `registry` and `entries`: each manifest or stub merged with its entry's text and `daily`. `listings()` returns it, filtered when asked.

The constructor only wires `$derived` references to its five dependencies. `destroy()` removes the `online` listener and the idle callback.

### `init()`: the installed list (ADR-040)

1. `/var/lib/apps/installed.json` parses → load it through `current_ids`: an id an app [replaces](#replaced-app-ids-adr-071) becomes every app replacing it, any other unknown id drops. Only with the full catalogue: booted from the installed slice, every id stays, since an id the slice lacks isn't unknown (and `init()` then fetches the catalogue in the background to list it). The file isn't rewritten; the next install or uninstall saves the mapped list. A list without `"system": true` is from before ADR-077's core apps, when every system app was installed: `keep_used_system_apps()` installs the optional system apps the signals of step 3 point to (their commands loaded for this one pass) and saves, once. Without the full catalogue (offline) they all count as installed for that boot (`provisional`), never saved: until the move runs, every save leaves them out and omits `"system": true`, so a later boot with the catalogue still runs it. Installing one saves it. Done. Once the full catalogue arrives (at boot or later, in `fetch_catalogue` and `refresh`), `drop_unknown()` maps the set through `current_ids` again: an id no app has and none replaces drops and the list is saved, so the next boot doesn't fetch the catalogue for it again.
2. Missing or invalid, and no `/var/lib/version/state.json` (a first boot) → only the core apps, quietly. The intro's interests page installs the rest (`INTERESTS` in `suggestions.ts`).
3. Missing, but the version state exists (a device from before installed apps) → `catalogue()` (skipped offline), then a one-time tidy: install only the apps `used_apps()` finds, and toast "Tidied N apps you never opened" with **Undo** (install everything) and **App Store**. Signals: window frames and saved windows in `session.json`, desktop `.desktop` / `.widget` targets, `app.{id}.*` localStorage keys, folders in `/var/lib/apps/`, app commands in the shell history (any pipe stage, `sudo` stripped), matched against ids from `command_apps()`, which loads every app's `commands.ts` for this one pass, and `settings.file_defaults`. Nothing records use after this; there is no rolling tidy.
4. Steps 2 and 3 save the list.

Before any of that, `init()` reads the catalogue ([below](#catalogue-adr-077)). After it, `load_recent()` reads the recent list ([below](#recent-apps)), `load_favourites()` the favourites ([below](#favourite-apps-adr-083)), replaced ids in pins and file defaults are mapped (full catalogue only), an `online` listener retries a wanted catalogue and failed installed apps' code, and `on_idle` starts loading every installed app's manifest.

## Lifecycle

Constructed by the kernel after its dependencies. Nothing registers in the constructor. Boot imports no manifest: `$lib/apps` (the glob) is imported only by the dev server's and tests' source, after the barrel has finished initializing.

## Persistence

`/var/lib/apps/installed.json`: `{ "version": 1, "installed": AppId[], "system": true }`, sorted, every installed app but the core ones, written through a `LatestWriter` on every change. `system` marks a list that covers system apps (ADR-077); it's left out while a list from before still waits for the move (offline boots).

`/var/lib/apps/catalogue.json` (ADR-077): `{ "version": 1, "core", "build", "release", "commit", "branch", "apps": CatalogueApp[] }` (`serialize_slice`), the entries of the installed apps, every system app, and the recent and taskbar-pinned apps, installed or not, sorted by id. System apps are always there, installed or not, so a file's default viewer, Kernel's Docs link or the `docs` command opens one on demand from what boot knows. This service only reads it, at boot; StoreService writes it ([store](store.md#the-installed-apps-catalogue)).

`/var/lib/apps/usage.json`: `{ "version": 1, "apps": { [id]: { "seconds", "last", "days" } } }`, ids sorted, minified, through a `LatestWriter`; each write re-reads the file and adds this tab's time onto it ([Active time](#active-time)). Missing or invalid reads as empty; an entry without `days` counts one. Backed up with `/var/lib`, never sent anywhere.

`/var/lib/apps/recent.json`: `{ "version": 1, "ids": AppId[] }`, newest first, at most 16, written through its own `LatestWriter` when a launch changes the list and on `clear_recent()`. Missing or invalid reads as empty. Missing or invalid means "not decided yet" (see `init()`). Backed up with `/var/lib` (ADR-037). `open()` writes remembered defaults into `settings.file_defaults`, which SettingsService persists in `/etc/settings.json` ([settings.md](settings.md), [persistence.md](../persistence.md)).

`/var/lib/apps/favourites.json` (ADR-083): `{ "version": 1, "ids": AppId[] }`, in the user's order. Every tab reads and writes it under the Web Lock `webos.apps.favourites` (`FAVOURITES_LOCK`): a change re-reads the file, applies itself to that list and writes it back through its own `LatestWriter` before releasing, so two tabs' changes both land ([Favourite apps](#favourite-apps-adr-083)). Missing or invalid reads as empty. Backed up with `/var/lib`.

## Behaviour & invariants

### `launch(id, props?)`

1. Look up the manifest. Missing → try `resolve_replaced` ([below](#replaced-app-ids-adr-071)) and carry on with the app and props it gives. Still missing → `throw`.
2. Another core's entry (`foreign`, a core update waits) → `offer_update(manifest)` and return `null`: no window, nothing remembered.
   Not installed → nothing extra: a file, a deep link, an announcement's Open, Game Hub's Play and search's Open run the app on demand without installing it (ADR-077, which replaced ADR-040's silent install). The "{App} isn't installed" toast this step used to show was removed on 2026-10-27 (owner).
3. Code loaded → validate props (below), then private `instantiate(manifest, props)`: split off `component` (the window gets the manifest without it) and call `component()` now, so the lazy import starts at launch, not at render. The instance holds the promise.
   Still a stub (`open_pending`) → the window opens at once from the stub (name, icon, size, raw props), and its component promise loads the manifest, validates the props against the real schema (the same warning and toast on failure) and sets them on the window through `windows.get(id).app.props`, before the component renders.
5. `windows.open({ id, manifest, component, props })` → the new `WindowId`.
6. `remember(id)`: any app but the core ones moves to the front of the recent list ([below](#recent-apps)).
7. `track_launch(id, kernel.mode, kernel.platform)` (`core/utils/analytics.ts`, ADR-070): pushes gtag's `app_open` event with `app_id`, `mode` (`desktop` for the full OS, `solo`) and `platform` (`desktop` | `mobile`). Never props, paths, file names or command text. A no-op when `window.gtag` is missing (tests, dev, localhost, blocked). Session restore goes through `create_instance`, so restored windows aren't counted; a solo tab counts its one window, not the blocked launches after it.

No single-instance mode, no "focus the existing window". Every call is a new window.

### Replaced app ids (ADR-071)

A manifest's `replaces: { app, props? }[]` names ids it took over. An id that is in the registry always wins; only an id no app has is resolved, by `resolve_replaced`:

- `launch(id, props)` and the `.desktop` / `.widget` paths of `open()` (a shortcut to the old id still opens);
- RouterService for `#/app/` and `#/solo/` links, before it validates props ([router](router.md)); the solo shell's header names the app that opened, not the link's id;
- `init()` for the installed list and StoreService's one-time migration of the old offline picks (`current_ids`: the old id becomes every replacing app).
- Single launch targets resolve to the app a bare launch opens (`current_list`, `current_target`): `load_recent()` for the recent list, `load_favourites()` and every favourites change for the favourites, and `init()` (`map_replaced_settings()`) for the taskbar pins and the `file_defaults` values in settings. Booted from the installed slice none of them maps yet (an id the slice lacks isn't unknown), so `drop_unknown()` maps all four again once the full catalogue arrives: the recent list and the favourites are saved when one changed (order kept, a duplicate dropped), and pins and defaults are rewritten in settings only when one changed, so settings saves the new shape. A recent list mapped at boot saves with the next launch.
- SessionService for saved windows (by props) and frames, and the desktop folder for `.desktop` shortcuts and `.widget` files on the desktop and the mobile home ([session](session.md), [desktop](desktop.md)). Shortcut and widget files aren't rewritten.

Not mapped: scheduler jobs (`/var/lib/scheduler/jobs.json`, none of the replaced apps schedules any), an app's data folder `/var/lib/apps/{id}` and its `app.{id}.*` localStorage. Old data stays behind on purpose: Color Games' slider space, practice level and saved daily attempt don't carry over (owner, 2026-10-25).

Today: Color Games became Color Recall (`{ app: "color-games" }` and `{ mode: "recall" }`), Odd One Out, Gradient Sort and Hex Guess (`{ mode: … }` each). `#/solo/color-games?mode=hex-guess&seed=12` opens Hex Guess with `{ seed: 12 }`; `#/solo/color-games` opens Color Recall.

### Catalogue (ADR-077)

Boot reads only `/var/lib/apps/catalogue.json`, so boot cost follows the installed apps, never every app that exists. No manifest is imported before first paint.

1. **Boot (`boot_catalogue`).** The slice parses and its `core` is this page's (`source.core`, `running_core()`: the `<meta name="webos-core">` in `index.html`) → its entries register as stubs. A slice from a later app-only release on the same core counts: its apps run on this core. Done, nothing fetched. Otherwise (no file: a first boot or the first boot of this release; another core's: a core release, or a restored backup) → `catalogue()`, awaited by boot. If that fails too (offline right after an update), the old slice's entries register as `foreign`: listed, their code never loads, until the catalogue arrives (`online` retries it). The order matters: the update itself was online, so the first boot of a release fetches the catalogue, StoreService writes this build's slice, and the next boot works offline from it.
2. **Full catalogue (`catalogue()`).** `source.fetch()` once (later calls share the promise; after a failure the next call tries again). A catalogue of this core registers every entry (stubs for the ones not known) and sets `complete`; a newer build of it is taken as an app-only update ([below](#app-only-updates-stage-3)). Another core's (a core deploy happened since this page loaded, or the cached copy offline is older) registers its entries as `foreign`, never over a runnable one, and resolves `false`: Open or Install of one toasts "Update WebOS to open {App}" with **Restart** (`offer_update`, which calls `version.apply_update()` when clicked).
3. **Code (`load(id)`).** `source.manifest(entry)` imports the manifest chunk; the result (with `system` and `version` from the entry) replaces the stub in `registry` and `code`. After first paint `on_idle` loads every installed app's; `install()` loads the new app's; a stub's lazy parts and `component()` load it on use.

Who asks for the full catalogue: the App Store (on open, again on `online`), the start menu's and the phone app list's search (once a query is typed), `open()` and Open with when no known app takes the file, a `.desktop` / `.widget` target or a remembered default the device doesn't know, RouterService for a link to an unknown app, VersionService for the first-boot intro and the new-app announcement, SessionService when a saved window's app is unknown, StoreService's migration of `/etc/offline.json`, Game Hub (app, widget, commands), `app info` / `app find` / `version log --apps`, the shortcut icon of an unknown target, Settings › About (credits) and › Default apps, Getting started, the PDF Viewer (its PDF Tools link), Docs' map and app atlas, and the Style Guide.

#### App-only updates (stage 3)

`refresh()` (VersionService's poll, another tab's `apps-ready` message) and `catalogue()` take a newer catalogue of the running core through `adopt()`. Per entry: `changed` when its `hash` differs, `swapped` when its manifest, `files` or `content` differ. An unchanged app keeps its code (its `version` updated). A changed one that isn't running here, or runs with no window, is swapped: its code is dropped and the stub of the new entry takes its place, so the next load imports the new manifest URL (installed apps start loading at once). A changed one with open windows keeps its code and its old entry goes into `stale`: every window, new ones too, runs the old version (one version per app per tab); `update_ready(id)` is true until the last window closes, when an effect over the window list swaps it. `restart(id)` does that on purpose. A load still in flight when its entry changes to other code (another manifest URL) loads again, as a fresh import that first leaves `loading`; an entry replaced by an identical one (the full catalogue landing over the boot slice) keeps the code that loaded. Before 3.78.1 the reload asked `load(id)`, which handed back the in-flight promise itself, so it waited on itself and the window's loader spun until a reload. An app the new catalogue no longer names is forgotten (entry, stub, code), unless it has windows here; `drop_unknown()` then takes it out of the installed set. `last_update` reports `{ build, changed, swapped }`; StoreService downloads and toasts ([store](store.md#hot-updates-adr-077-stage-3)).

#### Stubs

A stub is an `AppManifest` built from the entry: `id`, `name`, `version`, `category`, `system`, `defaults`, `associations`, `tools`, `restore`, `daily_rank`, `replaces`, `widget_size`, `default_widget`. Each lazy part the entry flags (`shell`, `widget`, `highlights`, `guide`, `preview`, `on_fire`, `on_uninstall_data`, `background`) is a loader that loads the manifest first, then runs the real one; `component()` the same, and so does each kind in the entry's `provides` (ADR-079). A stub has no `props` schema and no `badge`: badges fill in when the code lands. Its `icon` is `components/apps/catalogue-icon.svelte` bound to the app (`bind_icon`, a proxy over the caller's props, one per id): the app's own icon once its code is here, the sprite's symbol (`<svg><use href="{base}store/icons.svg#{id}"/></svg>`) while it isn't installed, a `bg-foreground/12` tile meanwhile that pulses (motion allowing) until the load settles. A window opened from a stub keeps that icon component, so its titlebar fills in too.

#### Catalogue sources

`catalogue_source()` imports `glob-source.ts` and `$lib/apps` and returns `glob_source(apps)` when `import.meta.env.DEV` (the dev server and every test), else `bundle_source()`. A build replaces the condition with `false`, so neither the glob, any manifest nor the dev build stamp (`build-info.ts`) reaches the bundle.

- `bundle_source()`: `fetch("{base}store/catalogue.json", { cache: "no-cache" })` through the service worker's `NetworkFirst` rule (`webos-store`, so the last copy answers offline), `parse_catalogue`; `manifest(entry, attempt)` is `import("{base}{entry.manifest}")`, with `?retry={attempt}` once that app's manifest has failed `attempt` times (`manifest_url`): the browser keeps a failed module fetch in its module map, so the same URL would fail again without asking the network (an app opened offline, then again online, or a Restart app that failed offline).
- `glob_source(manifests)`: the manifests already in memory. Its catalogue is built once from `manifest_data(manifest, await manifest.meta(), system)`, the function the build plugin runs, plus this page's build stamp and version, so the dev server never waits on a built catalogue (it serves none) and both paths describe an app the same way. `manifest(entry)` returns the in-memory one.
- `TestAppsService` overrides `catalogue_source()` with a glob source of the system apps and the stand-ins; tests that need the deployed behaviour (a slice, a fetch count, a manifest that takes time) pass their own source the same way (`service.browser.test.ts`).

### App text

An app's display text (`description`, `keywords`, `pitch`, `authors`) is written in its `meta.ts` ([manifest](../apps/manifest.md#meta-metats)); the build copies it into the app's catalogue entry, and the OS reads it from there. No `meta.ts` loads at runtime.

- **`meta(id)`** resolves the entry's text (`{}` for an app without any or an unknown id); an id the device doesn't know fetches the catalogue first.
- **`listings(filter?)`** is the read side: every `AppListing` (`AppManifest & AppMeta & { daily?, achievement_count? }`), from a `$derived` over the registry and the entries. Text is there as soon as an app is known; it never awaits. `filter.installed` and `filter.all` work as in `list()`; Game Hub, Settings › About › Credits and the Style Guide pass `all: true` instead of calling `catalogue()` themselves. The start menu, the mobile app list, the first-boot intro's suggestions, the App Store and Showcase, Game Hub, Settings › About › Credits and the Style Guide derive their lists from it. `app list`, `app info` and `taskbar list` await `meta(id)` per app. VersionService opens the first-boot intro and the new-app announcement after `catalogue()`, then reads `listings()` ([version](version.md)).
- `daily` comes from the entry (props take `daily`, ADR-035): a stub has no `props` schema, so Game Hub reads `daily` to list a game's daily puzzle without loading it.

### Recent apps

The Recent row in the start menu, the Recent rows on the mobile home, and `app recent` read `recent` ([brainstorm](../../brainstorm/2026-10-20_recent-apps.md)).

- **Recording.** Every `launch()` calls the protected `remember(id)`, so a file, a shortcut, a deep link or the shell all count; `create_instance()` (session restore, reopen closed) doesn't. Every app is recorded, installed or opened without installing (ADR-077), except the four core apps (App Store, Settings, File Explorer, Terminal), which the start menu always lists. The app moves to the front, each id once, capped at 16, and the list is saved. Launching the app already in front writes nothing.
- **Reading.** `load_recent()` runs at the end of `init()`, after the installed list: it parses the file and drops ids no app has and the core apps. The boot slice (`installed_catalogue()`) keeps the entries of recent apps, so one opened without installing is still known, and listed, after a reload.
- **Clearing.** `clear_recent()` (the tile menu's "Clear recent", `app recent --clear`) empties and saves.
- **Inspector.** A Recent count; detailed mode adds the list, newest first, and the file path.

### Favourite apps (ADR-083)

A "my apps" place the user orders ([brainstorm](../../brainstorm/2026-10-28_favourite-apps.md)): the Favourites section of the start menu and the mobile app list, and the App Store's Favourites filter and star.

- **Adding and removing.** `favourite(id, true)` appends an installed app once; `favourite(id, false)` removes it. Core apps can be favourites.
- **Order.** The order they're added in, changed by `move_favourite()` (drag in the start menu and the mobile app list, Alt+arrow keys on a start menu tile). `moved_favourite()` places the app among the shown ones; a saved id that isn't shown keeps its neighbours.
- **Installed only.** `favourites` keeps the saved ids that are installed (`is_installed`, so an offline boot's provisional system apps count). Uninstalling drops the id from the file, as it does from the taskbar pins; an id the device knows but doesn't count as installed yet stays in the file and shows once it is.
- **Reading.** `load_favourites()` runs after `load_recent()`, and again whenever the tab becomes visible (another tab may have changed the file): under the lock it parses the file and maps a [replaced](#replaced-app-ids-adr-071) id to the app a bare launch opens (full catalogue only). A change of this tab's still on its way wins over the re-read. Nothing is written until the list changes.
- **Changing.** `change_favourites(change)` runs every change (`favourite`, `move_favourite`, the uninstall drop, `drop_unknown()`'s mapping): it shows `change` applied to the list in memory at once, then under the lock applies `change` again to the file's list (mapped), writes it when it differs, and, when no other change of this tab is still queued, shows what it wrote. `move_favourite`'s index is applied to the file's installed ids. Two tabs' adds, removes and moves all land; a tab in the background shows the other's when it comes back.
- **Inspector.** A Favourites count; detailed mode adds the list in order and the file path.

### Active time

Every app's time in front, for the App Store's "Used 3 h" / "Played 3 h", Library's recent-use sort and the goals on an app's page ([brainstorm](../../brainstorm/2026-10-27_app-store-design.md)). `ActiveTime` (`active-time.svelte.ts`) is a private field of the service; `init()` starts it without awaiting it, and `destroy()` stops it.

- **What counts.** A stretch runs while one window of the app is focused (`windows.get_focused()`, so on a phone the app on screen) and the page is visible (`visibilitychange`). An effect follows the focused window's app; a change ends the running stretch and starts the next.
- **Saving.** Each ended stretch goes through `add_time()` into the `$state.raw` record and into this tab's deltas (`add_delta()`); 2 s later a save re-reads `usage.json`, adds the deltas onto it (`merge_usage()`) and writes, so two tabs never overwrite each other's time. A long stretch is committed every minute by a `setInterval` that runs only while a stretch does (an idle tab never wakes for it), so a crash loses at most that. A stretch counts at most two minutes (`stretch_seconds()`): a longer one wasn't watched by the timer, the device slept or the tab was frozen. Hiding the page ends the stretch and saves at once; the read before the write is async, so a tab closed mid-save can lose its last minute.
- **Days.** `days` counts distinct local days: a stretch on a day other than `last`'s adds one.
- **Reading.** `usage(id)` reads the record; it isn't live within a running stretch.
- Solo tabs count too. A popped-out window (ADR-043) counts while the main page is visible.

### First open

ADR-085. `launch()` opens the window, then calls `windows.toggle_guide(window)` when all of these hold (`first_open`):

- the manifest (real or stub) has a `guide`, and `guide_on_launch` isn't `false` (the catalogue carries the flag, so a stub knows it before the code loads);
- the props after replaced-id resolution are `undefined` or an empty object: a file (`{ path }`), a deep link with data, a daily, shell props all skip it;
- `usage(id)` is `null`: no entry in `usage.json`, so the app was never in front. There's no separate seen-list: apps used before this shipped count as opened;
- `usage.json` has been read (`ActiveTime.loaded`), so a launch in the moment before the read never mistakes a used app for a new one.

The window being focused then starts the app's first stretch, so the next launch finds an entry, as long as the app stayed in front for a second. `create_instance()` (session restore, reopen closed) never shows it. Apps without a guide never auto-show; their overlay (pitch, description, highlights) is only one click away. `app guide <app>` launches and turns the guide on unless the first open already did.

### Sentence search

[Brainstorm](../../brainstorm/2026-10-22_app-search.md). The strict search (`search_apps`, every word must match) finds names and keywords but nothing for "tool that allows me to make pixelart". The start menu and the App Store keep it first and unchanged, and add what the sentence search finds below it. Settings' search doesn't use it.

- **Ranker** (`sentence.ts`, pure). `build_sentence_index(listings)` turns each app into four stemmed word lists with their weights: name 6, keywords and id 3, description 2, the pitch (problem and solution) plus the category label 1. Neighbouring words are also stored joined ("pixel art" → `pixelart`), and so is every multi-word keyword. It counts how many apps hold each word. `rank_sentence(index, query)`: `query_terms()` lowercases and splits the query, joins two neighbours when the joined word is in the index ("to do" → `todo`), drops stop words ("a", "for", "me", "tool", "app", "make", "like"…; all of them only when nothing else is left) and stems what remains (`stem()`: `ings|ing|ers|er|ed|es|s` off words longer than four letters, on both sides). Each term scores per field with BM25 (`k1` 1.2, `b` 0.75, a word of three letters or more also matching the start of a longer one), times its rarity (`log(1 + (N − n + 0.5) / (n + 0.5))`), times the field weight; the app's sum is scaled by the share of query terms it matched. Results under 40 % of the best score are cut. Measured on the real catalogue (`sentence.browser.test.ts`, queries in `fixtures/sentence-queries.ts`): 11 of 11 sample sentences and 19 of 20 unseen ones put a right app in the top 3 of what the launcher shows, and the 8 name, prefix and typo queries still do.
- **UI glue** (`components/apps/sentence-search.svelte.ts`, `SentenceSearch`, constructed during component init like `Flash`). Given getters for every listing, the query and what the strict search shows, it `import()`s `sentence.ts` on the first non-empty query (`pending` until it lands, so the "No apps match" state waits), builds the index once per listings array (a `$derived` over `apps.listings()`), and exposes `related`: the ranked apps the strict search didn't show.
- **AI suggests.** When the glue gets an `ai` getter, the trimmed query has three words or more and `ai.features.prompt` is ready, it waits 400 ms after the last keystroke, then `suggest_keywords()` asks `ai.extract()` for `{ keywords: string[] }` (at most 6, zod, sent as the JSON schema) with a system message asking for short lowercase search keywords. The keywords go through `rank_sentence`; `suggested` is up to 4 apps neither list shows. A new keystroke clears the timer and aborts the request; a failure leaves the row out without a toast; an answer for an older query is never shown. All on the device, no network. `MobileAiService` answers no on phones anyway.
- **Who shows what.** Start menu: Results, Not installed, **Related**, **AI suggests** (the overline with a filled `primary` sparkle); Enter falls back to the first Related app. The mobile app list: Not installed and Related after its letter sections, no AI row (phones have no on-device model). App Store: Related and AI suggests sections after the sorted ones, in both Store and Showcase ([system apps](../system-apps.md#app-library)). `app find` uses the ranker without the glue.

### Solo mode

`SoloAppsService` (`apps/solo.svelte.ts`, ADR-047) is registered under `apps` for a `#/solo/` link. `install()` returns `[]`, so nothing joins the person's start menu. `load_recent()` and `remember()` are no-ops, so `recent` stays empty and `recent.json` is neither read nor written. `load_favourites()` and `change_favourites()` are no-ops too: `favourites` stays empty, `favourite()` and `move_favourite()` change nothing, and `favourites.json` is neither read nor written. `launch()` opens the first window normally; once a window exists, every later launch (and so every `open(path)`) opens nothing, focuses the solo window, returns its id and toasts "Open WebOS to use other apps" with an Open WebOS action that opens the window's app link in a new tab.

### `create_instance(id, props?)`

Silent and strict, for callers that would rather skip than open an empty window (ADR-023). It needs the app's code: without it, `null`, so callers `load(id)` first (SessionService does, for every saved app, once Restore is picked). `state` seeds the instance's window state (`AppInstance.state`, a `$state` record; `{}` otherwise), read by `storage.window()` ([app context](../apps/app-context.md#window)):

| Input | Result |
|-------|--------|
| Unknown id, or code not loaded | `null` |
| `props === undefined` | Instance with no props |
| Props, but the manifest has no schema | `null` |
| `schema.safeParse(props)` fails | `null` |
| Passes | Instance with the **parsed** props |

No `console.warn`, no notification, no window. A returned instance has already started its component import (`instantiate`, shared with `launch`). [SessionService](session.md) passes it straight to `windows.restore`.

### Props validation (ADR-008)

| Input | Result |
|-------|--------|
| `props === undefined` | `undefined`, silent |
| Manifest has no `props` schema | Discarded |
| `schema.safeParse(props)` fails | Discarded |
| Passes | `result.data`, the **parsed** value (a `z.object` strips unknown keys) |

Discarding does two things: `console.warn("[AppsService] \"{id}\" {reason}, discarding:", detail)` and a warning notification from the app's id: "{name} opened without its data" / "It was launched with invalid arguments." The window still opens, with no props.

### `open(path, options?)`: resolution, step by step

1. `files.get_file(path)`. `null` → error notification "File not found" (app id `"apps"`, message = path) → resolve `null`. If `get_file` throws, the promise rejects; the caller handles it.
2. `extension = file_extension(file.name)`.
3. **Shortcut.** If the extension is `.desktop`: read the file and `parse_shortcut()` it. Unparseable, or the `app_id` is neither registered nor replaced (after `catalogue()` when it isn't known) → error notification "Broken shortcut" (app id `"apps"`, message = path) → `null`. Otherwise → `launch(app_id, props)`, with the shortcut's props, not `{ path }`. This runs before remembered defaults and associations, so no default or Open-with choice can capture `.desktop`.
   **Widget.** Same for `.widget`: `parse_widget()`, and an unparseable file or an `app` neither registered nor replaced → error notification "Broken widget" → `null`. Otherwise → `launch(app, props)` with the widget's props, so opening a widget opens its app in a window.
4. **Remembered default.** Skipped when an app claims the file by a compound extension (`has_compound_match`, `.form.md`). Otherwise, if there is an extension, `settings.file_defaults[extension]` names an app, and that app is in the registry → `launch(default_id, { path })`. The default app does not have to list the extension in its associations. A default pointing at a missing app is skipped, not deleted.
5. **Candidates.** `best_apps_for(registry.values(), file)`, matching on `file.name` and `file.type` (the MIME the browser assigns to the OPFS `File`). None among the known apps → `catalogue()` and match again, so a file only a not-installed app opens still opens (on demand, with the Install toast). Apps that aren't installed are only candidates once the full catalogue is known.
6. Zero candidates → warning notification "No app can open {name}" (app id `"apps"`) → `null`.
7. One candidate → `launch(candidate.id, { path })`.
8. Several → `import()` `open-with-dialog.svelte`, then `dialogs.show(OpenWithDialog, { file_name, extension, apps }, { anchor: options.anchor })`.
   - `null` (Esc, outside click, shutdown) → resolve `null`. Nothing opens, no notification.
   - `{ app_id, always }`: if `always` and there is an extension, `settings.file_defaults[extension] = app_id`. Then `launch(app_id, { path })`.

Outside the shortcut and widget cases, the props passed are always `{ path }`, which fits `FILE_PROPS`. The receiving app looks the file up again itself.

Details on tiers, the dropdown and remembered defaults: [apps/file-associations.md](../apps/file-associations.md).

### Callers

| Caller | Call |
|--------|------|
| Start menu (`taskbar/start-menu-popover.svelte`) | `launch(id)` |
| `DesktopService.open()` for a shortcut or file (desktop double-click / Enter) | `open(path, { anchor })`; rejections go to `console.error` |
| `DesktopService.open()` for a folder | `launch("file-explorer", { path })` |
| SessionService restore | `create_instance(app_id, props, state)` per saved window ([session](session.md)) |
| File Explorer file row, double-click / Enter (`files/file-list.svelte`) | `open(path, { anchor })`, so a `.desktop` file there launches its target; rejections go to `report_file_error` |

## Divergence from ADR

- ADR-001's glob is `./**/index.ts`. The dev and test glob is `./system/*/index.ts` and `./user/*/index.ts`, one level deep; a build reads the catalogue instead (ADR-077).
- ADR-077 says StoreService owns the catalogue. AppsService fetches and holds it, since boot needs it before StoreService exists (store depends on apps) and the registry is AppsService's; StoreService writes the installed slice. Revision note 2026-10-26.
- ADR-077 names the installed apps' entries as the slice; it also holds every system app's, so what opens a system app on demand works without the full catalogue. Revision note 2026-10-27.
- ADR-077 says StoreService owns the hot swaps; AppsService does them, since the registry and the loaded code are its own. Revision note 2026-10-27.
- ADR-018's resolution matches the code. The `open()` JSDoc says it resolves `null` "when the file is missing or no app matches (both notify)"; it also resolves `null`, silently, when the chooser is dismissed.

## Shell

Contributes `app list|info|launch`, `app guide <app>` (launches an installed app with no props and shows its guide, [First open](#first-open), ADR-085), `app find <words…>` (`ai: "read"`: the strict matches, then the [sentence search](#sentence-search)'s, over every app installed or not, at most 10, as `app` values; it awaits `catalogue()` first and `import()`s `sentence.ts`; no words fails with a hint), `app info` fetches the catalogue for an app the device doesn't know and loads its code for the `props` line, `app recent` (yields `app` values from `recent`, newest first; `--clear` calls `clear_recent()` and yields nothing), `app provides [kind]` (every sheet apps provide for `win.request`, installed or not, after `catalogue()`, as `sheet` values with columns `key` (`app::kind`) and `app` (the name); a kind narrows it, ADR-079; defined in `shell-sheets.ts` and loaded with the apps' own commands, so it costs no boot weight), `open`, `taskbar list|pin|unpin` (ADR-042: the quick launch in `settings.taskbar.pinned`; `taskbar list` yields `app` values in order, `pin` takes installed apps only and appends, `unpin` fails on an app that isn't pinned), `taskbar position [top|bottom|left|right]`, `taskbar size [small|medium|large]` `taskbar autohide [on|off]` and `taskbar seconds [on|off]` (ADR-015 revision: zod enums, so Tab completes them; with no argument each returns the current value as text), the `app` completer, the `app` value type (opening one launches it, or, when it isn't installed, opens the App Store at it, since the shell never installs) and opening `file` values (folders in File Explorer) (`apps/shell.ts`). It also puts every known app's manifest `shell` module behind its contribution's `lazy` (a stub loads the manifest first), loaded in parallel on the shell's first `load()`, tagging those commands with `app: <id>` (ADR-034, revised 2026-10-17). See [shell](shell.md#contributions).

The shell never installs (ADR-040):

- An app's commands get `available: () => installed ? (own available ?? true) : "{App} isn't installed. Install it in the App Store"`, so an uninstalled app's commands leave the palette and completion, and running one fails with that reason. System apps are the exception (ADR-077): their commands (`docs`, `tour`) stay available and open the app on demand, with the Install toast, since boot always knows their entries.
- `app list` and the `app` completer list installed apps only; `app info` takes any app; `app launch` on one that isn't installed fails with the same message.
- `open` is a file open: the file's app opens through `launch`, installed or not, and isn't installed by it.

## Known gaps

- `create_instance` doesn't resolve replaced ids; its callers (session restore, reopen closed) pass ids that are already current.
- Duplicate app ids overwrite silently. User apps register after system apps (glob order), so a user app can replace a system one with no warning.
- No unregister, no way to change a running window's props.
- A second tab doesn't see an install or uninstall until it reloads (cross-tab sync is open).
- An app whose manifest chunk can't load (offline before its download finished) keeps a still placeholder icon and opens to the window's load-failed screen; a saved window of it is skipped at restore with the usual "couldn't be restored" toast.
- Offline on the first boot of a new release, with another build's slice, apps are listed but don't open until the catalogue arrives; with no slice at all (the first boot of this release offline) nothing is listed, system apps included.
- Session restore and Alt+Shift+T build instances with `create_instance`, which doesn't install: a window of an app uninstalled in another tab can still come back.
- Stale `file_defaults` entries (pointing at removed apps) stay in settings until the user forgets them in Settings → Default apps, which flags them as "no longer installed".
