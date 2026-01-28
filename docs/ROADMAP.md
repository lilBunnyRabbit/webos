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
- [x] `format_bytes()` utility
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
- **Status:** Not started
- [ ] Toast notifications
- [ ] Notification store
- [ ] Browser notification bridge (optional)

---

## P2 — Power Features

### Shortcuts Service
- [ ] Global / app / window scoped shortcuts
- [ ] Default OS-like shortcuts (Alt+F4, etc.)

### Shell Service / Command Palette
- [ ] Command registry with fuzzy search
- [ ] UI component (cmdk or custom)

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
