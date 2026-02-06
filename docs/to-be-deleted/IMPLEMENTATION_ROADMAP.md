# WebOS Implementation Roadmap

Actionable implementation plan for the WebOS API architecture.

## Overview

This roadmap breaks down the implementation into phases, with specific tasks, dependencies, and estimated effort.

**Total Estimated Time:** 8-10 weeks  
**Team Size:** 1-2 developers

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Kernel Implementation

**File:** `src/lib/core/kernel/kernel.svelte.ts`

- [ ] Service registry with Map-based storage
- [ ] Service initialization with dependency resolution
- [ ] Service lifecycle hooks (init, shutdown)
- [ ] Event bus implementation
- [ ] Basic error handling

**File:** `src/lib/core/kernel/capabilities.ts`

- [ ] Capability type definitions
- [ ] Capability parsing/matching logic
- [ ] Grant/revoke/check methods
- [ ] Wildcard pattern matching (e.g., `fs:read:/documents/**`)
- [ ] Capability assertion with helpful errors

**File:** `src/lib/core/kernel/lifecycle.ts`

- [ ] System boot sequence
- [ ] Service dependency ordering
- [ ] Graceful shutdown
- [ ] Error recovery

**Estimated Effort:** 3-4 days

**Tests:**
```typescript
✓ Service registration and retrieval
✓ Capability granting and checking
✓ Capability pattern matching
✓ Event bus publish/subscribe
✓ Dependency resolution
```

---

### 1.2 Type System

**File:** `src/lib/core/types/kernel.types.ts`

- [ ] Kernel interfaces
- [ ] Service descriptor types
- [ ] Capability type definitions
- [ ] Event types

**File:** `src/lib/core/types/services.types.ts`

- [ ] All service interface definitions
- [ ] Shared types (WindowId, AppId, etc.)
- [ ] Option types for all service methods

**File:** `src/lib/core/types/app.types.ts`

- [ ] AppManifest interface
- [ ] AppInstance interface
- [ ] App lifecycle types

**File:** `src/lib/core/types/index.ts`

- [ ] Central export file for all types

**Estimated Effort:** 2 days

---

### 1.3 Windows Service Migration

**Goal:** Migrate existing window manager to new service architecture

**File:** `src/lib/core/services/windows.svelte.ts`

- [ ] Extract from `src/lib/core/stores/window-manager/`
- [ ] Implement WindowsService interface
- [ ] Add capability checks to all methods
- [ ] Add subscription support
- [ ] Migrate window metadata structure
- [ ] Keep existing geometry handler

**Changes from Current:**
- Wrap in service descriptor
- Add capability enforcement
- Standardize method names
- Add subscription methods

**Estimated Effort:** 3-4 days

**Migration Checklist:**
```typescript
// OLD
import { WM } from '@/core/stores';
WM.windows.create('content');
WM.windows.focus(id);

// NEW
import { kernel } from '@/core/kernel';
const windows = kernel.service<WindowsService>('windows');
windows.open({ appId: 'test', props: { content: 'content' } });
windows.focus(id);
```

---

### 1.4 Window Context

**File:** `src/lib/core/contexts/window-context.svelte.ts`

- [ ] WindowContext interface
- [ ] setWindowContext function
- [ ] useWindow hook
- [ ] Per-window state (if needed)

**File:** `src/lib/core/components/window/window.svelte`

- [ ] Update to set window context
- [ ] Provide window-scoped operations

**Estimated Effort:** 1-2 days

---

## Phase 2: Apps & Storage (Week 3-4)

### 2.1 Apps Service

**File:** `src/lib/core/services/apps.svelte.ts`

- [ ] App registry (Map<AppId, AppManifest>)
- [ ] App instance tracking
- [ ] Launch logic (creates window + mounts component)
- [ ] File type associations
- [ ] URL scheme associations
- [ ] Single-instance enforcement
- [ ] Category filtering

**Estimated Effort:** 4-5 days

**Key Methods:**
```typescript
- register(manifest) → void
- unregister(appId) → void
- launch({ appId, props, window }) → WindowId | null
- get(appId) → AppManifest | undefined
- list() → AppManifest[]
- forFileType(type) → AppManifest[]
- setDefaultForFileType(type, appId) → void
```

---

### 2.2 Files Service (OPFS Integration)

**File:** `src/lib/core/services/files.svelte.ts`

- [ ] OPFS adapter
- [ ] Path normalization utilities
- [ ] Read/write operations
- [ ] Directory operations (mkdir, list, delete)
- [ ] File metadata (stat)
- [ ] Copy/move operations
- [ ] Watch implementation (polling-based initially)
- [ ] Quota checking
- [ ] Upload/download bridges

**Dependencies:**
- May need `idb` for metadata storage
- Consider `@zenfs/core` for better FS abstraction

**Estimated Effort:** 5-6 days

**Key Challenges:**
- OPFS API is async and verbose
- Watch implementation (no native OPFS watch)
- Efficient directory listing

---

### 2.3 Settings Service

**File:** `src/lib/core/services/settings.svelte.ts`

- [ ] Schema registry
- [ ] localStorage persistence
- [ ] Namespace support (`namespace.key` parsing)
- [ ] Validation on set
- [ ] Default values
- [ ] Reactive subscriptions
- [ ] Import/export functionality
- [ ] Migration to OPFS (optional)

**Estimated Effort:** 3 days

---

## Phase 3: Background Execution (Week 5-6)

### 3.1 Tasks Service

**File:** `src/lib/core/services/tasks.svelte.ts`

- [ ] Integrate `@lilbunnyrabbit/task-manager`
- [ ] Wrap task manager API
- [ ] Add capability checks
- [ ] UI integration (taskbar badges)
- [ ] Notification on completion
- [ ] Task persistence (optional)
- [ ] Task groups (sequence/parallel)

**Dependencies:**
```bash
npm install @lilbunnyrabbit/task-manager
```

**Estimated Effort:** 3-4 days

---

### 3.2 Workers Service

**File:** `src/lib/core/services/workers.svelte.ts`

- [ ] Worker pool management
- [ ] Task queue implementation
- [ ] Task serialization (function → string)
- [ ] Result deserialization
- [ ] Cancellation support
- [ ] Pool size configuration
- [ ] Worker lifecycle (spawn/terminate)
- [ ] Statistics tracking

**Key Challenge:** Function serialization

**Solution:** Use `Function.toString()` and `eval` in worker, or Comlink

**Estimated Effort:** 4-5 days

**Consider:** Use `comlink` library for easier worker communication

---

## Phase 4: User Experience (Week 7-8)

### 4.1 Notifications Service

**File:** `src/lib/core/services/notifications.svelte.ts`

- [ ] In-memory notification store
- [ ] Toast queue management
- [ ] Toast timeout handling
- [ ] System notification bridge
- [ ] Permission request
- [ ] Badge counting
- [ ] Notification history
- [ ] Mark read/unread
- [ ] Clear operations

**File:** `src/lib/core/components/notification-center/`

- [ ] Toast component
- [ ] Notification center UI
- [ ] Action button handling
- [ ] Notification item component

**Estimated Effort:** 4-5 days

---

### 4.2 Shell Service & Command Palette

**File:** `src/lib/core/services/shell.svelte.ts`

- [ ] Command registry
- [ ] Fuzzy search implementation
- [ ] Command execution
- [ ] Command categories
- [ ] Keyword matching
- [ ] Recently used tracking

**File:** `src/lib/core/components/command-palette/`

- [ ] Command palette UI
- [ ] Use `cmdk` library
- [ ] Keyboard navigation
- [ ] Command list rendering
- [ ] Search highlighting

**Dependencies:**
```bash
npm install cmdk
```

**Estimated Effort:** 4 days

---

### 4.3 Router Service

**File:** `src/lib/core/services/router.svelte.ts`

- [ ] Route registry
- [ ] Pattern matching (e.g., `app://<appId>/:path`)
- [ ] Navigation handling
- [ ] History management
- [ ] State serialization
- [ ] State restoration
- [ ] Share URL generation
- [ ] URL parsing utilities

**Dependencies:**
- Consider `regexparam` for pattern matching
- Consider `lz-string` for state compression

**Estimated Effort:** 3-4 days

---

### 4.4 Shortcuts Service

**File:** `src/lib/core/services/shortcuts.svelte.ts`

- [ ] Shortcut registry
- [ ] Key combo parsing (`Ctrl+S` → normalized format)
- [ ] Scope management (global/app/window)
- [ ] Conflict detection
- [ ] Key event listener
- [ ] Shortcut execution
- [ ] Enable/disable shortcuts
- [ ] Rebinding support

**File:** `src/lib/core/components/shortcuts-cheatsheet/`

- [ ] Cheat sheet UI
- [ ] Shortcut customization UI

**Dependencies:**
- Consider `tinykeys` for key handling

**Estimated Effort:** 3-4 days

---

### 4.5 IPC Service

**File:** `src/lib/core/services/ipc.svelte.ts`

- [ ] Channel registry (Map<Channel, Set<Handler>>)
- [ ] Publish implementation
- [ ] Subscribe implementation
- [ ] Unsubscribe implementation
- [ ] Pattern matching for channels
- [ ] Message history (optional)
- [ ] Channel scoping

**Estimated Effort:** 2-3 days

**Simple Implementation:**
```typescript
const subscribers = new Map<Channel, Set<MessageHandler>>();

function publish(channel: Channel, payload: any) {
  const handlers = subscribers.get(channel) ?? new Set();
  for (const handler of handlers) {
    handler({ channel, payload, sender: currentAppId, timestamp: new Date() });
  }
}

function subscribe(channel: Channel, handler: MessageHandler) {
  if (!subscribers.has(channel)) {
    subscribers.set(channel, new Set());
  }
  subscribers.get(channel)!.add(handler);
  return () => subscribers.get(channel)?.delete(handler);
}
```

---

## Phase 5: Integration & Polish (Week 9-10)

### 5.1 Bootstrap System

**File:** `src/main.ts`

- [ ] Kernel initialization
- [ ] Service registration in correct order
- [ ] Built-in app registration
- [ ] Default capability grants
- [ ] Error boundary setup

**Estimated Effort:** 1-2 days

---

### 5.2 Example Apps

Create 2-3 example apps to demonstrate the API:

**App 1: Text Editor**
- [ ] Manifest
- [ ] Component implementation
- [ ] File operations
- [ ] Settings integration
- [ ] Shortcuts
- [ ] Save/load functionality

**App 2: File Explorer**
- [ ] Manifest
- [ ] Directory listing
- [ ] File preview
- [ ] Context menu
- [ ] File operations (copy/move/delete)

**App 3: Task Manager**
- [ ] Manifest
- [ ] Task list UI
- [ ] Task progress display
- [ ] Task control (cancel/pause/resume)

**Estimated Effort:** 4-5 days

---

### 5.3 System Apps

**Taskbar**
- [ ] Update to use windows service
- [ ] Show running apps
- [ ] Badge counts
- [ ] Click to focus/restore

**Settings App**
- [ ] Create settings UI
- [ ] System settings
- [ ] App settings
- [ ] Keyboard shortcuts
- [ ] Theme settings
- [ ] Import/export settings

**About Dialog**
- [ ] Version info
- [ ] Keyboard shortcuts cheat sheet
- [ ] Credits

**Estimated Effort:** 3-4 days

---

### 5.4 Documentation

- [ ] Code comments for all services
- [ ] JSDoc for all public APIs
- [ ] Example app documentation
- [ ] Migration guide from old API
- [ ] Video/GIF demos

**Estimated Effort:** 2-3 days

---

### 5.5 Testing

**Unit Tests:**
- [ ] Kernel tests
- [ ] Each service (isolated)
- [ ] Capability system
- [ ] Type safety tests

**Integration Tests:**
- [ ] Kernel + services
- [ ] App lifecycle
- [ ] Window management flow
- [ ] File operations

**E2E Tests:**
- [ ] App launching
- [ ] Window interactions
- [ ] File picker
- [ ] Notifications

**Estimated Effort:** 4-5 days

---

## Dependencies Summary

### Required Packages

```bash
# Task management
npm install @lilbunnyrabbit/task-manager

# Command palette
npm install cmdk

# Key handling (optional, can implement custom)
npm install tinykeys

# Worker communication (optional)
npm install comlink

# Route pattern matching (optional)
npm install regexparam

# State compression (optional)
npm install lz-string
```

### Development Dependencies

```bash
# Testing
npm install -D vitest @testing-library/svelte

# Type checking
npm install -D typescript @tsconfig/svelte
```

---

## Risk Mitigation

### High-Risk Items

1. **OPFS Performance**
   - **Risk:** OPFS might be slow for many small files
   - **Mitigation:** Benchmark early, consider IndexedDB fallback

2. **Worker Serialization**
   - **Risk:** Function serialization is complex
   - **Mitigation:** Use Comlink library, document limitations

3. **State Serialization**
   - **Risk:** Large workspaces might exceed URL length
   - **Mitigation:** Use compression, consider server-side storage

4. **Migration from Existing Code**
   - **Risk:** Breaking changes might be extensive
   - **Mitigation:** Incremental migration, maintain compatibility layer

---

## Success Criteria

### Phase 1 (Foundation)
- ✅ Kernel can register and retrieve services
- ✅ Capabilities can be granted and checked
- ✅ Windows service works with existing UI
- ✅ All types compile without errors

### Phase 2 (Apps & Storage)
- ✅ Can register and launch apps
- ✅ Can read/write files to OPFS
- ✅ Settings persist across sessions
- ✅ Multiple windows per app work

### Phase 3 (Background Execution)
- ✅ Tasks run in background with progress
- ✅ Workers handle CPU-intensive operations
- ✅ Task completion triggers notifications

### Phase 4 (User Experience)
- ✅ Command palette is functional and fast
- ✅ Keyboard shortcuts work globally and per-app
- ✅ Notifications appear and are dismissible
- ✅ Deep links restore window state

### Phase 5 (Integration & Polish)
- ✅ Example apps demonstrate all APIs
- ✅ System is stable with no memory leaks
- ✅ Documentation is complete
- ✅ Test coverage >80%

---

## Next Steps

### Immediate Actions (Week 1, Day 1)

1. **Create Directory Structure**
```bash
mkdir -p src/lib/core/{kernel,services,types,contexts}
```

2. **Stub All Type Files**
```bash
touch src/lib/core/types/{kernel,services,app}.types.ts
touch src/lib/core/types/index.ts
```

3. **Create Kernel Stub**
```bash
touch src/lib/core/kernel/{kernel,capabilities,lifecycle}.svelte.ts
```

4. **Create Service Stubs**
```bash
touch src/lib/core/services/{windows,apps,files,tasks,notifications,settings,router,shortcuts,ipc,workers,shell}.svelte.ts
```

5. **Start with Kernel Implementation**
   - Begin with service registry
   - Add basic capability system
   - Create kernel tests

---

## Weekly Milestones

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1 | Kernel + Windows | Kernel functional, windows migrated |
| 2 | Window Context | Per-window context working |
| 3 | Apps Service | Can register and launch apps |
| 4 | Files Service | File operations work with OPFS |
| 5 | Tasks Service | Background tasks with progress |
| 6 | Workers Service | CPU offloading works |
| 7 | Notifications | Notification center functional |
| 8 | Shell + Router | Command palette and deep links |
| 9 | Integration | Example apps complete |
| 10 | Polish & Testing | Documentation and tests complete |

---

## Alternative: Incremental Approach

If full rewrite is too risky, consider incremental migration:

### Phase 0: Compatibility Layer

Create adapters that wrap existing code with new API:

```typescript
// Adapter: old API → new API
const windows = {
  open: (options) => WM.windows.create(options.content),
  close: (id) => WM.windows.destroy(id),
  // ... etc
};

kernel.register('windows', { instance: windows });
```

This allows:
- New code uses new API
- Old code continues working
- Gradual migration
- Easier rollback

---

## Resources

- [API Specification](./API_SPECIFICATION.md)
- [Quick Reference](./API_QUICK_REFERENCE.md)
- [Design Decisions](./API_DESIGN_DECISIONS.md)
- [Svelte 5 Runes Docs](https://svelte-5-preview.vercel.app/)
- [OPFS API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)

---

_Last Updated: October 27, 2025_


