# Window API & Actions Brainstorming

**Date:** 2026-01-31
**Participants:** Developer, Claude

## Context

Discussing how apps interact with their host window — setting titles, opening dialogs/file pickers, and what other actions should be exposed via the window API.

### Prior Art
- **ADR-003** defines `WindowHandle` with `close()`, `minimize()`, `maximize()`, `restore()`, `setTitle()`, event subscriptions
- **API_SPECIFICATION.md** has `windows.update(id, { title })` at service level
- **cursor_discussing_api_naming_convention.md** proposed `System.showFilePicker()`, `showAlert()`, `showConfirm()`, `showPrompt()`
- **cursor_considering_alternatives_to_reac.md** raised pain point of window-scoped interactions like file picker overlays

## Topics

### 1. Window Title Management

**Open questions:**
- `setTitle()` on WindowHandle vs `windows.update()` vs both?
- How should the titlebar reactively display it?

### 2. Window Dialog/Overlay System

**Open questions:**
- How should apps request file pickers, confirmations, prompts?
- Window-scoped overlays vs system-level dialogs?
- Communication pattern: how does the result get back to the app?

### 3. Other Window Actions to Expose

**Open questions:**
- What additional actions beyond close/minimize/maximize/restore/setTitle?
- e.g., `requestAttention()`, `setIcon()`, `setBadge()`, custom titlebar actions, progress indicators?

## Discussion

### Scope Split: Window API vs System API

**Window API** = scoped to a single window instance (accessed via window context)
**System API** = exists outside any window (accessed via kernel/service)

### Window API Ideas

**Title & Identity:**
- `setTitle(title)` — update window title
- `setIcon(icon)` — override app icon per-window

**Overlays (full window, promise-based):**
- File picker — returns selected file(s)
- Confirmation dialog — returns boolean
- Prompt dialog — returns string | null
- Custom overlay — app provides Svelte component (escape hatch)

**Status Bar (bottom of window, app-managed):**
- Left/right info text slots (e.g., "Line 42, Col 12" / "UTF-8")
- Progress indicator (determinate/indeterminate)

**Titlebar Actions (simpler than full menubar):**
- Array of `{ icon, label, onClick }` rendered next to window controls
- Like VS Code editor actions — keeps things simple
- Full menubar (Files > Open) deferred as future opt-in

**Taskbar Integration:**
- `requestAttention()` — flash/pulse taskbar entry
- `setProgress(value | null)` — progress on taskbar entry (like Windows)
- `setBadge(count | null)` — unread count badge

### System API Ideas

**Notification Center:**
- `notify({ title, message, icon?, type, actions? })` → returns notification ID
- `updateNotification(id, { title?, message?, progress? })` — in-place updates
- `dismissNotification(id)` — programmatic dismiss
- Types: `info`, `warning`, `error`, `progress`
- Toast appears briefly → persists in notification center
- Clicking notification focuses originating app/window
- Actions: clickable buttons ("Open File", "Retry")

**Other System APIs:**
- `clipboard.write(data)` / `clipboard.read()` — abstracts browser clipboard
- `launch(appId, params?)` — open another app with params
- System-level dialogs (not window-scoped)

**Deferred:**
- Global keyboard shortcuts
- Theming API
- IPC (Svelte stores/context handle this)

### Boundary Decision
- File picker is visually a window overlay but talks to FilesService → belongs in **Window API**
- Notifications exist outside any window → **System API**

### Decisions So Far

**Window API — Kept:**
- set_title, set_icon
- Overlays: file picker, confirm, prompt (no custom overlay)
- Status bar: left/right text, progress (app opts in by using it, no manifest flag)
- request_attention(), set_badge()

**Window API — Dropped/Deferred:**
- Custom overlay (too complex)
- Toolbar/menubar (deferred)
- set_progress() on taskbar (meh)

**System API — Kept:**
- NotificationsService (notify, update_notification, dismiss_notification)

**System API — Dropped:**
- Clipboard (no need)
- Launch app (already exists)
- System dialogs (no clear use cases)

### Architecture: Service vs Context

**NotificationsService → Kernel service**
- Lives outside windows, own state, persists across window lifecycles
- Multiple apps interact with it
- Fits service pattern

**Window API → Expanded WindowHandle in get_app_context()**
- Per-window scoped, not global
- Part of existing app context: `ctx.window.set_title()`, `ctx.window.pick_file()`, etc.
- Status bar: app opts in by setting values, window renders if content exists
- File picker overlay: built-in component rendered by window when `pick_file()` called, promise resolves on pick/cancel

**No new services needed for window-scoped features.**

### Usage Example

```typescript
const ctx = get_app_context();

// Title & identity
ctx.window.set_title("README.txt - Text Editor");
ctx.window.set_icon(SomeIcon);

// Overlays (promise-based)
const file = await ctx.window.pick_file({ multiple: false });
const confirmed = await ctx.window.confirm("Delete this file?");
const name = await ctx.window.prompt("Enter file name:");

// Status bar
ctx.window.status_bar.left = "Line 42, Col 12";
ctx.window.status_bar.right = "UTF-8";
ctx.window.status_bar.progress = 0.75;

// Taskbar
ctx.window.request_attention();
ctx.window.set_badge(3);

// System notifications
const notifications = kernel.service<NotificationsService>("notifications");
const id = notifications.notify({ title: "Export complete", type: "info" });
notifications.update_notification(id, { message: "Saved to /documents" });
```

### Final Architecture

- **WindowHandle** (expanded) — defined separately, accessed via `get_app_context().window`
- **NotificationsService** — new kernel service (`"notifications"`)
- File picker = window overlay convenience wrapping FilesService

### ADR Updates
- **ADR-003** updated — expanded WindowHandle with overlays, status bar, taskbar, identity
- **ADR-006** created — NotificationsService

## Key Takeaways

1. Window API lives on `WindowHandle` within app context, defined as its own interface
2. Overlays (file picker, confirm, prompt) are promise-based, rendered by the window component
3. Status bar is opt-in — app sets values, window renders if content exists
4. NotificationsService is a kernel service with updatable notifications and a notification center
5. Dropped: custom overlay, toolbar, set_progress on taskbar, clipboard API, system dialogs

## Action Items

- [ ] Implement expanded WindowHandle (set_title, set_icon, status_bar, request_attention, set_badge)
- [ ] Implement window overlay system (pick_file, confirm, prompt)
- [ ] Implement NotificationsService
- [ ] Add notification center UI to taskbar
- [ ] Update ROADMAP.md with these items
