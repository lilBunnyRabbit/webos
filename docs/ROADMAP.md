# WebOS Implementation Roadmap

Tracks what needs to be done, priority, and links to relevant ADRs/brainstorm sessions.

**Legend:** `[ ]` not started | `[-]` in progress | `[x]` done

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
- [ ] Multi-window / cross-instance sync: two explorers on the same folder don't update each other. The SvelteMap cache was built then removed (stale path keys, see ADR-005). **Needs its own brainstorm first** (likely event-based invalidation, touches kernel events)
- [ ] File explorer: open files in apps (see File Associations, ADR-018)
- [ ] File explorer: context menus (delete, rename, copy, move)
- [x] File search/filter (case-insensitive substring)
- [x] File explorer errors surfaced as notifications
- [x] Auto-rename on every name clash: upload, copy, move, new file, new folder (`name (1).ext`)
- [ ] Drag-and-drop file operations (must auto-rename via `available_name()`)
- [ ] File rename functionality
- [ ] Copy/paste operations (must auto-rename via `available_name()`)
- [ ] File properties dialog
- [ ] Back/forward navigation buttons

### Service Lifecycle Hooks
- **ADR:** [ADR-002](adrs/002-service-lifecycle.md)
- **Status:** Done, except swap (2026-10-10)
- [x] `init()` / `destroy()` on services (side effects moved out of constructors)
- [x] Kernel bootstrap sequence with lifecycle (dependency order, awaited init, `pagehide` shutdown)
- [x] Settings persisted to `localStorage["webos.settings"]` (versioned)
- [ ] `get_state()` / `set_state()` + `kernel.swap()`: deferred until session persistence defines the state shape

### App Context System
- **ADR:** [ADR-003](adrs/003-app-context.md)
- **Status:** Core done
- [x] `get_app_context()` / `set_app_context()` via Svelte context
- [x] WindowHandle core: reactive state + controls (no `on()` events, owner decision)
- [x] StorageHandle (localStorage scoped to app, optional zod validation)
- [ ] AppDataHandle (OPFS scoped to app), deferred until an app needs it
- [ ] WindowHandle: `set_title` / `set_icon`
- [ ] WindowHandle: overlays (`pick_file`, `pick_directory`, `confirm`, `prompt`)
- [ ] WindowHandle: status bar
- [ ] WindowHandle: taskbar `request_attention` / `set_badge`

---

## P1 — Essential UX

### Design System
- **Status:** In progress. Follows the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/)
- [x] Brand palettes (Brand Dark default, Brand Light) + extended tokens (tertiary, cottontail, states)
- [x] Brand fonts (Inter, Hack), self-hosted
- [x] Logo components (mark, lockup, badge) + placements, favicon/PWA icons, boot splash
- [x] Tailwind default palette disabled (only theme tokens compile)
- [ ] Window chrome design
- [ ] Typography and spacing
- [ ] Button/input component styles
- [ ] Consistent theming approach

### Window Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md)
- **Status:** Not started
- [ ] Single-instance app flag in manifest (focus existing window)
- [ ] Window open/close/minimize/maximize animations (CSS-based)
- [ ] Cascading window positioning (offset new windows)
- [ ] Reopen last closed window (Ctrl+Shift+T)
- [ ] Taskbar clock / date-time display

### Window API Expansion
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** Not started
- [ ] Expanded WindowHandle (set_title, set_icon, request_attention, set_badge)
- [ ] Window overlays: file picker, confirm, prompt (promise-based)
- [ ] Window status bar (left/right text, progress indicator)

### Session Persistence
- **ADR:** [ADR-014](adrs/014-window-enhancements.md)
- **Brainstorm:** [2026-01-24 Lifecycles & Persistence](brainstorm/2026-01-24_lifecycles-persistence.md)
- **Status:** Not started
- [ ] Save/restore open windows and positions
- [ ] Save timing strategy (beforeunload + periodic)
- [ ] Closed window stack (reopen last 10)

### Notifications Service
- **ADR:** [ADR-006](adrs/006-notifications-service.md)
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** In progress
- [x] NotificationsService (notify, update, dismiss, hide_toast, mark_read)
- [-] Toast area UI (bottom-right; position setting not yet)
- [ ] Notification center panel (accessible from taskbar)
- [ ] Unread badge on taskbar icon
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
- **Status:** Not started
- [ ] Desktop icon multi-selection (marquee, Ctrl+Click, Shift+Click)
- [ ] Desktop context menu (right-click on background and icons)
- [ ] Desktop wallpapers (solid, gradient, image with fit/blur/tint)
- [ ] Icon auto-arrange
- [ ] Desktop icon settings (size, labels, grid spacing)

### Taskbar Enhancements
- **ADR:** [ADR-014](adrs/014-window-enhancements.md), [ADR-015](adrs/015-customization-theming.md)
- **Status:** Not started
- [ ] System tray area (notifications, background tasks)
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
- [ ] Task Manager system app (filter, progress bars, actions)
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
- [ ] Theme persistence (blocked on ADR-002 lifecycle)
- [ ] Theme system (border radius, shadows, animation speed, font)
- [ ] CSS custom properties for all theme values
- [ ] Theme export/import as JSON
- [ ] Theme sharing via URL
- [ ] Sound effects (window open/close, notifications) — low priority

---

## P3 — Apps

### Port from React
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Media Preview app (image, video, audio, PDF)
- [ ] Tic-Tac-Toe game (+ AI, stats, undo)
- [ ] Profiler app (per-window performance overlay, FPS, render counts)

### New System Apps
- [ ] Calculator
- [ ] Text Editor (tests file ops + persistence)
- [ ] Style Guide (component showcase)

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
- [ ] QR Code Scanner — camera + image file scanning
- [ ] Compression Tools — DEFLATE, LZ77, Huffman + WASM
- [ ] P2P File Transfer — WebRTC, room codes, QR share

### static-utils Ports
- **ADR:** [ADR-009](adrs/009-app-ecosystem.md)
- [ ] Image Combiner
- [ ] PDF Generator
- [ ] Video Trimmer/Cropper
- [ ] Video Merger
- [ ] File Download Utility

### File Associations
- **ADR:** [ADR-018](adrs/018-file-associations.md), [ADR-019](adrs/019-system-dialogs.md)
- **Brainstorm:** [2026-10-11 File Associations](brainstorm/2026-10-11_file-associations.md)
- **Status:** In progress
- [x] `associations` manifest field (extensions + MIME patterns)
- [x] `FILE_PROPS` (`{ path }`) + `FilesService.get_file(path)`
- [x] `AppsService.open(path, { anchor })` with specificity tiers (ties take the first app until the chooser exists)
- [ ] DialogsService + dialogs host
- [ ] "Open with" dropdown with "Always use" checkbox
- [ ] `file_defaults` in persisted settings
- [ ] File Explorer: double-click / Enter on files
- [x] Text Viewer app (`text/*` + common text extensions)
- [ ] Media Preview port (image, video, audio)

---

## P4 — Infrastructure & Polish

### Testing
- [ ] Testing setup (Vitest + @testing-library/svelte)
- [ ] Unit tests for core utilities and services
- [ ] Integration tests for app launching and file operations
- [ ] E2E tests (Playwright)

### Error Handling
- [ ] Error handling strategy
- [ ] Error boundaries for app crashes

### Performance
- [ ] Lazy loading for apps (dynamic imports — already in place via `component()`)
- [ ] Virtual scrolling for large lists (file explorer, game hub)
- [ ] Performance targets: <100ms interaction, <3s initial load

### PWA & Offline
- [ ] Service Worker (Workbox) for offline support
- [ ] Cache strategies (cache-first for assets, network-first for version check)
- [ ] Background sync for queued operations
- [ ] Install prompt customization

### Workers Service
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
- **Status:** Not started
- [ ] Platform detection utility (runtime-once, `kernel.platform`)
- [ ] Shell-level split (`os.svelte` → `<DesktopShell>` / `<MobileShell>`)
- [ ] Shared `IWindowsService` base interface
- [ ] `MobileWindowsService` (fullscreen-only, no drag/resize/snap)
- [ ] `MobileDesktopService` (paged home screen, dock, app search)
- [ ] Mobile shell components (fullscreen app container, app switcher, home screen)
- [ ] Navigation gestures (home, back, app switcher)
- [ ] Conditional service registration in `init.ts`
- [ ] Virtual keyboard handling
- [ ] Touch gesture support

### SEO & Social
- [ ] Open Graph meta tags (dynamic per route)
- [ ] Twitter card support
- [ ] Demo mode preview images

### CI/CD
- [ ] GitHub Actions build pipeline
- [ ] Automated testing on PR
- [ ] Automated deployment to GitHub Pages
- [ ] Version tagging

---

## Needs Brainstorm

Owner-requested topics. Each needs a design session (brainstorm log, then an ADR) before any code. Agents: don't implement these, grill the owner.

- [ ] **Multi-window sync.** Two explorers on the same folder should see each other's changes. Constraints from ADR-005: the path-keyed cache went stale on rename/move, and event-based invalidation is the recorded way back, likely via kernel events (see Unscheduled Ideas).
- [ ] **Testing strategy.** Decide what to test and where:
  - Pure `.ts` first (`opfs.ts`, parsers, helpers)
  - Reactive `.svelte.ts` handlers
  - Components
  - E2E

  Also the runner (Vitest is the P4 assumption), how to test OPFS outside a browser, and what CI runs. The P4 Testing items wait on this.
- [ ] **Release notifications.** After an update, users get a popup they can open to see what changed or was added. The same notes are viewable in Settings. Builds on ADR-004, which planned a hand-written `CHANGELOG.md` rendered in Settings (not built; the file doesn't exist yet) and an "update available" toast. Open questions:
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
