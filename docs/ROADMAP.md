# WebOS Implementation Roadmap

Tracks what needs to be done, priority, and links to relevant ADRs/brainstorm sessions.

**Legend:** `[ ]` not started | `[-]` in progress | `[x]` done

---

## Order

Agreed with the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_roadmap-order.md)). Work top to bottom. Small apps (Text Editor first, then Markdown Viewer, Calculator, games) go between blocks as visible releases. ADRs from February predate the Svelte rewrite: re-check each against the code when its block starts.

**Next (owner, 2026-10-21): App store.** The owner builds it, next. Apps load into the cache only when installed, only installed apps show, per-app versions, auto-update when closed (the [import map](brainstorm/2026-10-21_slow-updates.md) already keeps an app's chunks apart from core). Needs a brainstorm and an ADR first; see Needs Brainstorm.

1. [x] **Foundations**
   - [x] Testing ([ADR-027](adrs/027-testing.md)): Vitest, unit + browser projects, CI gate on unit; helpers, opfs, revisions, DirectoryHandler, VersionService and SessionService through `boot_test_kernel`
   - [x] Error boundaries: a crashing app shows an error in its window, not a dead OS (`<svelte:boundary>` in `window-content.svelte`)
   - [x] Mobile groundwork only (ADR-016): `kernel.platform`, `WindowsService` / `DesktopWindowsService` split. Done 2026-10-12. Was: platform detection and the `IWindowsService` interface extraction. The mobile shell stays in block 8
2. [x] **Shortcuts service** (ADR-012, ADR-017, [brainstorm](brainstorm/2026-10-12_shortcuts.md)). Alt+Shift window keys, Mod+K launcher, Mod+/ cheat sheet, `ui` service (ADR-028). Not built: remapping. Reopen closed window landed in block 3 as Alt+Shift+T
3. [x] **Notification center + system tray** (ADR-006, [brainstorm](brainstorm/2026-10-12_notification-center.md)): done 2026-10-12 (tray button + panel, mobile list in the switcher, toasts follow the tray, history cap 50, Alt+Shift+N). Then **window polish** (ADR-014, [brainstorm](brainstorm/2026-10-12_window-polish.md)): done 2026-10-12 (remembered frames per app, cascade from the app's window, open/close/minimize/maximize motion, focus on open, Alt+Shift+T reopen)
4. [x] **Tasks service** (ADR-013): parked 2026-10-12 ([brainstorm](brainstorm/2026-10-12_tasks-parked.md)), built 2026-10-16 with Archive and PDF Tools as its first consumers ([brainstorm](brainstorm/2026-10-15_tasks-service.md))
5. [x] **Shell + Terminal + Command palette** (ADR-033, supersedes ADR-007): decided 2026-10-14 ([brainstorm](brainstorm/2026-10-14_shell-terminal.md)). Structured-value pipes, service `shell()` hook, Tab completion, Mod+K `>` mode, shortcuts run commands
6. [-] **Desktop** (ADR-011): multi-select shared with File Explorer done 2026-10-12 ([brainstorm](brainstorm/2026-10-12_multi-select.md)); wallpaper and Sort by done 2026-10-13 ([brainstorm](brainstorm/2026-10-13_desktop-theming.md)). **Theming** (ADR-015): corners, shadows, text size, motion off and `.webos-theme` export/import done 2026-10-16; UI and code font (built-in Burrow or a font file, Font Maker families) done 2026-10-21 ([brainstorm](brainstorm/2026-10-21_app-font.md))
7. [-] **Deep linking + share** (ADR-010, [brainstorm](brainstorm/2026-10-14_deep-linking.md)): app links and titlebar Copy link done 2026-10-14. Solo links (one app alone) done 2026-10-18 (ADR-047). File links, workspace, demo presets and mobile share deferred: almost every app's props are an OPFS path the receiving machine doesn't have
8. [x] **Mobile shell** (ADR-016), pulled forward by the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_mobile-shell.md)). Core shell and apps pass done; OS back gesture done 2026-10-14 ([brainstorm](brainstorm/2026-10-14_os-back.md)): `ui.back()` plus a history guard, desktop too

**Parked** (no consumer or nothing breaks without it; revisit only on demand): single-instance apps (ADR-014 revision), `get_state` / `kernel.swap`, WindowHandle status bar (the kit `StatusBar` covers it), theme sharing via URL, Shadow DOM isolation.

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
  - [ ] App data files (`json_file`) announce changes to other tabs, so an app open in one tab sees what another tab's scheduler leader or `on_fire` handler wrote (owner, 2026-10-21; [scheduler brainstorm](brainstorm/2026-10-21_background-scheduler.md))
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
- [x] Back/forward navigation buttons (Forward 2026-10-16)

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
- [x] `WindowHandle.is_visible`, `notify({ system })`, `print_html`, game kit (`$lib/core/games`, now `$kit/games`: Stopwatch, play time, daily seeds) (ADR-035)
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
- [x] AI mark on app icons (2026-10-21, [brainstorm](brainstorm/2026-10-21_ai-icon-mark.md)): `ai_icon` in the app kit puts a `primary` sparkle in the top-right corner of Ask, Unsaid, Doodlehop and Alibi, the apps that need on-device AI to work

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
- [x] Live wallpapers (ADR-057, 2026-10-21): a lazy registry of OS built-ins with a background layer and an overlay above windows, desktop only; the first is Pew Pew (LaxDOTexe's idea): grid-dot turrets firing at the cursor, shield and follow modes, three paces, optional synth sound. App-contributed wallpapers deferred
- [x] Pew Pew damage (idea from LaxDOTexe) (ADR-057 revision, 2026-10-21): an option where shield hits chip jagged bites out of windows and widgets, digging toward the cursor; Repair everything in its settings, memory only. Rabbit-worker repair and per-window Repair deferred
- [x] Pew Pew Dodge (idea from LaxDOTexe) (ADR-057 revision, 2026-10-21): a third mode where the bolts fly over windows and a corner clock counts how long the cursor lasts unhit, only while it's on the page; a hit resets it, and the best time is kept in `/var/lib/desktop/pew.json`. Game Hub card deferred
- [x] Icon auto-arrange: one-shot Sort by Name, Kind, Date modified (2026-10-13)
- [ ] Desktop icon settings (size, labels, grid spacing)

### Taskbar Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md), [ADR-015](adrs/015-customization-theming.md)
- **Status:** In progress
- [x] System tray area (notifications; a tasks indicator before it, ADR-013)
- [-] Context menus for taskbar items: window items have Pin to taskbar / Unpin and Close window; quick launch icons have Open, New window, Unpin (ADR-042)
- [x] Window grouping by app (2026-10-16, [brainstorm](brainstorm/2026-10-16_taskbar-polish.md)): one button per app with a count, click lists the windows, right-click Close all. Quick launch stays separate; merging them is next
- [x] Quick launch area ([ADR-042](adrs/042-quick-launch.md)): pinned apps between Start and the windows, focus-else-launch, drag to pin, reorder (icons slide apart) and drag off to unpin, `taskbar pin|unpin|list`
- [x] Taskbar auto-hide (2026-10-16): overlays the screen, CSS reveal on hover/focus/popover, drag reveals, `taskbar autohide`. Reveal on `request_attention` waits on that API
- [x] Taskbar size options (2026-10-16): small/medium/large via `--taskbar-item`, `taskbar size`; `taskbar position` too
- [x] Recent apps (LaxDOTexe, 2026-10-20, [brainstorm](brainstorm/2026-10-20_recent-apps.md)): `apps.recent` (user apps, newest first, max 16) in `/var/lib/apps/recent.json`, a paged Recent row atop the start menu and mobile app drawer, Clear recent, `app recent [--clear]`
- [x] App search in plain sentences (2026-10-22, [brainstorm](brainstorm/2026-10-22_app-search.md)): the strict search stays first; a lazy weighted ranker (stop words, stemming, name/keywords/description/pitch weights, rare words count more, joined words) adds a Related group in the start menu, mobile app drawer and App Library; an AI suggests row from Gemini Nano keywords on desktop; App Library keeps relevance order while searching; `app find` for the shell and Ask
- [x] Taskbar clock seconds (2026-10-20): Settings › Taskbar › Clock, `taskbar seconds on|off`, off by default
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
- **Status:** Partial (app links 2026-10-14, solo links 2026-10-18)
- [x] RouterService: `#/app/{id}` after the Restore answer, hash cleared after
- [ ] `#/file/{path}`, `#/demo/{name}` (deferred: paths don't exist on the receiving machine)
- [x] App links with query param props (JSON per value, validated via zod; bad links open nothing)
- [ ] Workspace state save/restore via URL
- [x] Isolated app open (2026-10-18, [ADR-047](adrs/047-solo-app-open.md), [brainstorm](brainstorm/2026-10-18_isolated-app-open.md)): `#/solo/{id}?{props}` opens one app full page on any platform; every service boots, `apps` / `session` / `version` swapped for solo versions; Open WebOS opens the app link in a new tab; titlebar Copy link menu with Copy solo link, `link --solo`; Forms shares forms as solo links
- [ ] Demo presets (curated workspace configurations)
- [-] Share: titlebar Copy link menu (Copy link / Copy solo link) for apps without a `path` prop, `link [--solo]` in the shell. No dialog, no QR, no titlebar menu on mobile

### Customization & Theming
- **ADR:** [ADR-015](adrs/015-customization-theming.md)
- **Status:** In progress
- [x] Colour tokens as CSS custom properties, brand palettes as presets (see ADR-015 revision)
- [x] Theme persistence (settings blob, ADR-002)
- [-] Theme system (2026-10-16, [brainstorm](brainstorm/2026-10-13_desktop-theming.md)): Settings › Text & interface sets corners, shadow strength, text size and motion off (`appearance` in settings.json). App fonts done 2026-10-21: Settings › Text & interface › Fonts picks the UI and code font (Inter / Hack, built-in Burrow, or a family file in `/etc/fonts`) ([brainstorm](brainstorm/2026-10-21_app-font.md))
- [x] CSS custom properties for all theme values: colours, `--radius-scale`, `--shadow-strength`, `--text-scale`
- [x] Theme export/import (2026-10-16): `.webos-theme` file in Documents from a saved theme's menu; opening one previews and imports it in Settings
- [ ] Theme sharing via URL
- [x] Settings redesign (2026-10-21, [brainstorm](brainstorm/2026-10-21_settings-redesign.md)): macOS-style panes in a grouped sidebar (Appearance split into Theme, Wallpaper, Text & interface, Taskbar), Create a theme and Edit colours as Theme subpages, search that opens the page and rings the row, `settings [setting]` and `?setting=` links, Reset moved to Backup & reset with a confirm, Related links; the kit `SideNav` drill-in mode for narrow windows and phones (also Style Guide and Activity Monitor)
- [x] Random theme generator (owner, 2026-10-16; ADR-015 revisions): first as Shuffle, then (same day, [brainstorm](brainstorm/2026-10-16_theme-generator.md)) a Generate panel in Appearance: mode, harmony, vibrance, contrast, a lock per base colour, preview, the last 3 generations, saved themes in "Your themes" with rename and delete; `theme random` on the same generator, `theme save` / `theme delete`. Readable lightness gaps always hold. Originally: a Randomize button that makes a new theme, not fully random: keep the logic that makes a theme work (contrast between token pairs, a coherent hue relationship such as analogous or complementary, sane lightness for light and dark), randomize within it
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
- [-] Wave 2 follow-ups ([triage log](brainstorm/2026-10-14_app-triage.md#wave-2-results)). Done 2026-10-15: shell commands for every new app, File Explorer Compress / Extract here, shared CodeMirror module (now `$kit/components/code`, ADR-048), core `write_image`, shared `Ticker` (one wall-clock-aligned clock per interval), widget resizing (`widget_size`), App Library, PWA install, word + typo app search, keyword pass. Left: kit additions (colour swatch picker, stat tile, tree list, `Segmented` disabled / icon-only / controlled, `format_date` without year, `NotificationType.SUCCESS`), `print_html` waiting for fonts
- [ ] Wave 3 follow-ups (agents' reports, 2026-10-15):
  - [ ] Kit: colour swatch picker (Soundboard, Nonogram), stat tile (Game Hub), tree list (Archive), pointer reorder for lists and grids (Kanban, PDF Tools, Soundboard), `Segmented` disabled / icon-only / controlled, `format_date` without the year, `NotificationType.SUCCESS`, `EmptyState` actions wrapping; Style Guide demo for `SideNav` counts
  - [-] Core: `live_file` in the app context and shared day/time parsers in `$lib/core/utils/date` done; the progress-toast job helper is replaced by Tasks (Archive and PDF Tools run on it). Left: a public `FilesService.ensure_directory(path)`
  - [x] Core → user-app import: zip moved into core (`$lib/core/utils/zip`); File Explorer and Archive both use it
  - [ ] Value types with secondary actions (Diff's "Compare with…" on files had nowhere to go)
  - [ ] `print_html` waits for `document.fonts.ready`
  - [x] Terminal: wide tables clip on phones (`since`, `alarm ls`, `rec list`): first column pinned, edge fade while columns are hidden (owner, 2026-10-20)
  - [x] Pinning a widget twice quickly from the shell makes a duplicate (`since pin`, `quno pin`): the desktop list hasn't caught up (`write_widget` lists the entry at once; `quno pin` / `quno t pin` check first)
  - [ ] Widgets: resize from any corner; a Resize item in the widget menu
  - [ ] Activity Monitor: highlight a widget on the desktop; counts of shared clocks and app-data cells
  - [x] Media Preview: no length for MediaRecorder WebM recordings (no duration header): seek past the end once, then back
  - [ ] Diff: "Paste text" only reveals the editors; editors rebuild (and lose scroll) on outside changes
  - [-] PDF Tools: Organize overwrites without a disk-change check, errors from commands show as a terminal line plus the task's failed toast with Retry, by design (owner, 2026-10-17). Split's default range follows the PDF's page count (done 2026-10-16); JPEGs follow their EXIF orientation (done 2026-10-17)
  - [ ] Recorder: test a real microphone (agents' sandbox blocked audio)
  - [x] Pomodoro / Clock / Calendar alerts need a window or widget alive; see Background scheduler (all done 2026-10-21)
- [-] Batch 1 follow-ups: in-app commands go through ShortcutsService (ADR-030, 2026-10-13); done 2026-10-12: kit Textarea, CopyButton, Slider, pressed buttons, Segmented `sm`, BoardOverlay, "Game app" pattern; close guard + `set_title` (Paint). `write_image(path)` done (2026-10-15, now `$kit/utils/image`). Left: colour well, anchored popover, `Input` invalid state, `Select` groups, regex tester in a worker

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
- Later: Chess
- [x] Letterer, Wordle and variants (owner, 2026-10-14; built 2026-10-17, [brainstorm](brainstorm/2026-10-17_app-wave-4.md)): classic at 5/6/7 letters, 2/4/8 boards, Dodge (Absurdle), Math (Nerdle), hard mode, Survival, daily. English lists from ENABLE, filtered by frequency; renamed from Wordle (trademark)
- [x] Sokoban (2026-10-17): generated levels, solvable by construction, solver-checked minimum pushes, daily. Left: Hint (the solver can power it), tap-to-walk
- [x] Blocks (2026-10-17): falling blocks, Marathon and Sprint 40; the daily is a 40-line sprint because Game Hub's daily record keeps the lowest time. Recording a score instead changes `plays.json` (owner's call)
- [x] Color Games (2026-10-18, [brainstorm](brainstorm/2026-10-18_color-games.md), [ADR-050](adrs/050-per-mode-dailies.md)): Recall (Dialed), Odd one out, Gradient sort, Hex guess; a daily per mode with its own Game Hub row, practice, share line with a solo challenge link; culori as the app's own dependency
  - [ ] Swap culori for the chromatics package when published; colour shell commands
- [x] Brackets (2026-10-17, owner's ideas notes): knockout, double elimination, round robin, race-points cup, `.bracket` files
- [x] Maze (generate, solve, play; 2026-10-12)
- [x] Minesweeper, 2048, Snake (2026-10-12)
- [x] Lunar Lander: three ships with per-thruster physics, gravity presets, air, wind, infinite fuel (2026-10-16)
- [x] Other puzzles, all generated with a proven single answer (2026-10-13): Word Search, Futoshiki, Sudoku, Kakuro, Nurikabe
- [x] Sun & Moon (2026-10-21, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md)): LinkedIn Tango-style suns and moons with `=`/`×` signs, 6×6 and 8×8, daily, hints that name the rule
- [x] Hutches (2026-10-21, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md)): one rabbit per row, column and meadow, none touching (LinkedIn Queens style); generated so the deduction rules alone solve it, hints show the next step, daily at 8×8. Region borders in `$kit/games` (`region_edges`)
- [x] Hop (2026-10-21, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md)): LinkedIn Zip-style path through numbered dots that fills the grid, walls on some puzzles, 6×6 to 8×8, 7×7 daily, hints through forced cells
- [x] Sudoku 6×6 (2026-10-22, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md)): LinkedIn Mini Sudoku-style 6×6 grid with 2×3 boxes beside the classic 9×9, same four difficulties scaled by clue count, hints and notes, its own daily (Game Hub lists Sudoku · 9×9 and Sudoku · 6×6)
- [x] Tunnels (2026-10-21, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md), [page](apps/tunnels.md)): Wend-style word paths, every letter used once, 4×5 / 5×5 / 6×5, uniqueness proven against the full accept list, hints, daily
- [x] Plots (2026-10-22, [brainstorm](brainstorm/2026-10-21_daily-puzzles.md), [page](apps/plots.md)): LinkedIn Patches-style garden plots, split the grid into rectangles with one clue each (size and shape), 6×6 to 9×9, 7×7 daily, generated so the deduction rules alone solve it, hints place the next proven plot. Second user of `region_edges`

### Productivity
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [x] Quick Notes (ADR-034, [brainstorm](brainstorm/2026-10-14_quick-notes.md)), quno-inspired
  - [x] App commands (`define_app({ shell })`)
  - [x] Core: `/home/Notes`, ids, Todo | Notes | Inbox tabs, `note`/`notes`/`todo` commands and values, capture dialog with context stamp, Alt+Shift+Q
  - [x] Manifest badge (open todos), shown where the icon shows
  - [x] Desktop widgets (`.widget` files, multi-cell), stickies; on the phone home since 2026-10-19 (spans in the flow, resize in edit mode)
  - [x] Widget resizing: corner grip and Shift+arrows, per-app `widget_size` limits (2026-10-15)
  - [x] Widget styles (2026-10-21, [brainstorm](brainstorm/2026-10-21_widget-styles.md), idea from LaxDOTexe): Card, Glass or Clear per widget from its menu, on the desktop and the phone home; stored in the `.widget` file, passed to the app as `WidgetProps.style`; Clock drops its panels and shadows its digits on Clear
  - [x] Wikilinks and backlinks
- [x] Speed Reader — RSVP, adjustable WPM, position per file (2026-10-12). Video export not ported (mediabunny)
- [x] Markdown to PDF: paged preview, templates, TOC, header/footer, export via print (2026-10-14)
- [x] Work Hours: clock in/out, month view, printable time sheet, widget (2026-10-14)
- [x] Pomodoro and Clock, two apps (2026-10-14)
  - [x] Clock All tab and a widget that lists everything running (2026-10-21, [brainstorm](brainstorm/2026-10-21_clock-all-view.md), idea from LaxDOTexe): running timers, the stopwatch, the next alarm and world clocks on one tab, landed on when two or more things run; the stopwatch moved into `clock.json`, shared by every window; widget lines open their tab, "+N more" opens All
  - [x] Clock timer names editable on the card (2026-10-21, idea from LaxDOTexe): the card title is an inline field, placeholder is the duration, saved on change
- [x] Time Since (2026-10-14)
- [x] Kanban, a personal "life" board (2026-10-14)
- [x] Calendar, with Work Hours days and Kanban due dates (2026-10-14)
- [x] Proposals app (idea from LaxDOTexe) (2026-10-21, [ADR-058](adrs/058-proposals.md), [brainstorm](brainstorm/2026-10-21_proposals.md), [internals](apps/proposals.md)): a notebook of app pitches with the eight guide sections, status chips, a filter and a fill meter; pictures inline or full width inside the text by paste, drop, picker, camera or a sketch pad, downscaled to 1200 px WebP; `.proposals.md` Markdown with data-URL images, hand-edit tolerant; Send the notebook or one proposal through the share sheet, else a download
  - [ ] Kinds (app, feature, bug) with their own sections, status coming back from the owner, a generic notebook: next session topics in the brainstorm
- [x] Warren, a word processor (idea from LaxDOTexe) (2026-10-21, [ADR-059](adrs/059-warren.md), [brainstorm](brainstorm/2026-10-21_warren.md), [internals](apps/warren.md)): Lexical without a framework; headings, bold, italic, sizes, lists, word and character counts; A4, Letter or A5 sheets with user page breaks, or one continuous page; Change everywhere in one undo step, words used most, AI synonyms on desktop; `.warren` files; .docx export and PDF through print; `doc count`, `doc export --docx`
- [x] Warren Lexical Extensions and wave A (idea from LaxDOTexe) (2026-10-21, [ADR-059](adrs/059-warren.md) revisions, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-21-ultra-functional), [internals](apps/warren.md)): editor built from Lexical Extensions; strikethrough, sub/superscript, clear formatting with shortcuts; horizontal lines and check lists (format version 3); outline navigation; reading time, selection counts, a word goal per document; smart quotes, dashes and ellipsis; themed spelling underline
- [x] Warren wave B, the CV wave (idea from LaxDOTexe) (2026-10-22, [ADR-059](adrs/059-warren.md) revision, [ADR-021](adrs/021-file-system-hierarchy.md) revision, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-21-ultra-functional), [internals](apps/warren.md)): templates (CV, cover letter, letter, report) and Save as template into a new `/home/Templates`; pictures (paste, drop, picker, camera; width, alignment, description) in the .warren, the .docx and the PDF, kept on .docx import; margins, orientation, page numbers and rich headers and footers with page fields; format version 4
- [x] Warren finalize (idea from LaxDOTexe) (2026-10-21, [ADR-059](adrs/059-warren.md) revision, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-21-finalize), [internals](apps/warren.md)): alignment and underline; .docx import through mammoth; one body font per document (Inter, Burrow, `/etc/fonts`), embedded in the PDF; links; find and replace (Mod+F); format version 2
  - [x] Spelling error list (nspell, wave E), images, tables, page numbers
- [x] Warren wave C: tables, styles and colour (idea from LaxDOTexe) (2026-10-22, [ADR-059](adrs/059-warren.md) revision, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-22-waves-ce), [internals](apps/warren.md)): tables with `@lexical/table` (insert by size, rows and columns, merge and split, header row, borders on or off, column widths by drag or presets, Tab between cells, tab-separated paste, a cell menu on right-click and a sheet on the phone), `w:tbl` in the .docx both ways and HTML tables in the PDF; a "CV (two-column)" template on a borderless table; a Styles panel for Normal, Title, Heading 1–3 and Quote stored per document and written to `styles.xml`; Title and Quote blocks; text colour and highlight; format version 5
- [x] Warren wave D: Markdown, slash menu, focus mode, ¶ marks (idea from LaxDOTexe) (2026-10-22, [ADR-059](adrs/059-warren.md) revision, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-22-waves-ce), [internals](apps/warren.md)): Markdown shortcuts while typing with `@lexical/markdown`; `.md` opened from Open with and exported from the File menu, the Export group and `doc export --md` (GFM tables, pictures as data URLs); a "/" block menu at the caret, a sheet on the phone; focus mode with dimmed paragraphs and typewriter scrolling; ¶ marks drawn over the page, never printed
- [x] Warren wave E: version history, spelling list, writing help, comments (idea from LaxDOTexe) (2026-10-22, [ADR-059](adrs/059-warren.md) revision, [brainstorm](brainstorm/2026-10-21_warren.md#follow-up-2026-10-22-waves-ce), [internals](apps/warren.md)): snapshots on save and every few minutes in `/var/lib/apps/warren/history/<id>/`, thinned by day and week, with preview, a paragraph compare and an undoable restore; a misspelt-words list from an English Hunspell dictionary in a worker (`nspell`), fetched on first use and cached, with jump, suggestions, ignore, ignore all and a personal dictionary; on-device Rewrite (shorter, clearer, friendlier, more formal) and Summarise on desktop; comments with `@lexical/mark`, resolved and reopened, exported to Word's `comments.xml`; format version 6; 44 px touch targets in the toolbar, the slash menu kept inside the window and above the phone's keyboard line
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
  - [x] Trim and cut a pad's sound in the pad dialog, saved as a new WAV; pad images and any colour (2026-10-20, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md)). `$kit/utils/audio` and `$kit/components/waveform`
  - [x] Pads from a part of a video: a video opens a trim sheet with the picture following the handles, saved as a WAV pad; Open with on videos (2026-10-21, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md#follow-up-pads-from-a-video-2026-10-21))
  - [x] Keep selection in the trim editor: keep only the selected part (2026-10-21, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md#follow-up-keep-selection-2026-10-21))
  - [x] Zoom and scroll the waveform with a time ruler, on desktop and touch (2026-10-21, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md#follow-up-zoom-and-scroll-the-waveform-2026-10-21))
  - [x] Precise trim markers: thin lines with tabs outside the wave, relative drag, nudge buttons (2026-10-21, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md#follow-up-precise-markers-2026-10-21))
  - [x] Compact editor layout on phones: zoom tray and help above the wave, one readout line, one action bar, sticky dialog footers (2026-10-21, [brainstorm](brainstorm/2026-10-20_soundboard-trim.md#mobile-layout-redesign-2026-10-21))
- [x] Format Lab (2026-10-18, [brainstorm](brainstorm/2026-10-18_format-lab.md)): one image as JPEG, WebP, AVIF and JPEG XL side by side, swipe compare, size, time, SSIM and a heatmap, per-format settings, save one or all; Inspect reads AVIF and JPEG XL headers; `convert` command. Codecs in `$kit/utils/codecs` (jSquash wasm in a worker); Media Preview decodes JPEG XL through it
  - [ ] Squash gaining AVIF and JPEG XL through the kit codecs; a shared swipe-compare stage for Image Tools › Compare and Format Lab
- [x] Shopping List (2026-10-19, [brainstorm](brainstorm/2026-10-19_shopping-list.md)): mobile-first lists for the store; tick and untick in place; in-store mode with big rows and wake lock; quantities parsed as typed ("2x mleko", "500 g moka"), suggestions and "buy again" from the purchase history that Clear done records; several lists with token colours, move items between them; read a list from a photo with Gemini Nano (AiService image input, [ADR-051](adrs/051-ai-image-input.md)) or PP-OCRv5 on onnxruntime-web (bundled, cached offline; replaced tesseract.js on 2026-10-19), with an optional crop, orientation fix, confidence filter and spelling snapped to history and a built-in grocery list, reviewed before adding; lists shared by multi-part QR with a review of every change (2026-10-20, [ADR-053](adrs/053-qr-data-transfer.md); replaced live WebRTC sync, [ADR-052](adrs/052-p2p-pairing-in-kit.md)), per-item newest-wins diff with 30-day tombstones; swipe to tick and delete, item editor, lists overview, All view, list icons (3.5.0). Cards shares its list the same way. Data in `/var/lib/apps/shopping-list/lists.json`
- [x] Ask as the assistant (2026-10-20, [ADR-054](adrs/054-ai-assistant-over-shell.md), [brainstorm](brainstorm/2026-10-20_ai-assistant.md)): answers from app data by picking one switched-on read command (`ai: "read"`) with Gemini Nano, running it and phrasing the result; commands sheet with memory costs, chat memory meter, "Read …" chip, `ask` shell command; first wave Shopping List, Calendar, Quick Notes, Kanban, Work Hours, Time Since. Next: writes behind a confirm, a Linear-style corner panel with the focused window's context
  - [ ] Store aisle grouping, shell commands (`shop add`), syncing all lists: next session topics in the brainstorm
- [x] Cards (2026-10-19, [brainstorm](brainstorm/2026-10-19_cards.md)): loyalty card wallet, mobile first; every `BarcodeDetector` format plus number only, drawn by bwip-js (the app's own dependency, per-symbology imports) as theme-coloured SVG; per-format validation; scan by camera, photo, drop or paste; checkout mode with wake lock; pins, most used first, search; front/back WebP photos and notes in `/var/lib/apps/cards`; `Cards.zip` export and import, QR share of the list or one card (a link with the `import` prop); `card` prop opens a card at the checkout. Kit: `create_barcode_detector(formats)`, `detect_barcode()` and `CameraScan` report the format
  - [ ] Card widget for the desktop and phone home; shell commands (`card ls`, `card show`) if the prop proves too little
- [x] Video Tools: trim to WebM, Video → GIF, audio extraction, by play-and-capture with its own WebM muxer and colour quantizer; `video trim|gif|audio` (2026-10-17). Merge not built. Capture, encoder, muxer and sizing moved to `$kit/utils/video` (2026-10-20)
- [x] Font Maker (2026-10-20, [ADR-055](adrs/055-font-maker.md), [brainstorm](brainstorm/2026-10-20_font-maker.md), idea from LaxDOTexe): handwriting to TrueType; draw each character with pen pressure on guides, or print a template, scan it (corner marks, homography) and trace over the guides; stroke expansion and a hand-written `.ttf` writer, live preview, `.fontmaker` files. Real phone photos of a filled sheet untested
- [x] Font Maker pen (2026-10-21, [brainstorm](brainstorm/2026-10-21_font-maker-pen.md)): line width per font, speed pressure for mouse and touch (Even / Speed), Edit spacing toggle with Reset to auto, Undo button and two-finger tap, character filmstrip, ghost letters, smoother slow strokes
- [x] App font and Burrow (2026-10-21, [brainstorm](brainstorm/2026-10-21_app-font.md)): Font Maker families (weights 100–900 from the line width, per-weight and italic redraws, slant), `.ttc` family, single-face and variable (`fvar`/`gvar`) export, Use as app font; Font Viewer opens `.ttc` and uses a font as the app font; Burrow, WebOS's own rounded monoline family drawn in Font Maker, ships built in and as a sample
  - [ ] GPOS kerning that varies by weight; auto-trace stays rejected (ADR-055), OTF/CFF closed ([brainstorm](brainstorm/2026-10-21_font-maker-kerning.md))
  - [x] Burrow's Bold ª and º: underline lowered and the line lighter so they no longer merge (2026-10-21, [brainstorm](brainstorm/2026-10-21_font-maker-kerning.md))
  - [x] Italic redraw per weight: Light Italic, Bold Italic and the rest each take their own redraw, every face in the picker; `.fontmaker` format 3; Burrow gets Light and Bold Italic `a` redraws that sit on the x-height and baseline (2026-10-21, [brainstorm](brainstorm/2026-10-21_font-maker-kerning.md))
  - [x] Kerning: a legacy `kern` table in every face, the variable fonts carrying their regular weight's pairs; auto kerning measured per face from the glyphs' side profiles, nothing stored; manual pair adjustments on top, stored in `.fontmaker` (format 3); tap between two letters in the preview for the − / + stepper, Reset and an Auto switch (2026-10-21, [brainstorm](brainstorm/2026-10-21_font-maker-kerning.md))
- [x] Birdseye (2026-10-20, [ADR-056](adrs/056-birdseye.md), [brainstorm](brainstorm/2026-10-20_birdseye.md), [internals](apps/birdseye.md)): box a moving subject and it stays still in the middle while the world moves; hand-written NCC tracker (2-level pyramid, 3× search, sub-pixel peak, slow template blend) as a task, lost frames on a confidence timeline, re-box from any frame, forward-backward smoothing, zoom, blur/black/theme-colour edges, optional Follow size; WebM export with the sound as a task. Open with for videos, no shell commands. 2026-10-21: re-acquire (search widens 3×, 5×, 8× while lost; the boxed template matched alongside) and a blob fallback against plain sky, "found by shape" on the timeline, after LaxDOTexe's real swallow clip
  - [ ] A detector to find the subject again after a loss, frame-exact demuxing, MP4 output: next session topics in the brainstorm

### Utilities
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Color Tools (Chromatics) — picker, palette, contrast checker, color blindness sim. Waits on chromatics as an npm package
- [ ] Color Mixing (owner's ideas notes, 2026-10-17): pick a target colour (camera or eyedropper), enter your paints, get mix ratios (Kubelka–Munk). Waits on the Chromatics decision; overlaps its mixer
- [x] wget (owner's ideas notes, 2026-10-17): download a URL into OPFS as a task with progress, Cancel and Retry, `wget <url> [--to] [-o name]`. Only CORS-enabled hosts work. Owned by API Client (2026-10-17)
- [x] API Client (app wave 7, 2026-10-17): request builder (method, query, headers, JSON/text/form body), response view (status, time, size, headers, pretty/raw, images), Cancel, `.http` files (REST Client format) with Open with, download to files as a task, `http` and `wget` in the shell
- [x] RNG Tools — number, dice, coin, list, password (2026-10-12)
- [x] Dev Tools — base64, hashes, URL, UUID, regex, JSON (2026-10-12)
- [x] Unit Converter (2026-10-12)
- [x] QR Code Scanner — camera + image file scanning (QR Reader, static-utils port)
- [x] Archive: zip read/write on native streams, "How it works" LZ77 view (2026-10-14). Runs on Tasks since 2026-10-16. Huffman stage in How it works (2026-10-17)
- [x] PDF Tools — merge, organize, split, sign (vector signatures from a signature pad), images ↔ PDF; pdf-lib + pdf.js, lazy (2026-10-15). pdf.js worker not precached yet
- [x] Diff on `@codemirror/merge` (2026-10-14)
- [x] Hex Viewer (2026-10-17): windowed rows for any size, `hexdump`, in Open with for every file (`tools: ["*"]`, ADR-018 revision)
- [x] Font Viewer (2026-10-17): native `FontFace`, default for font files. WOFF2 shows no names or axes (Chrome has no Brotli `DecompressionStream`)
- [x] Image Tools › Patch (2026-10-17): restore marks an edit tool stamped, from the original; diff regions, auto-align offset and scale, colour matching, no shell. Phone layout, pinch zoom and pan, zoom to a change (1.19.1) ([brainstorm](brainstorm/2026-10-17_app-wave-6.md))
- [x] Test image and test PDF generators in Image Tools and PDF Tools, `testimg` / `testpdf` (2026-10-17). Owner's call: `FilesService.write_stream(path, chunks, { signal })` so multi-GB files stream to disk instead of collecting in Blobs (~2 GB peak memory, double disk use while writing today)
- [x] Web App (2026-10-17): `.webapp` files (name, URL, optional icon) open a site in a sandboxed iframe; Add web app saves one to the desktop with the favicon as an `<img>`; a site that refuses framing gets a "Not loading?" screen and an Open in a tab hint, since cross-origin can't be detected; `webapp add <url> [-n]`. Desktop icons stay the generic file icon (per-file icons would be a core change)
- [x] P2P Transfer — WebRTC, QR-code signaling (no room codes: no server), resume (2026-10-13, [ADR-032](adrs/032-p2p-transfer.md), [brainstorm](brainstorm/2026-10-13_p2p-transfer.md))
  - [x] Files by light (2026-10-21, [ADR-060](adrs/060-files-by-light.md), [brainstorm](brainstorm/2026-10-21_light-transfer.md)): a By light mode sends one file up to 2 MB with no network, as animated QR codes on a systematic LT fountain code (`$kit/utils/light`); Steady / Fast speeds, estimated time, SHA-256 checked, saved to Downloads
  - [ ] Text chat during a transfer: short messages over the open data channel, shown as a side thread (owner's ideas notes, 2026-10-17)

### Algorithms
- [x] Algorithm visualizers (owner, 2026-10-18; built the same day, [brainstorm](brainstorm/2026-10-18_algorithm-visualizers.md)): the Algorithms app, a learning platform with 90 algorithms and structures in 12 groups (sorting, trees, graphs, data structures, compression, strings, searching, dynamic programming, backtracking, math, geometry, OS concepts). One snapshot-step engine; every step narrated, pseudocode lit, live counters, one legend; playground with typed / random / preset inputs, drawn graphs and points, parameters, and operations that animate only what they add; SVG views with pan and pinch, canvas for big sorts; `.algo` files, solo links with input, `algo list` / `algo`. LZ77 ports the owner's gist (with its look-ahead fix)
- [x] Algorithms follow-ups (2026-10-18, [brainstorm](brainstorm/2026-10-18_algorithm-visualizers.md#follow-ups)): red-black and B-tree delete; Boyer–Moore good-suffix rule; full Bentley–Ottmann (sorted active set, intersection events); arithmetic coding; Huffman coding with bit output under Compression (the tree is under Trees); a keyboard path for the graph and points editors (arrow keys to move, Enter to connect). Bentley–Ottmann sits beside the simple line sweep; Huffman coding reuses the Trees module's tree build; the editors got Add node / Add point buttons as the keyboard way to add

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
- [x] Performance pass (2026-10-17, [brainstorm](brainstorm/2026-10-17_performance-pass.md)): state writes debounced 300 ms and skipped when unchanged (20 focus clicks: 20 → 1 writes), only the focused window named for view transitions (minimize with 10 windows ~130 → 67 ms frames), Recorder meter and Lunar Lander readouts stop forcing layout, persisted cells don't rewrite on open. Left: element-scoped view transitions; Minesweeper per-cell state for huge boards
- [ ] Performance targets: <100ms interaction, <3s initial load. Throttled cold first visit is ~3.2 s, ~0.8 s of it the Inter preload
- [x] Lazy app metadata ([ADR-049](adrs/049-lazy-app-metadata.md), done 2026-10-18, 3.0.0). Lazy `shell` shipped in 2.0.0. `description`, `keywords`, `pitch` and `authors` moved to a lazy per-app `meta.ts` in one `app-meta` chunk, prefetched on idle (`meta_ready`, `meta(id)`); `props` stay eager; Algorithms `section` validated in-app; ADR-048 shims removed. Entry chunk 168.2 → 154.4 KB gz. Follow-up: AppsService owns `listings()`, `author` / `license` / `repository` deprecated for 4.0

### Scoped app dependencies
- [x] Scoped node modules for apps: an app declares its packages in its own `package.json`, Bun workspaces with the isolated linker keep them out of core and other apps ([ADR-045](adrs/045-scoped-app-dependencies.md))

### App kit layer
- [x] App-only helpers moved out of core into `src/lib/kit`, imported as `$kit` (2026-10-18, [brainstorm](brainstorm/2026-10-18_app-kit-layer.md), [ADR-048](adrs/048-app-kit-layer.md)): history, qr, qr-scan, exif, image (with image-format), components/code and games. Zip stays core. `DailyRank` moved into core's `apps/type.ts`. Core never imports `$kit` (`kit-boundary.test.ts`); the kit is stable like core (app-api.md `$kit` section, pinned by `app-api.test.ts`); the old stable paths `$lib/core/games` and `$lib/core/utils/image` were re-export shims until 3.0, removed in 3.0.0 (ADR-049)

### Custom app icons
- [x] Custom icon per app, drawn in the house line style; the Phosphor app icons are gone (2026-10-17, [brainstorm](brainstorm/2026-10-17_app-wave-7.md#decided-app-icons), [foundations](design/foundations.md#app-icons)). Boot entry 186.4 → 159.0 KB gz. Was: a skill (or script) that generates a custom icon per app in the lilBunnyRabbit brand style instead of a stock Phosphor glyph (owner, 2026-10-17). Open questions: output format (Svelte SVG component like the logo, sized for 16–64 px and the mobile home grid), theme tokens or fixed brand colours, how it fits the manifest `icon` field and the boot budget (every manifest icon ships in the boot chunk: Crack the Code's Phosphor icon alone is ~0.7 KB gz), and whether Style Guide shows the set

### Code quality pass (2026-10-15, 0.37.0)
- **Brainstorm:** [code quality pass](brainstorm/2026-10-15_code-quality-pass.md)
- [x] Fork test: deleting `src/lib/apps/user` leaves check at 0 errors, a working build, passing tests and a booting desktop and mobile. Zip engine moved to `core/utils/zip`, default widgets come from the `default_widget` manifest flag, core tests use a test-only app
- [x] Phosphor `thin`/`light` weights stripped at build, Inter preloaded
- [x] `BaseWindowsService`, `FileListHandler`/`DesktopHandler` pointer handlers, shared helpers (`files/path`, `History`, `date`, `live_file`, `confirm_discard`, games `grid`/`direction`, `CameraScan`)
- [x] App pass: tickers gated on visibility, debounced saves, Nonogram worker, Paint patch undo, camera/mic/bitmap leaks, CSV Viewer paging, Text Editor keystrokes
- [ ] Owner's call: Inter preload costs ~0.8 s on a slow first visit (keep, drop, or `font-display` only)
- [ ] Owner's call: `<link rel="modulepreload">` for platform chunks (needs a build hook)
- [ ] Owner's call: windowed rendering for long lists; `getFile` metadata cache for Explorer
- [x] Owner's call: session-save cadence (debounced 300 ms, 2026-10-17); desktop widgets covered by windows keep ticking (left as is: ~3 ms/s)
- [ ] Owner's call: `TextDraft` is duplicated in Kanban and Work Hours: move to core?
- [ ] Owner's call: `CameraScan` lives in core utils; keep there or move to an app-shared spot
- [ ] Owner's call: Recorder keeps chunks in RAM (stream to OPFS = persistence decision); QR Reader history into `storage.file`
- [ ] Owner's call: a `$docs` alias (Settings › Roadmap and markdown-pdf use long relative imports)
- [ ] Diff: undo history is lost when the window crosses the split/unified width (keeping it broke the automatic switch)
- [x] Minesweeper and Nurikabe have no `daily` command (`minesweeper daily [day]`, `nurikabe daily [day]`). Sudoku, Kakuro, Futoshiki and Word Search take `daily` too and still have no command
- [x] Activity Monitor's Windows section shows "—" on mobile (the mobile window body had no `data-window-id`)
- [-] `state_proxy_equality_mismatch` warning in Terminal and some games: Terminal fixed (the running `Run` held in deep `$state`, compared to the raw handle). Not reproduced in any game on 2026-10-16 (every game fuzzed: board clicks, toolbars and menus, reload, daily)

### 1.0 release (shipped 2026-10-15)
- **Brainstorm:** [1.0 release](brainstorm/2026-10-15_v1-release.md)
- [x] Fork test in CI (delete `src/lib/apps/user`, check + build + unit tests)
- [x] App API frozen: `docs/system/app-api.md` + export pin test
- [x] Boot budget: entry chunk <= 190 KB gz (was 180 until 2026-10-17), CI gate
- [x] Backups (ADR-037): `BackupService`, Settings › Backup, `backup` commands
- [x] Tasks service (ADR-013): after 1.0, additive (shipped 1.3.0)
- [x] Releases posted to Discord (2026-10-21, [brainstorm](brainstorm/2026-10-21_discord-releases.md)): an `announce` job after a successful deploy posts every changelog entry newer than the latest `v*` tag as one embed each, then tags the newest; waits on the owner's webhook secret

### PWA & Offline
- [x] Service Worker (VitePWA + Workbox precache, ADR-004 revision)
- [ ] Cache strategies (cache-first for assets, network-first for version check)
- [ ] Background sync for queued operations
- [x] Install prompt customization (`install.svelte.ts`, introduction and Settings › About)
- [x] Update screen progress (2026-10-21, [brainstorm](brainstorm/2026-10-21_slow-updates.md)): files done of the total and elapsed time while the new service worker installs, read from Cache Storage; "Still downloading…" with Restart now after 8 s; automatic fallback on a 20 s stall or after 120 s; `registration.update()` timeout
- [x] Stable chunk names across deploys: left as is (owner, 2026-10-15). Measured: the build stamp (`__VERSION_INFO__` in VersionService, entry chunk) renames 278 of 305 chunks on every deploy even with no code change, and a core change renames every app under any hashing option, because Rollup folds `import()` targets into the importer hash. Options were: `manualChunks` (+82 KB gz boot: barrels pull icons and the kit in), an unhashed `boot-data.js` (stale pairing under Pages max-age=600), or keeping old assets on Pages across deploys. The 1.2.0 update offer covers failed loads
- [x] Smaller updates: shared `core` chunk without the app registry or build stamp (done 2026-10-21, 3.21.0, [brainstorm](brainstorm/2026-10-21_slow-updates.md), ADR-036 revision). An app change or version bump renames 17 precached files (~0.35 MB) instead of 606 (5.65 MB); boot 170.5 KB gz in three chunks. Any OS change still renames every app
- [x] Smaller updates for OS changes: chunks import `core` through an import map in `index.html` (done 2026-10-21, 3.26.1, [brainstorm](brainstorm/2026-10-21_slow-updates.md#follow-up-2026-10-21-core-changes-still-rename-575-files), ADR-036 revision). A core change renames 17 precached files instead of 583

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
- [x] Home icon drag, back in an edit mode with `touch-action: none` (2026-10-19); still to check on the Samsung phone
- [x] Apps pass: every app at phone width, touch paths for File Explorer, Media Preview pinch, Sprite Extract, QR via `jsqr`
- [x] Dock reorder, menus as bottom sheets, `pointer-coarse:` kit sizes
- [x] Swipe down to dismiss every bottom sheet: menus, dialogs and window sheets docked to the bottom, the app drawer, in-app sheets and game stats panels; one `swipe_dismiss` attachment and a kit `Grabber` (2026-10-22, [mobile](system/shell/mobile.md#swipe-down-to-dismiss))
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
- [x] Pipeline status in Settings › About and `ci status` (newest master run and its jobs, public GitHub API, no token; [brainstorm](brainstorm/2026-10-22_ci-status.md))

---

## Needs Brainstorm

Owner-requested topics. Each needs a design session (brainstorm log, then an ADR) before any code. Agents: don't implement these, grill the owner.

- [x] **Multi-window sync.** Done 2026-10-12: each `DirectoryHandler` watches revisions ([brainstorm](brainstorm/2026-10-12_explorer-sync.md)). Cross-tab sync is a separate item under Files.
- [x] **Testing strategy.** Done as [ADR-027](adrs/027-testing.md).
- [x] **Background scheduler** (owner, 2026-10-14; [ADR-062](adrs/062-background-scheduler.md), [brainstorm](brainstorm/2026-10-21_background-scheduler.md)). Alarms, timers, Pomodoro phases and Calendar reminders only fire while that app's window or widget is alive. Service core done 2026-10-21: registry, one leader tab, OS notifications through the service worker with command buttons, missed summary, Triggers when flagged, `sched` commands, Settings › Notifications ([scheduler](system/services/scheduler.md)). Clock alarms and timers and Recipe Box cook timers moved onto it 2026-10-21 (they ring with their window closed; button commands `alarm snooze|stop`, `timer restart`, `recipe timer stop`). Pomodoro moved onto it 2026-10-21 (a phase end rings with the window closed, Start/Skip buttons, a missed phase waits paused with when it ended), and the scheduler now plays the chime for alarms, timers and phases. Apps can run code when their job fires (`define_app({ on_fire })`), so Pomodoro counts and chains phases with nothing of it loaded; jobs can be `silent`, and Pomodoro's Sound switch is back (2026-10-21). Calendar reminders moved onto it 2026-10-21: they arrive with Calendar closed and open Calendar on the event's day; a reminder whose day moves with the month's length (a day ahead of a monthly event on the 29th–31st, a week ahead of the 1st–7th, around 29 February for yearly) is refused until the owner picks how to schedule it (see the brainstorm). No timer while every job is switched off (2026-10-22, [owner calls](brainstorm/2026-10-22_owner-calls.md)).
- [-] **AI-native apps** (owner, 2026-10-20, [ideas](brainstorm/2026-10-20_ai-native-apps.md)). Apps that couldn't exist without Gemini Nano, not existing apps with an AI button. Owner picks which to build; each gets its own grill (shell question included). Open call: which ideas are too close to "AI bolted on" (ADR-054). Phones decided in [ADR-061](adrs/061-ai-games.md): AI apps open there and show the kit `AiGate`'s unavailable screen; a desktop-only manifest flag is deferred
  - [x] Taboo: describe a word without the banned ones; the AI guesses (S, research pick #1). Built as Unsaid ([ADR-061](adrs/061-ai-games.md), [internals](apps/unsaid.md))
  - [ ] Twenty Questions: the AI holds a secret, answers yes / no / sometimes / unknown (S)
  - [x] Sketch Guess: you draw, the AI guesses from snapshots (M, research pick #2). Built as Doodlehop ([ADR-061](adrs/061-ai-games.md), [internals](apps/doodlehop.md))
  - [x] Alibi: question an AI suspect, find the lie (M). [ADR-061](adrs/061-ai-games.md), [internals](apps/alibi.md)
  - [ ] Pocket Dungeon: text adventure, code runs the world, AI parses and narrates (L, research pick #3)
  - [ ] Emoji Rebus: guess or make emoji puzzles; Game Hub daily (S)
  - [ ] Café Talk: role-play language practice with corrections (M, needs Proofreader API)
  - [ ] Voice Inbox: speak a thought, filed as todo, idea or event (M, needs audio input)
  - [x] Night Journal, built as Moonrabbit without AI ([brainstorm](brainstorm/2026-10-22_moonrabbit.md), [ADR-063](adrs/063-moonrabbit-journal.md), [internals](apps/moonrabbit.md)): encrypted journal, master phrase and recovery code, passkey, Carrot patch and PIN quick unlock, auto-lock, today box, templates, prompt, photos, search, several journals, export, reminder; mood tap, activities, energy and sleep, calendar heat map, Year in Pixels, mood chart, activity correlations, On This Day, live formatting, adding while locked (widget and capture box); quick unlock offered at first run and after a phrase unlock, rename and delete from the lock screen and settings; uninstalling with its data deletes the device store (`on_uninstall_data`, 2026-10-22), and the typed-name delete step is red
  - [ ] Photo Bingo: webcam scavenger hunt (M)
  - [ ] Receipt Box: receipt photo to a spending table, totals checked (M; overlaps Shopping List photo reading)
  - [ ] Whiteboard Snap: photo of a board to clean Markdown (S; overlaps photo reading)
  - [ ] Quiz Me: text file to a multiple-choice quiz (M; maybe a shell filter instead)
  - [ ] Tone Dial: rewrite with formality, length and warmth sliders (S, needs Writer/Rewriter; maybe a shell filter)
- [x] **Forms by link** (owner's ideas notes "Auto Savable", 2026-10-17; answer codes 2026-10-18, [brainstorm](brainstorm/2026-10-18_forms-answer-codes.md): form id stamped on share, answer codes pasted in Forms or `form answer` save beside the form, Summary tab, forms home). Build a checklist or form, Copy link puts it in the URL; the other person fills it in and sends back a reply link; opening it merges the answers into your `.form` file. Open: compressed deep-link props (CompressionStream + base64url) and link length limits change the router's prop shape (ADR-010)
- [x] **Window extraction** (owner, 2026-10-16). Done as [ADR-043](adrs/043-window-extraction.md) ([brainstorm](brainstorm/2026-10-16_window-extraction.md)): Document Picture-in-Picture only, desktop-only `ExtractService`, any app, frame hidden and taskbar item marked, the window's sheets, menus and dialogs inside the mini window, disabled while dirty, `win pop` / `win back` + Alt+Shift+P. Built 2026-10-16. Left: OS shortcuts inside the mini window, keeping in-memory state across the move, `window.open` popups after cross-tab sync
- [x] **Backup system** (owner, 2026-10-14). Done as [ADR-037](adrs/037-backups.md): one zip of `/home`, `/etc`, `/var/lib` and `app.*` localStorage, picked per area, saved to the device; restore replaces the areas it holds and reloads ([brainstorm](brainstorm/2026-10-15_v1-release.md)).
- [x] **App showcase** (owner, 2026-10-18, [brainstorm](brainstorm/2026-10-18_app-showcase.md)). Done 2026-10-18: a Showcase view in the App Library (`view` / `app` props, `#/solo/app-library?view=showcase` to share), manifest `pitch` (`{ problem, solution }`) written for all 76 apps, story cards by category with Open / Get and Copy solo link, a detail with preview and every highlight.
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
- [ ] "App store" (next, owner builds it): load apps into cache, only show loaded apps, per-app versions, auto-update when closed

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
