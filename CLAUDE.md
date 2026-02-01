# WebOS - Svelte 5 Web Operating System

A browser-based desktop environment migrating from React to Svelte 5. Provides a platform for mini-features as standalone applications.

## Quick Start
```bash
bun install
bun dev
```

## Architecture

### Microkernel Pattern
Central kernel manages service registry with dependency injection. Services are independent, domain-specific stores using Svelte 5 runes.

### Service Layer
| Service | Purpose | Dependencies |
|---------|---------|--------------|
| SettingsService | Theme, taskbar position | none |
| WindowsService | Window lifecycle, geometry, z-ordering, snapping | none |
| FilesService | File system access (OPFS - sandboxed) | none |
| AppsService | App registry, launching | WindowsService |
| DesktopService | Desktop grid layout | AppsService |

### Planned Services (add when needed)
- Shortcuts Service - Keyboard shortcuts with scopes
- Notifications Service - Toasts + browser notifications
- Tasks Service - Background task orchestration
- Shell Service - Command palette with fuzzy search
- Workers Service - Web Worker pool management

**Note:** Router is an app-level pattern, not a system service. IPC may not be needed (Svelte stores/context handle inter-component communication).

### State Management
- `$state` - Reactive state declarations
- `$derived` - Computed values
- `$effect` - Side effects
- `SvelteMap`/`SvelteSet` - Reactive collections
- `Flags<T>` - Set-based flag management (`/src/lib/core/utils/flags.ts`)
- `Order<T>` - Z-index ordering (`/src/lib/core/utils/order.ts`)

## Adding New Apps

1. Create app folder in `/src/lib/apps/user/`
2. Create `index.ts` manifest using `defineApp()`
3. Create `.app.svelte` component
4. App is auto-discovered (no registration needed)

Example manifest:
```typescript
import { defineApp } from "$lib/core/api";
import { CalculatorIcon } from "@lucide/svelte";

export default defineApp({
  id: "calculator",
  name: "Calculator",
  icon: CalculatorIcon,
  version: "1.0.0",
  defaults: {
    constraints: { width: { min: 300 } }
  },
  component: () => import("./calculator.app.svelte"),
});
```

## Key Directories

### Core (`/src/lib/core/`)
- `api/kernel/` - Kernel and service registry
- `api/services/` - 5 service implementations
- `components/` - Window, Desktop, Taskbar components
- `utils/` - Flags, Order, cn(), type utilities

### Apps (`/src/lib/apps/`)
- `system/` - Kernel, Settings, File Explorer
- `user/` - Example app

### Documentation (`/docs/`)
- `DOCUMENTATION_SUMMARY.md` - Overview of all docs
- `API_*.md` - Service specifications (latest planning)
- `cursor_*.md` - Design decisions and rationale

### React Reference (`/_old/`)
Original implementation with more features to port:
- Media Preview app (images, video, audio, PDF)
- Tic-Tac-Toe game
- Profiler app
- Version management & update checking
- Cascading window positioning
- Date/time display on taskbar

## Window System

### Window Flags
- `MINIMIZED` - Window hidden in taskbar
- `MAXIMIZED` - Window fills container
- `DEBUG` - Shows bounds overlay

### Snap Zones
8 zones: top, bottom, left, right, top-left, top-right, bottom-left, bottom-right

### Key Files
- `window.svelte` - Main window container
- `window.handler.svelte.ts` - Drag/resize logic with snap detection
- `window-titlebar.svelte` - Title bar with controls
- `window-content.svelte` - Content area with zoom support

## Capabilities (Planned)

Format: `domain:action:scope`
Examples:
- `fs:read:/documents/**` - Read files in documents
- `windows:open` - Open new windows
- `notify:toast` - Show toast notifications

## Code Style

- **snake_case** for variables, functions, properties, and file names
- **PascalCase** for types, interfaces, classes, and components

## Key Patterns

### Service Access
```typescript
const windows = $derived(kernel.service<WindowsService>("windows"));
const instance = $derived(windows.get(id)!);
```

### Attachment Pattern (Svelte 5)
```svelte
{@attach geometry_handler.drag_attachment()}
{@attach geometry_handler.resize_attachment(edge)}
```

### App Component Props
```typescript
let { id }: { id: WindowId } = $props();
let { zoom = $bindable(), windowId }: Props = $props();
```

## Brainstorming Sessions

All architecture discussions and design decisions are logged in `/docs/brainstorm/`.

### Logging Instructions (for Claude)

**IMPORTANT:** Always update logs during brainstorming sessions, not just at the end.

When having design/architecture discussions:

1. **Create a log file** at `/docs/brainstorm/{YYYY-MM-DD}_{topic}.md`
2. **Update continuously** - Add new insights, decisions, and direction changes as they happen
3. **Include these sections:**
   - Date and participants
   - Context (what prompted the discussion)
   - Topics discussed (with decisions/conclusions)
   - Key takeaways
   - Action items
   - Next session topics (if applicable)

4. **Naming convention:** Use lowercase, hyphens for spaces
   - `2026-01-24_architecture-review.md`
   - `2026-01-25_opfs-implementation.md`
   - `2026-01-26_mobile-service-variants.md`

5. **Reference previous sessions** when relevant to maintain continuity
6. **Multiple topics same day** - Create separate files per major topic

### Current Sessions
- `2026-01-24_architecture-review.md` - Kernel pattern, service count, app store discussion
- `2026-01-24_app-architecture.md` - App definition, metadata structure, glob loading
- `2026-01-24_architecture-gaps-review.md` - Comprehensive gap analysis
- `2026-01-24_lifecycles-persistence.md` - Service/app lifecycles, persistence patterns

## Key Architectural Decisions

From brainstorming sessions:

1. **Kernel pattern** - Kept for service implementation swapping (mobile/desktop variants)
2. **OPFS for files** - Sandboxed virtual filesystem, no permission prompts
3. **5 core services** - Windows, Apps, Desktop, Settings, Files (others added as needed)
4. **In-app routing** - App-level pattern, not a system service
5. **Capabilities** - Deferred until plugin/app store ecosystem exists

## Architecture Decision Records (ADR)

When a decision is finalized but not immediately implemented, create an ADR in `/docs/decisions/`.

### When to Create ADR
- Significant structural decisions
- API design choices
- Patterns to be used throughout codebase

### Format
```markdown
# ADR-{number}: {Title}
**Date:** YYYY-MM-DD
**Status:** Accepted | Superseded | Deprecated

## Context
## Decision
## Alternatives Considered
## Consequences
```

### Current ADRs
- `001-app-manifest-structure.md` - Flat structure with nested `defaults`
- `002-service-lifecycle.md` - `init`, `destroy`, `getState`, `setState` hooks
- `003-app-context.md` - AppContext via Svelte context, WindowHandle, StorageHandle, AppDataHandle
- `004-version-update-system.md` - Build-generated version.json with polling
- `005-files-service.md` - Files service API redesign (pure functions + thin service)
- `006-notifications-service.md` - Toast notifications with types, updatable, notification center
- `007-shell-service.md` - Shell Service (command registry + parser) & Terminal App
- `008-app-props-validation.md` - App props validation with zod (all-or-nothing)
- `009-app-ecosystem.md` - Full app catalogue (games, productivity, media, utilities)
- `010-url-deep-linking.md` - Hash-based routing, app links, workspace sharing, embed mode
- `011-desktop-enhancements.md` - Multi-selection, wallpapers, context menus, icon settings
- `012-shortcuts-service.md` - Global/app/window scoped shortcuts, conflict detection, cheat sheet
- `013-tasks-service.md` - @lilbunnyrabbit/task-manager integration, Task Manager app
- `014-window-enhancements.md` - Single-instance, animations, grouping, session persistence
- `015-customization-theming.md` - Theme system, export/import, taskbar/icon customization
- `016-mobile-support.md` - Shell-level split, service swapping, runtime-once detection

## Implementation Roadmap

**`/docs/ROADMAP.md`** tracks all planned work with priorities, completion status, and links to ADRs/brainstorm sessions.

**IMPORTANT (for Claude):** At the end of every session that completes work items, update `ROADMAP.md` to reflect current status. Mark items `[x]` when done, `[-]` when partially done. This is the single source of truth for project progress.

## Related Docs
- `/docs/ROADMAP.md` - **Prioritized implementation plan with progress tracking**
- `/docs/DOCUMENTATION_SUMMARY.md` - All documentation overview
- `/docs/API_*.md` - Service specifications (aspirational)
- `/docs/cursor_*.md` - Historical design rationale
- `/docs/brainstorm/` - Ongoing design discussions
- `/docs/decisions/` - Finalized architectural decisions (ADRs)
