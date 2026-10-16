# WebOS Implementation Roadmap

Tracks what needs to be done, priority, and links to relevant ADRs/brainstorm sessions.

**Legend:** `[ ]` not started | `[-]` in progress | `[x]` done

---

## Order

Agreed with the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_roadmap-order.md)). Work top to bottom. Small apps (Text Editor first, then Markdown Viewer, Calculator, games) go between blocks as visible releases. ADRs from February predate the Svelte rewrite: re-check each against the code when its block starts.

1. [x] **Foundations**
   - [x] Testing ([ADR-027](adrs/027-testing.md)): Vitest, unit + browser projects, CI gate on unit; helpers, opfs, revisions, DirectoryHandler, VersionService and SessionService through `boot_test_kernel`
   - [x] Error boundaries: a crashing app shows an error in its window, not a dead OS (`<svelte:boundary>` in `window-content.svelte`)
   - [x] Mobile groundwork only (ADR-016): `kernel.platform`, `WindowsService` / `DesktopWindowsService` split. Done 2026-10-12. Was: platform detection and the `IWindowsService` interface extraction. The mobile shell stays in block 8
2. [x] **Shortcuts service** (ADR-012, ADR-017, [brainstorm](brainstorm/2026-10-12_shortcuts.md)). Alt+Shift window keys, Mod+K launcher, Mod+/ cheat sheet, `ui` service (ADR-028). Not built: remapping. Reopen closed window landed in block 3 as Alt+Shift+T
3. [x] **Notification center + system tray** (ADR-006, [brainstorm](brainstorm/2026-10-12_notification-center.md)): done 2026-10-12 (tray button + panel, mobile list in the switcher, toasts follow the tray, history cap 50, Alt+Shift+N). Then **window polish** (ADR-014, [brainstorm](brainstorm/2026-10-12_window-polish.md)): done 2026-10-12 (remembered frames per app, cascade from the app's window, open/close/minimize/maximize motion, focus on open, Alt+Shift+T reopen)
4. [ ] ~~**Tasks service** (ADR-013)~~ parked 2026-10-12 ([brainstorm](brainstorm/2026-10-12_tasks-parked.md)): built with its first consumer (terminal or zip)
5. [x] **Shell + Terminal + Command palette** (ADR-033, supersedes ADR-007): decided 2026-10-14 ([brainstorm](brainstorm/2026-10-14_shell-terminal.md)). Structured-value pipes, service `shell()` hook, Tab completion, Mod+K `>` mode, shortcuts run commands
6. [-] **Desktop** (ADR-011): multi-select shared with File Explorer done 2026-10-12 ([brainstorm](brainstorm/2026-10-12_multi-select.md)); wallpaper and Sort by done 2026-10-13 ([brainstorm](brainstorm/2026-10-13_desktop-theming.md)). **Theming** (ADR-015: radius, shadows, motion speed, export/import) deferred by the owner on 2026-10-13
7. [-] **Deep linking + share** (ADR-010, [brainstorm](brainstorm/2026-10-14_deep-linking.md)): app links and titlebar Copy link done 2026-10-14. File links, workspace, demo presets, embed and mobile share deferred: almost every app's props are an OPFS path the receiving machine doesn't have
8. [x] **Mobile shell** (ADR-016), pulled forward by the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_mobile-shell.md)). Core shell and apps pass done; OS back gesture done 2026-10-14 ([brainstorm](brainstorm/2026-10-14_os-back.md)): `ui.back()` plus a history guard, desktop too

**Parked** (no consumer or nothing breaks without it; revisit only on demand): Tasks service (ADR-013, until its first consumer), single-instance apps (ADR-014 revision), `get_state` / `kernel.swap`, WindowHandle status bar (the kit `StatusBar` covers it), theme sharing via URL, app store, Shadow DOM isolation.

---

## P0 — Core Infrastructure

### Files Service Overhaul
- **ADR:** [ADR-005](adrs/005-files-service.md)
- **Status:** In Progress
- [x] Redesign FilesService API (pure functions in opfs.ts, service + DirectoryHandler)
- [x] File CRUD operations (create, read, write, delete)
- [x] Directory CRUD operations (create, list, delete recursive)
- [x] Copy and move operations
- [x] Storage estimate API (`navigator.storage.estimate()`)
- [x] Upload from local filesystem
- [x] Download to local filesystem
- [x] `exists()` check
- [x] `format_bytes()` utility (moved to general utils `$lib/core/utils`)
- [x] Directory size calculation (recursive)
- [x] File explorer: status bar (item count + storage usage)
- [x] File explorer: create folder button
- [x] File explorer: upload button
- [x] Path-string identity system (segments[] + derived path string)
- [x] Multi-window sync: each `DirectoryHandler` watches its folder's and ancestors' `files.revision()` (ADR-021); a gone folder sends the explorer to the nearest parent ([brainstorm](brainstorm/2026-10-12_explorer-sync.md))
- [ ] Cross-tab file sync: FileSystemObserver vs BroadcastChannel relay (brainstorm first)
- [x] File explorer: open files in apps (see File Associations, ADR-018)
- [x] Context menus, window sheets and clipboard ([ADR-025](adrs/025-menus-sheets-clipboard.md)):
  - [x] Window-scoped dialogs + confirm/prompt sheets
  - [x] `dialogs.menu` + ContextMenu (File Explorer, desktop)
  - [x] Rename, delete, properties, Open with
  - [x] ClipboardService: copy/cut/paste with conflict sheet
  - [x] File picker sheet (`pick_file` / `pick_directory`)
- [x] File search/filter (case-insensitive substring)
- [x] File explorer errors surfaced as notifications
- [x] Auto-rename on every name clash: upload, copy, move, new file, new folder (`name (1).ext`)
- [x] Multi-select: Ctrl/Shift+Click, marquee, Ctrl+A; bulk copy/cut/delete/open. Same selection helper as the desktop (ADR-011 revision)
- [x] Drag-and-drop file operations: drag onto a folder, the list, the desktop or another Explorer window to move; clashes keep both (`files.move_paths`)
- [x] Drop real files and folders from the OS onto the list, a folder row or the desktop (`files.import_entries`, 2026-10-12)
- [ ] Touch selection mode on mobile; arrow-key selection
- [-] Back/forward navigation buttons (Back done, no Forward)

### Service Lifecycle Hooks
- **ADR:** [ADR-002](adrs/002-service-lifecycle.md)
- **Status:** Done, except swap (2026-10-10)
- [x] `init()` / `destroy()` on services (side effects moved out of constructors)
- [x] Kernel bootstrap sequence with lifecycle (dependency order, awaited init, `pagehide` shutdown)
- [x] Service inspectors + Kernel app redesign: per-service basic/detailed views, expand all, persisted ([ADR-020](adrs/020-service-inspectors.md))
- [x] Settings persisted, versioned (now `/etc/settings.json`, ADR-021 revision)
- [ ] `get_state()` / `set_state()` + `kernel.swap()`: parked. Session persistence shipped without it; no consumer

### App Context System
- **ADR:** [ADR-003](adrs/003-app-context.md)
- **Status:** Core done
- [x] `get_app_context()` / `set_app_context()` via Svelte context
- [x] WindowHandle core: reactive state + controls (no `on()` events, owner decision)
- [x] StorageHandle (localStorage scoped to app, optional zod validation)
- [x] App data (ADR-035, 2026-10-14): `storage.file()` JSON cells in `/var/lib/apps/{id}/`, replacing the parked AppDataHandle
- [x] `WindowHandle.is_visible`, `notify({ system })`, `print_html`, game kit (`$lib/core/games`: Stopwatch, play time, daily seeds) (ADR-035)
- [x] WindowHandle: `set_title` + `set_dirty` close guard (ADR-029, 2026-10-12); `set_icon` not built
- [x] WindowHandle: overlays (`pick_file`, `pick_directory`, `pick_save`, `confirm`, `prompt`; ADR-025)
- [ ] WindowHandle: status bar (parked: the kit `StatusBar` covers apps)
- [ ] WindowHandle: taskbar `request_attention` / `set_badge`

---

## P1 — Essential UX

### App author highlights
- **Status:** Done 2026-10-16 ([ADR-038](adrs/038-app-announcements.md#app-authors)): manifest `authors`, owner by default, in the App Library, the announcement, Settings › About › Credits and `app info` / `app list`
- [x] Credit an app's author (and later contributors) where the app is shown: App Library details, the new-app announcement, maybe About. Needs an ADR: where the author lives (manifest field vs changelog), what it holds (name, GitHub handle, link), and whether OS apps show the owner

### Showcasing features to new users
- [x] Done as [ADR-041](adrs/041-getting-started.md) ([brainstorm](brainstorm/2026-10-16_installed-apps-and-showcasing.md)): Getting started system app with Try it cards and `tour [topic]`, sample files on first boot, highlights for ~10 flagship apps. Originally: brainstorm how new users discover what WebOS can do: the shell and palette, shortcuts, tasks, widgets, file associations, deep links, backup and the apps. Ideas to weigh: a richer intro tour, contextual tips the first time a feature is near, a "Getting started" app or desktop widget, feature highlights per app (the manifest `highlights`), sample files on first boot, a demo deep link. Ties into Installed apps (starter set) and the new-app announcements

### Installed apps
- [x] Done as [ADR-040](adrs/040-installed-apps.md) ([brainstorm](brainstorm/2026-10-16_installed-apps-and-showcasing.md)): installed set in `/var/lib/apps/installed.json`, gated shell, implicit installs from the UI, uninstall with optional data delete, system apps plus the interests picked in the intro on first boot, a one-time tidy of unused apps on older devices. Originally: install model instead of showing every app: App Library is the store (Get / Open), the start menu, launcher, desktop and mobile drawer show installed apps only, and search covers everything (installed first, then a "Not installed" group with Get). First boot installs a starter set, maybe picked in the intro by interest. Opening a file, a deep link, `app launch` or an announcement's Open installs silently. Not gamified unlocking: gating tools reads as a bug. Needs an ADR. Open questions:
  - existing users migrate with everything installed
  - uninstall: hide only, or also remove data
  - where the list persists (`/etc/apps.json` vs settings)
  - whether shell commands of uninstalled apps still run, and whether widgets follow install
  - whether pinned + recent + "All apps" in the start menu is enough instead (lighter, no new state)

### Design System
- **Status:** Done (2026-10-11, ADR-024, [docs/design](design/README.md)). Follows the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/)
- [x] Brand palettes (Brand Dark default, Brand Light) + extended tokens (tertiary, cottontail, states)
- [x] Brand fonts (Inter, Hack), self-hosted
- [x] Logo components (mark, lockup, badge) + placements, favicon/PWA icons, boot splash
- [x] Tailwind default palette disabled (only theme tokens compile)
- [x] Window chrome design (ADR-024)
- [x] Typography and spacing (docs/design/foundations.md)
- [x] UI kit: buttons, inputs, select, switch, segmented, sections, toolbar, status bar (ADR-024)
- [x] Surface ladder tokens per theme, elevation, motion (ADR-024)

### Window Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md)
- **Status:** Done (2026-10-12), single-instance parked
- [ ] Single-instance app flag in manifest: parked, nothing breaks without it ([brainstorm](brainstorm/2026-10-12_roadmap-order.md))
- [x] Window open/close/minimize/maximize animations (Svelte transitions + View Transitions)
- [x] Window placement: remembered frame per app, cascade from the app's frontmost window, centred first open (replaces plain cascading)
- [x] Reopen last closed window (Alt+Shift+T; Ctrl+Shift+T is the browser's)
- [x] Taskbar clock / date-time display

### Window API Expansion
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** Overlays done (ADR-025)
- [-] Expanded WindowHandle (`set_title` done; set_icon, request_attention, set_badge open; the manifest `badge` may cover set_badge)
- [x] Window overlays: file picker, confirm, prompt (promise-based; window sheets, ADR-025)
- Window status bar: parked, the kit `StatusBar` covers it (see Parked)

### Session Persistence
- **ADRs:** [ADR-021](adrs/021-file-system-hierarchy.md) (hierarchy), [ADR-022](adrs/022-desktop-folder.md) (desktop folder), [ADR-023](adrs/023-session-persistence.md) (session; supersedes ADR-014 §Session Persistence)
- **Brainstorm:** [2026-10-11 Session persistence](brainstorm/2026-10-11_session-persistence.md), [2026-01-24 Lifecycles & Persistence](brainstorm/2026-01-24_lifecycles-persistence.md)
- **Status:** Done (2026-10-11); settings also moved to `/etc/settings.json`
- [x] File system hierarchy: `/home`, `/etc`, `/var`, `/tmp`, one-time migration, native moves, per-directory revision (ADR-021)
- [x] Desktop folder `/home/Desktop` with `.desktop` shortcuts, positions in `/var/lib/desktop/layout.json` (ADR-022)
- [x] SessionService: `/var/lib/session/session.json`, reactive save, restore dialog, `windows.restore` (ADR-023)
- [x] Closed window stack (reopen last 10, SessionService, 2026-10-12)

### Notifications Service
- **ADR:** [ADR-006](adrs/006-notifications-service.md)
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** Done (2026-10-12)
- [x] NotificationsService (notify, update, dismiss, hide_toast, mark_read)
- [x] Toast area UI (corner nearest the tray; no setting, ADR-006 revision)
- [x] Notification center panel (tray popover; switcher on mobile)
- [x] Unread badge on the tray (dot on the mobile running-apps button)
- [x] Progress notification type (determinate/indeterminate)

### App Props Validation
- **ADR:** [ADR-008](adrs/008-app-props-validation.md)
- **Brainstorm:** [2026-01-31 App Props Validation](brainstorm/2026-01-31_app-props-validation.md)
- **Status:** Done (2026-10-11)
- [x] Install zod (added with ADR-003)
- [x] Add `props` schema field to AppManifest / AppConfig
- [x] Update `define_app` to infer TProps from schema
- [x] Add validation in `AppsService.launch()`
- [x] Update example app to use schema + handle undefined props

### Desktop Enhancements
- **ADR:** [ADR-011](adrs/011-desktop-enhancements.md)
- **Status:** Context menu done (ADR-025)
- [x] Desktop icon multi-selection (marquee, Ctrl+Click, Shift+Click, Ctrl+A), group drag keeping its shape, drop into folders (2026-10-12)
- [x] Desktop context menu (right-click on background and icons; ADR-025)
- [x] Desktop wallpapers: token presets and a user image with fit, dim and blur, on the desktop and the phone home (2026-10-13). No free colour or gradient pickers (brand)
- [x] Icon auto-arrange: one-shot Sort by Name, Kind, Date modified (2026-10-13)
- [ ] Desktop icon settings (size, labels, grid spacing)

### Taskbar Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md), [ADR-015](adrs/015-customization-theming.md)
- **Status:** In progress
- [x] System tray area (notifications; a tasks indicator before it, ADR-013)
- [-] Context menus for taskbar items: window items have Pin to taskbar / Unpin and Close window; quick launch icons have Open, New window, Unpin (ADR-042)
- [ ] Window grouping by app (badge count, expand to list)
- [x] Quick launch area ([ADR-042](adrs/042-quick-launch.md)): pinned apps between Start and the windows, focus-else-launch, drag to pin, reorder (icons slide apart) and drag off to unpin, `taskbar pin|unpin|list`
- [ ] Taskbar auto-hide
- [ ] Taskbar size options (small/medium/large)
- [x] Drag and drop apps to pin (owner, 2026-10-16; [ADR-042](adrs/042-quick-launch.md)): start menu tiles and App Library cards drag onto the desktop (pins at that cell) or the quick launch; mobile keeps its menus
- [x] Show desktop: a sliver at the far end of the taskbar and Alt+Shift+D (`win desktop`) minimize every visible window; again brings back only those, until another window is focused (2026-10-15, [brainstorm](brainstorm/2026-10-15_show-desktop.md)). Mobile: goes home

---

## P2 — Power Features

### Shell Service
- **ADR:** [ADR-033](adrs/033-shell.md) (supersedes [ADR-007](adrs/007-shell-service.md))
- **Brainstorm:** [2026-10-14 Shell, terminal and palette](brainstorm/2026-10-14_shell-terminal.md), [2026-01-31 Terminal & Shell Design](brainstorm/2026-01-31_terminal-shell-design.md)
- **Status:** Done except deferred items (2026-10-14)
- [x] ShellService: reactive registry from each service's `shell()` hook (commands, completers, value types)
- [x] Parser: quotes, longest-prefix command ids, positionals, flags, zod coercion and validation
- [x] Structured values and pipes; verbs `where sort select first last count get`
- [x] Streaming runs with AbortSignal (Ctrl+C, window close)
- [x] ShellSession (cwd, entries); shared history in `/var/lib/shell/history`
- [x] Completion by arg kind with per-arg override
- [x] `sudo` (system dialog) for writes to system folders
- [x] Service commands: files, windows, apps, settings, notifications, clipboard, version, router, kernel
- [ ] Background jobs (`&`, `jobs`, `kill`), likely with Tasks (ADR-013): waiting on a use case
- [-] App-registered commands: global ones via `define_app({ shell })` (ADR-034, Quick Notes first); window-scoped via app context later, then app shortcuts become commands too
- [ ] `where` expression language (OR, grouping)
- [ ] Language beyond pipes (variables, globs, chaining, scripts): waiting on a use case

### Terminal App
- **ADR:** [ADR-033](adrs/033-shell.md)
- **Status:** Done (2026-10-14)
- [x] Terminal system app (`/src/lib/apps/system/terminal/`), one session per window
- [x] Rich value rendering (tables, clickable values); custom per-type `render` components not used yet
- [x] fish-style completion: ghost text, Tab popup
- [x] cwd and scrollback restored with the session (`storage.window()`)
- [x] Mobile key row (Tab, Esc, Ctrl, arrows, `|`, `~`, `/`)

### Command Palette
- **ADR:** [ADR-033](adrs/033-shell.md)
- **Status:** Done (2026-10-14)
- [x] Mod+K launcher `>` mode: commands with completion, inline results, "Open in Terminal"
- [x] OS shortcuts run commands (KeyShortcut `command` or `run`)

### Shortcuts Service
- **ADR:** [ADR-012](adrs/012-shortcuts-service.md), [ADR-017](adrs/017-keyboard-shortcuts-strategy.md)
- **Status:** Done (2026-10-12, Order block 2)
- [x] Global and window-scoped shortcuts (no separate app scope)
- [x] Default OS shortcuts: Alt+Shift window keys, Mod+K, Mod+/
- [ ] Conflict detection (only a console warning; newer wins)
- [ ] Customizable shortcuts in Settings
- [x] Shortcut cheat sheet (Mod+/)
- [x] OS detection (Windows vs Mac modifier display)

### Tasks Service & Task Manager
- **ADR:** [ADR-013](adrs/013-tasks-service.md) · [brainstorm](brainstorm/2026-10-15_tasks-service.md)
- **Status:** Done (2026-10-16), on task-manager 1.0.1
- [x] TasksService wrapping `@lilbunnyrabbit/task-manager`: one manager per run, cancel through an `AbortController` per job. Archive and PDF Tools run on it
- [x] Task lifecycle (run, cancel, retry, remove, clear)
- [x] Progress tracking (the package's `setProgress`, plus a message line)
- [ ] Retry configuration (fixed/exponential backoff): manual retry only; no consumer needs backoff yet
- [x] Tasks section in Activity Monitor (progress bars, Cancel, Retry, Remove, Clear finished); no separate Task Manager app (ADR-013 revision)
- [x] Taskbar indicator for running tasks (count from two); on mobile a line in the notification center
- [x] Notification integration: a progress toast with Cancel that becomes done, failed or cancelled
- [x] Shell: `task list`, `task cancel`, `task retry`, `task clear`
- [ ] Keyboard shortcut: owner said none for now
- [x] PDF Tools as task groups: a task per page, part, PDF or image, then a write step
- [ ] Image Tools batches as a task group
- [x] Backup create and restore as tasks (owner, 2026-10-16; [ADR-037 revision](adrs/037-backups.md), [brainstorm](brainstorm/2026-10-16_backup-as-tasks.md)): create is a task per area, then Save to device; restore unpacks each area into `/tmp/restore` (cancellable, nothing changed), then replaces and reloads (ignores Cancel)

### URL Deep Linking & Share System
- **ADR:** [ADR-010](adrs/010-url-deep-linking.md)
- **Status:** Partial (app links, 2026-10-14)
- [x] RouterService: `#/app/{id}` after the Restore answer, hash cleared after
- [ ] `#/file/{path}`, `#/demo/{name}` (deferred: paths don't exist on the receiving machine)
- [x] App links with query param props (JSON per value, validated via zod; bad links open nothing)
- [ ] Workspace state save/restore via URL
- [ ] Embed mode (`?embed=true` strips OS chrome)
- [ ] Demo presets (curated workspace configurations)
- [-] Share: titlebar Copy link for apps without a `path` prop. No dialog, no QR, nothing on mobile

### Customization & Theming
- **ADR:** [ADR-015](adrs/015-customization-theming.md)
- **Status:** In progress
- [x] Colour tokens as CSS custom properties, brand palettes as presets (see ADR-015 revision)
- [x] Theme persistence (settings blob, ADR-002)
- [ ] Theme system (border radius, shadows, animation speed, font)
- [ ] CSS custom properties for all theme values
- [ ] Theme export/import as JSON
- [ ] Theme sharing via URL
- [x] Random theme generator (owner, 2026-10-16; ADR-015 revision): Shuffle in Appearance and `theme random`, keeping the mode, harmonic hues, readable lightness gaps. Originally: a Randomize button that makes a new theme, not fully random: keep the logic that makes a theme work (contrast between token pairs, a coherent hue relationship such as analogous or complementary, sane lightness for light and dark), randomize within it
- [ ] Chromatics in WebOS (owner, 2026-10-15). Bring the whole Chromatics API (OKLCH engine, colour DSL, ~100 colour models, WCAG/APCA analysis, schemes, mixer, export) into WebOS, likely as an app plus a core colour layer. Open questions: depend on the `chromatics` package (not published yet: a new dependency) or vendor its source; what lives in core (theme maths, `derive_theme` today) and what stays in an app; shell commands (`color` values, convert, contrast); how it sits next to Culori (style default)
- [ ] Build WebOS themes with Chromatics: write a theme in the Chromatics DSL or studio, preview it live on the desktop, check contrast of every token pair, save it as a WebOS theme (feeds export/import and sharing above, and may replace `derive_theme`)
- [ ] Sound effects (window open/close, notifications) — low priority

---

## P3 — Apps

### Port from React (`v0-react` branch)
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [x] Media Preview app (image, video, audio; PDF lives in PDF Viewer)
- [x] Tic-Tac-Toe game (+ AI, stats, undo)
- [x] Profiler → Activity Monitor system app (per-window DOM activity, FPS, long frames, network, storage, workers; only while open) — [brainstorm](brainstorm/2026-10-11_app-ports.md)

### App catalogue
- **Brainstorm:** [2026-10-12 App candidates](brainstorm/2026-10-12_app-candidates.md): every candidate rated build now / after a gate / skip, and the rules for building apps in parallel
- [x] Categories + launcher sections + ranked search (ADR-001 revision, 2026-10-12)
- [x] Batch 1 (2026-10-12): Calculator, Minesweeper, 2048, Snake, Maze, RNG Tools, Dev Tools, Unit Converter, Speed Reader, Music Visualizer, Paint. Built in parallel worktrees; never run by hand yet
- **Triage:** [2026-10-14 App triage](brainstorm/2026-10-14_app-triage.md): yes / maybe / no for every remaining app, and the core work each yes app waits on
- Remove the `example` app: left for now (owner, 2026-10-14); `ui`, `session` and `router` browser tests launch it
- [-] Wave 2 follow-ups ([triage log](brainstorm/2026-10-14_app-triage.md#wave-2-results)). Done 2026-10-15: shell commands for every new app, File Explorer Compress / Extract here, shared CodeMirror module (`$lib/core/components/code`), core `write_image`, shared `Ticker` (one wall-clock-aligned clock per interval), widget resizing (`widget_size`), App Library, PWA install, word + typo app search, keyword pass. Left: kit additions (colour swatch picker, stat tile, tree list, `Segmented` disabled / icon-only / controlled, `format_date` without year, `NotificationType.SUCCESS`), `print_html` waiting for fonts
- [ ] Wave 3 follow-ups (agents' reports, 2026-10-15):
  - [ ] Kit: colour swatch picker (Soundboard, Nonogram), stat tile (Game Hub), tree list (Archive), pointer reorder for lists and grids (Kanban, PDF Tools, Soundboard), `Segmented` disabled / icon-only / controlled, `format_date` without the year, `NotificationType.SUCCESS`, `EmptyState` actions wrapping; Style Guide demo for `SideNav` counts
  - [ ] Core: a `live_file` helper next to `json_file` for shell commands (today in Kanban, used by Calendar); shared day/time/duration parsers (today in `calendar/parse.ts`, imported by Work Hours and Kanban); `FilesService.ensure_directory(path)`; a progress-toast job helper (Archive and PDF Tools each have one)
  - [ ] Core → user-app import: File Explorer's Compress / Extract here load Archive's code. Decide whether zip moves into core
  - [ ] Value types with secondary actions (Diff's "Compare with…" on files had nowhere to go)
  - [ ] `print_html` waits for `document.fonts.ready`
  - [ ] Terminal: wide tables clip on phones (`since`, `alarm ls`, `rec list`)
  - [ ] Pinning a widget twice quickly from the shell makes a duplicate (`since pin`, `quno pin`): the desktop list hasn't caught up
  - [ ] Widgets: resize from any corner; a Resize item in the widget menu
  - [ ] Activity Monitor: highlight a widget on the desktop; counts of shared clocks and app-data cells
  - [ ] Media Preview: no length for MediaRecorder WebM recordings (no duration header)
  - [ ] Diff: "Paste text" only reveals the editors; editors rebuild (and lose scroll) on outside changes
  - [ ] PDF Tools: JPEG EXIF orientation, Organize overwrites without a disk-change check, Split's default range errors on short PDFs, errors show twice from commands
  - [ ] Recorder: test a real microphone (agents' sandbox blocked audio)
  - [ ] Pomodoro / Clock / Calendar alerts need a window or widget alive; see Background scheduler
- [-] Batch 1 follow-ups: in-app commands go through ShortcutsService (ADR-030, 2026-10-13); done 2026-10-12: kit Textarea, CopyButton, Slider, pressed buttons, Segmented `sm`, BoardOverlay, "Game app" pattern; close guard + `set_title` (Paint). Left: colour well, anchored popover, `Input` invalid state, `Select` groups, `write_image(path)` in core, regex tester in a worker

### New System Apps
- [x] Markdown preview: Edit / Split / Preview in Text Editor, `marked` in a sandboxed frame (2026-10-13, ADR-030)
- [x] CSV Viewer (`.csv`/`.tsv` as a table)
- [x] HTML Preview (sandboxed iframe, `srcdoc`, no `allow-same-origin`)
- [x] Calculator (2026-10-12)
- [x] Text Editor: Text Viewer renamed and rebuilt on CodeMirror 6, save / save as / new, close guard, disk-change reload and banner (2026-10-13, ADR-030)
- [x] Open from device: every Open… gets a secondary device action, read in memory with no OPFS copy (2026-10-13, ADR-031)
- [x] Style Guide (component showcase)

### Games
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [x] Game Hub: library with play time, Today tab with daily puzzles and streak, stats, widget (2026-10-14)
- [x] Nonogram: black and white (2026-10-13); colour mode, editor with uniqueness check, `.nonogram` files (2026-10-14). Hand-made colour pack not done
- [x] Solitaire (Klondike) (2026-10-14)
- [x] Daily puzzles: `daily` prop in 8 games, Game Hub Today tab (2026-10-14)
- [x] Games on the kit: Stopwatch pauses when unseen, play time, Sudoku timer fix (2026-10-14)
- Later: Chess, Sokoban, Blocks
- [ ] Wordle and variants (owner, 2026-10-14): classic, longer words, multi-board (Quordle-style), daily via the `daily` prop. Needs a word list decision (bundled size vs language)
- [x] Maze (generate, solve, play; 2026-10-12)
- [x] Minesweeper, 2048, Snake (2026-10-12)
- [x] Other puzzles, all generated with a proven single answer (2026-10-13): Word Search, Futoshiki, Sudoku, Kakuro, Nurikabe

### Productivity
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [x] Quick Notes (ADR-034, [brainstorm](brainstorm/2026-10-14_quick-notes.md)), quno-inspired
  - [x] App commands (`define_app({ shell })`)
  - [x] Core: `/home/Notes`, ids, Todo | Notes | Inbox tabs, `note`/`notes`/`todo` commands and values, capture dialog with context stamp, Alt+Shift+Q
  - [x] Manifest badge (open todos), shown where the icon shows
  - [x] Desktop widgets (`.widget` files, multi-cell), stickies; mobile later
  - [x] Widget resizing: corner grip and Shift+arrows, per-app `widget_size` limits (2026-10-15)
  - [x] Wikilinks and backlinks
- [x] Speed Reader — RSVP, adjustable WPM, position per file (2026-10-12). Video export not ported (mediabunny)
- [x] Markdown to PDF: paged preview, templates, TOC, header/footer, export via print (2026-10-14)
- [x] Work Hours: clock in/out, month view, printable time sheet, widget (2026-10-14)
- [x] Pomodoro and Clock, two apps (2026-10-14)
- [x] Time Since (2026-10-14)
- [x] Kanban, a personal "life" board (2026-10-14)
- [x] Calendar, with Work Hours days and Kanban due dates (2026-10-14)
- [ ] Habit Tracker (yes, not now)
- Later: Spreadsheet

### Media & Entertainment
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- ~~Series Tracker~~ dropped in the 2026-10-14 triage
- [x] Paint (2026-10-12)
- [x] Music Visualizer (2026-10-12)
- [x] Image Editor — crop, resize, rotate, flip, adjustments, save as (2026-10-14)
- [x] Recorder: mic, screen, camera and photos in one app (2026-10-14). Real microphone untested by the agents
- [x] Soundboard (user-loaded sounds) (2026-10-14)
- Later: Video Tools (trim, merge, audio extraction), Video → GIF

### Utilities
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Color Tools (Chromatics) — picker, palette, contrast checker, color blindness sim. Waits on chromatics as an npm package
- [x] RNG Tools — number, dice, coin, list, password (2026-10-12)
- [x] Dev Tools — base64, hashes, URL, UUID, regex, JSON (2026-10-12)
- [x] Unit Converter (2026-10-12)
- [x] QR Code Scanner — camera + image file scanning (QR Reader, static-utils port)
- [x] Archive: zip read/write on native streams, "How it works" LZ77 view (2026-10-14). Moves onto Tasks once built
- [x] PDF Tools — merge, organize, split, sign (vector signatures from a signature pad), images ↔ PDF; pdf-lib + pdf.js, lazy (2026-10-15). pdf.js worker not precached yet
- [x] Diff on `@codemirror/merge` (2026-10-14)
- Maybe: Hex Viewer, Font Viewer, Web app wrapper
- [x] P2P Transfer — WebRTC, QR-code signaling (no room codes: no server), resume (2026-10-13, [ADR-032](adrs/032-p2p-transfer.md), [brainstorm](brainstorm/2026-10-13_p2p-transfer.md))

### static-utils Ports
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- **Brainstorm:** [2026-10-11 App ports](brainstorm/2026-10-11_app-ports.md). Outputs saved into OPFS (`pick_save`, folders for multi-file), native APIs instead of gifuct-js/jszip; QR uses `BarcodeDetector` with a lazy jsqr fallback
- [x] Image Tools — Remove background, Join, Trim, Split, Sprites in one app with sections and `image tools|trim|split|join|unbg` commands (2026-10-15, [brainstorm](brainstorm/2026-10-15_image-tools.md)). Replaces the separate Image Crop, Background Remove, Image Concat, Image Split and Sprite Extractor ports
- [x] GIF Player (`ImageDecoder`)
- [x] Hopsprite — indexed pixel art and animation editor: layers, timeline, onion skin, tags, `.hopsprite` JSON with RLE cels, SVG, animated SVG (SMIL) and hand-written GIF export on Tasks (2026-10-16, [ADR-039](adrs/039-hopsprite.md), [brainstorm](brainstorm/2026-10-16_hopsprite.md))
- [x] Hopsprite UI and performance pass — canvas-first layout, filmstrip of thumbnails, side panel for colours and layers, resizable and foldable panels, dirty-rect drawing, cached frame composites, faster open (2026-10-16, [brainstorm](brainstorm/2026-10-16_hopsprite.md#ui-pass))
- [x] QR Reader (`BarcodeDetector`; covers the "QR Code Scanner" utility)

### File Associations
- **ADR:** [ADR-018](adrs/018-file-associations.md), [ADR-019](adrs/019-system-dialogs.md)
- **Brainstorm:** [2026-10-11 File Associations](brainstorm/2026-10-11_file-associations.md)
- **Status:** Done (2026-10-11)
- [x] `associations` manifest field (extensions + MIME patterns)
- [x] `FILE_PROPS` (`{ path }`) + `FilesService.get_file(path)`
- [x] `AppsService.open(path, { anchor })` with specificity tiers
- [x] DialogsService + dialogs host (native `<dialog closedby="any">`, anchor positioning)
- [x] "Open with" dropdown with "Always use" checkbox
- [x] `file_defaults` in persisted settings
- [x] File Explorer: double-click / Enter on files
- [x] Text Viewer app (`text/*` + common text extensions)
- [x] Media Preview port (image, video, audio)
- [x] PDF Viewer app (native browser viewer in an iframe)

---

## Open bugs

- [x] **Windows stranded off-screen after the browser shrinks** (inbox, 2026-10-12). Fixed with options 2 + 4: titlebars stay reachable on resize, and Alt+Shift+G / desktop menu "Gather windows". `clamp_bounds` runs on restore and since 0.14.0 on open, never on container resize ([windows.md](system/services/windows.md) Known gaps). Maximized and snapped windows already re-fit: they're CSS percentages of the container. Options, lightest first, **owner's call**:
  1. Clamp stored bounds on container resize. Simple, but permanent: growing the browser back leaves windows squeezed.
  2. Keep a grab handle reachable: clamp only so N px of the titlebar stays on screen (macOS/Windows). Size untouched.
  3. Render-time clamp: display = clamp(stored, container); stored bounds change only on drag, so growing back restores the layout. Needs a stored vs displayed split.
  4. Recovery action ("Gather windows" in a taskbar menu or a shortcut). Combines with 2.

## Known bugs (system reference pass, 2026-10-11)

Found while writing `docs/system/`. Details and file:line on each page's "Known gaps".

- [x] Version: production always reports an update, because `version.json` is stamped after the bundle ([version.md](system/services/version.md))
- [x] Version: VitePWA service worker runs, though ADR-004 rejected one (kept as a PWA, ADR-004 revised; `apply_update` keeps the SW)
- [x] Kernel: a failed `init()` leaves the splash up forever, and services that did init are never destroyed ([kernel.md](system/kernel.md))
- [x] Windows: clicking the titlebar of a maximized or snapped window restores it (no move threshold) ([window.md](system/shell/window.md))
- [x] Windows: viewport and container coordinates are mixed, so windows shift when the taskbar is top or left
- [x] Windows: initial size ignores `constraints`, `max` is never read
- [x] Windows: a minimized window can stay focused, which puts dialogs at 0,0
- [x] Windows: clicking an input in a background window doesn't raise it
- [x] Taskbar: a minimized, unfocused window needs two clicks to restore
- [x] Desktop: items are dropped when the grid shrinks; the drag ghost has no width (`px` missing)
- [x] Notifications: progress toasts hide after 5 s while the work is still running
- [x] App storage: `remove()` doesn't affect a live `persisted()` cell, so the next change writes the value back
- [x] Associations: dotfiles like `.env` never match
- [x] Files: `directory(path)` without a handle ignores the path; uploads return original names after auto-rename
- [x] Settings app: Reset doesn't clear `file_defaults`; the colour picker writes hex, not OKLCH
- [x] Code hygiene:
  - `AppsService implements AppsService` (implements itself)
  - `children: any` in `window-content`
  - `$inspect` and `console.log` leftovers

---

## P4 — Infrastructure & Polish

### Testing
- **ADR:** [ADR-027](adrs/027-testing.md)
- [x] Testing setup (Vitest: `unit` in Node, `browser` in Chromium; no component tests)
- [x] Unit tests for core utilities and services (helpers, parsers, opfs, FilesService, DirectoryHandler, Version, Session; more as services change)
- [ ] Integration tests for app launching and file operations
- [ ] Playwright browser tests in CI (deferred by owner)

### Error Handling
- [ ] Error handling strategy
- [x] Error boundaries for app crashes (per window, Restart app / Close window, error toast)

### Performance
- [x] Lazy loading for apps (dynamic imports via `component()`), per-platform shell chunks, lazy service shell command bodies and dialogs boot doesn't show ([ADR-036](adrs/036-boot-loading-screen.md))
- [x] Boot loading screen with progress; the shell, desktop widgets and session apps start loading during boot (ADR-036). Entry chunk 269 → 164 KB gz
- [ ] Virtual scrolling for large lists (file explorer, game hub). Explorer got `content-visibility` and reused row objects instead (2000 files: add one 170 → 8 ms); windowing is the owner's call
- [ ] Performance targets: <100ms interaction, <3s initial load. Throttled cold first visit is ~3.2 s, ~0.8 s of it the Inter preload

### Scoped app dependencies
- [ ] Scoped node modules for apps: an app can use an npm package without adding it to the core `package.json` (needs an ADR: where the manifest lives, how it's installed and bundled, how the boot budget stays clean)

### Code quality pass (2026-10-15, 0.37.0)
- **Brainstorm:** [code quality pass](brainstorm/2026-10-15_code-quality-pass.md)
- [x] Fork test: deleting `src/lib/apps/user` leaves check at 0 errors, a working build, passing tests and a booting desktop and mobile. Zip engine moved to `core/utils/zip`, default widgets come from the `default_widget` manifest flag, core tests use a test-only app
- [x] Phosphor `thin`/`light` weights stripped at build, Inter preloaded
- [x] `BaseWindowsService`, `FileListHandler`/`DesktopHandler` pointer handlers, shared helpers (`files/path`, `History`, `date`, `live_file`, `confirm_discard`, games `grid`/`direction`, `CameraScan`)
- [x] App pass: tickers gated on visibility, debounced saves, Nonogram worker, Paint patch undo, camera/mic/bitmap leaks, CSV Viewer paging, Text Editor keystrokes
- [ ] Owner's call: Inter preload costs ~0.8 s on a slow first visit (keep, drop, or `font-display` only)
- [ ] Owner's call: `<link rel="modulepreload">` for platform chunks (needs a build hook)
- [ ] Owner's call: windowed rendering for long lists; `getFile` metadata cache for Explorer
- [ ] Owner's call: session-save cadence; desktop widgets covered by windows keep ticking
- [ ] Owner's call: `TextDraft` is duplicated in Kanban and Work Hours: move to core?
- [ ] Owner's call: `CameraScan` lives in core utils; keep there or move to an app-shared spot
- [ ] Owner's call: Recorder keeps chunks in RAM (stream to OPFS = persistence decision); QR Reader history into `storage.file`
- [ ] Owner's call: a `$docs` alias (Settings › Roadmap and markdown-pdf use long relative imports)
- [ ] Diff: undo history is lost when the window crosses the split/unified width (keeping it broke the automatic switch)
- [ ] Minesweeper and Nurikabe have no `daily` command
- [ ] Activity Monitor's Windows section shows "—" on mobile
- [ ] `state_proxy_equality_mismatch` warning in Terminal and some games

### 1.0 release (shipped 2026-10-15)
- **Brainstorm:** [1.0 release](brainstorm/2026-10-15_v1-release.md)
- [x] Fork test in CI (delete `src/lib/apps/user`, check + build + unit tests)
- [x] App API frozen: `docs/system/app-api.md` + export pin test
- [x] Boot budget: entry chunk <= 180 KB gz, CI gate
- [x] Backups (ADR-037): `BackupService`, Settings › Backup, `backup` commands
- [x] Tasks service (ADR-013): after 1.0, additive (shipped 1.3.0)

### PWA & Offline
- [x] Service Worker (VitePWA + Workbox precache, ADR-004 revision)
- [ ] Cache strategies (cache-first for assets, network-first for version check)
- [ ] Background sync for queued operations
- [x] Install prompt customization (`install.svelte.ts`, introduction and Settings › About)
- [x] Stable chunk names across deploys: left as is (owner, 2026-10-15). Measured: the build stamp (`__VERSION_INFO__` in VersionService, entry chunk) renames 278 of 305 chunks on every deploy even with no code change, and a core change renames every app under any hashing option, because Rollup folds `import()` targets into the importer hash. Options were: `manualChunks` (+82 KB gz boot: barrels pull icons and the kit in), an unhashed `boot-data.js` (stale pairing under Pages max-age=600), or keeping old assets on Pages across deploys. The 1.2.0 update offer covers failed loads

### Workers Service
- Deferred until an app needs a worker; then it also feeds a Workers tab in Activity Monitor ([brainstorm](brainstorm/2026-10-11_app-ports.md))
- [ ] Web Worker pool for CPU-heavy operations
- [ ] WASM module loading in workers (compression, image processing)

### Accessibility
- [ ] Keyboard navigation for all features
- [ ] ARIA labels and roles
- [ ] Focus management (window focus, modal focus trap)
- [ ] High contrast mode
- [ ] Screen reader testing

### Mobile Support
- **ADR:** [ADR-016](adrs/016-mobile-support.md)
- **Brainstorm:** [2026-02-01 Mobile Support](brainstorm/2026-02-01_mobile-support.md)
- **Status:** In progress. Core shell done 2026-10-12 ([brainstorm](brainstorm/2026-10-12_mobile-shell.md))
- [x] Platform detection utility (runtime-once, `kernel.platform`, `?platform=` override)
- [x] Shell-level split (`os.svelte` → `<DesktopShell>` / `<MobileShell>`)
- [x] Shared base interface: `WindowsService` (base) / `DesktopWindowsService`
- [x] `MobileWindowsService` (fullscreen, every app mounted, home = nothing focused)
- [x] `MobileDesktopService` (ordered pages, dock, `/var/lib/desktop/home-layout.json`); `DesktopService` base by name + `DesktopFolder`
- [x] Mobile shell components (fullscreen apps, live-card switcher, paged home, dock, app drawer, long-press menu; drag removed 2026-10-13)
- [x] Navigation: three-button bar (gestures rejected: device edges)
- [x] Back: apps claim it with `window.on_back` ([brainstorm](brainstorm/2026-10-12_mobile-apps-pass.md))
- [x] OS back gesture through history (2026-10-14, `ui.back()` + guard)
- [ ] Revisit home icon drag: the hold fired on Samsung Internet but the icon never moved, cause unknown
- [x] Apps pass: every app at phone width, touch paths for File Explorer, Media Preview pinch, Sprite Extract, QR via `jsqr`
- [x] Dock reorder, menus as bottom sheets, `pointer-coarse:` kit sizes
- [x] Conditional service registration in `init.ts`
- [ ] Virtual keyboard handling
- [ ] Touch gesture support

### SEO & Social
- [ ] Open Graph meta tags (dynamic per route)
- [ ] Twitter card support
- [ ] Demo mode preview images

### CI/CD
- [-] GitHub Actions build pipeline (check, unit tests, build on push to master; no PR trigger)
- [ ] Automated testing on PR
- [x] Automated deployment to GitHub Pages (`deploy.yml`: check, build, deploy on push to `master`)
- [ ] Version tagging

---

## Needs Brainstorm

Owner-requested topics. Each needs a design session (brainstorm log, then an ADR) before any code. Agents: don't implement these, grill the owner.

- [x] **Multi-window sync.** Done 2026-10-12: each `DirectoryHandler` watches revisions ([brainstorm](brainstorm/2026-10-12_explorer-sync.md)). Cross-tab sync is a separate item under Files.
- [x] **Testing strategy.** Done as [ADR-027](adrs/027-testing.md).
- [ ] **Background scheduler** (owner, 2026-10-14). Alarms, timers, Pomodoro phases and Calendar reminders only fire while that app's window or widget is alive. An OS-level scheduler (service) that holds due times and fires `notify({ system })` with no app open. Open: who owns the schedule (apps register `{ at, title, action }`?), persistence in `/var/lib`, dedupe across tabs, how the app is told on click.
- [x] **Window extraction** (owner, 2026-10-16). Done as [ADR-043](adrs/043-window-extraction.md) ([brainstorm](brainstorm/2026-10-16_window-extraction.md)): Document Picture-in-Picture only, desktop-only `ExtractService`, any app, frame hidden and taskbar item marked, the window's sheets, menus and dialogs inside the mini window, disabled while dirty, `win pop` / `win back` + Alt+Shift+P. Built 2026-10-16. Left: OS shortcuts inside the mini window, keeping in-memory state across the move, `window.open` popups after cross-tab sync
- [x] **Backup system** (owner, 2026-10-14). Done as [ADR-037](adrs/037-backups.md): one zip of `/home`, `/etc`, `/var/lib` and `app.*` localStorage, picked per area, saved to the device; restore replaces the areas it holds and reloads ([brainstorm](brainstorm/2026-10-15_v1-release.md)).
- [x] **New-app announcements and app history** (owner, 2026-10-16). Done as [ADR-038](adrs/038-app-announcements.md): changelog lines tagged with app ids and an `introduces` list per release (backfilled for every app), a new-app announcement after the Restore answer, manifest `highlights` / `preview`, App Library History section, Recently added / updated sort and session-only New / Updated badges, `changelog --apps` ([brainstorm](brainstorm/2026-10-16_app-announcements.md)).
- [x] **Release notifications.** Done as [ADR-026](adrs/026-release-notes-intro.md): typed changelog, "Updated" and "update available" toasts, Settings › What's new, full-screen first-boot introduction. Originally: after an update, users get a popup they can open to see what changed or was added. The same notes are viewable in Settings. Builds on ADR-004, which planned a hand-written `CHANGELOG.md` rendered in Settings (not built; the file doesn't exist yet) and an "update available" toast. Open questions:
  - What shows before vs after reloading into the new version?
  - How do we track which version a user has seen?
  - Is the changelog format structured or markdown?
  - Is it the ADR-006 notification or a dedicated window?

---

## Unscheduled Ideas

Owner ideas with no design yet. Each needs a brainstorm before anything is built. Source: [legacy gap analysis](brainstorm/2026-02-01_legacy-gap-analysis.md).

- [ ] App isolation via Shadow DOM
- [ ] Kernel custom events with zod-validated payloads
- [ ] Window events for file upload (and similar app-level events)
- [ ] "App store": load apps into cache, only show loaded apps, per-app versions, auto-update when closed

---

## Completed

- [x] Kernel + service registry
- [x] WindowsService (lifecycle, geometry, z-ordering, snapping)
- [x] AppsService (registry, launching, define_app)
- [x] SettingsService (theme, taskbar position, localStorage, now `/etc/settings.json`)
- [x] DesktopService (grid layout)
- [x] FilesService (basic OPFS read/list/upload/delete)
- [x] VersionService (ADR-004, polling + visibilitychange)
- [x] Window system (drag, resize, snap, minimize, maximize)
- [x] Desktop + taskbar + start menu
- [x] File Explorer (basic browsing, navigation, search)
- [x] System apps: Settings, File Explorer, Kernel
- [x] App auto-discovery via glob
- [x] ADR-006: Notifications Service design
- [x] ADR-007: Shell Service & Terminal design
- [x] ADR-008: App Props Validation with Zod design
- [x] ADR-009: App Ecosystem catalogue
- [x] ADR-010: URL Deep Linking design
- [x] ADR-011: Desktop Enhancements design
- [x] ADR-012: Shortcuts Service design
- [x] ADR-013: Tasks Service design
- [x] ADR-014: Window Enhancements design
- [x] ADR-015: Customization & Theming design
- [x] Code style decision: keeping snake_case ([brainstorm](brainstorm/2026-01-26_code-style-conventions.md))
- [x] Version update system design ([brainstorm](brainstorm/2026-01-27_version-update-system.md))
- [x] Legacy gap analysis ([brainstorm](brainstorm/2026-02-01_legacy-gap-analysis.md))
- [x] ADR-016: Mobile Support design
- [x] ADR-017: Keyboard Shortcuts Strategy design
- [x] Agent guidelines: PRINCIPLES.md, CONVENTIONS.md, CLAUDE.md rewrite ([brainstorm](brainstorm/2026-10-10_agent-guidelines.md))
