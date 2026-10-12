# WebOS Implementation Roadmap

Tracks what needs to be done, priority, and links to relevant ADRs/brainstorm sessions.

**Legend:** `[ ]` not started | `[-]` in progress | `[x]` done

---

## Order

Agreed with the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_roadmap-order.md)). Work top to bottom. Small apps (Text Editor first, then Markdown Viewer, Calculator, games) go between blocks as visible releases. ADRs from February predate the Svelte rewrite: re-check each against the code when its block starts.

1. [x] **Foundations**
   - [x] Testing ([ADR-027](adrs/027-testing.md)): Vitest, unit + browser projects, CI gate on unit; helpers, opfs, revisions, DirectoryHandler, VersionService and SessionService through `boot_test_kernel`
   - [x] Error boundaries: a crashing app shows an error in its window, not a dead OS (`<svelte:boundary>` in `window-content.svelte`)
   - [x] Mobile groundwork only (ADR-016): `kernel.platform`, `WindowsService` / `DesktopWindowsService` split. Done 2026-10-12. Was:: platform detection and the `IWindowsService` interface extraction. The mobile shell stays in block 8
2. [x] **Shortcuts service** (ADR-012, ADR-017, [brainstorm](brainstorm/2026-10-12_shortcuts.md)). Alt+Shift window keys, Mod+K launcher, Mod+/ cheat sheet, `ui` service (ADR-028). Not built: remapping. Reopen closed window landed in block 3 as Alt+Shift+T
3. [x] **Notification center + system tray** (ADR-006, [brainstorm](brainstorm/2026-10-12_notification-center.md)): done 2026-10-12 (tray button + panel, mobile list in the switcher, toasts follow the tray, history cap 50, Alt+Shift+N). Then **window polish** (ADR-014, [brainstorm](brainstorm/2026-10-12_window-polish.md)): done 2026-10-12 (remembered frames per app, cascade from the app's window, open/close/minimize/maximize motion, focus on open, Alt+Shift+T reopen)
4. [ ] ~~**Tasks service** (ADR-013)~~ parked 2026-10-12 ([brainstorm](brainstorm/2026-10-12_tasks-parked.md)): built with its first consumer (terminal or zip)
5. [ ] **Shell + Terminal + Command palette** (ADR-007): on hold 2026-10-12, owner: "needs more thinking". Open before resuming: Mod+K already opens the launcher; commands vs the shortcuts registry; who registers commands; how `cd`/`clear` reach the terminal
6. [ ] **Desktop** (ADR-011: multi-select shared with File Explorer, wallpaper, auto-arrange) and **Theming** (ADR-015: radius, shadows, motion speed, export/import)
7. [ ] **Deep linking + share** (ADR-010)
8. [-] **Mobile shell** (ADR-016), pulled forward by the owner on 2026-10-12 ([brainstorm](brainstorm/2026-10-12_mobile-shell.md)). Core shell and apps pass done; OS back gesture left

**Parked** (no consumer or nothing breaks without it; revisit only on demand): Tasks service (ADR-013, until its first consumer), single-instance apps (ADR-014 revision), `get_state` / `kernel.swap`, AppDataHandle, WindowHandle status bar (the kit `StatusBar` covers it), theme sharing via URL, app store, Shadow DOM isolation.

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
- [ ] Multi-select: Ctrl/Shift+Click, marquee, Ctrl+A; bulk copy/cut/delete/drag. Same selection model as desktop multi-select (ADR-011 revision, decide with block 6)
- [ ] Drag-and-drop file operations: drop files onto a folder to move them (must auto-rename via `available_name()`; pairs with multi-select)
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
- [ ] AppDataHandle (OPFS scoped to app), deferred until an app needs it
- [ ] WindowHandle: `set_title` / `set_icon`
- [x] WindowHandle: overlays (`pick_file`, `pick_directory`, `pick_save`, `confirm`, `prompt`; ADR-025)
- [ ] WindowHandle: status bar (parked: the kit `StatusBar` covers apps)
- [ ] WindowHandle: taskbar `request_attention` / `set_badge`

---

## P1 — Essential UX

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
- [ ] Expanded WindowHandle (set_title, set_icon, request_attention, set_badge)
- [x] Window overlays: file picker, confirm, prompt (promise-based; window sheets, ADR-025)
- [ ] Window status bar (left/right text, progress indicator)

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
- [ ] Desktop icon multi-selection (marquee, Ctrl+Click, Shift+Click), sharing its selection model with File Explorer
- [x] Desktop context menu (right-click on background and icons; ADR-025)
- [ ] Desktop wallpapers (solid, gradient, image with fit/blur/tint)
- [ ] Icon auto-arrange
- [ ] Desktop icon settings (size, labels, grid spacing)

### Taskbar Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md), [ADR-015](adrs/015-customization-theming.md)
- **Status:** Not started
- [-] System tray area (notifications done; background tasks with ADR-013)
- [ ] Context menus for taskbar items
- [ ] Window grouping by app (badge count, expand to list)
- [ ] Quick launch area
- [ ] Taskbar auto-hide
- [ ] Taskbar size options (small/medium/large)

---

## P2 — Power Features

### Shell Service
- **ADR:** [ADR-007](adrs/007-shell-service.md)
- **Brainstorm:** [2026-01-31 Terminal & Shell Design](brainstorm/2026-01-31_terminal-shell-design.md)
- **Status:** Not started
- [ ] ShellService (command registry, parser, executor)
- [ ] Command definition interface (args, flags, completions)
- [ ] Progressive prefix parser (tokenize, resolve, validate, execute)
- [ ] Built-in commands (help, clear, echo, kernel)
- [ ] Service-registered commands (files, windows, apps, settings)

### Terminal App
- **ADR:** [ADR-007](adrs/007-shell-service.md)
- **Status:** Not started
- [ ] Terminal system app (`/src/lib/apps/system/terminal/`)
- [ ] Per-instance cwd state
- [ ] Command history (localStorage via StorageHandle)
- [ ] Output rendering (text, table, tree, error)
- [ ] Tab autocomplete via `shell.complete()`

### Command Palette
- **Status:** Not started (depends on Shell Service)
- [ ] Ctrl+K UI for fuzzy command search
- [ ] Integration with Shortcuts Service

### Shortcuts Service
- **ADR:** [ADR-012](adrs/012-shortcuts-service.md)
- **Status:** Not started
- [ ] Global / app / window scoped shortcuts
- [ ] Default OS-like shortcuts (Alt+F4, Alt+Tab, Ctrl+K, etc.)
- [ ] Conflict detection
- [ ] Customizable shortcuts in Settings
- [ ] Shortcut cheat sheet (Ctrl+/)
- [ ] OS detection (Windows vs Mac modifier display)

### Tasks Service & Task Manager
- **ADR:** [ADR-013](adrs/013-tasks-service.md)
- **Status:** Not started
- [ ] TasksService wrapping `@lilbunnyrabbit/task-manager`
- [ ] Task lifecycle (create, cancel, retry, remove)
- [ ] Progress tracking (determinate/indeterminate)
- [ ] Retry configuration (fixed/exponential backoff)
- [ ] Tasks tab in Activity Monitor (filter, progress bars, actions); no separate Task Manager app (ADR-013 revision)
- [ ] Taskbar badge for active task count
- [ ] Notification integration on task complete/fail
- [ ] Keyboard shortcut: Ctrl+Shift+Esc

### URL Deep Linking & Share System
- **ADR:** [ADR-010](adrs/010-url-deep-linking.md)
- **Status:** Not started
- [ ] Hash-based router (`#/app/{id}`, `#/file/{path}`, `#/demo/{name}`)
- [ ] App links with query param props (validated via zod)
- [ ] Workspace state save/restore via URL
- [ ] Embed mode (`?embed=true` strips OS chrome)
- [ ] Demo presets (curated workspace configurations)
- [ ] Share dialog (copy URL, QR code)

### Customization & Theming
- **ADR:** [ADR-015](adrs/015-customization-theming.md)
- **Status:** In progress
- [x] Colour tokens as CSS custom properties, brand palettes as presets (see ADR-015 revision)
- [x] Theme persistence (settings blob, ADR-002)
- [ ] Theme system (border radius, shadows, animation speed, font)
- [ ] CSS custom properties for all theme values
- [ ] Theme export/import as JSON
- [ ] Theme sharing via URL
- [ ] Sound effects (window open/close, notifications) — low priority

---

## P3 — Apps

### Port from React (`v0-react` branch)
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [x] Media Preview app (image, video, audio; PDF lives in PDF Viewer)
- [x] Tic-Tac-Toe game (+ AI, stats, undo)
- [x] Profiler → Activity Monitor system app (per-window DOM activity, FPS, long frames, network, storage, workers; only while open) — [brainstorm](brainstorm/2026-10-11_app-ports.md)

### New System Apps
- [ ] Markdown Viewer (rendered `.md`, extension tier over Text Viewer; parser is a dependency question)
- [x] CSV Viewer (`.csv`/`.tsv` as a table)
- [x] HTML Preview (sandboxed iframe, `srcdoc`, no `allow-same-origin`)
- [ ] Calculator
- [ ] Text Editor (tests file ops + persistence)
- [x] Style Guide (component showcase)

### Games
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Game Hub (library browser, play time tracking, categories, saves)
- [ ] Nonogram (b&w + color, editor, hints, puzzle packs)
- [ ] Other puzzles: Kakuro, Maze, Word Search, Nurikabe, Futoshiki

### Productivity
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Quick Notes (quno) — chronological notes, markdown, tags, search
- [ ] Speed Reader — RSVP, adjustable WPM, library
- [ ] Markdown-to-PDF converter — live preview, templates, TOC
- [ ] Work Hours Tracker — time in/out, monthly reports, PDF export

### Media & Entertainment
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Series Tracker — TMDB API, episode tracking, watchlist
- [ ] Image Editor — crop, resize, rotate, filters
- [ ] Video Tools — trimmer, merger, audio extraction (ffmpeg.wasm)
- [ ] Gifski — video-to-GIF via WASM

### Utilities
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Color Tools (Chromatics) — picker, palette, contrast checker, color blindness sim
- [ ] RNG Tools — dice, coin, shuffler, password generator
- [x] QR Code Scanner — camera + image file scanning (QR Reader, static-utils port)
- [ ] Compression Tools — DEFLATE, LZ77, Huffman + WASM
- [ ] P2P File Transfer — WebRTC, room codes, QR share

### static-utils Ports
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- **Brainstorm:** [2026-10-11 App ports](brainstorm/2026-10-11_app-ports.md). Outputs saved into OPFS (`pick_save`, folders for multi-file), native APIs instead of jsqr/gifuct-js/jszip
- [x] Image Crop
- [x] Background Remove
- [x] Image Concat
- [x] Image Split
- [x] Sprite Extractor
- [x] GIF Player (`ImageDecoder`)
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

- [ ] **Windows stranded off-screen after the browser shrinks** (inbox, 2026-10-12). `clamp_bounds` runs on restore and since 0.14.0 on open, never on container resize ([windows.md](system/services/windows.md) Known gaps). Maximized and snapped windows already re-fit: they're CSS percentages of the container. Options, lightest first, **owner's call**:
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
- [ ] Lazy loading for apps (dynamic imports — already in place via `component()`)
- [ ] Virtual scrolling for large lists (file explorer, game hub)
- [ ] Performance targets: <100ms interaction, <3s initial load

### PWA & Offline
- [x] Service Worker (VitePWA + Workbox precache, ADR-004 revision)
- [ ] Cache strategies (cache-first for assets, network-first for version check)
- [ ] Background sync for queued operations
- [ ] Install prompt customization

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
- [x] Mobile shell components (fullscreen apps, live-card switcher, paged home, dock, app drawer, long-press menu and drag)
- [x] Navigation: three-button bar (gestures rejected: device edges)
- [x] Back: apps claim it with `window.on_back` ([brainstorm](brainstorm/2026-10-12_mobile-apps-pass.md))
- [ ] OS back gesture through history (brainstorm first, with ADR-010)
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
- [ ] GitHub Actions build pipeline
- [ ] Automated testing on PR
- [x] Automated deployment to GitHub Pages (`deploy.yml`: check, build, deploy on push to `master`)
- [ ] Version tagging

---

## Needs Brainstorm

Owner-requested topics. Each needs a design session (brainstorm log, then an ADR) before any code. Agents: don't implement these, grill the owner.

- [x] **Multi-window sync.** Done 2026-10-12: each `DirectoryHandler` watches revisions ([brainstorm](brainstorm/2026-10-12_explorer-sync.md)). Cross-tab sync is a separate item under Files.
- [x] **Testing strategy.** Done as [ADR-027](adrs/027-testing.md).
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
- [x] SettingsService (theme, taskbar position, localStorage)
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
