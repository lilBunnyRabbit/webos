# App API

ADR: [001](../adrs/001-app-manifest-structure.md), [003](../adrs/003-app-context.md), [008](../adrs/008-app-props-validation.md), [018](../adrs/018-file-associations.md), [034](../adrs/034-app-extension-points.md), [035](../adrs/035-app-platform-wave-2.md), [048](../adrs/048-app-kit-layer.md), [049](../adrs/049-lazy-app-metadata.md), [050](../adrs/050-per-mode-dailies.md), [071](../adrs/071-split-color-games.md) · Decided: [1.0 release](../brainstorm/2026-10-15_v1-release.md), [lazy app metadata](../brainstorm/2026-10-18_lazy-app-metadata.md) · Pinned by: `src/lib/core/app-api.test.ts`

What an app may rely on, frozen at 1.0. Written for whoever writes an app in `src/lib/apps/user/{id}/`, including someone who forked WebOS and never reads the core. If it's in a **stable** table below, it keeps working until the next major. Anything not listed is internal: use it if you want, but it can change in any release.

**Stable until 4.0.** Each major so far broke only what's listed here; everything else carried over:

| Major | Break | Moving an app across |
|-------|-------|----------------------|
| 2.0 | The eager `shell: {…}` manifest form was removed ([shell contributions](#shell-contributions)) | Move the object into `commands.ts` and point `shell` at it |
| 3.0 | `description`, `keywords`, `pitch` and `authors` left the manifest for a lazy `meta` module (ADR-049) | Move the four fields into a sibling `meta.ts` (`export default { … } satisfies AppMeta`) and add `meta: () => import("./meta")` |
| 3.0 | The shims `$lib/core/games` (and `games/time`, `games/daily`, `games/direction`) and `$lib/core/utils/image`, kept by ADR-048, were removed | Import the same names from `$kit/games` (and its `time`, `daily`, `direction`) and `$kit/utils/image` |
| 3.59 → 3.61 (exception) | 3.59 made `icon` the URL of an `icon.svg` (ADR-066); 3.61 turned it back into a Svelte component, because the icons drawn on demand showed a placeholder square first. Both shipped in minors because every app that existed lived in this repo and moved with it | Rename `icon.svg` back to `icon.svelte` with a `<script>` taking `...rest` onto the `<svg>`, then `import AppIcon from "./icon.svelte"` and `icon: AppIcon`; `ai_icon` is back for the sparkle |

The detail pages say how each piece behaves ([manifest](apps/manifest.md), [app context](apps/app-context.md), [file associations](apps/file-associations.md), [writing an app](apps/writing-an-app.md)). This page only says what's promised.

## Semver rule

| Change | Version |
|--------|---------|
| Adding to the stable surface: a new export, an optional manifest field, a new handle member, a new service method marked stable | minor |
| Fixing behaviour so it matches this page or the detail pages | patch |
| Removing or renaming anything stable, changing a stable signature incompatibly, changing a stable behaviour or storage location | **major (next: 4.0)** |
| Anything internal | any release, no notice |

"Stable" means the name, the signature and the documented behaviour. A stable function can grow an optional parameter in a minor; it can't lose one. A stable interface can grow an optional member; it can't lose one or make one required.

How it's enforced: `src/lib/core/app-api.test.ts` lists every stable runtime export per module and fails when one disappears (`bun run test:unit`). It also pins the member names of the manifest, the handles and the shell types, and imports every stable type, so removing one fails `bun run check`. A deliberate break edits that test and this page in the same commit, and that commit is the next major (4.0).

The test covers names, not signatures or behaviour. Those are still on you.

## Where to import from

| Module | Stable | Notes |
|--------|--------|-------|
| `$lib/core/api` | Default export `kernel`, the names in the tables below, every type listed here | The barrel also re-exports a lot of OS-only helpers; only what's listed here is promised |
| `$lib/core/api/services/apps/type` | `AppCategory`, `DailyRank` | Older manifests import constants from here directly (before [the import rule](apps/manifest.md#the-import-rule-lifted) was lifted), so this path is part of the promise |
| `$lib/core/api/services/apps/helpers` | `FILE_PROPS`, `define_app` | Same reason |
| `$lib/core/api/services/shell/type`, `shell/arg`, `shell/define` | `ShellError`; `arg`, `ArgKind`; `define_command` | Same reason: each app's `commands.ts` builds its commands |
| `$lib/core/contexts/app` | See [App context and data](#app-context-and-data) | Import from the barrel. The files behind it are internal paths |
| `$lib/core/components/ui` | The whole UI kit | |
| `$kit/games` | The whole games kit | Import from the barrel in components and lazy files |
| `$kit/games/time` | Kernel-free time helpers of the kit | Stable path. Use it from manifests and from logic that Node tests load: the barrel re-exports `track_play`/`use_plays`, which reach the kernel through `json_file` |
| `$kit/games/daily` | `DailyRank`, `DailyRanks`, `better_daily`, `DailyResult`, `daily_key`, `split_daily_key`, `daily_rank_for` | Stable path (1.20; the per-mode names 3.1), same reason as `games/time`: manifests set `daily_rank` |
| `$kit/games/direction` | Kernel-free direction helpers of the kit | Stable path, same reason as `games/time` |
| `$kit/games/grid` | Kernel-free grid helpers of the kit: `grid_key_move`, the stroke helpers, `across_cells`, `down_cells` | Stable path, same reason as `games/time`: puzzle logic with edge clues imports it |
| `$lib/core/utils` and the utility modules in [Utilities](#utilities) | The names listed there | |
| `$kit/utils/image` | The names in [App kit](#app-kit-kit) | |

## Manifest: `define_app`

Discovery: one folder per app, `src/lib/apps/user/{id}/index.ts`, default-exporting `define_app({...})`. No registration. That path and the default export are stable.

| Field | Stable | Notes |
|-------|--------|-------|
| `id`, `name`, `icon`, `category`, `component` | yes, required | `component: () => import("./x.app.svelte")`. Ids double as the storage prefix, so renaming an app's id loses its data |
| `highlights`, `preview` | yes (1.5) | The new-app announcement and the App Store details. `highlights: () => import("./highlights")` (a module whose default is `AppHighlight[]`, `{ icon, title, text }`; lazy since 1.9), `preview: () => import("./preview.webp?url")` (ADR-038) |
| `meta` | yes (3.0) | `meta: () => import("./meta")`, the module default-exporting an `AppMeta` (ADR-049): `description` (one sentence; launcher search and the App Store), `keywords` (launcher search), `pitch` (`AppPitch`, `{ problem, solution }`, one short sentence each: the Showcase tells the app's story with it and falls back to `description`), `authors` (`AppAuthor[]`, `{ name, github?, url? }`; omitted means the owner, `OWNER`; credited in the App Store details, the new-app announcement, Settings › About › Credits and `app info` / `app list`). Every member of `AppMeta` is stable. Loaded during boot, alongside the main chunk, so listings have their text from the first frame (ADR-049 revision 2026-10-24) |
| `author`, `license`, `repository` | **deprecated**, removed in 4.0 | Stored and never read. `author` predates `authors` (now in `meta`). Typed `@deprecated`; drop them from your manifest |
| `defaults` (`constraints`, `flags`, `snap_zone`) | yes | `constraints.width/height.min` is enforced; `max` is accepted and ignored |
| `associations`, `tools` | yes | Syntax below |
| `props` | yes | A zod object schema |
| `daily_rank` | yes (1.20; per-mode record 3.1) | `DailyRank`: `time` (default), `score-asc`, `score-desc`. How the game's daily results rank, time breaking a tie. Or a `DailyRanks` record, mode id → rank: the game has one daily per mode (ADR-050), Game Hub lists a row per mode |
| `restore` | yes | `false` keeps windows out of saved sessions |
| `replaces` | yes (3.70) | `AppReplacement[]`, `{ app, props? }`: ids this app took over (ADR-071). Launches, files, links, the installed list and offline picks naming a removed id open the app whose entry's props match, without those props; an entry without props takes the rest. Rename an app by giving the new one `replaces: [{ app: "old-id" }]`; its `app.{id}.*` data doesn't move ([manifest](apps/manifest.md)) |
| `shell` | yes | `() => import("./commands")`, the module default-exporting a `ShellContribution`. [Shell contributions](#shell-contributions) |
| `badge` | yes | `() => number \| null` |
| `achievements` | yes (3.75) | `Achievement[]`, `{ id, title, text, goal?, secret? }`, plain data in `index.ts` (ADR-078): what the app reports through `get_app_context().achievements`. Every member of `Achievement` is stable ([manifest](apps/manifest.md), [achievements](services/achievements.md)) |
| `on_uninstall_data` | yes (3.57) | `() => import("./uninstall")`, the module default-exporting `() => Promise<void>`, run after an uninstall with data cleared `app.{id}.*` and `/var/lib/apps/{id}`, for stores the OS can't see (IndexedDB, caches). A throw is toasted; the uninstall stands ([manifest](apps/manifest.md)) |
| `on_fire` | yes (3.57) | `() => import("./on-fire")`, the module default-exporting an `OnFire` `(job, { outcome, due })`, called by the scheduler when one of the app's jobs fires or is missed ([manifest](apps/manifest.md#on_fire-adr-062)) |
| `widget`, `widget_size`, `default_widget` | yes | [Widgets and badges](#widgets-and-badges) |
| `system` | no | Set by discovery for `src/lib/apps/system/`, never written by an app |

`define_app` throws on an invalid `widget_size` wherever the manifest is evaluated: in the build's Node step (the catalogue plugin), so the build fails, and when the manifest loads lazily in a tab. `AppCategory` values (`productivity`, `media`, `utilities`, `developer`, `games`) are stable; a new category is a minor.

Types: `AppConfig`, `AppDefinition`, `AppManifest`, `AppMeta`, `AppAuthor`, `AppHighlight`, `AppPitch`, `AppId`, `AppProps`, `AppReplacement`, `WindowOptions`, `WindowFlag`.

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
| `AppContext` | `window_id`, `app_id`, `window`, `storage`, `achievements` (3.75) |
| `AchievementsHandle` | `achieve(id)`, `progress(id, n)` (3.75, ADR-078) |
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
| `WidgetProps` | yes | `props` (validated against the manifest's `props`), `size` (`{ w, h }` cells), `name` (the `.widget` file), `style` (the frame, a `WidgetStyle`; on `clear` nothing sits behind the content, so it should read on any wallpaper) |
| `WidgetStyle` | yes | Const object `CARD` / `GLASS` / `CLEAR` (`card`, `glass`, `clear`). A new style is a minor |
| `WidgetSize`, `WidgetSizeLimits` | yes | Spans 1–8, `min ≤ default ≤ max` |
| `.widget` file format | yes | JSON `{ app, props?, w, h, style? }` in `/home/Desktop` (`style` missing or unknown reads as `card`). Users' widgets live in these, so the format is a promise too |
| `badge` reading | yes | Read inside the shell UI's reactive scope. Back it with `createSubscriber`. `null` or `0` shows nothing |
| A widget has no app context | yes | Use services through `kernel.service` |
| Widget grid, resize grip, desktop layout | no | |

## Shell contributions

An app adds commands through `define_app({ shell: () => import("./commands") })` ([ADR-034](../adrs/034-app-extension-points.md), revised 2026-10-17): a sibling `commands.ts` whose default export is the contribution, loaded by the shell on first use ([manifest](apps/manifest.md#shell-adr-034)). The eager object form was removed (owner's decision, app wave 7): a break of the stable surface, shipped as 2.0. Stable:

| Name | Members / values |
|------|------------------|
| `ShellContribution` | `commands`, `completers`, `values`. `lazy` is OS-only: AppsService uses it to hold the apps' modules back |
| `Command` (via `define_command`) | `id`, `description`, `args`, `positional`, `short`, `yields`, `complete`, `available`, `run`. `app` is set by AppsService, not by you |
| `CommandContext` | `args`, `input`, `piped`, `session`, `signal`, `elevated` |
| `ValueType` | `columns`, `text`, `cell`, `render`, `open` |
| `Value`, `Tagged`, `Output`, `Completer`, `Completion`, `ShellSession` | As typed in `shell/type.ts` |
| `ShellError` | Thrown for a message the user sees as is |
| `arg.kind()`, `arg.path()`, `arg.app()`, `arg.window()`; `ArgKind` | Completion kinds `path`, `app`, `window`, `command`, `theme` |
| `file_value`, `is_file_value`, `FileValue`, `assert_writable` (`$lib/core/api/services/files/shell`) | Yielding files so `open`, `where` and clicking work; the `sudo` guard for writes to system folders |

Behaviour that's promised: a service command wins an id clash with an app command; commands run with no window; app value types merge under the services' ones. Pipeline internals (`plan`, `run_stages`, tokenizer, completion engine) are internal.

## Services through `kernel.service<T>()`

`kernel.service<T>(key)` (throws on an unknown key), `kernel.platform` (`Platform.DESKTOP | MOBILE`) and `kernel.mode` (`Mode.FULL | SOLO`, since 3.63: in a solo link `apps.launch()` of another app only points to Open WebOS, so an app that offers to open another one links to `#/app/{id}` in a new tab instead; Portfolio does) are stable. Access it in `$derived`, never destructure: services can be swapped (ADR-016). Everything else on `kernel` (`services`, registration, boot) is internal.

The rule for methods: what at least two user apps call is stable. Methods only one app or only system apps use are internal, with the exceptions noted. Counts are user apps out of 42, from a grep on 2026-10-15.

| Key | Stable | Internal (used by) |
|-----|--------|--------------------|
| `apps` | `launch` (19), `open` (4), `get` (1; the manifest lookup is basic enough to promise) | `create_instance`, `register`, `list` (system apps); `listings`, `meta` (ADR-049; Game Hub and system UI); `catalogue`, `load`, `installed_catalogue` (ADR-077: Game Hub asks for the full catalogue, system UI and services the rest) |
| `files` | `get_file` (17), `get_directory` (11), `create_file` (9), `create_directory` (7), `revision` (7), `list` (3), `delete_entry` (3), `exists` (2), `get_root` (2) | `read_file`, `rename_entry` (one each); `write_file`, `directory`, `move_*`, `copy_*`, `move_paths`, `copy_paths`, `import_entries`, `upload_files`, `export_to_disk`, `get_storage_estimate`, `get_directory_size`, `clear` |
| `notifications` | `notify` (21), `request_system` (4: Clock, Recipe Box, Pomodoro, Calendar), `update` (1; a `progress` notification is useless without it) | `hide_toast` (no app since Pomodoro moved to the scheduler, 2026-10-21), `dismiss`, `mark_read`, `mark_all_read`, `all`, `toasts`, `unread_count` |
| `desktop` | `items` (5), `pin_widget` (7), `remove_item` (7) | `pin`, `open`, `rename_item`, `create_folder`, `names` and the grid/mobile variants |
| `dialogs` | `menu` (7), `show` (3) | `for_window` (Soundboard), `stack`, `system` |
| `shortcuts` | `register` (15) | `list`, `mac` (Quick Notes); `suspend`, `suspended` (Keyboard & HID Lab) |
| `windows` | `page_hidden` (5) | `get`, `get_focused` (Quick Notes); everything else. Inside a window, use `WindowHandle` |
| `settings` | `theme` (read) (6) | All writes and every other field |
| `scheduler` | `schedule`, `update`, `cancel`, `get`, `list`, `jobs` (read) (Clock, Recipe Box, Pomodoro, Calendar, Moonrabbit; 3.57) | `next`, `missed`, `is_leader`, `triggers`, `last_jump` (system UI and tests) |
| `tasks` | `run` (3.57; API Client, Birdseye, Example, Format Lab, HopSprite, Image Tools, PDF Tools, Shopping List, Soundboard, Video Tools and more). `build` returns `@lilbunnyrabbit/task-manager` tasks; the package is promised at the version `package.json` pins (1.0.1), and a breaking package upgrade is a WebOS major | `jobs`, `active_count`, `get`, `cancel`, `retry`, `remove`, `clear` (Activity Monitor, the taskbar, the toast) |
| `ai` | `features` (read), `availability`, `summarize`, `translate`, `detect`, `prompt`, `extract`, `measure` (3.57; Ask, Unsaid, Doodlehop, Alibi, Shopping List, Warren, the kit's `AiGate`). Chrome's built-in AI is still experimental: when Chrome changes, the wrapper absorbs it where it can, and what it can't is a WebOS major. `MobileAiService` answers "unavailable" and stays that way | `downloads`, `sessions` (Activity Monitor, the Kernel inspector) |
| `speech` | Nothing yet: one user app (Ask) uses it, since 3.71 | `voices`, `speaking`, `queued`, `supported`, `speak`, `feed`, `end`, `stop` (Ask, Settings, the shell) |
| `achievements` | Nothing: apps report through `get_app_context().achievements` (3.75) | `achieve`, `progress`, `list`, `idle` (the app context, App Store, Game Hub, the shell) |
| `shell`, `session`, `clipboard`, `ui`, `router`, `version` | nothing | Apps reach the shell through their manifest; the rest are OS-only |

Types that come with the stable methods: `AppsService`, `OpenOptions`, `FilesService`, `FileSystemItem`, `FileSystemFileItem`, `FileSystemDirectoryItem`, `CreateFileOptions`, `ListOptions`, `NotificationsService`, `NotifyOptions`, `NotificationUpdate`, `NotificationAction`, `NotificationId`, `NotificationType`, `DesktopService`, `DesktopItem`, `DialogsService`, `DialogProps`, `DialogOptions`, `MenuItem`, `ShortcutsService`, `KeyShortcut`, `RunShortcut`, `CommandShortcut`, `ShortcutCategory`, `WindowsService`, `WindowId`, `SettingsService`, `Theme`, `Platform`, `Mode` (since 3.63); since 3.57 `TasksService`, `TaskContext`, `TaskRunOptions`, `TaskReport`, `TaskJob`, `TaskJobId`, `TaskJobStatus`, `AiService`, `AiFeature`, `AiAvailability`, `AiMessage`, `AiPart`, `AiTextPart`, `AiImagePart`, `AiUsage`, `LanguagePair`, `SummarizeOptions`, `TranslateOptions`, `DetectedLanguage`, `SchedulerService`, `Job`, `JobId`, `JobKind`, `JobAt`, `JobRepeat`, `Repeat`, `JobAction`, `JobOpen`, `JobInput`, `JobPatch`, `JobFire`, `FireOutcome`, `OnFire`. `Job` can gain optional fields in a minor: `before` (lead time in minutes, off each occurrence on the wall clock) is the first, in 3.57. A service interface type being stable means the stable methods on it, not every member.

## UI kit

`$lib/core/components/ui`, all of it: `Badge`, `BoardOverlay`, `Button`, `Checkbox`, `CopyButton`, `EmptyState`, `IconButton`, `Input`, `Kbd`, `ResizeHandle`, `Section`, `Segmented`, `Select`, `Separator`, `SettingRow`, `SideNav`, `Slider`, `Spinner`, `StatusBar`, `Switch`, `Textarea`, `Toolbar`, the variant functions `button`, `field`, `badge`, and the types `IconComponent`, `ButtonVariants`, `FieldVariants`, `BadgeVariants`. Component names and the props documented in [design/components.md](../design/components.md) are stable; how they look is not.

Theme tokens are part of the surface too: the token names in [CONVENTIONS](../CONVENTIONS.md#themes-and-tokens) (`background` ladder, `foreground`, `primary`, `secondary`, `tertiary`, `accent`, `cottontail`, the states) and their Tailwind classes. Renaming one breaks every app's markup, so that's a major. Values change any time.

Not in the kit, internal: everything else under `$lib/core/components/` (`files`, `dialogs`, `clipboard`, `apps/app-badge.svelte`, `brand`, `theme`, `desktop`).

## App kit (`$kit`)

`src/lib/kit`, imported as `$kit` ([ADR-048](../adrs/048-app-kit-layer.md)): helpers only apps use, kept out of core. Core never imports it (`src/lib/core/kit-boundary.test.ts`); apps import both. The same rules as core apply: what's listed here as stable keeps working until a major, the rest is internal.

| Module | Stable | Internal (used by) |
|--------|--------|--------------------|
| `$kit/games`, `games/time`, `games/daily`, `games/direction`, `games/grid` | All of it, see [Games kit](#games-kit) | |
| `$kit/utils/paste` | `paste_files({ win, accept, multiple, onfiles, ontext })` (3.73) | |
| `$kit/utils/image` | `load_image`, `load_image_at`, `image_files`, `has_files`, `paint`, `save_image`, `extension_for`, `FORMAT_OPTIONS`, `ImageFormat`, `SourceImage` | `canvas_to_blob`, `write_image`, `read_pixels`, `format_of`, `has_quality` |
| `$kit/utils/picture` | | A picture as a downscaled WebP data URL for documents that keep pictures inline: `picture_data_url(blob, { max_side, quality })` (long edge 1200 px and quality 0.8 by default, never upscaled, decoded through `<img>` so SVG works), `fit_size`, `encode_webp`, `blob_to_data_url` (Proposals) |
| `$kit/utils/image-format` | | The kernel-free format tables, re-exported by `image` (Image Tools, Image Editor import them directly) |
| `$kit/utils/history` | | Undo history (Paint, Image Editor, HopSprite, Doodlehop) |
| `$kit/utils/qr`, `$kit/utils/qr-scan.svelte` | | QR encode, barcode and QR detect (`create_barcode_detector`, `detect_barcode` with the format), `CameraScan` (QR Reader, QR Studio, P2P Transfer, Cards). Without a native `BarcodeDetector` for the asked formats it falls back to jsQR for QR and `linear-barcode` for 1D, both loaded on first use |
| `$kit/utils/linear-barcode` | | Hand-written 1D decoder, the fallback behind `create_barcode_detector`: `decode_linear(gray, formats)` reads EAN-13, UPC-A, EAN-8, UPC-E, Code 128 and Code 39 along 22 averaged scan lines (rows and columns, both directions), each binarized three ways (local midrange, ZXing's row histogram, a local mean), on the frame at up to 2048 px; checksums, quiet zones, and two agreeing lines for Code 39 keep misreads out; `to_gray` (Cards) |
| `$kit/utils/filter` | | CSS canvas filters by hand where `ctx.filter` is ignored (Safari): `canvas_filter_works()` (a one-pixel probe, once), `draw_filtered(context, steps, draw, region?)` (the native filter, or `draw` on a scratch layer filtered by hand and composited back with the context's state), `FilterStep`, `filter_css`; kernel-free `filter/math` (`apply_filter_steps`: the Filter Effects spec matrices for brightness, contrast, saturate, hue-rotate, grayscale, sepia, invert, and its three-box Gaussian in premultiplied alpha, matching Chromium's canvas output to within 3 levels) (Image Editor, Image Tools › Patch, Birdseye) |
| `$kit/utils/caret` | | `caret_at_point(x, y)`, `caret_range_at_point(x, y)`: `caretPositionFromPoint`, or WebKit's `caretRangeFromPoint` where it's missing (Safari before 26.2) (Font Maker, Moonrabbit, Proposals) |
| `$kit/utils/exif` | | The EXIF reader (Metadata, PDF Tools) |
| `$kit/utils/base45` | | RFC 9285 Base45 (`to_base45`, `from_base45`): bytes as QR alphanumeric characters (pairing codes, QR transfer) |
| `$kit/utils/qr-transfer` | | Data too big for one QR ([ADR-053](../adrs/053-qr-data-transfer.md)): `encode_frames(app, payload)` → frames `WQ1:{APP}:{MSG}:{i}/{n}:{data}` (JSON, `deflate-raw`, Base45, 240 bytes a frame); `FrameCollector(app)` gathers them in any order (`add` → `CollectResult`), a newer message starts over, `payload()` once complete; `parse_frame` (Shopping List, Cards) |
| `$kit/components/qr-transfer` | | `QrFrames` (cycling codes, ‹ › and pause) and `QrCollect` (camera, progress dots, `onpayload`; throws reject and start over) (Shopping List, Cards). See [components](../design/components.md#app-kit) |
| `$kit/utils/p2p` | | WebRTC pairing with no server (P2P Transfer, [ADR-052](../adrs/052-p2p-pairing-in-kit.md)): `create_peer`, `create_offer(pc, label?)` → `{ code, channel }`, `accept_offer(pc, code)` → answer code, `accept_answer(pc, code)`, `channel_open(pc, channel?)`, `Inbox` (one message at a time), `read_link(pc)` → `LinkStats`; codes are the SDP's essentials packed in Base45 for a small QR (`encode_signal`, `decode_signal`) |
| `$kit/utils/codecs` (and its kernel-free `codecs/formats`) | | Image codecs in a worker (Format Lab, Media Preview, Image Tools): `ENCODERS` in `codecs/encoders` is the one table of every format the kit writes (PNG, JPEG, WebP, AVIF, JPEG XL, GIF, BMP, ICO, TIFF, QOI, TGA, PPM) with `encode(image, { quality, effort, signal })`; `read_image(file)` in `codecs/source`; the hand-written writers (`gif`, `quantize`, `ico`, `bmp`, `tiff`, `qoi`, `tga`, `ppm`) are kernel-free and importable on their own (Hopsprite, Video Tools, Icon Pack, Image Tools › Test image); `encode(format, image, options, { signal })` → `{ blob, ms }` for JPEG, WebP, PNG (OffscreenCanvas) and AVIF, JPEG XL (jSquash wasm); `decode(blob)` → `ImageData` (the browser's decoder, jSquash for JPEG XL and for AVIF where the browser can't); `compare(a, b)` → SSIM with its window map; `supported(format)`. Up to 4 workers, an idle one ends after 30 s, and aborting a call ends its worker, so a wasm encode stops at once. The wasm loads on first use only. See [codecs](#image-codecs-kitutilscodecs) |
| `$kit/utils/worker` (and `worker/serve` for the worker side) | | Re-exports `$lib/core/utils/worker`, which lives in core because background jobs spawn workers through it (`ctx.spawn`, ADR-081). Typed calls into a dedicated worker: `spawn<Api, Event>(WorkerCtor, { on_event, stopped })` → `call(method, input, { transfer, signal })`, `terminate(reason)`, `alive`, `pending`; in the worker, `serve<Api, Event>(handlers)` answers each call with its handler's result or its error's message and returns `emit(event)` for posts outside any call; `transfer(value, list)` moves buffers either way. Aborting a call ends the worker and rejects every pending call (a busy worker can't be interrupted otherwise); an uncaught error in the worker rejects what's pending and leaves the worker to its owner. `Api` is an interface of one-input methods (`check(words: string[]): string[]`). Pools, singletons and use counts stay with the caller (the codecs pool, Warren's speller, Motion Watch) |
| `$kit/utils/video` (`capture`, `encode`, `webm`, `plan`, `files`) | | Video without a demuxer (Video Tools, Birdseye, Soundboard): `probe_video`, `capture` (plays a detached `<video>` and hands each `requestVideoFrameCallback` frame to `on_frame`, a returned promise holds playback), `WebmEncoder` (VP9 or VP8 + Opus through WebCodecs, back-pressure through `busy`/`drained()`), `decode_audio`, `audio_slices`, `mux_webm`, `probe_tracks` (duration, whether there is a picture, and whether there is sound Chrome plays, read from `captureStream()` tracks), `record_audio` (plays the file muted once and records its sound to Opus WebM through `MediaRecorder`, in real time: Soundboard's fallback when `decodeAudioData` can't read a video's sound), the sizing and time helpers in `plan` (`even_size`, `video_bitrate`, `format_time`, `parse_time`, `Quality`), and `files` (`VIDEO_ACCEPT`, the picker filter in association syntax, and `is_video_name`). `mux_webm` stamps "WebOS" as the muxing and writing app. `fixtures.ts` makes test videos for browser tests |
| `$kit/components/code` | | CodeMirror setup and `CodeView` (Text Editor, Diff, Markdown to PDF, Funky DSL, Forms, SVG Workbench, API Client, Recipe Box) |
| `$kit/components/ai-gate` | | `AiGate`: checking, unavailable (the requirements text), the one-time download notice, then the app (Ask, the AI games, Style Guide). See [components](../design/components.md#app-kit) |
| `$kit/components/ai-icon` | | `ai_icon(Icon)`: an app icon with a `primary` sparkle cut into its top-right corner, for apps that need on-device AI (Ask, Unsaid, Doodlehop, Alibi; shown in Style Guide). Small enough for manifests. See [components](../design/components.md#app-kit) |
| `$kit/components/crop-frame` | | `CropFrame` and its crop geometry (Image Editor, Shopping List, Style Guide). See [components](../design/components.md#app-kit) |
| `$kit/components/swipe-compare` | | `SwipeCompare`: two snippets under a wipe divider with zoom, pan and pinch (Format Lab, Image Tools › Compare, Style Guide). See [components](../design/components.md#app-kit) |
| `$kit/components/waveform` | | `Waveform`: peaks on a canvas, trim and selection markers grabbed by tabs, a playhead, zoom and scroll with a time ruler (Soundboard, Style Guide). See [components](../design/components.md#app-kit) |
| `$kit/utils/audio` | | Kernel-free PCM: `Pcm`, `pcm_of(AudioBuffer)`, `encode_wav` / `wav_blob` (16-bit PCM WAV, channels interleaved), `normalize_regions`, `subtract_regions`, `cut_regions` (keeps regions in order, each seam a 10 ms linear crossfade, so the result is shorter by that much per seam), `peaks`, `peak_index` + `peaks_between` (min/max per 256 frames, so a zoomed view draws only its range) (Soundboard) |
| `$kit/utils/roadmap` | | `docs/ROADMAP.md` as data: `parse_roadmap` (`##` group, `###` section, checklist items with status and depth), `count_status`, `plain` (inline markdown to text), `ItemStatus` (Settings › Roadmap, Docs) |
| `$kit/utils/view` | | 2D camera math: `View`, `Point`, `to_screen`, `to_image`, `clamp_scale`, `fit_view`, `zoom_view`, `pinch_view` (`SwipeCompare`, Image Tools, Jigsaw) |
| `$kit/utils/report-error` | `report_error(app_id, title, reason)` (3.57) | `report_error`: an error toast whose message is `error_message(reason)`, the one-liner apps use for a failed save, open or copy (most apps; Clock's and Calendar's `attempt()`) |
| `$kit/utils/flash.svelte` | `Flash` (`text`, `show`, `clear`) (3.57) | `Flash(ms)`: a short status line that clears itself `ms` after `show(text)`; `clear()` drops it early. Construct it during component init, its timer is an `$effect` (Alibi, Crack the Code, Hex Guess, Letterer) |

The old paths `$lib/core/games` (and its `time`, `daily`, `direction`) and `$lib/core/utils/image` re-exported these until 3.0, which removed them. `history`, `qr`, `qr-scan`, `exif`, `image-format` and `components/code` were internal before the move, so their old paths are gone.

### Image codecs (`$kit/utils/codecs`)

Internal: Format Lab, Media Preview, Image Tools, Hopsprite, Video Tools and Icon Pack use it; the API can change in any release ([ADR-064](../adrs/064-kit-encoder-table.md)).

- **Formats.** `CodecFormat` (`jpeg`, `webp`, `avif`, `jxl`, `png`) and `CODECS[format]`: label, MIME, extension, whether it's wasm, the default quality, the effort range (AVIF `Speed` 0–10, higher is faster; JPEG XL `Effort` 1–9, higher is slower and smaller) and whether it can be lossless. `default_options(format)`, `format_for_name(name)`, and `is_jxl` / `is_avif` signature checks.
- **Encoder table** (`encoders.ts`). `EncoderFormat` adds `gif`, `bmp`, `ico`, `tiff`, `qoi`, `tga`, `ppm` to the five codecs; `ENCODER_INFO[format]` (kernel-free, in `formats.ts`) holds label, MIME, extension, `lossy` (takes a quality) and `alpha`; `ENCODERS[format]` adds `encode`. Every encode, hand-written ones included, runs in the worker pool (`write.ts` dispatches them), so a 256-colour GIF of a photo never blocks the page and Cancel ends it. `encoder_for_mime(type)` maps a source's MIME type back.
- **Writers.** GIF: LZW and the GIF89a blocks (`gif.ts`), a still image as median cut to 256 colours with Floyd–Steinberg (`quantize.ts`), under half alpha as the one transparent entry. BMP: 24-bit top-down, or 32-bit BGRA behind a BITMAPV4HEADER with an alpha mask when any pixel isn't opaque. ICO: PNG entries at 16, 32, 48 and 256 px (never past the image's own size), the image centred on a transparent square. TIFF: baseline little-endian, one uncompressed strip, unassociated alpha. QOI: spec 1.0. TGA: type 2 uncompressed, top-left origin, 32-bit with alpha, TGA 2.0 footer. PPM: binary P6, alpha flattened onto white.
- **Options.** `quality` 1–100 for every lossy format (jSquash's own scale for AVIF and JPEG XL, `quality / 100` for the canvas), `effort`, `lossless`. Lossless WebP is Chromium's canvas encoder at quality 1. JPEG is flattened onto white.
- **Worker.** `codecs.worker.ts`, loaded with Vite's `?worker` and spoken to through `$kit/utils/worker` (`serve<CodecApi>` in the worker, one `spawn` per pool slot); `vite.config.ts` sets `worker.format: "es"` (the worker imports jSquash lazily) and excludes `@jsquash/*` from `optimizeDeps` (pre-bundling moves the module away from the `new URL("x.wasm", import.meta.url)` it locates its wasm by). The build emits the wasm under `assets/`, so it resolves under `/webos/`. jSquash also ships multithreaded encoders; they need cross-origin isolation, which GitHub Pages doesn't give, so the single-threaded ones run.
- **SSIM** (`ssim.ts`, pure, Node-tested): Wang et al. on BT.601 luma with transparency flattened onto white, 8×8 windows every 4 px (column sums per band, about 12 operations a pixel). `map` holds each window's value for a heatmap.
- **Known gaps.** jSquash's JPEG XL decoder rounds a few lossless values one step off. Decoding is 8 bits per channel, sRGB: HDR and high bit depth are tone-mapped or truncated. The wasm isn't in the PWA precache (2–3.5 MB each), so AVIF and JPEG XL need the network the first time; after that the service worker's `webos-wasm` runtime cache serves it offline ([service worker](services/version.md#service-worker)).

## Games kit

`$kit/games`, all of it ([ADR-035](../adrs/035-app-platform-wave-2.md)):

| Area | Names |
|------|-------|
| Time | `format_time`, `FormatTimeOptions`, `Stopwatch` |
| Daily puzzles | `daily_seed`, `parse_day`, `ParsedDay`, `DailyRank`, `DailyRanks`, `DailyResult`, `better_daily`, `daily_key`, `split_daily_key`, `daily_rank_for`. `day_key` comes from `$lib/core/utils/date` |
| Play tracking | `track_play`, `PlayTracker`, `use_plays`, `Plays`, `GameStats`, `PlaysSchema`, `EMPTY_PLAYS`, `PLAYS_PATH` |
| Input | `Direction`, `key_direction`, `swipe_direction`, `grid_key_move`, `stroke_axis`, `stroke_end`, `stroke_cells`, `Axis` |
| Edge clues | `across_cells`, `down_cells`: the two cells an edge between neighbours joins, across edges indexed `row * (width - 1) + col`, down edges `row * width + col` (Futoshiki's signs, Sun & Moon's `=` and `×`) |
| Regions | `region_edges(regions, width)` → per cell the `Edge` bits (`TOP`, `RIGHT`, `BOTTOM`, `LEFT`) of sides that face another region or the board's edge, where a thick border goes (Hutches, Plots; 3.42) |
| Drawn paths | `path_step(path, cell, can_step)`: a cell on the path cuts back to it, a new one joins when `can_step(head, cell, path)` allows; the same array back when nothing changed. `grid_walk(width, from, to, rows_first?)` fills the cells a fast drag skipped, `path_walk` applies `path_step` along them up to the first refusal, `orthogonal(width, a, b)`, `PathRule`. Kernel-free in `$kit/games/path` (Hop; 3.44) |

`/var/lib/games/plays.json` (version 1) is stable as a format: Game Hub and every tracked game share it. A daily entry is `{ ms, score? }`; `score` was added in 1.20 and is optional, so older files stay valid. `PlayTracker.daily(day, ms, score?, mode?)` keeps the better result by the manifest's `daily_rank`. A day's keys are app ids, or `{app_id}/{mode}` for one mode of a game with a per-mode `daily_rank` (3.1, ADR-050); `daily_key(app_id, mode?)` builds one and `split_daily_key` takes one apart, so a reader that looks up a manifest by key splits first.

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

Internal, though bundled apps use them: `utils/zip/*` (Archive); `utils/install.svelte`; `$lib/core/utils`'s `tv` and `ov`; `files/opfs`, `files/hierarchy`'s `PATHS`; `components/files/drag`; `settings/themes`; `services/scheduler` (Clock, Recipe Box, Pomodoro, Calendar), `scheduler/occurrence` (Calendar: `next_occurrence`, `pending`), `scheduler/chime` (Pomodoro); `utils/zoned` (Clock, Calendar); `utils/font-loader` (Warren). The app kit's internal modules are listed under [App kit](#app-kit-kit). An app that copies one of these and needs it stable should ask for it to be promoted (a minor).

## Storage locations

Users' data sits in these, so moving one is a major even when no code signature changes.

| Location | Written by | Format |
|----------|------------|--------|
| `localStorage` `app.{id}.{key}` | `storage.get/set/persisted`, `create_storage_handle` | JSON |
| `/var/lib/apps/{id}/` | `storage.file`, `json_file(app_data_path(...))` | Whatever the app writes |
| `/var/lib/apps/{id}/achievements.json` | AchievementsService | Version 1, `{ unlocked: { [id]: epoch_ms }, progress: { [id]: number } }`; kept by an uninstall with data (3.75, ADR-078) |
| `/var/lib/games/plays.json` | Games kit | Version 1, `PlaysSchema` |
| `/home/Desktop/*.widget` | `desktop.pin_widget`, the desktop | `{ app, props?, w, h, style? }` |
| `storage.window()` values | SessionService, with the window | Internal file; the promise is that values come back on restore if they pass the schema |

## Known gaps

- The pin test checks names. A signature change (a parameter made required, a return type changed) passes it; review catches those.
- `create_storage_handle(app_id, state)` is stable because two apps need storage outside a window, but its `state` parameter only matters to the window frame. A cleaner out-of-window entry point would be an additive change.
- Two kinds of bundled file still import the games kit through `$kit/games/time`, `games/direction`, `games/grid` or `games/path`: the Solitaire and Game Hub manifests, and the kernel-free logic files (`game.ts` of Minesweeper, Sudoku, Kakuro, Nurikabe, Futoshiki, Sun & Moon, Hop, Word Search, Snake and 2048, and Pomodoro's `pomodoro.ts`). The barrel re-exports `track_play` and `use_plays`, which reach the kernel through `json_file`. From a manifest that puts the games kit in the boot chunk; from a file a Node test loads, it evaluates the kernel and every manifest in Node, and `define_app` isn't initialized yet. Every other app file imports the barrels. Owner, 2026-10-15: both paths are stable for 1.0 rather than splitting the kit.
- The `$lib/core/api` barrel exports much more than this page promises (theme presets, widget and shortcut file parsers, association ranking, launcher search, `Kernel`, `detect_platform`). Listing isn't promising.
