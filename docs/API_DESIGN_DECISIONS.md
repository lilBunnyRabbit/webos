# WebOS API Design Decisions

_Rationale behind architectural and naming choices_

## Overview

This document explains the key design decisions made in the WebOS API specification, synthesizing ideas from:
- Previous cursor conversation about API naming conventions
- Microkernel architecture proposal from external LLM consultation
- Current implementation patterns in the codebase
- Svelte 5 runes best practices

---

## 1. Microkernel Architecture

### Decision: Thin Kernel + Rich Services

**Rationale:**
- **Separation of Concerns**: Kernel handles only registration, discovery, and policy (capabilities)
- **Service Isolation**: Each service manages its own domain with clear boundaries
- **Flexibility**: Services can be added, removed, or replaced without kernel changes
- **Testing**: Services can be tested independently
- **Performance**: Fine-grained reactivity at service level

**Alternatives Considered:**
1. **Monolithic Manager**: Single large manager for everything
   - ❌ Hard to maintain
   - ❌ Tight coupling
   - ❌ Difficult to test

2. **No Kernel**: Direct service imports
   - ❌ No capability enforcement
   - ❌ No lifecycle management
   - ❌ Harder to mock for testing

**Example:**
```typescript
// Good: Service accessed via kernel
const windows = kernel.service<WindowsService>('windows');
kernel.assert(appId, 'windows:open');
windows.open({ appId: 'text-editor' });

// Bad: Direct import (no capability checks)
import { windows } from './services/windows';
windows.open({ appId: 'text-editor' }); // No security
```

---

## 2. Capability-Based Security

### Decision: Explicit Capability Grants

**Rationale:**
- **Principle of Least Privilege**: Apps only get what they request
- **User Transparency**: Users can see what apps can do
- **Security**: Prevents malicious or buggy apps from accessing sensitive data
- **Flexibility**: Fine-grained control (e.g., `fs:read:/documents/**`)

**Capability Format:**
```
domain:action:scope
```

Examples:
- `fs:read:/documents/**` - Can read files in /documents
- `windows:manage:self` - Can manage own windows only
- `notify:toast` - Can show in-OS toasts

**Alternatives Considered:**
1. **No Security Model**: Trust all apps
   - ❌ Dangerous for user data
   - ❌ No isolation between apps

2. **Role-Based**: Apps have roles (admin, user, guest)
   - ❌ Too coarse-grained
   - ❌ Harder to audit

3. **Ask on First Use**: Prompt for permission each time
   - ❌ Poor UX (too many prompts)
   - ✅ Good for sensitive operations (file picker)

**Design Choice**: Hybrid approach - capabilities declared in manifest, sensitive operations trigger user prompts.

---

## 3. Service Naming

### Decision: Domain-Based Service Names

**Services:**
- `windows` - Window management
- `apps` - App registry & launching
- `files` - File system operations
- `tasks` - Background task orchestration
- `notifications` - Notification center
- `settings` - System & app settings
- `router` - URL routing & deep links
- `shortcuts` - Keyboard shortcuts
- `ipc` - Inter-process communication
- `workers` - Web Worker pool
- `shell` - Command palette & shell

**Rationale:**
- **Clear Domain**: Name directly reflects what the service does
- **Singular vs Plural**: Use plural for collections (`windows`, `apps`)
- **Consistency**: All lowercase, no abbreviations
- **Discoverability**: Easy to guess and autocomplete

**Alternatives from Cursor Conversation:**

| Cursor Suggestion | Final Choice | Reason |
|-------------------|--------------|--------|
| `WindowManager` | `windows` | More concise, fits Svelte store pattern |
| `WindowAPI` | `windows` | "API" is redundant (all services are APIs) |
| `System` | `notifications` + `shell` | "System" too vague; split into focused services |
| `AppManager` | `apps` | Shorter, consistent with `windows` |
| `FileSystem` or `FS` | `files` | "files" more intuitive than "filesystem" |
| `VersionManager` | (not included) | Version checking moved to system-level concern |

---

## 4. Separation: Windows vs Apps

### Decision: Two Distinct Services

**Rationale:**
- **Windows Service**: Low-level window lifecycle, geometry, z-ordering, visual state
- **Apps Service**: High-level app registry, launching, file associations, capabilities

**Why Separate?**
1. **Different Concerns**: Window management ≠ app management
2. **Multiple Windows per App**: One app can have many windows
3. **Service Dependencies**: Apps service depends on windows service
4. **Clear API**: `apps.launch()` is user-facing, `windows.open()` is internal

**Flow:**
```
User clicks app icon
  → apps.launch({ appId: 'text-editor' })
    → kernel checks capabilities
    → windows.open({ appId: 'text-editor', ... })
      → Window created, component mounted
```

**Alternatives Considered:**
1. **Combined Service**: Single `windows` service handles apps too
   - ❌ Violates single responsibility
   - ❌ Confusing API (`windows.launchApp()`?)

2. **Apps Only**: Apps service handles windows internally
   - ❌ Can't manipulate windows directly
   - ❌ Tight coupling

---

## 5. Window State Management

### Decision: Per-Window Context + Global Service

**Architecture:**
```
Global WindowsService (service registry)
  └─ Manages all windows, z-ordering, focus
  
Per-Window Context (Svelte context)
  └─ Window-specific operations (close, minimize, etc.)
  └─ App-specific state
```

**Rationale:**

**Global Service:**
- Cross-window operations (list all, focus, z-order)
- Window creation/destruction
- Snap zones, maximize state
- Observable by taskbar, window switcher

**Per-Window Context:**
- Accessed via `useWindow()` in app components
- No need to pass window ID around
- Isolated reactivity (changing one window doesn't re-render others)
- App-specific state (zoom level, selection, etc.)

**Performance Consideration** (from Cursor conversation):
> "For performance reasons, size and position should be stored per-window"

**Decision**: Store `bounds` (size + position) in global service, but use per-window context for app-specific UI state.

**Why?**
- Global service needs bounds for:
  - Snap calculations
  - Window stacking
  - Boundary constraints
- Per-window context has app state:
  - Zoom level
  - Scroll position
  - Selected items

```typescript
// Global service (shared)
interface WindowMetadata {
  id: WindowId;
  bounds: Bounds;  // ← Global (needed for layout)
  state: WindowState;
  zIndex: number;
}

// Per-window context (isolated)
interface WindowContext {
  id: WindowId;
  appState: {
    zoom: number;      // ← Per-window (app-specific)
    selection: Set<string>;
  }
}
```

---

## 6. Task Service vs Tasks API

### Decision: Integrate @lilbunnyrabbit/task-manager as Service

**Rationale:**
- **Existing Package**: Already battle-tested task orchestration
- **Progress Tracking**: Built-in progress reporting
- **Task Groups**: Sequential/parallel execution
- **Retry Logic**: Automatic retry with backoff
- **Observable**: Reactive task updates

**Service Layer Adds:**
1. **Capability Enforcement**: `tasks:create` permission required
2. **UI Integration**: Automatic taskbar badges, notifications
3. **System Integration**: Task lifecycle tied to app lifecycle
4. **Persistence**: Optional task history

**Why Not Build from Scratch?**
- ❌ Reinventing the wheel
- ❌ More maintenance burden
- ✅ Focus on integration, not implementation

---

## 7. Notifications: Toast vs System

### Decision: Dual Notification APIs

**`notifications.toast()`**: In-OS notification center
- Displayed within WebOS UI
- Supports actions (buttons)
- Notification history
- Always works (no permissions)

**`notifications.system()`**: Browser system notifications
- Native OS notifications
- Requires user permission
- Works when tab is inactive
- Limited customization

**Rationale:**
- **Different Use Cases**: In-app messages vs background alerts
- **Graceful Degradation**: Apps can use toasts if system notifications denied
- **UX Flexibility**: Rich in-app UI vs native OS integration

**Example:**
```typescript
// In-app toast (rich UI, always available)
notifications.toast({
  title: 'File saved',
  message: 'readme.txt',
  type: 'success',
  actions: [
    { label: 'Open', action: () => openFile() },
    { label: 'Undo', action: () => undo() }
  ]
});

// System notification (background, requires permission)
await notifications.system({
  title: 'Task completed',
  body: 'Image processing finished',
  onClick: () => windows.focus(windowId)
});
```

---

## 8. Settings: Namespaced Configuration

### Decision: Hierarchical Settings with Schemas

**Format:** `namespace.key`

Examples:
- `system.theme` - System setting
- `text-editor.fontSize` - App setting
- `text-editor.keybindings.save` - Nested app setting

**Rationale:**
- **Namespacing**: Prevents key collisions between apps
- **Capabilities**: `settings:read:text-editor` grants access to namespace
- **Schema Validation**: Ensure type safety and constraints
- **Default Values**: Apps declare defaults in schema

**Schema Registration:**
```typescript
settings.register('text-editor', {
  'fontSize': { 
    default: 14, 
    validate: (v) => v >= 8 && v <= 32,
    description: 'Editor font size'
  },
  'theme': { 
    default: 'light',
    category: 'appearance' 
  }
});
```

**Alternatives Considered:**
1. **Flat Keys**: `text_editor_font_size`
   - ❌ No hierarchy
   - ❌ Harder to scope capabilities

2. **Separate Stores per App**: Each app has own settings store
   - ❌ No global settings management
   - ❌ Can't export/import easily

---

## 9. Router: Deep Links & State Sharing

### Decision: Custom URI Scheme + State Serialization

**URI Format:** `app://<appId>/<path>?<query>`

Examples:
- `app://text-editor/documents/readme.txt`
- `app://settings?tab=theme`
- `app://file-explorer/documents/projects`

**Rationale:**
- **Deep Linking**: Direct link to app state
- **Workspace Sharing**: Share entire workspace via URL
- **History Support**: Browser back/forward buttons work
- **Bookmarkable**: Users can bookmark app states

**State Serialization:**
```typescript
// Serialize workspace state
const state = {
  windows: [
    { appId: 'text-editor', props: { file: '/readme.txt' }, bounds: {...} },
    { appId: 'file-explorer', props: { path: '/documents' }, bounds: {...} }
  ],
  settings: {...}
};

const url = router.share(); // Encodes state in URL
// URL: webos.app/#state=base64EncodedState
```

**Why Not Standard Routing?**
- Standard routing (`/app/text-editor`) doesn't capture full window state
- Need to serialize multiple windows, positions, app states
- Custom scheme allows richer state encoding

---

## 10. Shortcuts: Conflict Resolution

### Decision: Scope-Based Shortcuts with Conflict Detection

**Scopes:**
1. **Global**: Always active (e.g., `Ctrl+Shift+P` for command palette)
2. **App**: Active when app has focus (e.g., `Ctrl+S` in text editor)
3. **Window**: Active when specific window has focus

**Conflict Resolution:**
```
Window-specific > App-specific > Global
```

**Rationale:**
- **Context Awareness**: `Ctrl+S` means different things in different apps
- **No Surprises**: Most specific shortcut wins
- **User Control**: Users can rebind if conflicts occur

**Conflict Detection:**
```typescript
// Registering shortcut
shortcuts.register({
  id: 'save-file',
  keys: 'Ctrl+S',
  scope: 'text-editor',
  action: () => save()
});

// Check for conflicts
const conflicts = shortcuts.conflicts('Ctrl+S', 'text-editor');
if (conflicts.length > 0) {
  // Warn user or auto-rebind
}
```

---

## 11. IPC: Channel-Based Messaging

### Decision: Pub/Sub Channels with Pattern Matching

**Channel Patterns:**
- `app:<appId>` - App-specific channel
- `window:<windowId>` - Window-specific channel
- `system:<event>` - System events
- `file:changed`, `file:deleted` - Domain events

**Rationale:**
- **Loose Coupling**: Apps don't need direct references
- **Broadcast**: One-to-many communication
- **Event-Driven**: Reactive architecture
- **Scoped**: Channel patterns enable capability control

**Example:**
```typescript
// File explorer publishes file changes
ipc.publish('file:changed', { path: '/documents/readme.txt' });

// Text editor subscribes to file changes
ipc.subscribe('file:changed', ({ payload }) => {
  if (payload.path === currentFile) {
    reloadFile();
  }
});
```

**Why Not Direct Method Calls?**
- Direct calls create tight coupling
- Hard to extend (adding new listener requires changing publisher)
- Pub/sub enables plugin architecture

---

## 12. Workers: Transparent CPU Offloading

### Decision: Worker Pool with Automatic Serialization

**Rationale:**
- **Performance**: Offload CPU-intensive tasks from main thread
- **Automatic**: No need to manage worker lifecycle
- **Pool**: Reuse workers for efficiency
- **Transparent**: Same API as regular functions

**API Design:**
```typescript
const result = await workers.run({
  task: (data) => {
    // Runs in worker
    return heavyComputation(data);
  },
  data: { input: ... }
});
```

**Constraints:**
- Task function must be serializable (no closures over external variables)
- Data must be cloneable (structured clone algorithm)

**Why This API?**
- Simple mental model: "run this function in background"
- No need to create separate worker files
- Automatic marshaling of data

**Alternatives Considered:**
1. **Manual Worker Management**: App creates/destroys workers
   - ❌ Complex API
   - ❌ Resource leaks

2. **Worker Files**: Each task is separate .worker.ts file
   - ❌ Build complexity
   - ❌ Harder to co-locate with usage

---

## 13. Shell: Command Palette as First-Class

### Decision: Unified Command Registry + Fuzzy Search UI

**Rationale:**
- **Discoverability**: All commands in one place
- **Keyboard-Driven**: Power users can do everything via keyboard
- **Extensible**: Apps register commands, shell provides UI
- **Consistent**: Same UX as VS Code, Sublime, etc.

**Command Registration:**
```typescript
shell.register({
  id: 'new-text-file',
  name: 'New Text File',
  description: 'Create a new text document',
  keywords: ['create', 'file', 'text'],
  category: 'File',
  execute: () => createFile()
});
```

**Why Not Just Shortcuts?**
- Shortcuts require memorization
- Commands provide search + description
- Commands can have complex parameters

**Relationship:** Commands can have shortcuts, shortcuts trigger commands.

---

## 14. File System: OPFS + Virtual Paths

### Decision: Origin Private File System with Unix-Style Paths

**Rationale:**
- **Performance**: OPFS is faster than IndexedDB
- **Persistence**: Data survives page refreshes
- **Familiar API**: Unix-style paths (`/documents/file.txt`)
- **Large Files**: Supports large files better than alternatives

**Path Structure:**
```
/documents/     - User documents
/downloads/     - Downloaded files
/system/        - System files (read-only for apps)
/apps/          - App-specific data
/tmp/           - Temporary files
```

**Capability Mapping:**
- `fs:read:/documents/**` - Can read all documents
- `fs:write:/apps/text-editor/**` - Can write to own app directory

**Why Not IndexedDB?**
- ✅ OPFS has better performance for large files
- ✅ OPFS has file-like API (more intuitive)
- ❌ IndexedDB requires more boilerplate

**Why Not File System Access API?**
- ✅ OPFS is fully sandboxed (more secure)
- ✅ OPFS doesn't require user permission prompts
- ❌ File System Access API requires permissions per folder

---

## 15. Type System: Full TypeScript Coverage

### Decision: Discriminated Unions + Generics

**Rationale:**
- **Type Safety**: Catch errors at compile time
- **IntelliSense**: Better DX with autocomplete
- **Self-Documenting**: Types serve as documentation
- **Refactoring**: Easier to refactor with confidence

**Example: Discriminated Union**
```typescript
type TaskStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

interface Task {
  id: TaskId;
  status: TaskStatus;
  result?: any;     // Only present if status === 'completed'
  error?: Error;    // Only present if status === 'failed'
}
```

**Example: Generic Service Access**
```typescript
const windows = kernel.service<WindowsService>('windows');
//    ^? const windows: WindowsService
```

**Complete Type Exports:**
```typescript
export type {
  // All service interfaces
  WindowsService, AppsService, FilesService, ...
  
  // All data types
  WindowMetadata, AppManifest, FileHandle, ...
  
  // All option types
  WindowOpenOptions, TaskOptions, ...
};
```

---

## 16. Svelte 5 Runes Integration

### Decision: Services as Runes, Context for Per-Window State

**Service Pattern:**
```typescript
export function createWindowsService() {
  const windows = $state<Record<WindowId, WindowMetadata>>({});
  
  return {
    get list() { return Object.values(windows); },
    open(options: WindowOpenOptions) {
      const id = generateId();
      windows[id] = { ...metadata };
      return id;
    }
  };
}

export const windows = createWindowsService();
```

**Context Pattern:**
```typescript
const WINDOW_KEY = Symbol('window');

export function setWindowContext(context: WindowContext) {
  setContext(WINDOW_KEY, context);
}

export function useWindow(): WindowContext {
  return getContext(WINDOW_KEY);
}
```

**Rationale:**
- **Fine-Grained Reactivity**: Only components using specific state re-render
- **Automatic Tracking**: No manual subscriptions needed in components
- **Performance**: Better than stores for high-frequency updates
- **Modern**: Follows Svelte 5 best practices

**Why Runes over Stores?**
- ✅ Simpler API (`$state` vs `writable()`)
- ✅ Better performance (fine-grained reactivity)
- ✅ Type inference works better
- ✅ Less boilerplate

---

## 17. Error Handling Strategy

### Decision: Throw for Programming Errors, Return for Expected Failures

**Programming Errors (Throw):**
```typescript
kernel.assert(appId, 'fs:write:/documents/**');
// Throws if capability not granted
```

**Expected Failures (Return/Callback):**
```typescript
const window = windows.get(windowId);
// Returns undefined if not found (expected)

try {
  await files.read('/nonexistent.txt');
} catch (error) {
  // File not found (expected, handle gracefully)
}
```

**Rationale:**
- **Programming Errors**: Developer mistakes, should crash during development
- **Expected Failures**: Runtime conditions, should be handled gracefully
- **Type Safety**: `undefined` return forces null checks

---

## 18. Async vs Sync APIs

### Decision: Async for I/O, Sync for State

**Async (returns Promise):**
- File operations (`files.read()`, `files.write()`)
- Task execution (`tasks.create()`)
- System notifications (`notifications.system()`)
- Worker operations (`workers.run()`)

**Sync (returns immediately):**
- State queries (`windows.get()`, `apps.list()`)
- State mutations (`windows.focus()`, `windows.close()`)
- Subscriptions (`windows.subscribe()`)

**Rationale:**
- **I/O is Inherently Async**: File system, network, workers
- **State is Synchronous**: Svelte runes provide instant reactivity
- **Better DX**: No unnecessary `await` for simple queries

---

## 19. Subscription Pattern

### Decision: Subscribe/Unsubscribe with Cleanup Function

**Pattern:**
```typescript
const unsubscribe = service.subscribe(id, (data) => {
  // Handle update
});

// Later...
unsubscribe();
```

**In Svelte 5:**
```typescript
$effect(() => {
  const unsubscribe = windows.subscribe(windowId, (win) => {
    console.log('Window updated:', win);
  });
  
  return unsubscribe; // Cleanup
});
```

**Rationale:**
- **Standard Pattern**: Same as stores, event listeners
- **Automatic Cleanup**: Svelte calls cleanup on component unmount
- **Memory Safety**: Prevents subscription leaks

**Alternatives Considered:**
1. **EventEmitter Pattern**: `on(event, handler)`, `off(event, handler)`
   - ❌ More methods to implement
   - ❌ Harder to ensure cleanup

2. **Reactive Queries**: Automatically subscribe when accessing
   - ❌ Hidden subscriptions (harder to debug)
   - ❌ Performance unpredictable

---

## 20. Testing Strategy

### Decision: Services are Easily Testable

**Mock Kernel:**
```typescript
const mockKernel = {
  service: (name: string) => mockServices[name],
  check: () => true,
  assert: () => {}
};
```

**Test Service in Isolation:**
```typescript
describe('WindowsService', () => {
  it('should open window', () => {
    const windows = createWindowsService();
    const id = windows.open({ appId: 'test-app' });
    expect(windows.get(id)).toBeDefined();
  });
});
```

**Test with Capabilities:**
```typescript
it('should enforce capabilities', () => {
  kernel.grant('test-app', ['windows:open']);
  expect(() => kernel.assert('test-app', 'windows:open')).not.toThrow();
  expect(() => kernel.assert('test-app', 'windows:manage:all')).toThrow();
});
```

**Rationale:**
- **Unit Testing**: Services can be tested without kernel
- **Integration Testing**: Kernel + services can be tested together
- **Capability Testing**: Security model is testable

---

## Summary

The WebOS API design prioritizes:

1. **🔒 Security**: Capability-based access control
2. **🎯 Clarity**: Each service has clear responsibility
3. **⚡ Performance**: Fine-grained reactivity with Svelte 5 runes
4. **🧩 Modularity**: Services are independent and composable
5. **🛠️ Developer Experience**: Type-safe, intuitive APIs
6. **🧪 Testability**: Easy to unit test and mock
7. **📚 Consistency**: Naming and patterns are predictable

These decisions create a foundation that scales from simple single-window apps to complex multi-window workspaces, while maintaining security, performance, and developer ergonomics.

---

_For implementation details, see [API_SPECIFICATION.md](./API_SPECIFICATION.md)_  
_For quick reference, see [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md)_


