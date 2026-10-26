# AppsService

Key `apps` · Depends on: `windows`, `notifications`, `files`, `settings`, `dialogs` · ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [022](../../adrs/022-desktop-folder.md) (shortcuts), [023](../../adrs/023-session-persistence.md) (`create_instance`, manifest `restore`), [040](../../adrs/040-installed-apps.md) (installed apps), [047](../../adrs/047-solo-app-open.md) (solo), [049](../../adrs/049-lazy-app-metadata.md) (meta) · Source: `src/lib/core/api/services/apps/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The app registry. Holds every discovered manifest and which user apps are installed, launches an app into a new window with validated props, and resolves a file path to the app that should open it. A `.desktop` shortcut file resolves to the app it points at.

| File | Contents |
|------|----------|
| `type.ts` | `AppsService` interface, `AppManifest`, `AppDefinition`, `AppConfig`, `AppInstance`, `OpenOptions`, `AppsFilter`, `UninstallOptions`, `AppCategory`, `AppProps`, `AppMeta`, `AppListing`, `AppAuthor`, `AppPitch`, `AppHighlight`, `DailyRank` (re-exported by the games kit, ADR-048), `WidgetSize`, `WidgetSizeLimits`, `WidgetProps` |
| `helpers.ts` | `define_app()`, `FILE_PROPS` |
| `authors.ts` | `OWNER`, `app_authors()`, `author_link()`, `author_names()`, `credits()`, `Credit`: who made an app (the meta's `authors`, else the owner) |
| `associations.ts` | Pure matching: `file_extension()`, `association_tier()`, `best_apps_for()`, `apps_for()`, `tools_for()` |
| `shortcut.ts` | `.desktop` shortcut files: `SHORTCUT_EXTENSION`, `Shortcut`, `parse_shortcut()`, `serialize_shortcut()`, `shortcut_label()` (ADR-022) |
| `widget.ts` | `.widget` files: `WIDGET_EXTENSION`, `WIDGET_FALLBACK_SIZE`, `WidgetFile`, `widget_size_schema`, `parse_widget()`, `serialize_widget()`, `widget_label()`, `clamp_widget_size()`, `initial_widget_size()` (ADR-034) |
| `search.ts` | App search and grouping for the start menu, the mobile app list and App Store: `search_apps()` (supplies each app's fields to `search_ranked` from `core/utils/search.ts`, the ranker Settings' search shares), `group_apps()`, `APP_CATEGORY_LABELS`, `AppSection`; re-exports `within_one_edit()` |
| `letters.ts` | `LETTERS` (`#`, A–Z) and `group_by_letter()`: the phone's letter rail and full list file each app under its name's first letter, accents folded, anything else under `#` |
| `sentence.ts` | Lazy: the sentence search ([below](#sentence-search)). `build_sentence_index()`, `rank_sentence()`, `query_terms()`, `stem()`, `suggest_keywords()` and `suggest_messages()` (on-device AI). Imported only by `components/apps/sentence-search.svelte.ts` and `app find`, never at boot |
| `shell.ts` | `apps_shell()`: the service's shell contribution (see [Shell](#shell)) |
| `installed.ts` | `INSTALLED_PATH`, `parse_installed()`, `serialize_installed()` (ADR-040) |
| `recent.ts` | `RECENT_PATH`, `RECENT_LIMIT` (16), `parse_recent()` (tolerant: a broken file is `[]`, non-string and repeated entries drop out), `serialize_recent()`, `with_recent(ids, id)` (moves `id` to the front, capped) |
| `usage.ts` | `used_apps(manifests, signals)`: the apps past use points to, for the one-time tidy |
| `suggestions.ts` | `INTERESTS` and `interest_apps()`: the intro's "What are you into?" groups, installed when picked. The intro hides a group with none of its apps registered |
| `test-apps.ts` | Tests only: `EXAMPLE_APP` and `TestAppsService`, which registers it, so core tests don't depend on user apps |
| `service.svelte.ts` | The class |
| `solo.svelte.ts` | `SoloAppsService`, registered instead in solo mode (see [Solo mode](#solo-mode)) |

Manifest fields are documented in [apps/manifest.md](../apps/manifest.md). The full launch path, window included, is in [apps/lifecycle.md](../apps/lifecycle.md).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `registry` | `Map<string, AppManifest>` (a `SvelteMap`) | Public on the class, not on the interface. Reactive |
| `list(filter?)` | `(filter?: { installed?: boolean }): IterableIterator<[AppId, AppManifest]>` | Iterator over `registry`, insertion order. `installed: true` only installed apps (the start menu, the mobile home and app list, `app list`), `false` only the others (search's Not installed group) |
| `is_installed(id)` | `(id: AppId): boolean` | System apps always; unknown ids never. Reactive |
| `install(ids)` | `(ids: AppId \| AppId[]): AppId[]` | Adds the ones not installed yet, saves, returns them. No toast |
| `uninstall(id, options?)` | `(id: AppId, options?: { data?: boolean }): Promise<void>` | Throws for system and unknown apps. Unpins it from the taskbar's quick launch (ADR-042). `data` also deletes `app.{id}.*` localStorage and `/var/lib/apps/{id}/`, then awaits the manifest's `on_uninstall_data` if it has one (a throw is logged and toasted "Some of {App}'s data is left"; the uninstall stands). Windows and desktop entries are the caller's: `uninstall_app()` in `components/apps/app-actions.ts` asks (`uninstall-dialog.svelte`, with the "Also delete its saved data" checkbox), closes the app's windows through the guarded close (a kept dirty window cancels), removes its desktop shortcuts and widgets, then calls this and toasts |
| `get(id)` | `(id: AppId): AppManifest \| undefined` | |
| `register(manifest)` | `(manifest: AppManifest): void` | `registry.set`. Same id overwrites silently. No `unregister` |
| `launch(id, props?)` | `(id: AppId, props?: unknown): WindowId` | An id no app has opens the app that [replaces](#replaced-app-ids-adr-071) it; throws `App ${id} not found` when none does. An app that isn't installed opens without installing (ADR-077) and toasts "{App} isn't installed" with **Install**. Always opens a new window |
| `create_instance(id, props?, state?)` | `(id: AppId, props?: unknown, state?: Record<string, unknown>): AppInstance \| null` | The instance `launch()` would open, without a window and without toasts. Used by session restore. See below |
| `open(path, options?)` | `(path: string, options?: OpenOptions): Promise<WindowId \| null>` | File → app resolution, below |
| `meta_ready` | `Promise<void>` (getter) | Settles once every app's `meta` has loaded; the first read starts the load. [App meta](#app-meta-adr-049) |
| `meta(id)` | `(id: AppId): Promise<AppMeta>` | After `meta_ready`: the app's meta, `{}` without one |
| `listings(filter?)` | `(filter?: AppsFilter): AppListing[]` | Every app (or the installed / not installed ones, like `list`), its manifest merged with its meta. Reactive: bare manifests until the metas load. [App meta](#app-meta-adr-049) |
| `recent` | `readonly AppId[]` (getter) | User apps `launch()` opened lately, newest first, each once, at most 16. Installed ones only: an uninstalled app drops out (and comes back if reinstalled). Reactive. [Recent apps](#recent-apps) |
| `clear_recent()` | `(): void` | Empties the list and saves it |

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

- `registry`, filled in the constructor from the eager glob in `src/lib/apps/index.ts` (see [lifecycle](../apps/lifecycle.md#1-discovery)).
- `installed`, a private `SvelteSet` of user app ids (system apps are never stored), filled by `init()`.
- `metas`, a private `$state.raw` `ReadonlyMap<AppId, AppMeta>`, empty until the meta load replaces it once ([below](#app-meta-adr-049)).
- `recent_ids`, a private `$state.raw` `AppId[]`: the recent list as saved, newest first; `recent_listed`, a private `$derived` of it keeping only installed user apps, is what `recent` returns.
- `all_listings`, a private `$derived` over `registry` and `metas`: each manifest merged with its meta, the bare manifest while it has none. `listings()` returns it, filtered when asked.

The constructor also wires `$derived` references to its five dependencies. There is no `destroy()`.

### `init()`: the installed list (ADR-040)

1. `/var/lib/apps/installed.json` parses → load it through `current_ids`: an id an app [replaces](#replaced-app-ids-adr-071) becomes every app replacing it, any other unknown id drops. The file isn't rewritten; the next install or uninstall saves the mapped list. Done.
2. Missing or invalid, and no `/var/lib/version/state.json` (a first boot) → only the system apps, quietly. The intro's interests page installs the rest (`INTERESTS` in `suggestions.ts`).
3. Missing, but the version state exists (a device from before installed apps) → a one-time tidy: install only the apps `used_apps()` finds, and toast "Tidied N apps you never opened" with **Undo** (install everything) and **App Store**. Signals: window frames and saved windows in `session.json`, desktop `.desktop` / `.widget` targets, `app.{id}.*` localStorage keys, folders in `/var/lib/apps/`, app commands in the shell history (any pipe stage, `sudo` stripped), matched against ids from `command_apps()`, which loads every app's `commands.ts` for this one pass, and `settings.file_defaults`. Nothing records use after this; there is no rolling tidy.
4. Steps 2 and 3 save the list.

Before any of that, `init()` schedules the meta load with `requestIdleCallback`. After it, `load_recent()` reads the recent list ([below](#recent-apps)).

## Lifecycle

Constructed by the kernel after its dependencies. Registration happens in the constructor, which bends the CONVENTIONS rule "constructors only set fields", but it has no side effects outside the instance.

Importing `service.svelte.ts` imports `$lib/apps`, which evaluates every manifest eagerly. This happens while the `$lib/core/api` barrel is still initializing, which is why manifests may not import constants from the barrel ([manifest.md](../apps/manifest.md#the-import-rule)).

## Persistence

`/var/lib/apps/installed.json`: `{ "version": 1, "installed": AppId[] }`, sorted, user apps only, written through a `LatestWriter` on every change.

`/var/lib/apps/recent.json`: `{ "version": 1, "ids": AppId[] }`, newest first, at most 16, written through its own `LatestWriter` when a launch changes the list and on `clear_recent()`. Missing or invalid reads as empty. Missing or invalid means "not decided yet" (see `init()`). Backed up with `/var/lib` (ADR-037). `open()` writes remembered defaults into `settings.file_defaults`, which SettingsService persists in `/etc/settings.json` ([settings.md](settings.md), [persistence.md](../persistence.md)).

## Behaviour & invariants

### `launch(id, props?)`

1. Look up the manifest. Missing → try `resolve_replaced` ([below](#replaced-app-ids-adr-071)) and carry on with the app and props it gives. Still missing → `throw`.
2. Not installed → the protected `offer_install(manifest)`: an info toast "{App} isn't installed" / "Install it to keep it in your apps and use it offline." with **Install** (`install(id)`). The window opens either way: a file, a deep link, an announcement's Open, Game Hub's Play and search's Open run the app on demand without installing it (ADR-077, which replaced ADR-040's silent install). `SoloAppsService` overrides it to nothing.
3. Validate props (below).
4. Private `instantiate(manifest, props)`: split off `component` (the window gets the manifest without it) and call `component()` now, so the lazy import starts at launch, not at render. The instance holds the promise.
5. `windows.open({ id, manifest, component, props })` → the new `WindowId`.
6. `remember(id)`: a user app moves to the front of the recent list ([below](#recent-apps)).
7. `track_launch(id, kernel.mode, kernel.platform)` (`core/utils/analytics.ts`, ADR-070): pushes gtag's `app_open` event with `app_id`, `mode` (`desktop` for the full OS, `solo`) and `platform` (`desktop` | `mobile`). Never props, paths, file names or command text. A no-op when `window.gtag` is missing (tests, dev, localhost, blocked). Session restore goes through `create_instance`, so restored windows aren't counted; a solo tab counts its one window, not the blocked launches after it.

No single-instance mode, no "focus the existing window". Every call is a new window.

### Replaced app ids (ADR-071)

A manifest's `replaces: { app, props? }[]` names ids it took over. An id that is in the registry always wins; only an id no app has is resolved, by `resolve_replaced`:

- `launch(id, props)` and the `.desktop` / `.widget` paths of `open()` (a shortcut to the old id still opens);
- RouterService for `#/app/` and `#/solo/` links, before it validates props ([router](router.md)); the solo shell's header names the app that opened, not the link's id;
- `init()` for the installed list and StoreService's one-time migration of the old offline picks (`current_ids`: the old id becomes every replacing app).
- Single launch targets resolve to the app a bare launch opens (`current_list`, `current_target`): `load_recent()` for the recent list, and `init()` for the taskbar pins and the `file_defaults` values in settings. Pins and defaults are rewritten in settings only when one changed, so settings saves the new shape; the recent list saves it with the next launch.
- SessionService for saved windows (by props) and frames, and the desktop folder for `.desktop` shortcuts and `.widget` files on the desktop and the mobile home ([session](session.md), [desktop](desktop.md)). Shortcut and widget files aren't rewritten.

Not mapped: scheduler jobs (`/var/lib/scheduler/jobs.json`, none of the replaced apps schedules any), an app's data folder `/var/lib/apps/{id}` and its `app.{id}.*` localStorage. Old data stays behind on purpose: Color Games' slider space, practice level and saved daily attempt don't carry over (owner, 2026-10-25).

Today: Color Games became Color Recall (`{ app: "color-games" }` and `{ mode: "recall" }`), Odd One Out, Gradient Sort and Hex Guess (`{ mode: … }` each). `#/solo/color-games?mode=hex-guess&seed=12` opens Hex Guess with `{ seed: 12 }`; `#/solo/color-games` opens Color Recall.

### App meta (ADR-049)

An app's display text (`description`, `keywords`, `pitch`, `authors`) is in its `meta.ts`, behind the manifest's `meta` loader ([manifest](../apps/manifest.md#meta-metats)), so the manifests stay small; boot loads it in one chunk.

- **Loading.** `meta_ready` is a getter over one memoized promise: the first read starts the load, every later read gets the same promise. `init()` awaits it next to the installed list (ADR-049 revision 2026-10-24), and the build modulepreloads the `app-meta` chunk from `index.html`, so it downloads alongside `main` and every listing has its text when the desktop first paints. The load calls every registered app's `meta()` in parallel with `Promise.allSettled`; Vite puts all of them in one `app-meta` chunk, so it's one request. A module that fails logs `[AppsService] {id}'s meta failed to load` and the app counts as having none. It runs once per page: an app registered after the load starts has no meta (only tests register late).
- **`meta(id)`** awaits `meta_ready` and resolves the app's `AppMeta`, or `{}` for an app without `meta`, one whose module failed, or an unknown id.
- **`listings(filter?)`** is the read side: every `AppListing` (`AppManifest & AppMeta`), from a `$derived` over the registry and the loaded metas. The load lands before `init()` returns, so readers see the text at once; it never awaits. `filter.installed` works as in `list()`. The start menu, the mobile app list, the first-boot intro's suggestions, the App Store and Showcase, Game Hub, Settings › About › Credits and the Style Guide derive their lists from it. `meta_ready` and `meta(id)` stay internal. `search_apps` and `group_apps` are generic over the listing type. `app list`, `app info` and `taskbar list` await `meta(id)` per app. VersionService opens the first-boot intro and the new-app announcement only after `meta_ready`, then reads `listings()` ([version](version.md)).
- Static per app, so two windows of one app, the mobile service set and solo mode (`SoloAppsService` inherits it) all share the one load.

### Recent apps

The Recent row in the start menu, the Recent rows on the mobile home, and `app recent` read `recent` ([brainstorm](../../brainstorm/2026-10-20_recent-apps.md)).

- **Recording.** Every `launch()` calls the protected `remember(id)`, so a file, a shortcut, a deep link or the shell all count; `create_instance()` (session restore, reopen closed) doesn't. Only installed user apps are recorded: system apps (Settings, File Explorer, Terminal…) never. The app moves to the front, each id once, capped at 16, and the list is saved. Launching the app already in front writes nothing.
- **Reading.** `load_recent()` runs at the end of `init()`, after the installed list: it parses the file and drops ids no app has and system apps. `recent` also leaves out apps that aren't installed at read time, so an uninstall hides the app without rewriting the file.
- **Clearing.** `clear_recent()` (the tile menu's "Clear recent", `app recent --clear`) empties and saves.
- **Inspector.** A Recent count; detailed mode adds the list, newest first, and the file path.

### Sentence search

[Brainstorm](../../brainstorm/2026-10-22_app-search.md). The strict search (`search_apps`, every word must match) finds names and keywords but nothing for "tool that allows me to make pixelart". The start menu and the App Store keep it first and unchanged, and add what the sentence search finds below it. Settings' search doesn't use it.

- **Ranker** (`sentence.ts`, pure). `build_sentence_index(listings)` turns each app into four stemmed word lists with their weights: name 6, keywords and id 3, description 2, the pitch (problem and solution) plus the category label 1. Neighbouring words are also stored joined ("pixel art" → `pixelart`), and so is every multi-word keyword. It counts how many apps hold each word. `rank_sentence(index, query)`: `query_terms()` lowercases and splits the query, joins two neighbours when the joined word is in the index ("to do" → `todo`), drops stop words ("a", "for", "me", "tool", "app", "make", "like"…; all of them only when nothing else is left) and stems what remains (`stem()`: `ings|ing|ers|er|ed|es|s` off words longer than four letters, on both sides). Each term scores per field with BM25 (`k1` 1.2, `b` 0.75, a word of three letters or more also matching the start of a longer one), times its rarity (`log(1 + (N − n + 0.5) / (n + 0.5))`), times the field weight; the app's sum is scaled by the share of query terms it matched. Results under 40 % of the best score are cut. Measured on the real catalogue (`sentence.browser.test.ts`, queries in `fixtures/sentence-queries.ts`): 11 of 11 sample sentences and 19 of 20 unseen ones put a right app in the top 3 of what the launcher shows, and the 8 name, prefix and typo queries still do.
- **UI glue** (`components/apps/sentence-search.svelte.ts`, `SentenceSearch`, constructed during component init like `Flash`). Given getters for every listing, the query and what the strict search shows, it `import()`s `sentence.ts` on the first non-empty query (`pending` until it lands, so the "No apps match" state waits), builds the index once per listings array (a `$derived` over `apps.listings()`), and exposes `related`: the ranked apps the strict search didn't show.
- **AI suggests.** When the glue gets an `ai` getter, the trimmed query has three words or more and `ai.features.prompt` is ready, it waits 400 ms after the last keystroke, then `suggest_keywords()` asks `ai.extract()` for `{ keywords: string[] }` (at most 6, zod, sent as the JSON schema) with a system message asking for short lowercase search keywords. The keywords go through `rank_sentence`; `suggested` is up to 4 apps neither list shows. A new keystroke clears the timer and aborts the request; a failure leaves the row out without a toast; an answer for an older query is never shown. All on the device, no network. `MobileAiService` answers no on phones anyway.
- **Who shows what.** Start menu: Results, Not installed, **Related**, **AI suggests** (the overline with a filled `primary` sparkle); Enter falls back to the first Related app. The mobile app list: Not installed and Related after its letter sections, no AI row (phones have no on-device model). App Store: Related and AI suggests sections after the sorted ones, in both Store and Showcase ([system apps](../system-apps.md#app-library)). `app find` uses the ranker without the glue.

### Solo mode

`SoloAppsService` (`apps/solo.svelte.ts`, ADR-047) is registered under `apps` for a `#/solo/` link. `install()` returns `[]`, so nothing joins the person's start menu. `load_recent()` and `remember()` are no-ops, so `recent` stays empty and `recent.json` is neither read nor written. `launch()` opens the first window normally; once a window exists, every later launch (and so every `open(path)`) opens nothing, focuses the solo window, returns its id and toasts "Open WebOS to use other apps" with an Open WebOS action that opens the window's app link in a new tab.

### `create_instance(id, props?)`

Silent and strict, for callers that would rather skip than open an empty window (ADR-023). `state` seeds the instance's window state (`AppInstance.state`, a `$state` record; `{}` otherwise), read by `storage.window()` ([app context](../apps/app-context.md#window)):

| Input | Result |
|-------|--------|
| Unknown id | `null` |
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
3. **Shortcut.** If the extension is `.desktop`: read the file and `parse_shortcut()` it. Unparseable, or the `app_id` is neither registered nor replaced → error notification "Broken shortcut" (app id `"apps"`, message = path) → `null`. Otherwise → `launch(app_id, props)`, with the shortcut's props, not `{ path }`. This runs before remembered defaults and associations, so no default or Open-with choice can capture `.desktop`.
   **Widget.** Same for `.widget`: `parse_widget()`, and an unparseable file or an `app` neither registered nor replaced → error notification "Broken widget" → `null`. Otherwise → `launch(app, props)` with the widget's props, so opening a widget opens its app in a window.
4. **Remembered default.** Skipped when an app claims the file by a compound extension (`has_compound_match`, `.form.md`). Otherwise, if there is an extension, `settings.file_defaults[extension]` names an app, and that app is in the registry → `launch(default_id, { path })`. The default app does not have to list the extension in its associations. A default pointing at a missing app is skipped, not deleted.
5. **Candidates.** `best_apps_for(registry.values(), file)`, matching on `file.name` and `file.type` (the MIME the browser assigns to the OPFS `File`).
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

- ADR-001's glob is `./**/index.ts`. The code globs `./system/*/index.ts` and `./user/*/index.ts`, one level deep.
- ADR-018's resolution matches the code. The `open()` JSDoc says it resolves `null` "when the file is missing or no app matches (both notify)"; it also resolves `null`, silently, when the chooser is dismissed.

## Shell

Contributes `app list|info|launch`, `app find <words…>` (`ai: "read"`: the strict matches, then the [sentence search](#sentence-search)'s, over every app installed or not, at most 10, as `app` values; it awaits `meta_ready` first and `import()`s `sentence.ts`; no words fails with a hint), `app recent` (yields `app` values from `recent`, newest first; `--clear` calls `clear_recent()` and yields nothing), `open`, `taskbar list|pin|unpin` (ADR-042: the quick launch in `settings.taskbar.pinned`; `taskbar list` yields `app` values in order, `pin` takes installed apps only and appends, `unpin` fails on an app that isn't pinned), `taskbar position [top|bottom|left|right]`, `taskbar size [small|medium|large]` `taskbar autohide [on|off]` and `taskbar seconds [on|off]` (ADR-015 revision: zod enums, so Tab completes them; with no argument each returns the current value as text), the `app` completer, the `app` value type (opening one launches it, or, when it isn't installed, opens the App Store at it, since the shell never installs) and opening `file` values (folders in File Explorer) (`apps/shell.ts`). It also puts every app's manifest `shell` module behind its contribution's `lazy`, loaded in parallel on the shell's first `load()`, tagging those commands with `app: <id>` (ADR-034, revised 2026-10-17). See [shell](shell.md#contributions).

The shell never installs (ADR-040):

- An app's commands get `available: () => installed ? (own available ?? true) : "{App} isn't installed. Install it in the App Store"`, so an uninstalled app's commands leave the palette and completion, and running one fails with that reason.
- `app list` and the `app` completer list installed apps only; `app info` takes any app; `app launch` on one that isn't installed fails with the same message.
- `open` is a file open: the file's app opens through `launch`, installed or not, and isn't installed by it.

## Known gaps

- `create_instance` doesn't resolve replaced ids; its callers (session restore, reopen closed) pass ids that are already current.
- Duplicate app ids overwrite silently. User apps register after system apps (glob order), so a user app can replace a system one with no warning.
- No unregister, no way to change a running window's props.
- A second tab doesn't see an install or uninstall until it reloads (cross-tab sync is open).
- Session restore and Alt+Shift+T build instances with `create_instance`, which doesn't install: a window of an app uninstalled in another tab can still come back.
- Stale `file_defaults` entries (pointing at removed apps) stay in settings until the user forgets them in Settings → Default apps, which flags them as "no longer installed".
