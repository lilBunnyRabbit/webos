# WebOS API Quick Reference

> Quick reference for WebOS service APIs. See [API_SPECIFICATION.md](./API_SPECIFICATION.md) for complete documentation.

## Service Access Pattern

```typescript
import { kernel } from '@/core/kernel';

const service = kernel.service<ServiceType>('serviceName');
```

---

## Kernel

```typescript
kernel.init(config?)                    // Initialize system
kernel.service<T>('name')               // Get service
kernel.grant(appId, capabilities)       // Grant permissions
kernel.check(appId, capability)         // Check permission
kernel.on(event, handler)               // Listen to events
```

---

## Windows Service

```typescript
const windows = kernel.service<WindowsService>('windows');

// Lifecycle
windows.open({ appId, props?, bounds? })  // → WindowId
windows.close(id)
windows.closeAll(appId?)

// State
windows.focus(id)
windows.minimize(id)
windows.maximize(id)
windows.restore(id)
windows.snap(id, zone)

// Queries
windows.get(id)                           // → WindowMetadata | undefined
windows.list(appId?)                      // → WindowMetadata[]
windows.focused()                         // → WindowId | null
windows.exists(id)                        // → boolean

// Subscriptions
windows.subscribe(id, handler)            // → unsubscribe fn
windows.subscribeList(handler)            // → unsubscribe fn
```

**SnapZones**: `'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`

---

## Apps Service

```typescript
const apps = kernel.service<AppsService>('apps');

// Registry
apps.register(manifest)
apps.unregister(appId)

// Launching
apps.launch({ appId, props?, window?, background? })  // → WindowId | null

// Queries
apps.get(appId)                          // → AppManifest | undefined
apps.list()                              // → AppManifest[]
apps.category(category)                  // → AppManifest[]
apps.instance(appId)                     // → AppInstance | undefined
apps.installed(appId)                    // → boolean
apps.running(appId)                      // → boolean

// File Associations
apps.forFileType(type)                   // → AppManifest[]
apps.forUrlScheme(scheme)                // → AppManifest[]
apps.setDefaultForFileType(type, appId)
apps.defaultForFileType(type)            // → AppId | null
```

**Categories**: `'system' | 'utility' | 'productivity' | 'media' | 'development' | 'other'`

---

## Files Service

```typescript
const files = kernel.service<FilesService>('files');

// File Operations
files.read(path, options?)               // → Promise<string | ...>
files.write(path, data, options?)        // → Promise<void>
files.delete(path, recursive?)           // → Promise<void>
files.move(from, to)                     // → Promise<void>
files.copy(from, to)                     // → Promise<void>

// Directory Operations
files.mkdir(path, recursive?)            // → Promise<void>
files.list(path, options?)               // → Promise<FileHandle[]>

// Metadata
files.stat(path)                         // → Promise<FileStats>
files.exists(path)                       // → Promise<boolean>
files.quota()                            // → Promise<{ usage, quota }>

// Watching
files.watch(path, handler, options?)     // → unsubscribe fn

// Browser Bridge
files.download(path, filename?)          // → Promise<void>
files.upload(destination)                // → Promise<FileHandle>
```

**Read Options**: `{ as?: 'text' | 'json' | 'blob' | 'arraybuffer', encoding?: string }`

---

## Tasks Service

```typescript
const tasks = kernel.service<TasksService>('tasks');

// Task Management
tasks.create({ name, execute, ...options })  // → TaskId
tasks.group([taskIds], 'sequence'|'parallel') // → TaskId
tasks.cancel(id)
tasks.pause(id)
tasks.resume(id)
tasks.retry(id)

// Queries
tasks.get(id)                            // → Task | undefined
tasks.list(filter?)                      // → Task[]

// Subscriptions
tasks.subscribe(id, handler)             // → unsubscribe fn
tasks.subscribeAll(handler)              // → unsubscribe fn

// Cleanup
tasks.clear(statuses?)
```

**Task Statuses**: `'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'`

---

## Notifications Service

```typescript
const notifications = kernel.service<NotificationsService>('notifications');

// Display
notifications.toast({ title, message?, type?, duration?, actions? })  // → NotificationId
notifications.system({ title, body?, icon? })  // → Promise<NotificationId>
notifications.badge(appId, count)

// Management
notifications.dismiss(id)
notifications.markRead(id)
notifications.markAllRead()
notifications.clear(filter?)

// Queries
notifications.get(id)                    // → Notification | undefined
notifications.list(filter?)              // → Notification[]

// Subscriptions
notifications.subscribe(handler)         // → unsubscribe fn

// Permissions
notifications.requestPermission()        // → Promise<'granted' | 'denied' | 'default'>
```

**Types**: `'info' | 'success' | 'warning' | 'error'`

---

## Settings Service

```typescript
const settings = kernel.service<SettingsService>('settings');

// Schema
settings.register(namespace, schema)

// Get/Set
settings.get<T>(key, defaultValue?)      // → T
settings.set<T>(key, value)
settings.namespace(namespace)            // → Record<string, SettingValue>

// Reset
settings.reset(key)
settings.resetNamespace(namespace)

// Subscriptions
settings.subscribe<T>(key, handler)      // → unsubscribe fn

// Import/Export
settings.import(data)
settings.export(namespace?)              // → Record<string, SettingValue>
```

**Key Format**: `'namespace.setting'` (e.g., `'text-editor.fontSize'`)

---

## Router Service

```typescript
const router = kernel.service<RouterService>('router');

// Routing
router.register({ pattern, handler, metadata? })
router.navigate(url, options?)
router.back()
router.forward()

// State
router.current()                         // → RouteParams
router.share()                           // → shareable URL
router.restore(url)                      // → Promise<void>

// Subscriptions
router.subscribe(handler)                // → unsubscribe fn
```

**URL Pattern**: `'app://<appId>/<path>'` (e.g., `'app://text-editor/documents/file.txt'`)

---

## Shortcuts Service

```typescript
const shortcuts = kernel.service<ShortcutsService>('shortcuts');

// Registration
shortcuts.register({ id, keys, description, action, scope })  // → ShortcutId
shortcuts.unregister(id)
shortcuts.rebind(id, keys)
shortcuts.toggle(id, enabled?)

// Queries
shortcuts.get(id)                        // → Shortcut | undefined
shortcuts.list(scope?)                   // → Shortcut[]
shortcuts.conflicts(keys, scope)         // → ShortcutConflict[]
shortcuts.cheatSheet()                   // → Record<category, Shortcut[]>
```

**Key Format**: `'Ctrl+S'`, `'Cmd+Shift+P'`, `'Alt+F4'`  
**Scopes**: `'global' | AppId | WindowId`

---

## IPC Service

```typescript
const ipc = kernel.service<IpcService>('ipc');

// Pub/Sub
ipc.publish(channel, payload)
ipc.subscribe(channel, handler)          // → unsubscribe fn
ipc.unsubscribe(channel, handler?)

// Management
ipc.channels()                           // → Channel[]
ipc.clear(channel)
```

**Channel Patterns**: `'app:*'`, `'window:<id>'`, `'system:*'`, `'file:changed'`

---

## Workers Service

```typescript
const workers = kernel.service<WorkersService>('workers');

// Task Execution
workers.run({ task, data, priority? })   // → Promise<result>
workers.cancel(id)

// Pool Management
workers.stats()                          // → { poolSize, active, queued, completed }
workers.setPoolSize(size)
```

**Note**: Task functions must be serializable (no closures).

---

## Shell Service

```typescript
const shell = kernel.service<ShellService>('shell');

// Commands
shell.register({ id, name, description, execute, ... })
shell.unregister(id)
shell.execute(id, args?)                 // → Promise<void>
shell.run(query)                         // → Promise<void>

// Queries
shell.get(id)                            // → Command | undefined
shell.search(query)                      // → Command[]
shell.list()                             // → Command[]

// UI
shell.showCommandPalette(options?)
```

---

## Capabilities

Capabilities follow the pattern: `'domain:action:scope'`

### File System
- `'fs:read:/path/**'` - Read files in path
- `'fs:write:/path/**'` - Write files in path
- `'fs:delete:/path/**'` - Delete files in path

### Windows
- `'windows:open'` - Open new windows
- `'windows:close'` - Close windows
- `'windows:manage:self'` - Manage own windows
- `'windows:manage:all'` - Manage any window (privileged)
- `'windows:observe'` - Observe window list

### Notifications
- `'notify:toast'` - Show in-OS toasts
- `'notify:system'` - Trigger browser notifications
- `'notify:badge'` - Update app badges

### Tasks
- `'tasks:create'` - Create tasks
- `'tasks:observe'` - Observe task progress

### IPC
- `'ipc:publish:channel'` - Publish to channel
- `'ipc:subscribe:channel'` - Subscribe to channel

### Settings
- `'settings:read:namespace'` - Read settings
- `'settings:write:namespace'` - Write settings

### System
- `'shell:execute'` - Execute shell commands
- `'workers:spawn'` - Spawn web workers
- `'router:navigate'` - Navigate URLs

---

## Common Patterns

### App Component Structure

```svelte
<script lang="ts">
  import { kernel } from '@/core/kernel';
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  interface Props {
    // Your app props
  }
  
  let props: Props = $props();
  
  // Get services
  const windows = kernel.service<WindowsService>('windows');
  const files = kernel.service<FilesService>('files');
  
  // Get window context
  const window = useWindow();
  
  // App state
  let state = $state({ ... });
  
  // Effects
  $effect(() => {
    // React to state changes
  });
</script>

<div class="app">
  <!-- Your UI -->
</div>
```

### Service Subscription Cleanup

```typescript
// In component
let unsubscribe: (() => void) | undefined;

$effect(() => {
  unsubscribe = service.subscribe(id, handler);
  
  return () => {
    unsubscribe?.();
  };
});
```

### Capability Checking

```typescript
// Before sensitive operation
try {
  kernel.assert(appId, 'fs:write:/documents/**');
  await files.write(path, content);
} catch (error) {
  notifications.toast({
    type: 'error',
    title: 'Permission denied',
    message: 'This app cannot write to this location'
  });
}
```

### Task Progress Tracking

```typescript
const taskId = tasks.create({
  name: 'Process files',
  execute: async (signal, progress) => {
    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) throw new Error('Cancelled');
      
      await processItem(items[i]);
      
      progress({ 
        value: (i + 1) / items.length,
        label: `Processing ${i + 1}/${items.length}`
      });
    }
  }
});

tasks.subscribe(taskId, (task) => {
  console.log(`Progress: ${task.progress.value * 100}%`);
});
```

---

## Type Imports

```typescript
// Kernel & Services
import type {
  Kernel,
  WindowsService,
  AppsService,
  FilesService,
  TasksService,
  NotificationsService,
  SettingsService,
  RouterService,
  ShortcutsService,
  IpcService,
  WorkersService,
  ShellService,
  Capability
} from '@/core/types';

// Common Types
import type {
  WindowId,
  WindowMetadata,
  AppId,
  AppManifest,
  FilePath,
  FileHandle,
  TaskId,
  Task,
  NotificationId,
  Notification
} from '@/core/types';
```

---

## Helpful Links

- [Complete API Specification](./API_SPECIFICATION.md)
- [Svelte 5 Quick Reference](./SVELTE_QUICK_REFERENCE.md)
- [Migration Guide](./API_SPECIFICATION.md#migration-guide)
- [Best Practices](./API_SPECIFICATION.md#best-practices)

---

_For detailed documentation, examples, and type definitions, see [API_SPECIFICATION.md](./API_SPECIFICATION.md)_


