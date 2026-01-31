# WebOS Implementation Roadmap

Tracks what needs to be done, priority, and links to relevant ADRs/brainstorm sessions.

**Legend:** `[ ]` not started | `[-]` in progress | `[x]` done

---

## P0 — Core Infrastructure

### Files Service Overhaul
- **ADR:** [ADR-005](decisions/005-files-service.md)
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
- [x] Cross-instance sync (shared DirectoryHandler via SvelteMap cache)
- [ ] File explorer: file open callback (for media preview etc.)
- [ ] File explorer: context menus (delete, rename, copy, move)

### Service Lifecycle Hooks
- **ADR:** [ADR-002](decisions/002-service-lifecycle.md)
- **Status:** Not started
- [ ] `init()` / `destroy()` on services
- [ ] `get_state()` / `set_state()` for persistence/swap
- [ ] Kernel bootstrap sequence with lifecycle

### App Context System
- **ADR:** [ADR-003](decisions/003-app-context.md)
- **Status:** Not started
- [ ] `get_app_context()` / `set_app_context()` via Svelte context
- [ ] WindowHandle (window events for apps)
- [ ] StorageHandle (localStorage scoped to app)
- [ ] AppDataHandle (OPFS scoped to app)

---

## P1 — Essential UX

### Design System
- **ADR:** TBD
- **Status:** Not started (color scheme exists)
- [ ] Window chrome design
- [ ] Typography and spacing
- [ ] Button/input component styles
- [ ] Consistent theming approach

### Window Improvements
- [ ] Cascading window positioning (offset new windows)
- [ ] Taskbar clock / date-time display

### Session Persistence
- **Brainstorm:** [2026-01-24 Lifecycles & Persistence](brainstorm/2026-01-24_lifecycles-persistence.md)
- **Status:** Not started
- [ ] Save/restore open windows and positions
- [ ] Save timing strategy (beforeunload vs periodic)

### Notifications Service
- **ADR:** [ADR-006](decisions/006-notifications-service.md)
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** Not started
- [ ] NotificationsService (notify, update, dismiss, mark_read)
- [ ] Toast area UI (position configurable via SettingsService)
- [ ] Notification center panel (accessible from taskbar)
- [ ] Unread badge on taskbar icon
- [ ] Progress notification type (determinate/indeterminate)

### App Props Validation
- **ADR:** [ADR-008](decisions/008-app-props-validation.md)
- **Brainstorm:** [2026-01-31 App Props Validation](brainstorm/2026-01-31_app-props-validation.md)
- **Status:** Not started
- [ ] Install zod
- [ ] Add `props` schema field to AppManifest / AppConfig
- [ ] Update `defineApp` to infer TProps from schema
- [ ] Add validation in `AppsService.launch()`
- [ ] Update example app to use schema + handle undefined props

### Window API Expansion
- **Brainstorm:** [2026-01-31 Window API & Actions](brainstorm/2026-01-31_window-api-actions.md)
- **Status:** Not started
- [ ] Expanded WindowHandle (set_title, set_icon, request_attention, set_badge)
- [ ] Window overlays: file picker, confirm, prompt (promise-based)
- [ ] Window status bar (left/right text, progress indicator)

---

## P2 — Power Features

### Shell Service
- **ADR:** [ADR-007](decisions/007-shell-service.md)
- **Brainstorm:** [2026-01-31 Terminal & Shell Design](brainstorm/2026-01-31_terminal-shell-design.md)
- **Status:** Not started
- [ ] ShellService (command registry, parser, executor)
- [ ] Command definition interface (args, flags, completions)
- [ ] Progressive prefix parser (tokenize, resolve, validate, execute)
- [ ] Built-in commands (help, clear, echo, kernel)
- [ ] Service-registered commands (files, windows, apps, settings)

### Terminal App
- **ADR:** [ADR-007](decisions/007-shell-service.md)
- **Brainstorm:** [2026-01-31 Terminal & Shell Design](brainstorm/2026-01-31_terminal-shell-design.md)
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
- [ ] Global / app / window scoped shortcuts
- [ ] Default OS-like shortcuts (Alt+F4, etc.)

### Tasks Service
- [ ] Background task orchestration
- [ ] Progress tracking

---

## P3 — Apps

### Port from React
- [ ] Media Preview app (image, video, audio, PDF)
- [ ] Tic-Tac-Toe game

### New Apps
- [ ] Text Editor (tests file ops + persistence)
- [ ] Calculator

### File Associations (Future)
- [ ] `associations` field on app manifest (e.g., `[".png", ".jpg"]`)
- [ ] `open` command in AppsService (resolves file → associated app)
- [ ] Standard `file` prop for file-handling apps

---

## P4 — Infrastructure

- [ ] Testing setup (Vitest + @testing-library/svelte)
- [ ] Error handling strategy
- [ ] Workers Service (when concrete use case arises)

---

## Completed

- [x] Kernel + service registry
- [x] WindowsService (lifecycle, geometry, z-ordering, snapping)
- [x] AppsService (registry, launching, defineApp)
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
- [x] Code style decision: keeping snake_case ([brainstorm](brainstorm/2026-01-26_code-style-conventions.md))
- [x] Version update system design ([brainstorm](brainstorm/2026-01-27_version-update-system.md))
