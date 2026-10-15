# App API

ADR: [001](../adrs/001-app-manifest-structure.md), [003](../adrs/003-app-context.md), [008](../adrs/008-app-props-validation.md), [018](../adrs/018-file-associations.md), [034](../adrs/034-app-extension-points.md), [035](../adrs/035-app-platform-wave-2.md) · Decided: [1.0 release](../brainstorm/2026-10-15_v1-release.md) · Pinned by: `src/lib/core/app-api.test.ts`

What an app may rely on, frozen at 1.0. Written for whoever writes an app in `src/lib/apps/user/{id}/`, including someone who forked WebOS and never reads the core. If it's in a **stable** table below, it keeps working until 2.0. Anything not listed is internal: use it if you want, but it can change in any release.

The detail pages say how each piece behaves ([manifest](apps/manifest.md), [app context](apps/app-context.md), [file associations](apps/file-associations.md), [writing an app](apps/writing-an-app.md)). This page only says what's promised.

## Semver rule

| Change | Version |
|--------|---------|
| Adding to the stable surface: a new export, an optional manifest field, a new handle member, a new service method marked stable | minor |
| Fixing behaviour so it matches this page or the detail pages | patch |
| Removing or renaming anything stable, changing a stable signature incompatibly, changing a stable behaviour or storage location | **major (2.0)** |
| Anything internal | any release, no notice |

"Stable" means the name, the signature and the documented behaviour. A stable function can grow an optional parameter in a minor; it can't lose one. A stable interface can grow an optional member; it can't lose one or make one required.

How it's enforced: `src/lib/core/app-api.test.ts` lists every stable runtime export per module and fails when one disappears (`bun run test:unit`). It also pins the member names of the manifest, the handles and the shell types, and imports every stable type, so removing one fails `bun run check`. A deliberate break edits that test and this page in the same commit, and that commit is 2.0.

The test covers names, not signatures or behaviour. Those are still on you.

## Where to import from

| Module | Stable | Notes |
|--------|--------|-------|
| `$lib/core/api` | Default export `kernel`, the names in the tables below, every type listed here | The barrel also re-exports a lot of OS-only helpers; only what's listed here is promised |
| `$lib/core/api/services/apps/type` | `AppCategory` | Manifests import constants from their own module ([the import rule](apps/manifest.md#the-import-rule)), so this path is part of the promise |
| `$lib/core/api/services/apps/helpers` | `FILE_PROPS`, `define_app` | Same reason |
| `$lib/core/api/services/shell/type`, `shell/arg`, `shell/define` | `ShellError`; `arg`, `ArgKind`; `define_command` | Same reason: app manifests build their commands eagerly |
| `$lib/core/contexts/app` | See [App context and data](#app-context-and-data) | Import from the barrel. The files behind it are internal paths |
| `$lib/core/components/ui` | The whole UI kit | |
| `$lib/core/games` | The whole games kit | Import from the barrel in components and lazy files |
| `$lib/core/games/time` | Kernel-free time helpers of the kit | Stable path. Use it from manifests and from logic that Node tests load: the barrel re-exports `track_play`/`use_plays`, which reach the kernel through `json_file` |
| `$lib/core/games/direction` | Kernel-free direction helpers of the kit | Stable path, same reason as `games/time` |
| `$lib/core/utils` and the utility modules in [Utilities](#utilities) | The names listed there | |

## Manifest: `define_app`

Discovery: one folder per app, `src/lib/apps/user/{id}/index.ts`, default-exporting `define_app({...})`. No registration. That path and the default export are stable.

| Field | Stable | Notes |
|-------|--------|-------|
| `id`, `name`, `version`, `icon`, `category`, `component` | yes, required | `component: () => import("./x.app.svelte")`. Ids double as the storage prefix, so renaming an app's id loses its data |
| `description`, `keywords` | yes | Launcher search |
| `highlights`, `preview` | yes (1.5) | The new-app announcement and the App Library details. `highlights: AppHighlight[]` (`{ icon, title, text }`), `preview: () => import("./preview.webp?url")` (ADR-038) |
| `author`, `license`, `repository` | yes | Stored only today. `author` predates `authors` and isn't read |
| `authors` | yes (1.5) | `AppAuthor[]` (`{ name, github?, url? }`). Omitted means the owner (`OWNER`). Credited in the App Library details, the new-app announcement, Settings › About › Credits and `app info` / `app list` |
| `defaults` (`constraints`, `flags`, `snap_zone`) | yes | `constraints.width/height.min` is enforced; `max` is accepted and ignored |
| `associations`, `tools` | yes | Syntax below |
| `props` | yes | A zod object schema |
| `restore` | yes | `false` keeps windows out of saved sessions |
| `shell` | yes | [Shell contributions](#shell-contributions) |
| `badge` | yes | `() => number \| null` |
| `widget`, `widget_size`, `default_widget` | yes | [Widgets and badges](#widgets-and-badges) |
| `system` | no | Set by discovery for `src/lib/apps/system/`, never written by an app |

`define_app` throws at boot on an invalid `widget_size`. `AppCategory` values (`productivity`, `media`, `utilities`, `developer`, `games`) are stable; a new category is a minor.

Types: `AppConfig`, `AppDefinition`, `AppManifest`, `AppAuthor`, `AppHighlight`, `AppId`, `AppProps`, `WindowOptions`, `WindowFlag`.

## Props and file associations

| Promise | Detail |
|---------|--------|
| Props are validated against `props` on every launch and restore | Invalid or schema-less props are discarded with a warning; the window still opens with none ([apps](services/apps.md#props-validation-adr-008)) |
| The component gets `Partial<Props>` | An app launched from the start menu or the desktop gets no props, so every prop is optional |
| `FILE_PROPS` is `z.object({ path: z.string() })` | File-opening apps use it or extend it. `open(path)` launches with `{ path }` |
| Association syntax | `.ext` (extension), `type/*` (MIME prefix), `type/sub` (exact MIME), lowercase. Ranking and the Open-with chooser are internal ([file-associations](apps/file-associations.md)) |
| `tools` | Same syntax; listed under Open with, never the default |

## App context and data

`get_app_context()` during component init, inside a window. Everything on it is stable.

| Name | Members |
|------|---------|
| `AppContext` | `window_id`, `app_id`, `window`, `storage` |
| `WindowHandle` | Getters `id`, `is_focused`, `is_maximized`, `is_minimized`, `is_visible`, `bounds`. Controls `focus`, `close`, `minimize`, `maximize`, `restore`, `set_title`, `set_dirty`, `on_back`. Sheets `confirm`, `prompt`, `pick_file`, `pick_directory`, `pick_save` |
| `StorageHandle` | `get`, `set`, `remove`, `persisted`, `window`, `file` |

Option types: `ConfirmOptions`, `PromptOptions`, `PickOptions`, `SaveOptions`, `DirtyOptions`.

Outside the context, from `$lib/core/contexts/app`:

| Export | Stable | Use |
|--------|--------|-----|
| `json_file(path, initial, schema)` → `JsonFile` | yes | Shared reactive JSON file; `value`, `ready`, `error`, `release()`. For widgets, other apps' files, the games kit |
| `live_file(path, initial, schema)` → `LiveFile` | yes | `read()` / `edit()` for shell commands; throws `ShellError` on an invalid file |
| `app_data_path(app_id, name?)` | yes | `/var/lib/apps/{app_id}/{name}` |
| `confirm_discard(win, name)` | yes | The "Discard changes to …?" sheet before New or Open |
| `create_storage_handle(app_id, state)` | yes, for use outside a window | The only way shell code and background players reach `app.{id}.*` (Solitaire's commands, Soundboard's player). Pass `{}` as `state`; `window()` on such a handle keeps nothing |

The barrel exports nothing else. The window frame builds the context with `set_app_context` (`contexts/app/context`) and `create_window_handle` (`contexts/app/window-handle`), and `live_file`'s release delay is `LINGER_MS` (`contexts/app/live-file.svelte`). All three are internal and imported from their own modules.

## Widgets and badges

| Name | Stable | Notes |
|------|--------|-------|
| `WidgetProps` | yes | `props` (validated against the manifest's `props`), `size` (`{ w, h }` cells), `name` (the `.widget` file) |
| `WidgetSize`, `WidgetSizeLimits` | yes | Spans 1–8, `min ≤ default ≤ max` |
| `.widget` file format | yes | JSON `{ app, props?, w, h }` in `/home/Desktop`. Users' widgets live in these, so the format is a promise too |
| `badge` reading | yes | Read inside the shell UI's reactive scope. Back it with `createSubscriber`. `null` or `0` shows nothing |
| A widget has no app context | yes | Use services through `kernel.service` |
| Widget grid, resize grip, desktop layout | no | |

## Shell contributions

An app adds commands through `define_app({ shell })` ([ADR-034](../adrs/034-app-extension-points.md)). Stable:

| Name | Members / values |
|------|------------------|
| `ShellContribution` | `commands`, `completers`, `values` |
| `Command` (via `define_command`) | `id`, `description`, `args`, `positional`, `short`, `yields`, `complete`, `available`, `run`. `app` is set by AppsService, not by you |
| `CommandContext` | `args`, `input`, `piped`, `session`, `signal`, `elevated` |
| `ValueType` | `columns`, `text`, `cell`, `render`, `open` |
| `Value`, `Tagged`, `Output`, `Completer`, `Completion`, `ShellSession` | As typed in `shell/type.ts` |
| `ShellError` | Thrown for a message the user sees as is |
| `arg.kind()`, `arg.path()`, `arg.app()`, `arg.window()`; `ArgKind` | Completion kinds `path`, `app`, `window`, `command`, `theme` |
| `file_value`, `is_file_value`, `FileValue`, `assert_writable` (`$lib/core/api/services/files/shell`) | Yielding files so `open`, `where` and clicking work; the `sudo` guard for writes to system folders |

Behaviour that's promised: a service command wins an id clash with an app command; commands run with no window; app value types merge under the services' ones. Pipeline internals (`plan`, `run_stages`, tokenizer, completion engine) are internal.

## Services through `kernel.service<T>()`

`kernel.service<T>(key)` (throws on an unknown key) and `kernel.platform` (`Platform.DESKTOP | MOBILE`) are stable. Access it in `$derived`, never destructure: services can be swapped (ADR-016). Everything else on `kernel` (`services`, registration, boot) is internal.

The rule for methods: what at least two user apps call is stable. Methods only one app or only system apps use are internal, with the exceptions noted. Counts are user apps out of 42, from a grep on 2026-10-15.

| Key | Stable | Internal (used by) |
|-----|--------|--------------------|
| `apps` | `launch` (19), `open` (4), `get` (1; the manifest lookup is basic enough to promise) | `create_instance`, `register`, `list` (system apps) |
| `files` | `get_file` (17), `get_directory` (11), `create_file` (9), `create_directory` (7), `revision` (7), `list` (3), `delete_entry` (3), `exists` (2), `get_root` (2) | `read_file`, `rename_entry` (one each); `write_file`, `directory`, `move_*`, `copy_*`, `move_paths`, `copy_paths`, `import_entries`, `upload_files`, `export_to_disk`, `get_storage_estimate`, `get_directory_size`, `clear` |
| `notifications` | `notify` (21), `request_system` (3), `update` (1; a `progress` notification is useless without it) | `hide_toast` (Pomodoro), `dismiss`, `mark_read`, `mark_all_read`, `all`, `toasts`, `unread_count` |
| `desktop` | `items` (5), `pin_widget` (7), `remove_item` (7) | `pin`, `open`, `rename_item`, `create_folder`, `names` and the grid/mobile variants |
| `dialogs` | `menu` (7), `show` (3) | `for_window` (Soundboard), `stack`, `system` |
| `shortcuts` | `register` (15) | `list`, `mac` (Quick Notes) |
| `windows` | `page_hidden` (5) | `get`, `get_focused` (Quick Notes); everything else. Inside a window, use `WindowHandle` |
| `settings` | `theme` (read) (6) | All writes and every other field |
| `shell`, `session`, `clipboard`, `ui`, `router`, `version` | nothing | Apps reach the shell through their manifest; the rest are OS-only |

Types that come with the stable methods: `AppsService`, `OpenOptions`, `FilesService`, `FileSystemItem`, `FileSystemFileItem`, `FileSystemDirectoryItem`, `CreateFileOptions`, `ListOptions`, `NotificationsService`, `NotifyOptions`, `NotificationUpdate`, `NotificationAction`, `NotificationId`, `NotificationType`, `DesktopService`, `DesktopItem`, `DialogsService`, `DialogProps`, `DialogOptions`, `MenuItem`, `ShortcutsService`, `KeyShortcut`, `RunShortcut`, `CommandShortcut`, `ShortcutCategory`, `WindowsService`, `WindowId`, `SettingsService`, `Theme`, `Platform`. A service interface type being stable means the stable methods on it, not every member.

## UI kit

`$lib/core/components/ui`, all of it: `Badge`, `BoardOverlay`, `Button`, `Checkbox`, `CopyButton`, `EmptyState`, `IconButton`, `Input`, `Kbd`, `Section`, `Segmented`, `Select`, `Separator`, `SettingRow`, `SideNav`, `Slider`, `Spinner`, `StatusBar`, `Switch`, `Textarea`, `Toolbar`, the variant functions `button`, `field`, `badge`, and the types `IconComponent`, `ButtonVariants`, `FieldVariants`, `BadgeVariants`. Component names and the props documented in [design/components.md](../design/components.md) are stable; how they look is not.

Theme tokens are part of the surface too: the token names in [CONVENTIONS](../CONVENTIONS.md#themes-and-tokens) (`background` ladder, `foreground`, `primary`, `secondary`, `tertiary`, `accent`, `cottontail`, the states) and their Tailwind classes. Renaming one breaks every app's markup, so that's a 2.0. Values change any time.

Not in the kit, internal: everything else under `$lib/core/components/` (`code`, `files`, `dialogs`, `apps/app-badge.svelte`, `brand`, `theme`, `desktop`).

## Games kit

`$lib/core/games`, all of it ([ADR-035](../adrs/035-app-platform-wave-2.md)):

| Area | Names |
|------|-------|
| Time | `format_time`, `FormatTimeOptions`, `Stopwatch` |
| Daily puzzles | `daily_seed`, `parse_day`, `ParsedDay`. `day_key` comes from `$lib/core/utils/date` |
| Play tracking | `track_play`, `PlayTracker`, `use_plays`, `Plays`, `GameStats`, `PlaysSchema`, `EMPTY_PLAYS`, `PLAYS_PATH` |
| Input | `Direction`, `key_direction`, `swipe_direction`, `grid_key_move`, `stroke_axis`, `stroke_end`, `stroke_cells`, `Axis` |

`/var/lib/games/plays.json` (version 1) is stable as a format: Game Hub and every tracked game share it.

## Utilities

The rule: generic helpers used by three or more user apps are stable.

| Module | Stable |
|--------|--------|
| `$lib/core/utils` | `cn`, `clamp`, `pad2`, `error_message`, `escape_html`, `format_bytes`, `format_date`, `format_datetime`, `resolve_token` |
| `$lib/core/utils/type` | `Position`, `Dimensions`, `Bounds` |
| `$lib/core/api/services/files/path` | `split_path`, `join_path`, `resolve_path`, `tilde_path`, `base_name`, `parent_path`, `file_stem`, `file_extension` (the whole module: small and generic; `parent_path` alone is in 14 apps) |
| `$lib/core/api/services/files/hierarchy` | `is_system_path` |
| `$lib/core/utils/device-file` | `pick_device_files`, `DeviceFileOptions` |
| `$lib/core/utils/random` | `create_rng`, `random_seed`, `random_int`, `pick`, `shuffle`, `Rng` |
| `$lib/core/utils/date` | `day_key`, `parse_time`, `resolve_day` |
| `$lib/core/utils/ticker.svelte` | `Ticker` |
| `$lib/core/utils/long-press` | `long_press` |
| `$lib/core/utils/detached-root.svelte` | `detached_root` |
| `$lib/core/utils/print` | `print_html` (ADR-035) |
| `$lib/core/utils/image` | `load_image`, `load_image_at`, `image_files`, `has_files`, `paint`, `save_image`, `extension_for`, `FORMAT_OPTIONS`, `ImageFormat`, `SourceImage` |

Internal, though bundled apps use them: `utils/image`'s `canvas_to_blob`, `write_image`, `read_pixels`, `format_of`, `has_quality`; `utils/history` (Paint, Image Editor); `utils/qr`, `utils/qr-scan.svelte` (QR Reader, P2P Transfer); `utils/zip/*` (Archive); `utils/install.svelte`; `utils/image-format` directly; `$lib/core/utils`'s `tv` and `ov`; `files/opfs`, `files/hierarchy`'s `PATHS`; `components/files/drag`; `components/code`; `settings/themes`. An app that copies one of these and needs it stable should ask for it to be promoted (a minor).

## Storage locations

Users' data sits in these, so moving one is a 2.0 even when no code signature changes.

| Location | Written by | Format |
|----------|------------|--------|
| `localStorage` `app.{id}.{key}` | `storage.get/set/persisted`, `create_storage_handle` | JSON |
| `/var/lib/apps/{id}/` | `storage.file`, `json_file(app_data_path(...))` | Whatever the app writes |
| `/var/lib/games/plays.json` | Games kit | Version 1, `PlaysSchema` |
| `/home/Desktop/*.widget` | `desktop.pin_widget`, the desktop | `{ app, props?, w, h }` |
| `storage.window()` values | SessionService, with the window | Internal file; the promise is that values come back on restore if they pass the schema |

## Known gaps

- The pin test checks names. A signature change (a parameter made required, a return type changed) passes it; review catches those.
- `create_storage_handle(app_id, state)` is stable because two apps need storage outside a window, but its `state` parameter only matters to the window frame. A cleaner out-of-window entry point would be an additive change.
- Two kinds of bundled file still import the games kit through `$lib/core/games/time` or `games/direction`: the Solitaire and Game Hub manifests, and the kernel-free logic files (`game.ts` of Minesweeper, Sudoku, Kakuro, Nurikabe, Futoshiki, Word Search, Snake and 2048, and Pomodoro's `pomodoro.ts`). The barrel re-exports `track_play` and `use_plays`, which reach the kernel through `json_file`. From a manifest that puts the games kit in the boot chunk; from a file a Node test loads, it evaluates the kernel and every manifest in Node, and `define_app` isn't initialized yet. Every other app file imports the barrels. Owner, 2026-10-15: both paths are stable for 1.0 rather than splitting the kit.
- The `$lib/core/api` barrel exports much more than this page promises (theme presets, widget and shortcut file parsers, association ranking, launcher search, `Kernel`, `detect_platform`). Listing isn't promising.
