# System apps

The apps bundled with the OS, in `src/lib/apps/system/{id}/`. Each one is an `index.ts` manifest made with `define_app` plus a lazy `{id}.app.svelte`, and they're auto-discovered like any other app ([manifest](apps/manifest.md), [writing an app](apps/writing-an-app.md)). Apps in `src/lib/apps/user/` aren't OS and aren't covered here.

All of them live in `src/lib/apps/system/`, so discovery sets `system: true`: the launcher lists them under System, last. Each still declares a `category` for search. All UI is built from the kit in `$lib/core/components/ui` and follows the app frames in [docs/design/patterns.md](../design/patterns.md) (ADR-024).

| id | Name | Associations | Props | Window `defaults` | Services | App storage ([app context](apps/app-context.md)) |
|----|------|--------------|-------|-------------------|----------|-------------|
| `file-explorer` | File Explorer | none | `FILE_PROPS` (a folder path) | none | files, apps, notifications (through the shared components) | none |
| `settings` | Settings | `.webos-theme` | `{ section?, setting?, path? }` (a page id, `appearance` meaning Theme; a search id to ring; a `.webos-theme` file to import) | min 640×480 | settings, version, apps, backup, notifications, scheduler, files, dialogs, shortcuts, shell | window: `section`, `sub`, `open`, `target`, `import` |
| `kernel` | Kernel | none | none | none | the kernel itself | window: `expanded` |
| `text-editor` | Text Editor | `text/*` + `.md .json .ts .js .svelte .yaml .yml .toml .ini .log .env`; tool for `.http .rest .cook .fdsl` | `FILE_PROPS` | none | files, notifications, shortcuts, settings | window: `wrap`, `markdown` |
| `media-preview` | Media Preview | `image/*`, `video/*`, `audio/*` | `FILE_PROPS` | min 400×300 | files | none |
| `pdf-viewer` | PDF Viewer | `application/pdf`, `.pdf` | `FILE_PROPS` | min 400×300 | files, apps (Edit in PDF Tools) | none |
| `html-preview` | HTML Preview | `text/html`, `.html`, `.htm` | `FILE_PROPS` | min 400×300 | files | none |
| `csv-viewer` | CSV Viewer | `text/csv`, `text/tab-separated-values`, `.csv`, `.tsv` | `FILE_PROPS` | min 400×300 | files | none |
| `activity-monitor` | Activity Monitor | none | `{ section? }`: opens on that section (`tasks` from the taskbar) | min 480×360 | windows, files, apps, desktop, notifications, tasks | window: `section`, `open` |
| `style-guide` | Style Guide | none | none | min 720×520 | none | window: `section`, `open` |
| `terminal` | Terminal | none | `{ cwd?, run? }`: start folder, a line to run once | none | shell (`tilde_path` from `services/files/path` for display, no files service) | window: `cwd`, `scrollback`, `started` |
| `calculator` | Calculator | none | none | min 280×360 | clipboard, notifications | `history`; window: `calc`, `solved`, `show_history` |
| `app-library` | App Library | none | `{ view?, app? }`: `showcase` or `store`, and an app whose details open | min 340×360 | apps, windows, session, desktop, notifications, version, clipboard | window: `page`, `category`, `showcase_category`, `filters`, `sort`, `view`, `selected` |
| `getting-started` | Getting started | none | `{ topic? }`: scrolls to that card | min 340×360 | shell, apps, desktop, files, router, shortcuts, notifications | `storage.file("progress.json")`: `{ tried }` |

"None" for window defaults means the windows service fallback applies ([windows](services/windows.md)). `FILE_PROPS` is `z.object({ path: z.string() })`, an absolute OPFS path (ADR-018). Manifests import it from `services/apps/helpers`, not from the barrel, to avoid the TDZ problem described in [CONVENTIONS](../CONVENTIONS.md#apps). "window:" keys are `storage.window()` state, per window and saved with the session ([app context](apps/app-context.md#window)). Others are `storage.persisted()` cells, localStorage `app.{id}.{key}` shared by every window of the app ([persistence](persistence.md#app-storage-handle)).

**Phones and tablets** (ADR-016 apps pass). Every app runs fullscreen in the [mobile shell](shell/mobile.md). Layout adapts through container queries and the kit's `pointer-coarse:` sizes; File Explorer reads `kernel.platform` to open on tap and uses long press for menus, and claims the Back button with `window.on_back`.

On first boot the desktop seeds shortcuts to `getting-started`, `settings`, `file-explorer` and `terminal` (`DEFAULT_SHORTCUTS` in `services/desktop/folder.svelte.ts`, [desktop](services/desktop.md#behaviour--invariants)).

---

## File Explorer

`file-explorer` · own `icon.svelte` · source `system/file-explorer/`

**Purpose.** Browse and manage OPFS.

**Props.** `props: FILE_PROPS`, `{ path }` = the folder to open at, default `/home`. The desktop launches it with `{ path: "/home/Desktop/{folder}" }` when a desktop folder is opened. A missing folder shows an error empty state, "Couldn't open this folder".

**Implementation.** `file-explorer.app.svelte` only renders `<FileExplorer {path} />` from `core/components/files/`. Everything is documented in [FilesService → File explorer components](services/files.md#file-explorer-components): navigation, interactions, opening files and error handling.

**Features.** A document-style frame: toolbar, list, status bar.

- **Toolbar:** Back and Forward (history only), Reload, a breadcrumb of the real path (`/ home › Desktop`, every segment clickable), a filter field (always shown, wider from `@lg`), New folder (`prompt()`), Upload (a menu: Upload files…, Upload a folder…, and Mount a folder (no copy)… where the browser has a folder chooser; ADR-044) and Open in Terminal (the Terminal starting in this folder; hidden in the picker). The folder's own right-click menu ends with Open in Terminal too.
- **History:** `history` holds the folders visited before this one and `forward` the ones left by Back, nearest last, as paths; a handler is opened only when the user steps back or forward to it. Back moves the current folder onto `forward`, Forward moves it onto `history`, and each skips folders that no longer exist (disabled when its stack is empty). Opening any folder another way (double-click, breadcrumb, Places) clears `forward`. No keyboard shortcut for either; on mobile the OS Back walks `history` through `window.on_back`.
- **Places sidebar** (from `@3xl`): Home, Desktop, Documents, Downloads, and the System folders `/etc`, `/var`, `/tmp`, with the current one highlighted (clicking it is a no-op).
- **List:** a grid with sticky overline headers (Name, Size, Modified; Modified from `@md`), 32px rows, folders first in `primary`, files as duotone icons, `.desktop` rows drawn as `ShortcutIcon` with the target app's icon, and a "system" badge on `/etc`, `/var`, `/tmp` and below. Skeleton rows while loading, empty states for an empty folder and for a filter with no matches.
- **Actions:** open a file in its associated app (double-click or Enter; a tap on mobile, through `apps.open`; a `.desktop` shortcut launches its target), enter a folder, delete (Delete or Cmd+Backspace, `confirm()`; folders recursive).
- **Compress and Extract here** (item menu, `compress_items` / `extract_here` in `file-actions.ts`): Compress zips the selection into the current folder, named after the one item (`Photos.zip`, `report.zip`) or `Archive.zip`, numbered when taken. Extract here, on one `.zip`, extracts into a new folder next to it named after the archive. Both run the zip engine in core (`core/utils/zip/operations.ts`: `compress_into`, `extract_to`, loaded on first use, shared with the Archive app) with a progress toast from File Explorer and Cancel; a cancelled or failed run offers Discard (deletes the partial zip or the new folder) or Keep. Disabled inside system folders.
- **Multi-select and drag** (desktop pointer): click, Ctrl+click, Shift+click, Ctrl+A, a rectangle from empty space; Cut, Copy, Delete and Open act on the selection. Drag rows onto a folder, into another Explorer window or onto the desktop to move them ([details](services/files.md#multi-select-and-drag-and-drop)).
- **Bulk rename** (several selected, F2 or `Rename N items…`): a sheet with a name pattern (`{name}`, `{ext}`, `{n:3}`, `{date:…}`, `{parent}`, case modifiers, or `/regex/replacement/flags`), find and replace, and a live old → new preview that blocks clashes; renames run in two phases and roll back on a failure ([details](services/files.md#bulk-rename)). Phones have no multi-select, so there it's the `rename` command.
- **Read-only system folders:** inside `/etc`, `/var`, `/tmp`, and `/mnt` itself (`is_read_only_path`) New folder, Upload, Paste and drops are disabled, and the empty state says "System folders are read-only." A locked entry (`is_locked_path`: anything system, plus the layout folders `/home`, `/home/Desktop`, `Documents`, `Downloads`, `/mnt`, and mount points, whose menu has Unmount in place of Delete) can't be cut, renamed, deleted or dragged; its menu items are disabled and F2, Ctrl+X and Delete do nothing. Copy, Open, Save to disk and Properties still work.
- **Mounted folders (ADR-044):** real folders from the disk at `/mnt/<name>`, listed under "On disk" in Places. Inside one everything works as in `/home`, but deletes change the disk: the confirm says "Delete 3 items from Photos on your disk? This can't be undone." After a reload a mount is locked: Places shows a lock, and opening it shows "Photos is locked" with Reconnect, which asks the browser again. Unmount from the mount's menu in `/mnt`.
- **Status bar:** one truncating line: item count (folder/file breakdown from `@sm`), and a storage meter with usage of quota (from `@md`).

**Known gaps.**

- Folders update live when another window or a service changes them (each `DirectoryHandler` watches its revision). A folder deleted or moved elsewhere sends the window to the nearest existing parent with a toast. Changes in other browser tabs still need a manual reload.
- No associations, so `apps.open()` on a folder path doesn't reach it. Only `launch("file-explorer", { path })` does.
- No multi-select on phones and tablets and no arrow-key selection. Real files and folders dropped from the OS are imported (folders need Chromium). New folder and delete use window sheets (`window.prompt` with name validation, `window.confirm` with `danger`).

---

## Settings

`settings` · own `icon.svelte` · source `system/settings/`

**Purpose.** Change the theme, wallpaper, text and interface, taskbar, notifications and remembered default apps; back up, restore and reset; read every release's notes and the roadmap; see build info and who made the apps, install WebOS and check for updates. Every setting is findable by name ([search](#settings-search)).

**Services.** `settings` ([settings](services/settings.md)), `version` ([version](services/version.md)), `apps` (Default apps names and icons, Credits, Related links), `shortcuts` and `shell` (the Shortcuts page), `backup` ([backup](services/backup.md)), `scheduler` (Notifications) and `notifications` (errors). All through `$derived(kernel.service(...))`.

**Files.**

| File | Contents |
|------|----------|
| `settings.app.svelte` | `SideNav` in drill-in mode with the search field and results, the open page (`max-w-2xl` centered, `h1` or a breadcrumb on a subpage), Related links, the `setting` reveal |
| `ids.ts` | `PAGE_IDS`, `SECTION_IDS` (pages plus the `appearance` alias), `page_of()`, `Subpage`. The only module the manifest imports, so no icons reach the boot chunk |
| `pages.ts` | `PAGES` (id, label, icon, group, optional platform), `pages_for(platform)`, `SUBPAGE_LABELS`, `RELATED` |
| `search.ts` | The static search index `SETTINGS`, `search_settings()`, `find_setting()`, `place_of()`, `complete_setting()`. Loaded with the app, or by the `setting` completer on first Tab |
| `commands.ts`, `shell.ts` | The `settings [setting]` command and its `setting` completer ([shell](#settings-shell)) |
| `sections/theme.svelte` | Theme: Your themes (each card with a ⋯ menu), the WebOS presets, Project themes, Make your own (Create a theme, Edit colours) |
| `sections/generate.svelte` | Theme › Create a theme |
| `sections/colours.svelte` | Theme › Edit colours: one `SettingRow` per token, grouped Surfaces, Text and brand, States |
| `sections/theme-import.svelte` | The import preview for one `.webos-theme` path: reads and checks it, then a `ThemeCard`, Import and Cancel |
| `theme-file.ts` | `.webos-theme` format: `serialize_theme_file()`, `parse_theme_file(raw, is_colour)`, `free_theme_name()`, `theme_file_name()`, `THEME_FILE_EXTENSION`. Unit tests in `theme-file.test.ts` |
| `sections/wallpaper.svelte` | Wallpaper: Style tiles, Image (choose, fit, dim, blur), Live wallpapers (desktop only) |
| `sections/interface.svelte` | Text & interface: Readability (Text size, Motion), Fonts, Shape (Corners, Shadows) |
| `sections/fonts.svelte` | The Fonts section: UI font and Code font pickers, a font file per role, installed fonts with Remove |
| `sections/taskbar.svelte` | Taskbar (desktop only): position, size, auto-hide, seconds, live preview |
| `sections/notifications.svelte` | Notifications |
| `sections/files.svelte` | Default apps |
| `sections/shortcuts.svelte` | Shortcuts: the OS set |
| `sections/backup.svelte` | Backup & reset: area switches with sizes, Download backup, Restore… (ADR-037), Reset settings |
| `sections/offline.svelte` | Offline: which apps stay offline (ADR-065) |
| `sections/whats-new.svelte` | The changelog (ADR-026) |
| `sections/roadmap.svelte` | The Roadmap page: loads `docs/ROADMAP.md?raw` lazily, the filter and the section cards |
| `sections/about.svelte` | Install, build info, updates, introduction replay, feedback, credits, source link |
| `sections/related.svelte` | The Related row at a page's bottom: `RELATED[page]`, pages it links to and apps it launches |
| `roadmap.ts` | `parse_roadmap`, `count_status`, `plain` (inline markdown to text), `ItemStatus`. Unit tests in `roadmap.test.ts` |
| `color.ts` | `to_hex()` (a batch of colours) and `to_oklch()` for the colour picker, through probe elements and relative colour syntax. A batch appends every probe before reading any, so it costs one style recalc |
| `settings.browser.test.ts` | Mounts the app (fixture `fixtures/settings-host.svelte`) once per index id and fails when the id has no anchor on its page; aliases, the ring, and search with Enter |

**Layout.** The settings-style frame with drill-in ([patterns](../design/patterns.md#app-frames)): a grouped `SideNav` (Personalise: Theme, Wallpaper, Text & interface, Taskbar; System: Notifications, Default apps, Shortcuts, Backup & reset, Offline; WebOS: What's new, Roadmap, About) with the search field on top. From `@2xl` sidebar and page sit side by side; below, the list shows first and a page replaces it with a "‹ Settings" bar; the phone's Back leaves a subpage first, then the page (`onback`, then SideNav's `window.on_back`). The window's minimum width (640) is below `@2xl`, so a narrow desktop window drills too. Taskbar is left out on phones (`pages_for(kernel.platform)`; a restored or linked `taskbar` falls back to Theme). Window state: `section` (the page; `appearance` parses to `theme`), `sub` (Theme's `create` or `colours`, or `null`), `open` (narrow: the page is showing; true when opened with a section, setting or path), `target` (a `setting` to ring once on mount, then `null`, so a restored window doesn't ring again) and `import`. Picking a page from the list clears `sub` and scrolls to the top. Theme cards are `ThemeCard` from `$lib/core/components/theme/` (one preset as a miniature OS in its own colours), shared with the introduction.

**Who opens which page.** The "Updated to vX" toast → `{ section: "whats-new" }`; Getting started's backup card → `backup`; the scheduler's test notification → `notifications`; Choose apps (the offline migration toast, the launchers' offline note, an app that isn't saved) → `offline`; the desktop's "Change wallpaper or theme" → `wallpaper`; a `.webos-theme` file → Theme with the import preview; `settings <id>` → any page or setting.

<a id="settings-search"></a>**Search.** `search.ts` lists every page and every `Section` or `SettingRow` worth finding as `{ id, page, label, keywords, sub?, platform? }`: a page entry's id is the page id, any other id is the `setting` anchor on that page (`sub` entries mark the subpage's root instead and open it without a ring). Typing replaces the sidebar list with results (SideNav's `list`): an overline count, then one option per hit with its label and place ("Text & interface", "Theme › Create a theme"). Ranking is `search_ranked` from `core/utils/search.ts`, the launcher's ranker generalised (label, then keywords, then place and id; every word must match; one typo forgiven in words of five letters or more), ties in index order. The field is a combobox: ArrowUp/Down move the active option, Enter or a click opens it, Esc clears. Opening one sets the page and subpage, drills in, then `reveal_setting(main, id)` (`ui/setting-anchor.ts`) scrolls the anchor to the centre and sets `data-targeted` for 2.4 s, which a `SettingRow` draws as a `primary/10` fill with an inset `primary` ring and a `Section` as a `primary` outline (`TARGETED_ROW`, `TARGETED_SECTION`); if focus was left on something now hidden (the list), it moves to the row's control. The browser test keeps index and anchors in step. Entries are platform-filtered like the pages.

<a id="settings-shell"></a>**Shell.** `define_app({ shell })` (ADR-034): `settings [setting]` opens Settings, at a page (`settings wallpaper`) or a setting (`settings text-size`, ringed). An unknown id fails with up to three suggestions from the search. The `setting` completer offers ids starting with what's typed, else search hits, each with its label and place. Both import `search.ts` lazily.

| Section | What it does |
|---------|--------------|
| Theme | Grids of `ThemeCard`s: "Themes" for `THEME_PRESETS` in group `webos`, "Project themes" for group `projects` (Speed Reader, While True). Clicking one replaces the theme with a copy. The active preset is the one whose 17 tokens all equal `settings.theme` (else a matching saved theme is named); it gets a `primary` ring and a check. The section description names it, or says "A customised theme is active." ([theming](theming.md)) |
| Theme › Your themes | Always shown, above the presets; with no saved themes it's only the header ("Save one from Create a theme, or import a .webos-theme file."). A `ThemeCard` per saved theme; clicking applies it, the active one gets the ring and check, and the Themes section's description names it. A ⋯ `IconButton` on each card (and right-click) opens the menu: Apply, Rename… (`ask_theme_name`, then `renamed_saved`), Export, Delete… (a danger confirm, then `without_saved`). **Export** writes `serialize_theme_file()` to `/home/Documents/{name}.webos-theme` (`/` and `\` in the name become `-`) through `files.create_file`, so a taken name becomes `{name} (1).webos-theme` (CONVENTIONS → Files: no overwrite); a toast names the path with **Show folder** (File Explorer on Documents). Failures go through `report_file_error`. **Import…** in the header opens `window.pick_file` (accept `.webos-theme`, starting in Documents) and shows the import preview for the chosen file |
| Theme › Import theme | Shown at the top of Theme while the window's `import` state holds a path: from the `path` prop (opening a `.webos-theme` file anywhere, through the association) or from Import…. `theme-import.svelte` reads the file and runs `parse_theme_file` with `CSS.supports("color", value)`; a missing file, another format, a newer `version`, a missing token or a value that isn't a colour toasts "Couldn't import the theme" with the reason and drops the preview. Otherwise a `ThemeCard` under the name it will get, Cancel and Import. The name is `free_theme_name()`: a clash with a saved theme or a preset (case ignored) appends " (2)", " (3)"… and the description says so. Import (or clicking the card) adds it with `with_saved` and applies it. Both buttons clear `import`, which is window state, so a restored window doesn't ask again |
| Theme › Make your own | Two setting rows that open the one-level subpages Create a theme and Edit colours. A subpage shows a breadcrumb (‹, Theme, ›, the subpage) in place of the `h1`; ‹, Theme or the phone's Back return. Related links are hidden there |
| Theme › Create a theme | `sections/generate.svelte`. Mode (Segmented: Dark, Light, Any), Harmony (Select: Any or one of four), Vibrance and Contrast (sliders 0–100) in setting rows; a `ThemeCard` preview of `derive_theme(preview)` ("Preview", or "Applied" with the active ring when it equals the theme; clicking it applies), Generate and Apply. Below, the five base colours as swatches with a lock toggle each. Generate calls `generate_theme` with the locked swatches kept ([settings](services/settings.md#public-api)) and remembers the result; Apply sets `derive_theme(preview)`; Save… asks a name (`ask_theme_name` in `theme-name.ts`: not empty, not a preset's, not another saved theme's) and adds `derive_theme(preview)` to `saved_themes`. The preview starts as the applied theme, the mode as its light or dark. "Recent" shows the last 3 generations as `ThemeCard`s; clicking one loads it into the preview, right-click offers Apply and Save…. They live in `generator.svelte.ts`, module state in the Settings app (owner): they outlive the Settings window, not a reload. Replaced the Shuffle button |
| Wallpaper | Style: tiles (16:10 previews drawn by the real `wallpaper.svelte` with `value`) for Grid, Glow, Tint and Plain, then Image: the current image, or "Image…" which opens the picker. The active tile gets the `primary` ring and a check. Image: a Picture row with "Choose image…" (`window.pick_file`, `image/*`; a device image comes through the picker's "This device…") calls `settings.set_wallpaper_image`; failures toast. With an image: Fit (Segmented: Fill, Fit, Tile, Center), Dim (slider 0–60%) and Blur (slider 0–20px), each writing a new `wallpaper` object. On the phone a live wallpaper marks Grid active, since that's what it draws |
| Wallpaper › Live wallpapers | Desktop only (`kernel.platform`), its own `Section` after Image (ADR-057). A tile per `LIVE_WALLPAPERS` entry, its preview the real `wallpaper.svelte` with `value`, so the entry's background renders a still frame (`preview` and `paused` true, the 14px thumbnail grid). Picking one sets `{ kind: "live", id }`. The selected entry shows an `AppByline` from its `authors`, then its lazy `settings` form, given `live_options_of(id, settings.live_options[id])` and writing `settings.live_options = { ...settings.live_options, [id]: next }`; two Settings windows show the same values. Pew Pew's form: Mode (Segmented Shield, Follow; the description follows the mode), Pace (Chill, Normal, Frantic), Sound (Switch), Volume (Slider 0–100, disabled while sound is off) |
| Text & interface | `sections/interface.svelte`. Setting rows with a `Segmented` each, bound to `settings.appearance`: Readability ("Kept when you switch themes."): Text size (Small, Medium, Large) and Motion (System, Off); then Fonts; then Shape: Corners (Sharp, Default, Round), Shadows (None, Subtle, Default, Strong). Related: Theme, Font Maker, Font Viewer |
| Text & interface › Fonts | `sections/fonts.svelte`. A setting row per role ("UI font", "Code font"): a `Select` of the default (Inter or Hack), the built-ins (`BUILTIN_FONTS`: Burrow) and the files in `/etc/fonts`, plus a folder button that picks a font file (`.ttc .ttf .otf .woff .woff2`) and calls `settings.use_font(role, path)`. Under each row a sample line in `var(--font-{role})` with Bold and Italic words, so the choice shows as soon as it loads. When `/etc/fonts` has files, an overline and a `SettingRow` per file (name, format) with Remove (confirmed; a role using it goes back to the default), re-read on the folder's revision ([settings › Fonts](services/settings.md#fonts)) |
| Theme › Edit colours | `sections/colours.svelte`. A `Section` per group, Surfaces (the seven ladder shades), Text and brand (foreground, primary, secondary, tertiary, accent, cottontail) and States, with a `SettingRow` per token: a swatch that opens `<input type="color">` and a mono `Input`. Both write on `change` (the field on blur or Enter). The picker shows the token's hex (sRGB, clipped) from one `$derived` map: every token goes through a single `to_hex()` batch per theme change while the subpage is open and stores `to_oklch(hex)`, the computed `oklch(from <hex> l c h)`. Picking or typing a derived token replaces its live expression with a fixed value |
| Taskbar | Desktop only. A `Segmented` (Bottom, Top, Left, Right, with icons) bound to `settings.taskbar.position`; Size and hiding (size `Segmented`, Auto-hide `Switch`); Clock (Show seconds `Switch`, `settings.taskbar.seconds`); and a miniature screen preview that moves its dock to the chosen edge |
| Default apps | Lists `settings.file_defaults` sorted by extension, a `SettingRow` each: the extension, "Opens in {app}" (or "{id} is no longer installed"), the app's icon and a Forget `IconButton` that removes that entry. "Forget all" in the section header sets `{}`. Empty: "No default apps yet". Entries are added by "Always use" in the Open-with menu ([file associations](apps/file-associations.md)) |
| Shortcuts | A line on app shortcuts with the Mod+/ keys, then a `Section` per OS group (Windows, Apps, System) with a `SettingRow` per shortcut: its label and `Kbd` chips (`format_keys`). Lists `shortcuts.list()` without window-scoped entries: those belong to whichever app is focused, and the sheet shows them. "Open the shortcuts sheet" runs `shortcuts sheet` |
| Notifications | `sections/notifications.svelte`. System notifications: Permission (a `Badge`: Allowed `success`, Not asked yet `warning`, Blocked `error`, Unavailable; Allow, only while not asked, calls `notifications.request_system()`; watched through `navigator.permissions` so a change in the site settings shows) and Send test (asks first when not decided, then `scheduler.schedule("settings", { key: "test", at: now + 1 s })` (a second ahead: an occurrence before `armed_at` never fires), so the test goes through the real leader, timer and service worker and opens Settings › Notifications on click). When WebOS is closed: On when the browser has notification triggers, otherwise Off with what that means ([scheduler](services/scheduler.md)) |
| Offline | `sections/offline.svelte` (ADR-065, [offline](services/offline.md)). One section, "Apps kept offline" (search id `offline-apps`): what on demand means, a search field (`search_apps`), the picked count, an `Offline` warning badge while offline and a spinner while syncing. Then the installed apps as rows: icon, name, a status `Badge` (Saved `success`, Downloading `primary`, Not saved, Always saved) and a `Switch` ("Keep {app} offline", `offline.set_picked`; checked and disabled for system apps), "Downloads when you're online" for a picked app not saved yet. Picked apps first, then other user apps, then system apps; the picked-first order is taken on mount and on each search, so a row doesn't jump as it's ticked. Rows are a fixed 56px in their own scroll box (at most 448px tall), and only the ones in view plus four either side render, so the page stays fast with any number of apps. Related: Downloads in Activity Monitor, Backup & reset. Opened by the migration toast's and the offline note's **Choose apps** (`{ section: "offline" }`) |
| Backup & reset | Back up: a `SettingRow` + `Switch` per area (Files `/home`, Settings `/etc`, App data `/var/lib` and app storage), all on by default, each described by its folder and `backup.sizes()` (measured once per mount, `…` until then). The footer shows the last backup saved in this tab, or the chosen areas' total before compression, and a primary "Download backup" (`backup.create(areas)`), disabled with no area chosen or while a backup runs; a spinner replaces its icon while saving. Restore: "Restore…" (`backup.restore()`), which picks the file, asks, replaces and reloads. Errors toast from Settings with the message (`BackupError` text as is, anything else also logged) ([backup](services/backup.md)). Reset: "Reset…" (`danger`) asks first (`window.confirm`, danger), then sets taskbar to `BOTTOM` with no pins, theme to a copy of `BRAND_DARK`, `file_defaults` to `{}`, the wallpaper to the grid preset, `appearance` to `DEFAULT_APPEARANCE` and `live_options` to `{}`; saved themes, fonts and files are kept |
| What's new | `version.changelog`, newest first: one `background-light` card per release with title, mono version `Badge`, a primary "New to you" `Badge` for releases in `version.unseen`, and the date (`format_date` of the local day). Each change is a row: kind `Badge` (New `primary`, Improved `info`, Fixed `success`) and the text |
| Roadmap | `docs/ROADMAP.md` imported as `?raw` in a lazy chunk (the roadmap this build shipped with), parsed by `roadmap.ts` (`parse_roadmap`: `##` group, `###` section, checklist items with status and nesting, inline markdown flattened to text; unit-tested) and shown as one card per section with a status icon per item (done `success`, in progress `warning`, planned muted). Counts on top; a `Segmented` filter All / Open (default) / Done. No HTML is rendered from the file |
| About | A card with the logo lockup, a one-line blurb, a Development/Production badge and the version. Install: "Install WebOS" with the why line; a primary Install button (`installer.install()`) while a prompt is held, "Installed" in `success` once installed, otherwise the platform hint appended to the description. Build: a `SettingRow` each for Version, Commit, Branch, Built (`version.info`, `format_datetime`: medium date, 24-hour time). Updates: "Update and reload" (`version.apply_update()`) when an update is available, otherwise "Check now" (`version.check()`), disabled in dev and while checking. Pipeline (`sections/pipeline.svelte`, search keywords ci, build status, actions, deploy): `version.pipeline()` on mount, then again every 30 s while the run is queued or running and the page is mounted (a settled run stops it; leaving About aborts the call). The run's state icon and label, its short sha and title, a Refresh icon button and an Open link to the run; one chip per job with its state icon, each linking to the job; "Started …" plus "This build" when the run is this build's commit or "Newer than this build (vX)" when it started after this build. Offline or a GitHub error shows the reason with Retry. Memory only.  `version.show_intro()` (doesn't touch the seen marker); Getting started: "Open" launches the Getting started app. Feedback: "Request a feature", "Propose an app" and "Report a bug" open a pre-filled GitHub issue form in a new tab (`settings/feedback.ts` `issue_url`: `template=feature.yml|proposal.yml|bug.yml`, `version` as "3.12.0 (commit)", and `platform` for bugs; GitHub issue forms fill fields by their `id`; templates in `.github/ISSUE_TEMPLATE/`). No token or backend; posting needs a GitHub account. Browser support (`sections/browser-support.svelte`, [compat](compat.md#settings--about)): the browser label and a summary, Show the warning (clears the dismissal and draws the warning screen over the OS), then every entry of the browser support list by level with a Supported, Missing or May misbehave badge, what's lost, its apps and the update line. Credits: one row per author from `credits(apps)` (`services/apps/authors.ts`), the owner first with an Owner badge, then by app count: an initial in a `primary/12` disc, the name, the app count, a GitHub (or Website) link opening a new tab, and the author's apps as small icon chips, twelve shown with "+N more" / "Show fewer". A "Source on GitHub" link |

Every write goes straight to service state. Persistence is the settings service's job (`/etc/settings.json`).

**Interactions.** Mouse and keyboard through native controls (buttons, radios, inputs); the search combobox as above. Token text fields accept any string, with no validation.

**Known gaps / oddities.**

- Theme cards re-declare only the five base variables on the miniature, so its `shadow-raised` uses the active theme's darkest shade.
- The "checks every 30 minutes" copy matches `version/service.svelte.ts`, but it's hardcoded.
- The Updates row shows a success check whenever no check is running in production, even before the first check has completed.

---

## Kernel

`kernel` · own `icon.svelte` · source `system/kernel/`

**Purpose.** An inspector for the service registry (ADR-020).

**Implementation.** Imports the `kernel` singleton directly and lists `kernel.services` (a `SvelteMap`) in init order, as a dashboard column (`max-w-4xl`, `p-6`). The header has the logo mark, "Kernel", the service count and an Expand all / Collapse all quiet button. Each service is a `rounded-xl bg-background-light` card:

- The header button shows a chevron, the class `name`, the registry key as a `Badge` and the `description` (from `@lg`).
- The body lazily loads `service.inspector()` and renders it with `detailed` set to whether the card is open. A service without an inspector falls back to `to_string()` in a `<pre>`. A failed import shows an error line.

**Interactions.**

| Action | Effect |
|--------|--------|
| Click a card header | Toggles that card between basic and detailed. `aria-expanded`/`aria-controls` are set. |
| Expand all / Collapse all | Opens every card, or closes all of them when all are open. |

**Persistence.** The set of open cards is `storage.window("expanded", string[])`: per Kernel window, restored with the session.

**Inspectors** (basic → detailed):

| Service | Basic | Detailed |
|---------|-------|----------|
| settings | preset name or "Custom", taskbar position, file-default count | token swatches with values; file-defaults table (extension → app, flags missing apps) |
| windows | open count, focused app, container size | table by z-order: order, app, short id, bounds, flags and snap zone; focused row highlighted |
| files | OPFS usage / quota, persistent or best effort | root listing: name, kind, size |
| version | version, commit, update status | running vs available build, field by field |
| notifications | total, unread, toasts | last 10: time, type, app, title (read ones dimmed) |
| dialogs | open count | stack: id, component name, point, anchored or centered |
| apps | registered, system / user, association count | registry table: icon, id, name, version, props schema, associations |
| session | status (`none`/`pending`/`restored`/`declined`), saved windows, last save time | file path |
| clipboard | entries held, mode (`copy`/`cut`) | path table; "The clipboard is empty." |
| ui | open overlay, back guard armed | none |
| shell | command count, history length | command table: name, description |
| shortcuts | registered, window-scoped count, key style (macOS / PC) | table of keys, id, scope (global or window) |
| router | last link hash, its outcome | none |
| backup | activity (`idle`/`creating`/`restoring`), last backup name and size | table of area, folder and size (`sizes()` on open) |
| desktop | grid size, icon count, cell size | occupancy map of the grid; table of cell, entry name, kind (`shortcut`/`file`/`directory`) and target (the shortcut's app name, `{id} (missing)` for an unregistered app, `—` otherwise); empty text "Desktop folder is empty." |

On mobile the `windows` and `desktop` keys hold the mobile classes, which ship their own `mobile-inspector.svelte`: windows shows running count and the app on screen, detailed a table of recent order, app, id and flags; desktop shows home and dock counts, detailed a table of place, entry and kind.

Inspector building blocks (`components/inspector/`) follow the kit's type scale: `text-ui` values, `text-2xs` labels at 80%, and tables in a `rounded-lg` hairline ring with overline-style headers.

**Known gaps.**
- Inspectors are read-only. Whether they get actions (check for updates, close a window) is still open.
- The files inspector reads storage once per mount. It doesn't read `files.revision("/")`, so root changes made through the service don't refresh it either.
- The desktop inspector only sees the visible grid, so icons that are hidden on a small screen don't show up.
- No dependency graph view.

---

## Text Editor

`text-editor` · own `icon.svelte` · source `system/text-editor/` · [ADR-030](../adrs/030-text-editor.md)

**Purpose.** Edit text and code files. Replaced Text Viewer on 2026-10-13 (id renamed, no alias: old `text-viewer` session entries are skipped on restore, a `text-viewer` file default falls back to the built-in).

**Associations.** `text/*` (tier 1) plus explicit extensions (tier 3). The extensions win over any MIME-wildcard app, for example `.ts` even if the browser reports a `video/` type for it. `tools: [".http", ".rest", ".cook", ".fdsl"]` puts it in Open with for API Client's request files, Recipe Box's Cooklang recipes and Funky DSL files, which have no MIME type and open in their own app by default.

**Engine.** CodeMirror 6 (`basicSetup`: line numbers, folding, history, search on Mod+F, bracket matching; Tab indents). The editor setup lives in the app kit at `$kit/components/code` (ADR-048) so Diff and Markdown to PDF share it: `editor.ts` holds the theme (`token_theme`) and highlight style (`token_highlight`), both written against the raw theme variables (`--primary`, `--background`, …), so any theme, derived ones included, applies without rebuilding the editor. `@theme inline` doesn't emit font or text-size variables at runtime, so the editor's font stack and size are literal. Syntax colours: keywords and tags `primary`, strings `secondary`, numbers and literals `accent`, types `tertiary`, comments `foreground/55` italic; state colours only for invalid tokens. `language.ts` (`language_for`, `load_language`) maps the extension to a language package (`javascript`/`typescript`, `json`, `markdown`, `css`, `html`, `yaml`), each loaded on first use; anything else is plain text. `assist.ts` is for an app with its own language (Funky DSL is the first): `symbol_assist(symbols, word?)` turns a list of `SymbolDoc` (`name`, `kind`, `signature?`, `detail`) into completion with a docs panel (`@codemirror/autocomplete`, as an `override`) and hover docs (`hoverTooltip`); `symbols` is a function read on every request, so it can include names the user declared. `diagnostics_gutter` is `@codemirror/lint`'s gutter alone: the app computes diagnostics itself and pushes them with `show_diagnostics(view, list)` (offsets clamped to the document), so nothing compiles twice. `reveal(view, from, to)` selects a range, scrolls it to the middle and focuses the editor. The theme styles the lint underlines, gutter dots and diagnostic tooltips with the state colours, and completion info and hover docs on the tooltip surface. Both packages are direct root dependencies, pinned to the versions `codemirror` already pulled in, so every editor shares one copy.

**Behaviour.** Always editable. Launched without a path it's an untitled buffer ("Untitled", path "Not saved yet"). States: loading (`Spinner`), ready, not found and read error (error empty states with Open a file…), drawn over the editor so CodeMirror stays mounted. `text` mirrors the document (update listener); `dirty = text !== saved_text`.

- **Toolbar:** New, Open…, Save, Save as… (`IconButton`s), the path in mono, the Markdown view switch (`.md` only), wrap toggle (`pressed`), Copy all (`CopyButton`).
- **Status bar:** file name, lines, characters, UTF-8 size. Lines and characters come from the CodeMirror doc (`doc.lines`, `doc.length`), so a keystroke never splits or encodes the text; the UTF-8 size is encoded in an `on_idle` callback (`requestIdleCallback`, or a `setTimeout` in Safari). The buffer is kept as the CodeMirror `Text` and compared with the saved one through `Text.eq`, which skips the subtrees an edit left shared. A `load_id` drops a load that a newer load or New overtook.
- **Files** like Paint: `pick_file` / `pick_save` with `accept: manifest.associations`, written with `files.create_file(…, { overwrite: true })`. New and Open ask before discarding unsaved changes.
- **Close guard:** `set_title(file name)`, `set_dirty(dirty, { save })` (ADR-029).
- **System files** (`is_system_path`: `/etc`, `/var`, `/tmp`) open read-only: a compartment sets `EditorState.readOnly` and `EditorView.editable` off, Save is disabled, an `info/10` strip says "This is a system file, so it opens read-only" with a Save as… button, and the status bar says Read-only. Save (Mod+S) goes to Save as…, starting in `/home`. The OS rewrites these files on its own, so an edit would be lost or break it.
- **Disk changes**, like a code editor. `base_modified` is the `lastModified` the buffer is based on. An effect reads `files.revision(parent folder)`; any write there (another window, Explorer) runs `check_disk`. Newer on disk with the same text: adopt it silently. Clean buffer: reload, keeping cursor and scroll. Dirty buffer: a `warning/10` banner, "This file changed on disk", with Keep mine (adopts the disk version as the base, so Save won't ask) and Reload. Save checks again and asks "changed on disk… Overwrite" when the disk is newer and differs. A save in progress is ignored by the watcher.
- **Markdown preview** (`.md` only): Edit / Split / Preview `Segmented`, per window. Split is side by side at `@2xl`, stacked below. The preview re-renders 250ms after typing stops, with `marked` (GFM; declared in the app's own `package.json`, ADR-045) loaded on first use from `markdown-preview.ts`, in an iframe: `srcdoc`, `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` (opaque origin: nothing in it can reach WebOS or OPFS) and a CSP of `default-src 'none'; script-src 'nonce-…'; style-src 'unsafe-inline'; img-src data: blob: https:`. Only the editor's own nonce'd script runs (Markdown `<script>` and `on*=` handlers are blocked): it restores the scroll position after a re-render and posts it back (`text-editor:scroll`, checked against the frame's `contentWindow`). Theme variables are written into the frame, so theme changes re-render it. Links open in a new tab (`<base target="_blank">`).

**Persistence.** Per window via `storage.window`: `wrap` (on by default) and `markdown` (`split` by default).

**Shortcuts** (ShortcutsService, window-scoped, in Mod+/): Open… Mod+O, Save Mod+S, Save as… Mod+Shift+S. CodeMirror's own keys work inside the editor (Mod+F search, Mod+Z undo).

**Known gaps.**

- No size limit or binary check; a huge file is one CodeMirror document.
- UTF-8 only. Svelte, TOML, INI and `.env` have no highlighting.
- Relative images in Markdown (`./a.png`) don't resolve: the preview can't read OPFS. The frame uses system fonts (Inter and Hack aren't loaded inside it).
- No scroll sync between editor and preview.
- A file deleted while open isn't flagged; Save writes it back.

---

## Media Preview

`media-preview` · own `icon.svelte` · source `system/media-preview/` · ported from v0 (`v0-react`) (ADR-009, ADR-018)

**Purpose.** Show images, play video and audio.

**Associations.** MIME wildcards only, so a match depends on the `File.type` the browser reports. A file with an empty type never matches. Chromium reports `image/jxl` for a `.jxl` and `image/avif` for an `.avif`, so both reach Media Preview through `image/*` with no mapping of our own. Format Lab lists `image/*` as a tool only, so Media Preview stays the default for them.

**Behaviour.**

1. `$effect` on `path`: `files.get_file(path)` sets `file` (`undefined` while loading, `null` if not found) or `error`. The result of an earlier, cancelled path is dropped.
2. `$effect` on `file`: creates an object URL, and revokes it on cleanup. A JPEG XL (`image/jxl` or a `.jxl` name, `jxl.ts`) is decoded first: Chromium can't decode it, so `jxl_to_png` imports `$kit/utils/codecs` (only then: the codec worker and its wasm never load for other files), decodes in the worker and hands the `<img>` a PNG. A decode failure shows the error state ("Couldn't decode the JPEG XL: …").
3. `kind` comes from `file.type`: `image` / `video` / `audio` / `unsupported`; a `.jxl` counts as `image` whatever its type.

States before the frame: no path ("Nothing to preview", with Open a file…), error ("Couldn't read the file"), loading (`Spinner`), not found. Then the document frame: a `Toolbar` with the file name and controls, a stage on `background-darker` (a scoped `.stage` style), and a `StatusBar` with type, size and last-modified time (`format_datetime`).

Below the `@lg` container width the name takes the toolbar's first row (`order-first basis-full`) and the controls wrap onto the next, with Save to disk… pushed right; from `@lg` up it's one row with the name truncating in between.

| Kind | Rendering | Controls |
|------|-----------|----------|
| (every kind) | | Open… at the start of the toolbar ([Open…](#open-in-the-viewers-adr-025-adr-031)) |
| image | A box sized in layout to the rotated image times the scale, centred in a `min-w-full min-h-full w-max` grid with padding (24px desktop, 8px mobile). The `<img>` inside is absolutely centred at its natural size times the scale and rotated by `transform`. Fit's scale is `fit_scale()` of the rotated size into the stage (`bind:clientWidth/Height`) minus padding, so small images scale up and a 90° turn still fits | Zoom out / level / zoom in (step 0.25 within 0.25 to 5, the limits widened to include the fit scale; zooming leaves fit mode starting from the fit scale; the level reads "Fit" in fit mode), rotate +90°, fit (resets zoom, rotation and fit), a separator, Set as wallpaper (not for JPEG XL: the desktop paints wallpapers through CSS, which can't decode it), Save to disk… |
| video | `<video controls>`, `max-h-full max-w-full`, centred in a one-cell grid (`grid-rows-1 grid-cols-1`, so `minmax(0, 1fr)` tracks the stage height bounds; an auto row would grow to the video and scroll). Always fits, no zoom | Save to disk… |
| audio | a large music-note tile, the file name, `<audio controls>` | Save to disk… |
| unsupported | "Can't preview this file" empty state with the type | Save to disk… |

Video and audio carry the `find_duration` attachment (`duration.ts`): MediaRecorder WebM has no duration header, so the element reports `Infinity` and the controls show no length. When `loadedmetadata` sees `Infinity` it seeks to `Number.MAX_SAFE_INTEGER`, waits for `durationchange` or `timeupdate` to give a finite duration, then seeks back to 0.

Rotation animates over 200ms; size changes are instant. Because zoom changes the layout size rather than a transform, the scroll area grows with the image and every edge is reachable. The wrapper's `overflow-clip` keeps the image's corners mid-rotation from adding scrollbars. Pure math (`clamp`, `distance`, `midpoint`, `rotated_size`, `fit_scale`) is in `zoom.ts`, tested in `zoom.test.ts`.

Every zoom goes through `zoom_at(scale, anchor)`. It reads the box rect, applies the zoom, `flushSync()`s, and adjusts the stage's `scrollLeft/Top` so the image point under the anchor stays put.

**Interactions.**

| Input | Effect |
|-------|--------|
| Ctrl + wheel over the image (trackpad pinch too) | Zoom by ±0.25 around the cursor, default scroll prevented |
| Two-finger pinch (touch, pen) | Zoom around the pinch midpoint, and pan as the midpoint moves. Ending a pinch at or below the fit scale snaps back to fit |
| One-finger drag (touch, pen) | Pan the zoomed image by scrolling the stage |
| Toolbar buttons | As above, zooming around the stage centre. Each is a labelled `IconButton`; zoom buttons disable at the limits |
| Native media controls | Play, seek, volume |

For an image, "Set as wallpaper" (`Image` icon) comes before Save to disk… and calls `set_wallpaper(source)`, so a device file works too.

The toolbar's "Save to disk…" (`HardDrives` icon) calls `save_to_disk(path)` from `components/files/file-actions.ts`, the same action as File Explorer and the desktop: `files.export_to_disk` plus a "Saved to disk" toast or an error toast.

Touch and pen pointers are tracked in a plain `Map` (up to two) with pointer capture; the image wrapper is `touch-none`, so the browser neither scrolls nor page-zooms under it, and the app does both. Gestures end on `lostpointercapture`, which also covers `pointercancel`. Mouse pointers are ignored there: the mouse keeps scrollbars and Ctrl + wheel.

**Known gaps.**

- Touch pan has no momentum, and there's no double-tap to zoom.
- Mouse drag doesn't pan; use the scrollbars.
- No keyboard shortcuts for zoom or rotate. Rotation doesn't apply to video.
- No gallery or next/previous through the folder.
- `file` and `error` aren't reset if `path` changes. That's harmless today, because props don't change after launch.

---

## PDF Viewer

`pdf-viewer` · own `icon.svelte` · source `system/pdf-viewer/` (ADR-018 revision: a separate app because it's a different interaction model)

**Purpose.** View PDFs with the browser's built-in viewer.

**Associations.** `application/pdf` (tier 2) and `.pdf` (tier 3), so it wins on extension even when the MIME type is empty.

**Behaviour.** The same load pattern as Media Preview. It then wraps the file in `new Blob([file], { type: "application/pdf" })` before `createObjectURL`. Chrome only hands a blob to its PDF viewer when the blob's type says PDF, and would otherwise download it. The result is a full-size borderless `<iframe src={blob url}>` on `background-darker`, titled with the file name, under a `Toolbar`: Open…, the file name, and **Edit in PDF Tools** (`PencilSimple`), which runs `apps.launch("pdf-tools", { path })` and so lands on Organize. That button shows only for a file with a path and while `pdf-tools` is registered. Other states use the kit: "No PDF open" and error empty states, a `Spinner` ("Loading PDF") while loading.

**Interactions.** Whatever the native viewer offers: zoom, page navigation, search, print, download. The app adds only its toolbar.

**Known gaps.** It depends entirely on the browser's PDF viewer: no viewer means a blank or downloading iframe. There's no file info.

---

## HTML Preview

`html-preview` · own `icon.svelte` · source `system/html-preview/`

**Purpose.** Render an HTML file the way a browser would, or read its source.

**Associations.** `text/html` (tier 2) plus `.html` and `.htm` (tier 3), so it beats Text Editor's `text/*` (tier 1) with no prompt.

**Behaviour.** `path` is local state seeded from the prop (`untrack`), and "Open…" swaps it. A `$derived.by` turns `path` into a `files.get_file(path)` + `file.text()` promise and also reads a `revision` counter. Reload bumps the counter, which re-reads the file and remounts the iframe. The states are: no path ("No file open" with "Open a file…"), loading (`Spinner`), not found and read error (error empty states), then the document frame:

- **Toolbar:** Open…, Reload, the full path in mono (truncated, `title` = path), and a `sm` `Segmented` Preview / Source switch.
- **Preview:** a borderless full-size `<iframe srcdoc={text} sandbox="allow-scripts">`. There is no `allow-same-origin`, so the page runs in an opaque origin. Its scripts run, but they can't reach the OS, localStorage or OPFS. The document paints its own background.
- **Source:** the text in a read-only `<pre>`, mono `text-ui`, `whitespace-pre-wrap wrap-anywhere`.
- **Status bar:** file name, line count, size, MIME type (`text/html` when empty).

**Persistence.** None. The view resets to Preview in every new window.

**Known gaps.**

- Relative URLs (`style.css`, `img.png`, sibling pages) don't resolve. `srcdoc` has no base URL, and nothing maps OPFS paths to URLs.
- External resources and network requests from the page aren't blocked.
- No auto-reload when the file changes. Source view has no line numbers or highlighting.

---

## CSV Viewer

`csv-viewer` · own `icon.svelte` · source `system/csv-viewer/`

**Purpose.** Read CSV and TSV files as a table.

**Associations.** `text/csv`, `text/tab-separated-values` (tier 2) plus `.csv`, `.tsv` (tier 3), so it beats Text Editor's `text/*`.

**Behaviour.** The same `path` pattern as HTML Preview. The `get_file` promise resolves into `{ file, delimiter, rows, column_count }`. The delimiter comes from the extension: `.tsv` is tab, anything else is comma.

`parse_csv` (`csv.ts`) is a hand-written RFC 4180 parser: quoted fields, `""` escapes, CRLF or LF, line breaks inside quotes. It is lenient:

- a stray quote inside an unquoted field is kept
- text after a closing quote is appended
- a trailing newline adds no empty row
- a leading BOM is dropped

`column_count` is the longest row; short rows render empty cells. After the no-path, loading, not-found and read-error states, an empty file shows "This file is empty". Otherwise the app renders:

- **Toolbar:** Open…, the full path in mono, and a "First row is header" `Switch` (on by default; "Header row" below `@md`).
- **Table:** each row is its own grid on one shared fixed template: `{digits+3}ch` for row numbers, then `12rem` per column. Rows line up without a `<table>`, so each body row can use `content-visibility: auto` with `contain-intrinsic-block-size: auto 1.75rem`, and the browser skips rendering off-screen rows with no JS virtualization. Table rows can't do this, because containment doesn't apply to them. The header row is sticky on `background-light`: the first row, or A, B, … AA when the header is off. The row-number column is sticky on the left. Cells are mono `text-ui`, truncated, with the full value as `title`. Clicking or tapping a cell (one delegated handler on the scroller) highlights it `primary/12` and shows its full value, wrapped and selectable, in a strip above the status bar with its row number and column; the same cell again closes it, and so does a new file or a header toggle. That's the touch path to long values.
- **Show more:** the table renders the first 1000 body rows (`ROW_PAGE`). Past that, a sticky "Show more" `Button` with `{shown} of {rows} rows` sits under the last row and adds another 1000 per click. Opening another file starts again at 1000.
- **Status bar:** file name, `{rows} rows × {columns} columns` (excluding the header), delimiter (Comma / Tab), size.

**Persistence.** None. The header toggle is per window.

**Known gaps.**

- Fixed column width: long values are truncated (tooltip, or tap for the value strip), short columns waste space.
- Parses on the main thread. Rendering is capped by "Show more", not virtualized: every shown row has DOM, and `content-visibility` only skips its layout and paint.
- No delimiter detection (semicolon CSVs show as one column), UTF-8 only, read-only, no sorting or filtering.

---

## Activity Monitor

`activity-monitor` · own `icon.svelte` · source `system/activity-monitor/`

**Purpose.** A task manager for the web OS: activity per window and per desktop widget, page-wide performance, network requests, storage use and background tasks. It replaces the planned Profiler ([brainstorm](../brainstorm/2026-10-11_app-ports.md)).

**Services.** `windows` (`list`, `get` for manifests, `force_close`), `files` (`size_tree`, `revision`), `apps` (names for app storage and widgets, `launch` for Reveal in Explorer), `desktop` (`items`, `open`, `remove_item` for widgets), `notifications` (a failed widget removal), `tasks` (the Tasks section).

**Zero cost when closed.** All monitoring lives in the app, in three classes next to the component: `DomMonitor` (two instances: windows and widgets), `PerformanceMonitor` and `NetworkMonitor`. No service or shell code knows the app exists. Each class has two methods, and each returns its cleanup to an `$effect`:

- `observe()`: the event-driven observers (long animation frames, CPU pressure, resource timing, the connection `change` listener). They run for the window's lifetime.
- `sample()`: the 1 s ticks, the rAF frame counter and the per-window and per-widget MutationObservers. Only the monitor of the shown section samples (Windows, Widgets or Performance; Network and Storage have none), and only while the window is visible (`win.is_visible`: not minimized, tab not hidden, ADR-035). A section's sparklines start filling when it's opened.

Samples are 60-entry ring buffers (`Series`, `$state.raw`) held in memory. `untrack` wraps the start call so a window opening doesn't restart the sampler.

**Sections** (`SideNav` in drill-in mode, Settings-style frame: below `@2xl` the list first, a page with a "‹ Activity Monitor" bar, the phone's Back returns; window state `open`, true when launched with a `section`):

- **Windows:**
  - One row per window from `windows.list()`: manifest icon and the window's title, else the app name (the full name and window id in its tooltip), and badges "this" and "minimized".
  - **Mutations:** a MutationObserver (subtree, childList, attributes, characterData) on each `[data-window-id]` element (the desktop window, or the mobile window body), read and reset every second. Shown as mutations per second, peak, and a 60 s sparkline.
  - **Other columns:** DOM node count, and media (canvases, playing/total video and audio, iframes).
  - **Live rows:** rows follow the window list. The tick attaches observers to new windows and disconnects closed ones.
  - **Sorting:** by name, rate, peak or nodes. Unsorted rows keep open order, so End buttons don't move under the cursor. The table is its own `@container`, so columns follow the table's width, not the window's (the page is capped at `max-w-3xl`): Nodes from `@md`, Peak and Media from `@xl`, the sparkline from `@2xl`. The name column keeps the rest. Headers are uppercase overlines, sortable or not; the sortable ones are `sections/sort-header.svelte`, shared with Widgets (`next_sort` in `sort.ts`). The long-frames table drops its Blocking column there.
  - **End:** calls `windows.force_close(id)`, skipping unsaved-changes prompts.
- **Widgets:** its own section, after Windows, because widgets aren't windows: they have no id, no z-order and no End.
  - One row per `desktop.items()` entry with `kind === "widget"`: the app's icon (`ShortcutIcon`, no badge), the widget's label (its file name without `.widget`), and the app name next to it when the label differs (from `@md`). The tooltip has label, app and file name.
  - **Columns:** Size in cells (`w×h`, from `@md`), Props as one line (`summarize_props` in `widget-props.ts`: `key: value` pairs, absolute paths cut to their last segment, long strings truncated, `—` for none; from `@xl`), a 60 s sparkline (from `@2xl`), mutations per second, and DOM nodes (from `@xl`). Sortable by name, rate and nodes.
  - **Mutations:** `DomMonitor` keyed by the widget's file name. It finds the frame through its title strip, `[data-desktop-name="{name}"]`, and observes the frame's `[data-widget-body]`, so dragging or selecting the frame doesn't count. A widget pushed off the visible grid has no element and shows `—`.
  - **Actions:** Open (`desktop.open(item)`, which launches the widget's app) and Remove from desktop (a window `confirm`, then `desktop.remove_item(name)`; the same wording as the desktop's Remove). Rows follow the Desktop folder, so a removal drops the row and its observer on the next tick.
  - **Summary:** widget count and total mutations per second.
  - **Mobile:** the phone home doesn't render widgets (ADR-016), so the section shows an empty state saying so instead of a list.
- **Performance:**
  - Frame rate (rAF), event-loop lag (drift of a chained 1 s `setTimeout`) and JS heap (`performance.memory`, copied field by field because its fields are prototype getters), each with a sparkline.
  - CPU pressure (`PressureObserver`, `"cpu"`, 1 s) as a badge. "Not allowed here" if `observe()` is rejected.
  - The newest 50 long animation frames (`buffered: false`): age, duration, blocking duration, and the longest script's invoker and source.
- **Network:**
  - Online state (`svelte/reactivity/window`), plus `navigator.connection` effective type, downlink, rtt and save-data.
  - Resource timing since the window opened, newest first, capped at 500: path, initiator, transfer size, duration, with totals.
  - "Include earlier" merges `performance.getEntriesByType("resource")`; "Clear" empties the list.
- **Storage:**
  - `storage.estimate()` as a meter, plus `usageDetails` and `storage.persisted()`.
  - **Disk usage** (`sections/disk-usage.svelte`): a squarified treemap of one folder, starting at `/`. It loads `files.size_tree(path, 3)` when the section opens and again when the shown folder's revision moves; Refresh asks again (cheap: the service caches listings by revision, so only changed folders are re-read). Three levels because the tiles are the folder's children, folder tiles draw their own children inside (non-interactive, when the tile is at least 48×56 px), and the third level is what tells those inner cells which are folders.
    - **Layout:** `squarify(items, size, bounds)` in `treemap.ts`, pure and unit-tested (Bruls, Huizing and van Wijk: a row grows while that doesn't worsen its worst aspect ratio; zero-size items get no tile). The box is `h-64`, `@md:h-80`, `@xl:h-96` of its own `@container`, measured with `bind:clientWidth/Height`; tiles are absolutely placed buttons inset 1 px, so neighbours never touch.
    - **Colours** (`tile_kind`): folders `primary`, images `secondary`, video and audio `tertiary`, other files `foreground`, all at 45% (other files 20%). A folder tile is a faint `primary/15` frame with its name on top and its children drawn in their own colours, so depth reads as nesting. A legend sits under the map.
    - **Interaction:** click or tap a folder tile to open it; a file tile selects it (an inset ring). Hover (mouse only) or focus shows that item in the info line: name, size, share of the shown folder, Open (folders) and Reveal in Explorer (`apps.launch("file-explorer", { path })`: the folder itself, or a file's parent). With nothing picked the line shows the shown folder. A breadcrumb (`ancestors()`) and an Up button go back; Backspace or Alt+↑ on a tile goes up; on phones the nav bar's Back goes up through `window.on_back` until `/`.
    - **List:** under the card, the 12 biggest children as rows (swatch, name, share, size, `pointer-coarse:` taller), each doing what its tile does, so items too small to tap in the map stay reachable; then a count of smaller and empty items. Empty items get no tile.
  - localStorage bytes per `app.{id}.` prefix (UTF-16), plus "Other keys".
- **Tasks:** [TasksService](services/tasks.md) jobs, newest first: title, status badge (running, done, failed, cancelled), app name, message or error, and a progress bar while running. Per row: Cancel while running, Retry when failed or cancelled, Remove when finished; Clear finished in the header. A caret toggles the run's tree (`task-details.svelte`, live through `TaskTree` in `task-tree.svelte.ts`): groups with their mode, tasks with their own status line, a bar while running or failed, and a logs button per task. Under the list, a card names `@lilbunnyrabbit/task-manager` with its version and links to its docs and npm. The taskbar's tasks indicator and the mobile "N tasks running" line launch the app with `{ section: "tasks" }`. Sections and their ids live in `sections.ts`, shared with the manifest's `props`.
  - Service worker controller and registration states.
  - Refresh is manual; this tab has no timers.

An API the browser doesn't have shows "Not available in this browser". There are no polyfills.

**Persistence.** `storage.window("section")`: per window, restored with the session. Samples are never stored.

**Known gaps.**

- No Workers tab: no browser API lists workers, and no app spawns one yet. A Workers Service comes with its first consumer. TasksService jobs (ADR-013) become a tab once that service lands.
- Its own row counts the mutations from re-rendering its own table.
- Widgets can't be highlighted on the desktop from their row: the desktop's selection is local to the desktop component.
- Shared clocks (`utils/ticker.svelte.ts`) and shared app-data cells (`json_file`) aren't listed: their registries are module-private, and a count would need a new core export.
- Sparklines have no history from before their section was opened.
- Cross-origin resources without `Timing-Allow-Origin` report 0 bytes.

---

## Style Guide

`style-guide` · own `icon.svelte` · source `system/style-guide/` (ADR-024)

**Purpose.** Render every design token and UI kit component live in the current theme, as the in-OS companion to [docs/design](../design/README.md). Change the theme in Settings and the Style Guide follows. Its manifest sets `description` and `keywords` (`design`, `components`, `tokens`), so the start menu search finds it by those words.

**Layout.** The settings-style frame: `SideNav` in drill-in mode, grouped Foundations (Colour, Type, Surfaces) and Components (Actions, Inputs, Feedback, App kit), + a `max-w-3xl` page with a header ("Live in the current theme…"). The open section is `storage.window("section", "colour", z.enum([...]))` and `open` the narrow drill state: per window, restored with the session.

| Section | Shows |
|---------|-------|
| Colour | The surface ladder as a strip, text and brand swatches, state swatches, the opacity modifiers. Swatches read `var(--{token})` and print the CSS variable |
| Type | The type scale, from `text-lg` titles to mono `text-2xs` values |
| Surfaces | Radius tokens, the four shadows, a sample app frame (Toolbar, content, StatusBar), a drill-in `SideNav` demo (groups, a search header, a Wide / Narrow switch, a `SettingRow` with a `setting` anchor and a button that rings it through `reveal_setting`), and a `ResizeHandle` between content and a panel |
| Actions | `Button` variants and sizes, `IconButton`s, toggles (`pressed` on `Button` and `IconButton`), `CopyButton` (with text and empty) |
| Inputs | `Input` (plain and with a leading icon), `Select`, `Segmented` (`md` and `sm`), `Slider` (`md` and `sm`), `Switch`, `Checkbox` inside `SettingRow`s; `Textarea` (prose and `mono`) |
| Feedback | `Badge` tones, `Kbd`, `Spinner`, `BoardOverlay` over a sample board, a bottom sheet in a small frame (Open sheet: grabber, 12 rows, Done; swipes down by touch), the app announcement (in place with three sample apps, Paint with sample highlights; "Show as dialog" and "Show with 6 apps" open it for real), `EmptyState` with an action, and an error one ("Paint didn't load") with Try again, Close window and a Details disclosure |
| App kit | `SwipeCompare` from `$kit/components/swipe-compare`, wiping between a sharp and a blurred sample drawn from tokens (a Phosphor icon on `background-light`); `CropFrame`; `Waveform` with trim handles, a selection and a playhead; `ai_icon` from `$kit/components/ai-icon` wrapping four system apps' icons (Terminal, Calculator, Text Editor, File Explorer: not the AI apps, so it shows in a fork without them) at `size-4`, `size-6`, `size-9`, `size-12` and in `primary` ink on a `primary/15` strip; `AiGate` from `$kit/components/ai-gate` around a placeholder app, live in this device's AI state (checking, unavailable or the download notice); `QrFrames` from `$kit/components/qr-transfer`, cycling the frames of a made-up 12-list payload |

The controls (and the sample panel's width) are bound to local `$state` and do nothing else. Nothing but the open section is persisted.

**Known gaps.**

- Hand-maintained: a new kit component or token only appears once someone adds it here. `Separator` isn't shown at all; `SideNav` appears as the app's own navigation and in the Surfaces demo. Of the app kit, `CodeView` and `QrCollect` aren't shown.
- The token lists are hard-coded arrays, not read from `ThemeToken`.

---

## Calculator

`calculator` · own `icon.svelte` · source `system/calculator/`

**Purpose.** A basic calculator: `+ − × ÷`, percent, sign change, decimals and brackets, with a history of results. Category Utilities; `description` and `keywords` (`math`, `calc`, `arithmetic`) feed launcher search.

**Evaluation** (`calculator.ts`, no `eval`/`Function`). `tokenize` turns the expression into numbers, operators, `%` and brackets; it accepts ASCII (`* / -`) and the display symbols (`× ÷ −`). A recursive-descent `Parser` applies the usual precedence: brackets, then unary `+`/`−`, then postfix `%`, then `× ÷`, then `+ −`, all left-associative. Two calculator rules:

- `%` divides by 100, except that a bare `n%` on the right of `+` or `−` is a share of the left side: `200 + 10%` is 220, `200 × 10%` is 20.
- A bracket right after a value multiplies: `2(3)` is 6.

`evaluate` returns `{ ok, value }` or `{ ok: false, error }` with `syntax`, `divide_by_zero` (any `÷ 0`, even `0 ÷ 0`) or `out_of_range` (a non-finite result). `format_number` rounds to 12 significant digits, so `0.1 + 0.2` shows `0.3`, and switches to exponent form (`1e+21`) at 10^15 and above or below 10^-9. The tokenizer reads that exponent form, so a large result can carry on into the next expression.

**Input.** `press(state, key)` is a pure reducer over `{ expression, evaluated }`. It keeps the expression finishable: a second binary operator replaces the first (a `−` after `×` or `÷` stays as a unary minus), one decimal point per number (`.` alone becomes `0.`), `)` only when a bracket is open, `%` only after a number or bracket, a leading `0` is replaced by the next digit, and a digit or `(` after `)` or `%` inserts `×`. `±` flips the sign of the last number, or of the bracket group it closes. After `=`, a digit or `.` starts a new expression and an operator carries the result on.

**Display.** Mono, right-aligned, wrapping. While typing: the expression large, and the live result below it (`preview`: trailing operators dropped and open brackets closed, then evaluated; hidden for a lone number or an unfinished expression). After `=`: the solved expression small with `=`, the result large. Errors show in `error`. `=` completes the expression the same way, so `2 × (3 + 4` gives 14.

**Layout.** Toolbar (Copy result, History toggle as a `pressed` `IconButton`), then the display over a 4×6 keypad of kit `Button`s (`secondary` digits, `secondary` + `text-primary` operators, `quiet` functions, `primary` equals spanning two rows, `0` spanning two columns). From `@2xl` the history is a side panel; below that the toggle shows it over the keypad, and picking an entry closes it. The keypad fills the window, so a phone gets large touch targets.

**Interactions.**

| Action | Effect |
|--------|--------|
| Keys `0–9 . , + - * x / % ( )` | The matching pad |
| Enter or `=` | Evaluate. Adds `{ expression, result }` to the history |
| Backspace | Delete the last character (clears after `=`) |
| Escape or Delete | Clear |
| Ctrl/Cmd+C with no text selected | Copy the result |
| Copy result button | `clipboard.copy_text(result)`; a check for 1.2 s, or an error toast if the browser refuses |
| Click a history entry | Loads its expression for editing |
| Clear (history) | Window sheet confirm, then empties the history |

Keys are read by one `<svelte:window>` `keydown` listener, only while the window is focused and focus is on the window frame or inside the app (not a sheet). Pads cancel `mousedown` so they never take focus: Enter after clicking a pad means `=`, not that pad again. Enter on a focused button (Tab navigation) still activates the button.

**Persistence.** `storage.persisted("history")`: newest first, capped at 50, a repeat of the newest entry isn't added again, shared live by every Calculator window. The current expression, the solved expression and the history toggle are `storage.window()` state, restored with the session.

**Known gaps.**

- No memory keys, powers, roots or scientific functions; no locale number formatting (always `.` decimals, no grouping).
- Keyboard shortcuts don't go through ShortcutsService, so they aren't in the Mod+/ cheat sheet.
- The expression can't be edited in the middle; Backspace works from the end only.

## App Library

`app-library` · own `icon.svelte` · source `system/app-library/`

**Purpose.** The store (ADR-040): every app, installed or not, in one browsable window: categories with counts, search, filters, a grid or list, and a details panel per app. Its Showcase view tells each app's story, what it solves, for someone new to WebOS ([brainstorm](../brainstorm/2026-10-18_app-showcase.md)). The start menu's and the app drawer's "All apps" button opens it. Category Utilities. The id is `app-library`, not `apps`, so it can't be mistaken for the `apps` service or the `app list` command.

**Files.**

| File | Contents |
|------|----------|
| `library.ts` | Pure: `LibraryCategory` (All, the five categories, System), `LibraryFilter`, `LibrarySort`, `category_of`, `has_filter`, `category_counts`, `library_sections`, `app_commands` (an app's commands from the shell's registry; the details panel calls `shell.load()`), `app_file_types`, `category_label`. Unit tests in `library.test.ts` |
| `app-library.app.svelte` | Toolbar, category nav, filter chips, grid or list, details pane, status bar |
| `app-details.svelte` | The details of one app and its actions |
| `props.ts` | `LibraryView` (`showcase`, `store`) and `APP_LIBRARY_PROPS`, apart from `index.ts` so the component can import them without a cycle |
| `category-icons.ts` | The Phosphor icon per `LibraryCategory`, shared by the store's nav and the Showcase chips |
| `showcase.svelte` | The Showcase: hero, category chips, a grid of story cards per category |
| `showcase-detail.svelte` | One app's story: problem and answer, preview, every highlight |
| `showcase-actions.svelte` | Open / Get (Open in WebOS in a solo tab) and Copy solo link, on cards and in the detail |

**Props.** `APP_LIBRARY_PROPS`: `view` picks the Showcase or the Store, `app` selects that app (its story in the Showcase, its details in the Store). Both only seed the window state, so a restored window keeps what the user last chose. `#/solo/app-library?view=showcase` is the shareable showcase link; `#/app/app-library?view=showcase&app=forms` opens one story inside the OS.

**Layout.** Container queries only. Every toolbar starts with a `Segmented` Showcase / Store switch (`page`, default Store); the search is shared by both views.

- **Toolbar:** a search `Input` (the launcher's `search_apps`: every word must match name, id, keywords, description or category, with one-typo tolerance from five letters; plus the launcher's `SentenceSearch` over every app, [apps](services/apps.md#sentence-search)), a sort `Select` (A–Z, By category, Recently added / updated) and Grid / List as a pair of `pressed` `IconButton`s. Enter in the search launches the first app shown.
- **Categories:** the kit `SideNav` with a `count` per item: All, Productivity, Media, Utilities, Developer, Games, System. Counts follow the search and the filters, so they say where the matches are. A sidebar from `@2xl`, a tab row below.
- **Filter chips:** `quiet` `sm` `Button`s with `pressed`, ANDed: **Has widget** (manifest `widget`), **Opens files** (non-empty `associations` or `tools`), **Has commands** (a manifest `shell` loader; the commands themselves load lazily), **Used before**, **Not installed** (`!apps.is_installed`). There is no usage log, so Used before is what the OS already holds: apps with an open window, the session's recently closed windows (`session.closed`, memory only) and the apps with a remembered window frame (`windows.frames` keys, persisted in the session file, recorded when a desktop window closes). It's a set, not an order, and a phone that never opened a desktop window only knows this visit's windows.
- **Apps:** the sort picks the sections; without a search A–Z inside them, with one the search's relevance order (owner, 2026-10-22). After them a **Related** section (the sentence search's apps the strict search didn't match) and an **AI suggests** section (on-device AI's picks for a sentence of three words or more, its overline led by a filled `primary` `Sparkle`), both narrowed by the category and the filters and counted in the category counts. A–Z is one grid; By category is one overline section per `group_apps()` entry, like the start menu; Recently added / updated is one section per release ("v1.2.0 · Image Tools and project themes"), newest first, holding the apps whose newest mention in the release notes is that release (`recency`), and an "Earlier" section for apps the notes never mention. Apps that aren't installed carry a primary **Get** badge instead. After an update, apps the unseen releases introduce carry a primary **New** badge and apps they only change an info **Updated** badge, under the tile name and beside the list row name. Both come from `version.unseen`, so they last for the session only. Grid tiles are the start menu's (44px icon tile over the name, 56px on touch); list rows show a small tile, the name, the description from `@lg`, three fixed-slot icons (widget, files, commands) and the category from `@md`. Click or tap selects (`primary/14`); double-click launches. Tiles and rows are `draggable` with `application/x-webos-app` (ADR-042): drop one on the desktop to pin it there, or on the taskbar's quick launch. No match shows an `EmptyState` with "Clear search and filters".
- **Details:** a side pane (`w-80`, hairline left) from `@4xl`, with a "Pick an app" empty state when nothing is selected. Below `@4xl` a selection swaps the whole browser for the details as a second view, with a back arrow; the browser stays mounted underneath, so its scroll and search survive. The category nav remounts when the details close, so a narrow tab row scrolls the active category back into view. On phones the app is fullscreen like any other and Back closes the details first (`window.on_back`).
- **Status bar:** `{shown} of {total} apps · {n} installed`, the number of active filters, the selected app's id.

**Showcase.** A scrolling page, at most `max-w-6xl` wide:

- **Hero:** an overline, "Every app, and what it solves", and one line with the app count.
- **Category chips:** `quiet` `sm` `pressed` `Button`s, All plus the six library categories with a mono count that follows the search (`showcase_category`, its own window state). A horizontal scroll row below `@2xl`, wrapping above.
- **Sections:** `showcase_sections()` (`library.ts`): one per category in the nav's order, System last, apps A–Z (in relevance order while searching), empty ones dropped; the search narrows like the store's, and adds Related (`MagnifyingGlass`) and AI suggests (`Sparkle`) sections at the end. Each is a grid of cards (`auto-fill`, min 17rem, one column on a phone).
- **Card:** the icon tile, name, category and the session's New / Updated badge; `app_story()`: the `pitch` problem muted, then an arrow and the solution (the description when there's no pitch); the first two `highlights` as small chips (loaded lazily per card); then Open (installed), Get (not installed, `apps.install`) and a Copy solo link `IconButton`. The name is a button stretched over the card, so a click anywhere but the actions opens the story; Tab reaches the name and each action.
- **Detail:** replaces the page (the page stays mounted, keeping its scroll), with a back arrow; the OS Back closes it too. Icon, name, category, byline; Open / Get, Copy solo link, and Details (switches to the Store with the same app selected); The problem / What {name} does cards; the `preview` image when the manifest has one; the description when it differs from the pitch; every highlight as a card, two columns from `@xl`.
- **Copy solo link** copies `route_url({ kind: solo, id })`, `#/solo/{id}` with no props, and toasts it.
- **In a solo tab** (ADR-047) Open and Get become **Open in WebOS**, a link to `#/app/{id}` in a new tab: a solo tab launches no other app and installs nothing, and the deep link installs it on open (ADR-040).
- Enter in the search opens the first match's story.

**Details pane.** The icon tile with the app's badge, name (with the New / Updated badge), category label (System for system apps) and "Added v… · Updated v…" from the release notes (`app_history`, ADR-038), or the manifest `v{version}` when the notes say nothing; for an installed app: Open (`apps.launch`, the library stays open), Pin to desktop (`desktop.pin`; "Add to home screen" on mobile), on desktop Pin to taskbar / Unpin from taskbar (`settings.taskbar.pinned`, ADR-042), for an app with a widget on desktop Add widget (`desktop.pin_widget(id, { label: name })`), and for a user app **Uninstall…** (`uninstall_app()`, [apps](services/apps.md#public-api)). For one that isn't: **Get** (`apps.install`, quietly; the buttons turn into the installed set) and **Get and open** (`apps.launch`). Each action toasts its result. A "By …" line (`AppByline`, `components/apps/app-byline.svelte`: each author linked to GitHub or their url, new tab) sits under it. Then the description, **What it does** (the manifest `highlights` as small cards, when present), keywords as `Badge`s, **Opens** (`associations`) and **Works on, from Open with** (`tools`) as mono badges with extensions first, **Commands** (ids from the manifest `shell` declarations, sorted, with their descriptions), **Widget** (the default and range of `widget_size` in cells, or the 2×2 fixed fallback; "desktop only" on mobile) **History** (every changelog line tagged with the app, newest first: kind `Badge`, mono version, date, the text; four shown, then "Show all N"; ending with "Added in v…" when the release that introduced it is reached) and **Shell**, the `app launch {id}` line.

**Shell.** No commands of its own: `app launch app-library` opens it, the Showcase included (owner, 2026-10-18: nothing new in the shell; it's reached through the view switch, the start menu and its link), and `app list` / `app info` already give the same data as values.

**Persistence.** The Showcase / Store page, category, Showcase category, filters, sort, view and the selected app are `storage.window()` state, restored with the session. The search is not kept.

**Known gaps.**

- No arrow-key movement between tiles; Tab and Enter (select) work, launching is the details' button or double-click.
- "All apps" always opens a new window, like any launch; it doesn't focus an open library.
- Used before has no order and no "recently": nothing records when an app was last used.

## Terminal

`terminal` · own `icon.svelte` · source `system/terminal/` · [ADR-033](../adrs/033-shell.md)

A [shell](services/shell.md) session per window (opening it calls `shell.load()`, so app commands highlight and complete from the first keystroke), on the field surface (`light-dark(background-lightest, background-darker)`) in `font-mono text-ui`.

| File | Contents |
|------|----------|
| `terminal.app.svelte` | Session, persistence, layout |
| `prompt-input.svelte` | The prompt line: input, ghost text, completion popup, history, keys |
| `terminal-entry.svelte` / `entry-output.svelte` / `output-table.svelte` | One run: prompt line, output blocks, error or `^C`. A table wider than the terminal scrolls sideways with its first column pinned (`sticky`, on `--terminal-background`), and its right edge fades while columns are hidden (a scroll-driven animation of `--fade` in a mask; no overflow, no timeline, no fade) |
| `key-row.svelte` | Touch key row |
| `blocks.ts` / `line.ts` | Pure: values to blocks, cells, saved text; common prefix, applying a completion, history hint. Unit-tested |

**Layout.**
- The scroller is `flex-col-reverse` around a single `mb-auto` child. The browser keeps the view pinned to the newest output while you're at the bottom and leaves it alone when you've scrolled up. Short output stays at the top.
- The prompt follows the last entry.
- Clicking empty space focuses the prompt, unless you clicked a button or a row, or are selecting text.
- The window title is the cwd (`~/Pictures`).

**Output.** `to_blocks` groups each entry's values:
- Tagged values of one known type become a table with the type's columns and `cell` formatting. Rows are clickable and focusable when the type has `open`: a file opens in its app, a window comes forward, an app launches.
- Plain records with the same keys become a table; a lone record becomes a key/value list.
- Everything else is pre-wrapped text, with consecutive lines joined.
- Tables show 500 rows, then "… N more". Numeric columns are right-aligned `tabular-nums`.

**Prompt (fish-style).**

| Key | Does |
|-----|------|
| Typing | Ghost text: the newest history line that continues it, else the single completion that fits. → at the end accepts it |
| Tab | One completion: applied (a space after unless it's a folder). Several: fills the common prefix and opens a popup (top-layer popover, anchored under the prompt row, flips above). Tab / Shift+Tab / ↑ ↓ move, Enter picks, Esc closes. Picking a folder lists its contents. Typing refreshes the list (the ghost-text lookup has its own request counter, so it doesn't cancel the refresh) |
| ↑ ↓ | History (shared by all terminals), keeping the line you were typing as a draft |
| Enter | Runs the line; ignored while one is running |
| Ctrl+C | Aborts the run, or clears the line |
| Ctrl+L | Clears the screen (`session.clear()`) |
| Ctrl+U | Deletes to the start of the line |

Ctrl means the Control key on every platform; Cmd+C still copies.

**Touch.** The key row shows on `pointer-coarse`: Ctrl (sticky: the next typed letter acts as Ctrl+letter), Tab, Esc, arrows, `|`, `~`, `/`. Its buttons `preventDefault` on pointerdown, so the field keeps focus and the soft keyboard stays up. `index.html` sets `interactive-widget=resizes-content`, so on Android the layout shrinks above the keyboard and the row stays visible.

**Persistence.**
- Window state holds `cwd`, `scrollback` (the last 100 entries as text, 20 000 characters each, cached per entry while its output is unchanged; a running entry's output is saved once a second, not per streamed batch) and `started`. Session restore therefore brings back the folder and the screen.
- Restored output is plain text. An entry restored mid-run shows as aborted.
- `run` executes only on the first mount (`started`), so a restore doesn't rerun it. It's called inside `untrack`: tracked, the run's own state re-ran the effect and its cleanup aborted the command (a `^C` on every `run` link before 3.4.3).
- Closing the window aborts the running line.

**Ways in.** The launcher and the `>` palette (Open in Terminal), the desktop and phone-home icon (new devices only: the seed runs once), the taskbar button, Alt+Shift+↵, File Explorer (toolbar and folder menu) and the desktop menu (Open Terminal here, in `~/Desktop`).

**Known gaps.** iOS Safari ignores `interactive-widget`, so the keyboard can cover the key row there. The popup sits at the start of the prompt row, not at the completed word. Long lines scroll the field and hide the ghost text.

## Getting started

`getting-started` · own `icon.svelte` · source `system/getting-started/` · [ADR-041](../adrs/041-getting-started.md)

**Purpose.** A tour of what WebOS can do, one card per part, each with a Try it button that runs the real thing. On the desktop of every new device (first in `DEFAULT_SHORTCUTS`) and linked from Settings › About.

**Files.**

| File | Contents |
|------|----------|
| `ids.ts` | `TOPIC_IDS`, `TopicId`: kept apart so the manifest doesn't load the topics |
| `topics.ts` | `TOPICS` (id, icon, title, text, optional `keys`, `platforms`, optional `app`, the Try it label and `run(window_id)`) and `topics_for(platform)`, which also skips a topic whose `app` isn't registered (a fork without user apps: Ask, Desktop widgets) |
| `shell.ts` | `tour(topic)`: launches the app with the prop |
| `getting-started.app.svelte` | Header with a "N of M tried" bar, then the cards |

**Topics.** Desktop: Find any app (`ui launcher`), Command palette (`ui launcher`), Terminal (launches it with `run: "ls ~"`), Ask about your apps (launches Ask, whose empty state offers "Choose what Ask can read…"), Keyboard shortcuts (`shortcuts sheet`), Snap windows (`win snap left` on its own window), Desktop widgets (installs Clock and pins its widget), Files open in their app (File Explorer at `/home/Documents/Samples`, seeding the samples for the registered apps first when the folder is missing, else home), Get more apps (App Library), Background tasks (Activity Monitor › Tasks), Share a window (`router.copy_link` of its own window), Back up your files (Settings › Backup & reset). Phones drop the palette, Ask, shortcuts, snap, widgets and links, and add Home and dock (`ui launcher`) and Switch apps (`ui switcher`). Key chips (`format_keys`) show on desktop only.

**Behaviour.** Pressing Try it adds the topic to `tried` (once the file is loaded), then runs it; a throw becomes an error toast "Couldn't {action}". Tried cards get a `success` check and a quiet button. A `topic` prop scrolls its card to the centre and rings it in `primary` for 1.6 s. Cards are one column, two from `@xl`.

**Shell.** `tour [topic]` (manifest command; `topic` completes from the enum) opens it at a card. `#/app/getting-started?topic=widgets` does the same from a link.

## "Open…" in the viewers (ADR-025, ADR-031)

Text Editor, Media Preview, PDF Viewer, HTML Preview and CSV Viewer have an "Open…" toolbar button and an "Open a file…" action in their empty state. It calls `window.pick_file({ accept: manifest.associations })` and swaps the file in place: each viewer keeps the launched file as local state seeded from its prop (`untrack`), and Media Preview / PDF Viewer reset their loading state and view when it changes. PDF Viewer gained a toolbar for this.

A file from the device comes through the picker's "This device…" (ADR-044): it is copied into `/tmp/device/` and opens by path like any other. `/tmp` is a system folder, so the Text Editor treats it as read-only and Save goes to Save as. The viewers still hold `source: string | File` for files handed over in memory.
