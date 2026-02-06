# WebOS API Specification

_Version: 1.0.0-draft_  
_Last Updated: October 27, 2025_

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Kernel API](#kernel-api)
4. [Service APIs](#service-apis)
   - [Windows Service](#windows-service)
   - [Apps Service](#apps-service)
   - [Files Service](#files-service)
   - [Tasks Service](#tasks-service)
   - [Notifications Service](#notifications-service)
   - [Settings Service](#settings-service)
   - [Router Service](#router-service)
   - [Shortcuts Service](#shortcuts-service)
   - [IPC Service](#ipc-service)
   - [Workers Service](#workers-service)
   - [Shell Service](#shell-service)
5. [App Development](#app-development)
6. [Type Definitions](#type-definitions)

---

## Architecture Overview

WebOS follows a **user-space microkernel architecture** designed for modern web browsers. The system consists of:

- **Kernel (façade)**: Thin service registry that manages lifecycle, capabilities, and service discovery
- **System Services**: Singleton stores that provide OS-level functionality
- **Apps**: Svelte components that request capabilities and consume services
- **Drivers**: Browser API adapters (OPFS, Service Workers, Web APIs)

### Design Principles

1. **Thin kernel, rich services**: Kernel only handles registration, discovery, and policy
2. **Capability-based security**: Apps explicitly request permissions
3. **Service isolation**: Each service manages its own state with Svelte 5 runes
4. **Type safety**: Full TypeScript coverage with discriminated unions
5. **Performance**: Fine-grained reactivity prevents unnecessary re-renders

### File Structure

```
src/lib/core/
├── kernel/
│   ├── kernel.svelte.ts          # Service registry & capabilities
│   ├── capabilities.ts            # Capability definitions & checks
│   └── lifecycle.ts               # System lifecycle hooks
├── services/
│   ├── windows.svelte.ts          # Window management
│   ├── apps.svelte.ts             # App registry & launching
│   ├── files.svelte.ts            # File system (OPFS)
│   ├── tasks.svelte.ts            # Task orchestration
│   ├── notifications.svelte.ts    # Notification center
│   ├── settings.svelte.ts         # System settings
│   ├── router.svelte.ts           # URI routing & deep links
│   ├── shortcuts.svelte.ts        # Keyboard shortcuts
│   ├── ipc.svelte.ts              # Inter-process communication
│   ├── workers.svelte.ts          # Web Worker pool
│   └── shell.svelte.ts            # Command palette & shell
├── types/
│   ├── kernel.types.ts            # Kernel interfaces
│   ├── services.types.ts          # Service interfaces
│   └── app.types.ts               # App manifest & lifecycle
└── contexts/
    └── window-context.svelte.ts   # Per-window context
```

---

## Core Concepts

### Services

**Services** are singleton Svelte runes-based stores that provide system-level functionality. They:
- Are registered with the kernel at boot
- Expose typed APIs
- Manage their own reactive state
- Can depend on other services
- Are accessed via `kernel.service<T>(name)`

### Capabilities

**Capabilities** are permission tokens that control what apps can do. They follow the principle of least privilege:

```typescript
type Capability = 
  // File system
  | `fs:read:${string}`      // Read from path pattern
  | `fs:write:${string}`     // Write to path pattern
  | `fs:delete:${string}`    // Delete from path pattern
  
  // Windows
  | 'windows:open'           // Open new windows
  | 'windows:close'          // Close own windows
  | 'windows:manage:self'    // Manage own window state
  | 'windows:manage:all'     // Manage any window (privileged)
  | 'windows:observe'        // Observe window list
  
  // Notifications
  | 'notify:toast'           // Show in-OS toasts
  | 'notify:system'          // Trigger browser notifications
  | 'notify:badge'           // Update app badge
  
  // Tasks
  | 'tasks:create'           // Create background tasks
  | 'tasks:observe'          // Observe task progress
  
  // IPC
  | `ipc:publish:${string}`  // Publish to channel pattern
  | `ipc:subscribe:${string}`// Subscribe to channel pattern
  
  // Settings
  | `settings:read:${string}` // Read setting namespace
  | `settings:write:${string}`// Write setting namespace
  
  // System
  | 'shell:execute'          // Execute shell commands
  | 'workers:spawn'          // Spawn web workers
  | 'router:navigate'        // Navigate/manipulate URLs
```

### App Lifecycle

Apps go through the following lifecycle:

```
REGISTERED → LOADING → MOUNTED → ACTIVE
                           ↓
                       PAUSED ←→ RESUMED
                           ↓
                      UNMOUNTING → DESTROYED
```

---

## Kernel API

The kernel is the entry point to all system services and manages capabilities.

### Types

```typescript
export interface KernelConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom service configurations */
  services?: Record<string, any>;
}

export interface ServiceDescriptor<T = any> {
  /** Service instance */
  instance: T;
  /** Service dependencies */
  dependencies?: string[];
  /** Initialization priority (lower = earlier) */
  priority?: number;
}
```

### Interface

```typescript
export interface Kernel {
  /**
   * Initialize the kernel and all services
   */
  init(config?: KernelConfig): Promise<void>;

  /**
   * Shutdown the kernel and cleanup
   */
  shutdown(): Promise<void>;

  /**
   * Register a service
   */
  register<T>(name: string, descriptor: ServiceDescriptor<T>): void;

  /**
   * Get a registered service
   * @throws if service not found
   */
  service<T>(name: string): T;

  /**
   * Check if service exists
   */
  has(name: string): boolean;

  /**
   * List all registered services
   */
  list(): string[];

  /**
   * Grant capabilities to an app
   */
  grant(appId: string, capabilities: Capability[]): void;

  /**
   * Revoke capabilities from an app
   */
  revoke(appId: string, capabilities: Capability[]): void;

  /**
   * Check if app has capability
   */
  check(appId: string, capability: Capability): boolean;

  /**
   * Assert app has capability (throws if not)
   */
  assert(appId: string, capability: Capability): void;

  /**
   * Get all capabilities for an app
   */
  capabilities(appId: string): Set<Capability>;

  /**
   * Subscribe to kernel events
   */
  on(event: KernelEvent, handler: (data: any) => void): () => void;

  /**
   * Emit kernel event
   */
  emit(event: KernelEvent, data?: any): void;
}

export type KernelEvent =
  | 'service:registered'
  | 'service:unregistered'
  | 'capability:granted'
  | 'capability:revoked'
  | 'app:registered'
  | 'app:launched'
  | 'app:destroyed'
  | 'system:ready'
  | 'system:shutdown';
```

### Usage

```typescript
import { kernel } from '@/core/kernel';

// Initialize kernel
await kernel.init({ debug: true });

// Register a service
kernel.register('myService', {
  instance: createMyService(),
  dependencies: ['windows', 'files'],
  priority: 10
});

// Use a service
const windows = kernel.service<WindowsService>('windows');
const windowId = windows.open({ appId: 'text-editor' });

// Check capabilities
kernel.grant('text-editor', ['fs:read:/documents/**', 'fs:write:/documents/**']);
kernel.assert('text-editor', 'fs:read:/documents/file.txt'); // OK
kernel.check('text-editor', 'fs:write:/system/'); // false

// Listen to events
kernel.on('app:launched', ({ appId, windowId }) => {
  console.log(`App ${appId} launched in window ${windowId}`);
});
```

---

## Service APIs

### Windows Service

Manages window lifecycle, visual state, z-ordering, and geometry.

#### Types

```typescript
export type WindowId = string;

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type Bounds = Position & Dimensions;

export type WindowState =
  | 'normal'      // Regular windowed state
  | 'minimized'   // Minimized to taskbar
  | 'maximized'   // Fullscreen within container
  | 'snapped';    // Snapped to edge/corner

export type SnapZone = 
  | 'left' | 'right' | 'top' | 'bottom'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WindowConstraints {
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface WindowMetadata {
  id: WindowId;
  appId: string;
  title: string;
  icon?: string;
  state: WindowState;
  bounds: Bounds;
  snapZone: SnapZone | null;
  zIndex: number;
  constraints: WindowConstraints;
  flags: Set<string>;
  createdAt: Date;
  focusedAt: Date | null;
}

export interface WindowOpenOptions {
  /** App to open */
  appId: string;
  /** Props to pass to app component */
  props?: Record<string, any>;
  /** Initial bounds (defaults calculated) */
  bounds?: Partial<Bounds>;
  /** Initial state */
  state?: WindowState;
  /** Window constraints */
  constraints?: Partial<WindowConstraints>;
  /** Custom title (overrides app default) */
  title?: string;
}

export interface WindowUpdateOptions {
  title?: string;
  bounds?: Partial<Bounds>;
  state?: WindowState;
  snapZone?: SnapZone | null;
}
```

#### Interface

```typescript
export interface WindowsService {
  /**
   * Open a new window
   * Requires: windows:open
   */
  open(options: WindowOpenOptions): WindowId;

  /**
   * Close a window
   * Requires: windows:close or windows:manage:all
   */
  close(id: WindowId): void;

  /**
   * Close all windows (optionally filtered by app)
   * Requires: windows:manage:all
   */
  closeAll(appId?: string): void;

  /**
   * Focus a window (brings to front)
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  focus(id: WindowId): void;

  /**
   * Minimize a window
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  minimize(id: WindowId): void;

  /**
   * Maximize a window
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  maximize(id: WindowId): void;

  /**
   * Restore a window to normal state
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  restore(id: WindowId): void;

  /**
   * Snap a window to a zone
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  snap(id: WindowId, zone: SnapZone): void;

  /**
   * Update window metadata
   * Requires: windows:manage:self (own) or windows:manage:all
   */
  update(id: WindowId, options: WindowUpdateOptions): void;

  /**
   * Get window metadata
   * Requires: windows:observe
   */
  get(id: WindowId): WindowMetadata | undefined;

  /**
   * Get all windows (optionally filtered by app)
   * Requires: windows:observe
   */
  list(appId?: string): WindowMetadata[];

  /**
   * Get currently focused window ID
   * Requires: windows:observe
   */
  focused(): WindowId | null;

  /**
   * Check if window exists
   */
  exists(id: WindowId): boolean;

  /**
   * Subscribe to window changes
   * Returns unsubscribe function
   */
  subscribe(id: WindowId, handler: (window: WindowMetadata) => void): () => void;

  /**
   * Subscribe to window list changes
   */
  subscribeList(handler: (windows: WindowMetadata[]) => void): () => void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const windows = kernel.service<WindowsService>('windows');

// Open a window
const winId = windows.open({
  appId: 'text-editor',
  props: { file: '/documents/readme.txt' },
  bounds: { width: 800, height: 600 },
  constraints: { minWidth: 400, minHeight: 300 }
});

// Manipulate window
windows.focus(winId);
windows.maximize(winId);
windows.snap(winId, 'left');
windows.update(winId, { title: 'README.txt - Text Editor' });

// Query windows
const window = windows.get(winId);
const allWindows = windows.list();
const textEditorWindows = windows.list('text-editor');

// Subscribe to changes
const unsubscribe = windows.subscribe(winId, (win) => {
  console.log('Window updated:', win.title, win.state);
});

// Inside app component (Svelte)
import { useWindow } from '@/core/contexts/window-context.svelte';

const window = useWindow(); // Per-window context
$effect(() => {
  console.log('My window is:', window.state);
});
```

---

### Apps Service

Manages app registry, metadata, and launching. Acts as the primary interface for app lifecycle.

#### Types

```typescript
export type AppId = string;

export interface AppManifest {
  /** Unique app identifier */
  id: AppId;
  /** Display name */
  name: string;
  /** Short description */
  description?: string;
  /** App icon (URL or icon name) */
  icon: string;
  /** App version */
  version: string;
  /** App author */
  author?: string;
  /** Component entry point */
  component: typeof SvelteComponent;
  /** Default window dimensions */
  defaultSize?: Dimensions;
  /** Default window constraints */
  constraints?: WindowConstraints;
  /** Requested capabilities */
  capabilities: Capability[];
  /** Supported file types (for file associations) */
  fileTypes?: string[];
  /** Supported URL schemes */
  urlSchemes?: string[];
  /** Single instance (only one window allowed) */
  singleInstance?: boolean;
  /** Category for app launcher */
  category?: 'system' | 'utility' | 'productivity' | 'media' | 'development' | 'other';
}

export interface AppInstance {
  /** App ID */
  appId: AppId;
  /** Associated window IDs */
  windowIds: WindowId[];
  /** App state */
  state: AppState;
  /** App-specific data */
  data?: Record<string, any>;
  /** Launch timestamp */
  launchedAt: Date;
}

export type AppState = 
  | 'registered'  // App is registered but not launched
  | 'loading'     // App is loading (async component)
  | 'active'      // App has active windows
  | 'background'; // App is running without visible windows

export interface AppLaunchOptions {
  /** App ID to launch */
  appId: AppId;
  /** Props to pass to app component */
  props?: Record<string, any>;
  /** Window options (merged with app defaults) */
  window?: Partial<WindowOpenOptions>;
  /** Launch in background (no window) */
  background?: boolean;
}
```

#### Interface

```typescript
export interface AppsService {
  /**
   * Register an app
   * Called at boot or dynamically
   */
  register(manifest: AppManifest): void;

  /**
   * Unregister an app
   * Closes all associated windows
   */
  unregister(appId: AppId): void;

  /**
   * Launch an app (opens window or activates existing)
   * Returns window ID (or null if background/single-instance)
   */
  launch(options: AppLaunchOptions): WindowId | null;

  /**
   * Get app manifest
   */
  get(appId: AppId): AppManifest | undefined;

  /**
   * Get all registered apps
   */
  list(): AppManifest[];

  /**
   * Get apps by category
   */
  category(category: AppManifest['category']): AppManifest[];

  /**
   * Get app instance (runtime state)
   */
  instance(appId: AppId): AppInstance | undefined;

  /**
   * Get all running instances
   */
  instances(): AppInstance[];

  /**
   * Check if app is installed
   */
  installed(appId: AppId): boolean;

  /**
   * Check if app is running
   */
  running(appId: AppId): boolean;

  /**
   * Get app that can open file type
   */
  forFileType(type: string): AppManifest[];

  /**
   * Get app that can handle URL scheme
   */
  forUrlScheme(scheme: string): AppManifest[];

  /**
   * Set default app for file type
   */
  setDefaultForFileType(type: string, appId: AppId): void;

  /**
   * Get default app for file type
   */
  defaultForFileType(type: string): AppId | null;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';
import TextEditor from '@/apps/text-editor/TextEditor.svelte';

const apps = kernel.service<AppsService>('apps');

// Register an app
apps.register({
  id: 'text-editor',
  name: 'Text Editor',
  description: 'Simple text editor',
  icon: 'file-text',
  version: '1.0.0',
  component: TextEditor,
  defaultSize: { width: 800, height: 600 },
  constraints: { minWidth: 400, minHeight: 300 },
  capabilities: [
    'fs:read:/documents/**',
    'fs:write:/documents/**',
    'windows:open',
    'windows:manage:self',
    'notify:toast'
  ],
  fileTypes: ['.txt', '.md', '.json'],
  category: 'productivity'
});

// Launch app
const winId = apps.launch({
  appId: 'text-editor',
  props: { file: '/documents/readme.txt' }
});

// Query apps
const editor = apps.get('text-editor');
const productivityApps = apps.category('productivity');
const textApps = apps.forFileType('.txt');

// Check state
if (apps.running('text-editor')) {
  const instance = apps.instance('text-editor');
  console.log('Text editor has', instance.windowIds.length, 'windows');
}
```

---

### Files Service

Provides file system operations backed by Origin Private File System (OPFS).

#### Types

```typescript
export type FilePath = string;

export interface FileHandle {
  path: FilePath;
  name: string;
  type: FileType;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  permissions: FilePermissions;
}

export type FileType = 'file' | 'directory' | 'symlink';

export interface FilePermissions {
  readable: boolean;
  writable: boolean;
  deletable: boolean;
}

export interface FileStats {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
  isFile: boolean;
  isDirectory: boolean;
}

export interface ReadOptions {
  /** Read as specific type */
  as?: 'text' | 'json' | 'blob' | 'arraybuffer';
  /** Text encoding (default: utf-8) */
  encoding?: string;
}

export interface WriteOptions {
  /** Create parent directories */
  recursive?: boolean;
  /** Text encoding (default: utf-8) */
  encoding?: string;
  /** Append instead of overwrite */
  append?: boolean;
}

export interface ListOptions {
  /** Include subdirectories recursively */
  recursive?: boolean;
  /** Filter by glob pattern */
  pattern?: string;
  /** Include hidden files */
  includeHidden?: boolean;
}

export interface WatchOptions {
  /** Watch recursively */
  recursive?: boolean;
}

export type WatchEvent = 
  | { type: 'created'; path: FilePath }
  | { type: 'modified'; path: FilePath }
  | { type: 'deleted'; path: FilePath }
  | { type: 'renamed'; path: FilePath; oldPath: FilePath };
```

#### Interface

```typescript
export interface FilesService {
  /**
   * Read file contents
   * Requires: fs:read:<path>
   */
  read<T = string>(path: FilePath, options?: ReadOptions): Promise<T>;

  /**
   * Write file contents
   * Requires: fs:write:<path>
   */
  write(path: FilePath, data: string | Blob | ArrayBuffer, options?: WriteOptions): Promise<void>;

  /**
   * Delete file or directory
   * Requires: fs:delete:<path>
   */
  delete(path: FilePath, recursive?: boolean): Promise<void>;

  /**
   * Move/rename file
   * Requires: fs:write:<from>, fs:write:<to>
   */
  move(from: FilePath, to: FilePath): Promise<void>;

  /**
   * Copy file
   * Requires: fs:read:<from>, fs:write:<to>
   */
  copy(from: FilePath, to: FilePath): Promise<void>;

  /**
   * Create directory
   * Requires: fs:write:<path>
   */
  mkdir(path: FilePath, recursive?: boolean): Promise<void>;

  /**
   * List directory contents
   * Requires: fs:read:<path>
   */
  list(path: FilePath, options?: ListOptions): Promise<FileHandle[]>;

  /**
   * Get file/directory stats
   * Requires: fs:read:<path>
   */
  stat(path: FilePath): Promise<FileStats>;

  /**
   * Check if path exists
   * Requires: fs:read:<path>
   */
  exists(path: FilePath): Promise<boolean>;

  /**
   * Watch path for changes
   * Requires: fs:read:<path>
   */
  watch(path: FilePath, handler: (event: WatchEvent) => void, options?: WatchOptions): () => void;

  /**
   * Get storage quota information
   */
  quota(): Promise<{ usage: number; quota: number }>;

  /**
   * Download file to user's downloads folder
   */
  download(path: FilePath, filename?: string): Promise<void>;

  /**
   * Upload file from user's device
   */
  upload(destination: FilePath): Promise<FileHandle>;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const files = kernel.service<FilesService>('files');

// Read file
const content = await files.read('/documents/readme.txt');
const data = await files.read<any>('/config/settings.json', { as: 'json' });

// Write file
await files.write('/documents/notes.txt', 'Hello world');
await files.write('/data/binary.dat', new Uint8Array([1, 2, 3]).buffer);

// Directory operations
await files.mkdir('/projects/myapp', { recursive: true });
const entries = await files.list('/documents', { pattern: '*.txt' });

// File operations
await files.copy('/documents/file.txt', '/backup/file.txt');
await files.move('/old/path.txt', '/new/path.txt');
await files.delete('/temp/cache.dat');

// Watch for changes
const unwatch = files.watch('/documents', (event) => {
  if (event.type === 'created') {
    console.log('New file:', event.path);
  }
}, { recursive: true });

// Check quota
const { usage, quota } = await files.quota();
console.log(`Using ${usage / quota * 100}% of storage`);
```

---

### Tasks Service

Orchestrates background tasks with progress tracking, cancellation, and error handling. Integrates with `@lilbunnyrabbit/task-manager`.

#### Types

```typescript
export type TaskId = string;

export type TaskStatus = 
  | 'pending'    // Queued, not started
  | 'running'    // Currently executing
  | 'paused'     // Paused by user/system
  | 'completed'  // Finished successfully
  | 'failed'     // Finished with error
  | 'cancelled'; // Cancelled by user

export interface TaskProgress {
  /** Current progress (0-1) */
  value: number;
  /** Current step label */
  label?: string;
  /** Additional progress data */
  data?: Record<string, any>;
}

export interface TaskOptions<T = any> {
  /** Task display name */
  name: string;
  /** Task description */
  description?: string;
  /** Task executor function */
  execute: (signal: AbortSignal, progress: (p: TaskProgress) => void) => Promise<T>;
  /** Retry configuration */
  retry?: {
    attempts: number;
    delay: number;
  };
  /** Task priority (higher = earlier) */
  priority?: number;
  /** Task group ID */
  group?: string;
  /** Show notification on completion */
  notify?: boolean;
  /** Cancel dependent tasks on failure */
  cancelDependent?: boolean;
}

export interface Task<T = any> {
  id: TaskId;
  name: string;
  description?: string;
  status: TaskStatus;
  progress: TaskProgress;
  result?: T;
  error?: Error;
  priority: number;
  group?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

#### Interface

```typescript
export interface TasksService {
  /**
   * Create and queue a task
   * Requires: tasks:create
   */
  create<T = any>(options: TaskOptions<T>): TaskId;

  /**
   * Create a task group (run tasks in sequence or parallel)
   */
  group(tasks: TaskId[], mode: 'sequence' | 'parallel'): TaskId;

  /**
   * Cancel a task
   */
  cancel(id: TaskId): void;

  /**
   * Pause a task (if supported)
   */
  pause(id: TaskId): void;

  /**
   * Resume a paused task
   */
  resume(id: TaskId): void;

  /**
   * Retry a failed task
   */
  retry(id: TaskId): void;

  /**
   * Get task details
   * Requires: tasks:observe
   */
  get(id: TaskId): Task | undefined;

  /**
   * Get all tasks
   */
  list(filter?: Partial<{ status: TaskStatus; group: string }>): Task[];

  /**
   * Subscribe to task updates
   */
  subscribe(id: TaskId, handler: (task: Task) => void): () => void;

  /**
   * Subscribe to all task updates
   */
  subscribeAll(handler: (tasks: Task[]) => void): () => void;

  /**
   * Clear completed/failed/cancelled tasks
   */
  clear(statuses?: TaskStatus[]): void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const tasks = kernel.service<TasksService>('tasks');

// Create a task
const taskId = tasks.create({
  name: 'Process images',
  description: 'Converting images to thumbnails',
  execute: async (signal, progress) => {
    const images = await getImages();
    
    for (let i = 0; i < images.length; i++) {
      if (signal.aborted) throw new Error('Cancelled');
      
      await processImage(images[i]);
      progress({ 
        value: (i + 1) / images.length,
        label: `Processing ${i + 1}/${images.length}`
      });
    }
    
    return { processed: images.length };
  },
  retry: { attempts: 3, delay: 1000 },
  notify: true
});

// Monitor task
tasks.subscribe(taskId, (task) => {
  console.log(`${task.name}: ${task.progress.value * 100}%`);
  if (task.status === 'completed') {
    console.log('Result:', task.result);
  }
});

// Control task
tasks.pause(taskId);
tasks.resume(taskId);
tasks.cancel(taskId);

// Task groups
const downloadTasks = files.map(file => 
  tasks.create({ name: `Download ${file}`, execute: () => download(file) })
);
const groupId = tasks.group(downloadTasks, 'parallel');
```

---

### Notifications Service

Manages system notifications, toasts, and notification center.

#### Types

```typescript
export type NotificationId = string;

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  action: () => void | Promise<void>;
}

export interface ToastOptions {
  /** Toast type */
  type?: NotificationType;
  /** Toast title */
  title: string;
  /** Toast message */
  message?: string;
  /** Duration in ms (0 = persistent) */
  duration?: number;
  /** Actions */
  actions?: NotificationAction[];
  /** Icon */
  icon?: string;
}

export interface SystemNotificationOptions {
  /** Notification title */
  title: string;
  /** Notification body */
  body?: string;
  /** Notification icon */
  icon?: string;
  /** Notification badge */
  badge?: string;
  /** Notification tag (replaces previous with same tag) */
  tag?: string;
  /** Require interaction (no auto-dismiss) */
  requireInteraction?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export interface Notification {
  id: NotificationId;
  type: NotificationType;
  title: string;
  message?: string;
  icon?: string;
  appId?: string;
  timestamp: Date;
  read: boolean;
  actions?: NotificationAction[];
}
```

#### Interface

```typescript
export interface NotificationsService {
  /**
   * Show in-OS toast notification
   * Requires: notify:toast
   */
  toast(options: ToastOptions): NotificationId;

  /**
   * Show browser system notification
   * Requires: notify:system
   */
  system(options: SystemNotificationOptions): Promise<NotificationId>;

  /**
   * Update app badge count
   * Requires: notify:badge
   */
  badge(appId: AppId, count: number): void;

  /**
   * Dismiss notification
   */
  dismiss(id: NotificationId): void;

  /**
   * Mark notification as read
   */
  markRead(id: NotificationId): void;

  /**
   * Mark all notifications as read
   */
  markAllRead(): void;

  /**
   * Get notification
   */
  get(id: NotificationId): Notification | undefined;

  /**
   * Get all notifications
   */
  list(filter?: { appId?: AppId; unread?: boolean }): Notification[];

  /**
   * Clear notifications
   */
  clear(filter?: { appId?: AppId; olderThan?: Date }): void;

  /**
   * Subscribe to notifications
   */
  subscribe(handler: (notification: Notification) => void): () => void;

  /**
   * Request system notification permission
   */
  requestPermission(): Promise<'granted' | 'denied' | 'default'>;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const notifications = kernel.service<NotificationsService>('notifications');

// Show toast
notifications.toast({
  type: 'success',
  title: 'File saved',
  message: 'Your changes have been saved successfully',
  duration: 3000
});

// Toast with actions
notifications.toast({
  type: 'info',
  title: 'Update available',
  message: 'Version 2.0 is available',
  duration: 0, // persistent
  actions: [
    { label: 'Update', action: () => updateApp() },
    { label: 'Later', action: () => {} }
  ]
});

// System notification
if (await notifications.requestPermission() === 'granted') {
  await notifications.system({
    title: 'Task completed',
    body: 'Image processing finished',
    icon: '/icons/check.png',
    onClick: () => windows.focus(taskWindowId)
  });
}

// Notification center
const unread = notifications.list({ unread: true });
console.log(`${unread.length} unread notifications`);
```

---

### Settings Service

Manages system and app settings with persistence and reactivity.

#### Types

```typescript
export type SettingKey = string;
export type SettingValue = string | number | boolean | object | null;

export interface SettingDescriptor<T = SettingValue> {
  /** Default value */
  default: T;
  /** Validation function */
  validate?: (value: T) => boolean;
  /** Setting description */
  description?: string;
  /** Setting category */
  category?: string;
  /** Requires restart to apply */
  requiresRestart?: boolean;
}

export interface SettingsSchema {
  [key: string]: SettingDescriptor;
}
```

#### Interface

```typescript
export interface SettingsService {
  /**
   * Register settings schema
   */
  register(namespace: string, schema: SettingsSchema): void;

  /**
   * Get setting value
   * Requires: settings:read:<namespace>
   */
  get<T = SettingValue>(key: SettingKey, defaultValue?: T): T;

  /**
   * Set setting value
   * Requires: settings:write:<namespace>
   */
  set<T = SettingValue>(key: SettingKey, value: T): void;

  /**
   * Get all settings in namespace
   */
  namespace(namespace: string): Record<string, SettingValue>;

  /**
   * Reset setting to default
   */
  reset(key: SettingKey): void;

  /**
   * Reset entire namespace
   */
  resetNamespace(namespace: string): void;

  /**
   * Subscribe to setting changes
   */
  subscribe<T = SettingValue>(key: SettingKey, handler: (value: T) => void): () => void;

  /**
   * Import settings from JSON
   */
  import(data: Record<string, SettingValue>): void;

  /**
   * Export settings as JSON
   */
  export(namespace?: string): Record<string, SettingValue>;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const settings = kernel.service<SettingsService>('settings');

// Register app settings
settings.register('text-editor', {
  'fontSize': { default: 14, validate: (v) => v >= 8 && v <= 32 },
  'theme': { default: 'light', category: 'appearance' },
  'autoSave': { default: true }
});

// Get/set settings
const fontSize = settings.get<number>('text-editor.fontSize');
settings.set('text-editor.fontSize', 16);

// Subscribe to changes
settings.subscribe('text-editor.theme', (theme) => {
  applyTheme(theme);
});

// Namespaces
const editorSettings = settings.namespace('text-editor');
settings.resetNamespace('text-editor');

// Export/import
const backup = settings.export();
settings.import(backup);
```

---

### Router Service

Handles URL-based routing, deep links, and workspace state sharing.

#### Types

```typescript
export interface Route {
  /** Route pattern (e.g., "app://<appId>/<path>") */
  pattern: string;
  /** Route handler */
  handler: (params: RouteParams) => void | Promise<void>;
  /** Route metadata */
  metadata?: Record<string, any>;
}

export interface RouteParams {
  /** Path parameters */
  params: Record<string, string>;
  /** Query parameters */
  query: Record<string, string>;
  /** Full matched path */
  path: string;
}

export interface NavigateOptions {
  /** Replace current history entry */
  replace?: boolean;
  /** Navigation state */
  state?: any;
}
```

#### Interface

```typescript
export interface RouterService {
  /**
   * Register route handler
   * Requires: router:navigate
   */
  register(route: Route): void;

  /**
   * Navigate to URL
   */
  navigate(url: string, options?: NavigateOptions): void;

  /**
   * Go back in history
   */
  back(): void;

  /**
   * Go forward in history
   */
  forward(): void;

  /**
   * Get current route
   */
  current(): RouteParams;

  /**
   * Generate shareable URL for current workspace state
   */
  share(): string;

  /**
   * Restore workspace from URL
   */
  restore(url: string): Promise<void>;

  /**
   * Subscribe to route changes
   */
  subscribe(handler: (route: RouteParams) => void): () => void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const router = kernel.service<RouterService>('router');

// Register route
router.register({
  pattern: 'app://text-editor/:file',
  handler: ({ params, query }) => {
    apps.launch({
      appId: 'text-editor',
      props: { file: params.file, mode: query.mode }
    });
  }
});

// Navigate
router.navigate('app://text-editor/documents/readme.txt?mode=edit');

// Share workspace
const shareUrl = router.share();
// URL contains: open windows, positions, app states
navigator.clipboard.writeText(shareUrl);

// Restore from URL
await router.restore(shareUrl);
```

---

### Shortcuts Service

Manages keyboard shortcuts with conflict resolution.

#### Types

```typescript
export type ShortcutId = string;
export type KeyCombo = string; // e.g., "Ctrl+S", "Cmd+Shift+P"

export interface Shortcut {
  id: ShortcutId;
  keys: KeyCombo;
  description: string;
  action: () => void | Promise<void>;
  /** Scope (global, app-specific, window-specific) */
  scope: 'global' | AppId | WindowId;
  /** Enabled state */
  enabled: boolean;
  /** Category for UI display */
  category?: string;
}

export interface ShortcutConflict {
  existing: Shortcut;
  new: Shortcut;
}
```

#### Interface

```typescript
export interface ShortcutsService {
  /**
   * Register shortcut
   */
  register(shortcut: Omit<Shortcut, 'enabled'>): ShortcutId;

  /**
   * Unregister shortcut
   */
  unregister(id: ShortcutId): void;

  /**
   * Update shortcut keys
   */
  rebind(id: ShortcutId, keys: KeyCombo): void;

  /**
   * Enable/disable shortcut
   */
  toggle(id: ShortcutId, enabled?: boolean): void;

  /**
   * Get shortcut
   */
  get(id: ShortcutId): Shortcut | undefined;

  /**
   * List shortcuts (optionally filtered by scope)
   */
  list(scope?: Shortcut['scope']): Shortcut[];

  /**
   * Check for conflicts
   */
  conflicts(keys: KeyCombo, scope: Shortcut['scope']): ShortcutConflict[];

  /**
   * Get cheat sheet (grouped by category)
   */
  cheatSheet(): Record<string, Shortcut[]>;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const shortcuts = kernel.service<ShortcutsService>('shortcuts');

// Register global shortcut
shortcuts.register({
  id: 'open-command-palette',
  keys: 'Ctrl+Shift+P',
  description: 'Open command palette',
  action: () => shell.showCommandPalette(),
  scope: 'global',
  category: 'System'
});

// App-specific shortcut
shortcuts.register({
  id: 'save-file',
  keys: 'Ctrl+S',
  description: 'Save current file',
  action: async () => await saveCurrentFile(),
  scope: 'text-editor',
  category: 'File'
});

// Check conflicts
const conflicts = shortcuts.conflicts('Ctrl+S', 'text-editor');
if (conflicts.length > 0) {
  console.warn('Shortcut conflict detected');
}

// Rebind
shortcuts.rebind('save-file', 'Ctrl+Alt+S');

// Cheat sheet
const sheet = shortcuts.cheatSheet();
// { "File": [...], "Edit": [...], "System": [...] }
```

---

### IPC Service

Provides inter-process communication via publish/subscribe channels.

#### Types

```typescript
export type Channel = string;
export type MessagePayload = any;

export interface Message {
  channel: Channel;
  payload: MessagePayload;
  sender: AppId | 'system';
  timestamp: Date;
}

export type MessageHandler = (message: Message) => void | Promise<void>;
```

#### Interface

```typescript
export interface IpcService {
  /**
   * Publish message to channel
   * Requires: ipc:publish:<channel>
   */
  publish(channel: Channel, payload: MessagePayload): void;

  /**
   * Subscribe to channel
   * Requires: ipc:subscribe:<channel>
   */
  subscribe(channel: Channel, handler: MessageHandler): () => void;

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: Channel, handler?: MessageHandler): void;

  /**
   * List active channels
   */
  channels(): Channel[];

  /**
   * Clear channel (remove all messages)
   */
  clear(channel: Channel): void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const ipc = kernel.service<IpcService>('ipc');

// Subscribe to channel
const unsubscribe = ipc.subscribe('file:changed', ({ payload }) => {
  console.log('File changed:', payload.path);
  refreshFile(payload.path);
});

// Publish to channel
ipc.publish('file:changed', { path: '/documents/readme.txt' });

// App-specific channels
ipc.subscribe(`app:text-editor:theme`, ({ payload }) => {
  applyEditorTheme(payload.theme);
});

// System channels
ipc.subscribe('system:shutdown', () => {
  cleanup();
});
```

---

### Workers Service

Manages Web Worker pool for CPU-intensive tasks.

#### Types

```typescript
export type WorkerTaskId = string;

export interface WorkerTask<T = any, R = any> {
  /** Task function (must be serializable) */
  task: (data: T) => R | Promise<R>;
  /** Input data */
  data: T;
  /** Task priority */
  priority?: number;
}

export interface WorkerResult<R = any> {
  /** Task ID */
  id: WorkerTaskId;
  /** Result data */
  data: R;
  /** Execution time (ms) */
  duration: number;
}
```

#### Interface

```typescript
export interface WorkersService {
  /**
   * Run task in worker pool
   * Requires: workers:spawn
   */
  run<T = any, R = any>(task: WorkerTask<T, R>): Promise<R>;

  /**
   * Cancel task
   */
  cancel(id: WorkerTaskId): void;

  /**
   * Get worker pool stats
   */
  stats(): {
    poolSize: number;
    active: number;
    queued: number;
    completed: number;
  };

  /**
   * Set pool size
   */
  setPoolSize(size: number): void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const workers = kernel.service<WorkersService>('workers');

// Run CPU-intensive task
const result = await workers.run({
  task: (data) => {
    // This runs in worker thread
    let sum = 0;
    for (let i = 0; i < data.count; i++) {
      sum += Math.sqrt(i);
    }
    return sum;
  },
  data: { count: 1000000 }
});

// Image processing example
const thumbnail = await workers.run({
  task: async ({ imageData, width, height }) => {
    // Heavy image manipulation
    return resizedImageData;
  },
  data: { imageData, width: 200, height: 200 }
});
```

---

### Shell Service

Provides command palette and shell-like command execution.

#### Types

```typescript
export type CommandId = string;

export interface Command {
  id: CommandId;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  keywords?: string[];
  execute: (args?: string[]) => void | Promise<void>;
  enabled?: () => boolean;
}

export interface CommandPaletteOptions {
  /** Placeholder text */
  placeholder?: string;
  /** Filter commands by category */
  category?: string;
  /** Initial search query */
  query?: string;
}
```

#### Interface

```typescript
export interface ShellService {
  /**
   * Register command
   * Requires: shell:execute
   */
  register(command: Command): void;

  /**
   * Unregister command
   */
  unregister(id: CommandId): void;

  /**
   * Execute command by ID
   */
  execute(id: CommandId, args?: string[]): Promise<void>;

  /**
   * Execute command by name/search
   */
  run(query: string): Promise<void>;

  /**
   * Get command
   */
  get(id: CommandId): Command | undefined;

  /**
   * Search commands
   */
  search(query: string): Command[];

  /**
   * List all commands
   */
  list(): Command[];

  /**
   * Show command palette UI
   */
  showCommandPalette(options?: CommandPaletteOptions): void;
}
```

#### Usage

```typescript
import { kernel } from '@/core/kernel';

const shell = kernel.service<ShellService>('shell');

// Register command
shell.register({
  id: 'new-text-file',
  name: 'New Text File',
  description: 'Create a new text file',
  icon: 'file-plus',
  category: 'File',
  keywords: ['create', 'new', 'text'],
  execute: async () => {
    const path = await promptFileName();
    await files.write(path, '');
    apps.launch({ appId: 'text-editor', props: { file: path } });
  }
});

// Execute command
await shell.execute('new-text-file');

// Search commands
const results = shell.search('new file');

// Show palette
shell.showCommandPalette({ placeholder: 'Type a command...' });
```

---

## App Development

### App Manifest Structure

Every app must export a manifest that describes its capabilities and requirements.

```typescript
// apps/text-editor/manifest.ts
import TextEditor from './TextEditor.svelte';
import type { AppManifest } from '@/core/types/app.types';

export const manifest: AppManifest = {
  id: 'text-editor',
  name: 'Text Editor',
  description: 'Edit text files with syntax highlighting',
  icon: 'file-text',
  version: '1.0.0',
  author: 'WebOS Team',
  component: TextEditor,
  
  defaultSize: { width: 800, height: 600 },
  constraints: { 
    minWidth: 400, 
    minHeight: 300 
  },
  
  capabilities: [
    'fs:read:/documents/**',
    'fs:write:/documents/**',
    'windows:open',
    'windows:manage:self',
    'notify:toast',
    'ipc:subscribe:file:*'
  ],
  
  fileTypes: ['.txt', '.md', '.json', '.js', '.ts'],
  urlSchemes: ['text://'],
  
  singleInstance: false,
  category: 'productivity'
};
```

### App Component Structure

Apps are Svelte components that receive props and context.

```svelte
<!-- apps/text-editor/TextEditor.svelte -->
<script lang="ts">
  import { kernel } from '@/core/kernel';
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  // Props passed from launcher
  interface Props {
    file?: string;
    mode?: 'view' | 'edit';
  }
  
  let { file = '/documents/untitled.txt', mode = 'edit' }: Props = $props();
  
  // Get services
  const files = kernel.service<FilesService>('files');
  const windows = kernel.service<WindowsService>('windows');
  const notifications = kernel.service<NotificationsService>('notifications');
  
  // Get window context
  const window = useWindow();
  
  // App state
  let content = $state('');
  let modified = $state(false);
  
  // Load file
  $effect(() => {
    loadFile(file);
  });
  
  async function loadFile(path: string) {
    try {
      content = await files.read(path);
      windows.update(window.id, { 
        title: `${path} - Text Editor` 
      });
    } catch (error) {
      notifications.toast({
        type: 'error',
        title: 'Failed to load file',
        message: error.message
      });
    }
  }
  
  async function save() {
    try {
      await files.write(file, content);
      modified = false;
      notifications.toast({
        type: 'success',
        title: 'File saved',
        duration: 2000
      });
    } catch (error) {
      notifications.toast({
        type: 'error',
        title: 'Failed to save',
        message: error.message
      });
    }
  }
  
  // Track modifications
  $effect(() => {
    if (content !== '') {
      modified = true;
    }
  });
</script>

<div class="text-editor">
  <toolbar>
    <button onclick={save} disabled={!modified}>
      Save
    </button>
  </toolbar>
  
  <textarea 
    bind:value={content}
    readonly={mode === 'view'}
  />
</div>

<style>
  .text-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  textarea {
    flex: 1;
    resize: none;
    padding: 1rem;
    font-family: monospace;
  }
</style>
```

### App Registration

Apps are registered at boot time or dynamically.

```typescript
// main.ts
import { kernel } from '@/core/kernel';
import { manifest as textEditorManifest } from '@/apps/text-editor/manifest';
import { manifest as fileExplorerManifest } from '@/apps/file-explorer/manifest';

// Initialize kernel
await kernel.init();

// Get services
const apps = kernel.service<AppsService>('apps');

// Register built-in apps
apps.register(textEditorManifest);
apps.register(fileExplorerManifest);

// Grant capabilities (kernel does this automatically based on manifest)
```

### Window Context

Each window gets its own context for window-specific operations.

```typescript
// contexts/window-context.svelte.ts
import { getContext, setContext } from 'svelte';

const WINDOW_CONTEXT_KEY = Symbol('window');

export interface WindowContext {
  id: WindowId;
  appId: AppId;
  close: () => void;
  minimize: () => void;
  maximize: () => void;
  focus: () => void;
}

export function setWindowContext(context: WindowContext) {
  setContext(WINDOW_CONTEXT_KEY, context);
}

export function useWindow(): WindowContext {
  const context = getContext<WindowContext>(WINDOW_CONTEXT_KEY);
  if (!context) {
    throw new Error('useWindow must be called within a window component');
  }
  return context;
}
```

---

## Type Definitions

### Complete Type Exports

```typescript
// types/index.ts
export type {
  // Kernel
  Kernel,
  KernelConfig,
  KernelEvent,
  ServiceDescriptor,
  Capability,
  
  // Services
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
  
  // Windows
  WindowId,
  WindowState,
  WindowMetadata,
  WindowOpenOptions,
  WindowUpdateOptions,
  Position,
  Dimensions,
  Bounds,
  SnapZone,
  
  // Apps
  AppId,
  AppManifest,
  AppInstance,
  AppState,
  AppLaunchOptions,
  
  // Files
  FilePath,
  FileHandle,
  FileType,
  FileStats,
  FilePermissions,
  ReadOptions,
  WriteOptions,
  ListOptions,
  WatchOptions,
  WatchEvent,
  
  // Tasks
  TaskId,
  Task,
  TaskStatus,
  TaskProgress,
  TaskOptions,
  
  // Notifications
  NotificationId,
  Notification,
  NotificationType,
  ToastOptions,
  SystemNotificationOptions,
  
  // Settings
  SettingKey,
  SettingValue,
  SettingDescriptor,
  SettingsSchema,
  
  // Router
  Route,
  RouteParams,
  NavigateOptions,
  
  // Shortcuts
  ShortcutId,
  Shortcut,
  KeyCombo,
  ShortcutConflict,
  
  // IPC
  Channel,
  Message,
  MessageHandler,
  
  // Workers
  WorkerTaskId,
  WorkerTask,
  WorkerResult,
  
  // Shell
  CommandId,
  Command,
  CommandPaletteOptions,
};
```

---

## Implementation Roadmap

### Phase 1: Kernel & Core Services (Week 1-2)

1. **Kernel implementation**
   - Service registry
   - Capability system
   - Event bus
   - Lifecycle management

2. **Windows Service**
   - Migrate existing window manager
   - Add snapping & constraints
   - Implement window context

3. **Apps Service**
   - Manifest system
   - App registry
   - Launch logic
   - Capability integration

### Phase 2: Storage & Execution (Week 3-4)

4. **Files Service**
   - OPFS adapter
   - File watching
   - Quota management
   - Upload/download bridges

5. **Tasks Service**
   - Integrate @lilbunnyrabbit/task-manager
   - Progress tracking
   - Task groups
   - Notification integration

6. **Workers Service**
   - Worker pool management
   - Task serialization
   - Load balancing

### Phase 3: User Experience (Week 5-6)

7. **Notifications Service**
   - Toast system
   - Notification center UI
   - System notification bridge
   - Badge management

8. **Settings Service**
   - Schema registration
   - Persistence (localStorage + OPFS)
   - Reactive subscriptions
   - Settings UI

9. **Shell Service**
   - Command registry
   - Command palette UI (cmdk)
   - Fuzzy search
   - Command history

### Phase 4: Advanced Features (Week 7-8)

10. **Router Service**
    - URL routing
    - Deep links
    - State serialization
    - Share system

11. **Shortcuts Service**
    - Key binding system
    - Conflict resolution
    - Cheat sheet UI
    - Customization UI

12. **IPC Service**
    - Pub/sub system
    - Channel scoping
    - Message history
    - Cross-window messaging

---

## Migration Guide

### From Current Implementation

1. **Window Manager** → Windows Service
   - `WM.windows.create()` → `windows.open()`
   - `WM.windows.focus()` → `windows.focus()`
   - Add capability checks
   - Wrap in service descriptor

2. **Settings** → Settings Service
   - Add schema registration
   - Add namespace support
   - Add validation

3. **Add Kernel Bootstrap**
   ```typescript
   // main.ts
   import { kernel } from '@/core/kernel';
   
   await kernel.init();
   
   // Register all services
   kernel.register('windows', { instance: windows });
   kernel.register('apps', { instance: apps });
   // ... etc
   ```

4. **Update App Components**
   - Add manifests
   - Use `kernel.service()` instead of direct imports
   - Add capability requests

---

## Best Practices

### Service Design

1. **Single Responsibility**: Each service handles one domain
2. **Capability-Driven**: Check capabilities before operations
3. **Reactive State**: Use Svelte 5 runes for automatic reactivity
4. **Error Handling**: Always handle errors gracefully
5. **Type Safety**: Export full TypeScript types

### App Development

1. **Declare Minimal Capabilities**: Only request what you need
2. **Handle Permission Denials**: Gracefully degrade functionality
3. **Use Window Context**: Access window-specific APIs via context
4. **Subscribe Cleanup**: Always unsubscribe in cleanup functions
5. **Progress Feedback**: Show progress for long operations

### Performance

1. **Fine-Grained Reactivity**: Use per-window stores for performance
2. **Batch Updates**: Group state changes when possible
3. **Lazy Loading**: Load apps on-demand
4. **Worker Offloading**: Use workers for CPU-intensive tasks
5. **Debounce UI Updates**: Avoid excessive re-renders

---

## Examples

### Complete App Example

See [apps/text-editor/](../apps/text-editor/) for a complete working example.

### Service Implementation Example

See [services/windows.svelte.ts](../core/services/windows.svelte.ts) for a complete service implementation.

---

## API Versioning

This API follows semantic versioning:

- **Major**: Breaking changes to service interfaces
- **Minor**: New services or backward-compatible additions
- **Patch**: Bug fixes and documentation updates

Current version: **1.0.0-draft**

---

_For questions or contributions, see [CONTRIBUTING.md](./CONTRIBUTING.md)_


