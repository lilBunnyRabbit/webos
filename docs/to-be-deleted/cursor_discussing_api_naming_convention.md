# Discussing api naming conventions in svelte
_Exported on 10/22/2025 at 21:20:42 GMT+2 from Cursor (1.7.44)_

---

**User**

Lets talk about the "api" naming. I need/have api for

- handling window instances and their "visual" state so maximized, minimized, snapped, etc
- handling window instance - some internal window api as notifications, file picker, etc. and with current design (for performance reasons) size and position is also stored here
- handling apps - this was a seprate hook that just opened a new window with the created app instance
- handling files - file api
- handling version - checking every few minutes if there is a new version

I need to decide on the naming and what should each api/context do in svelte environment

---

**Cursor**

I'll help you think through the API naming and responsibilities for your Svelte application. Let me first look at the document you have open to understand the current context.

Based on your context document and the APIs you need, let me help you design a clean naming structure for your Svelte WebOS. Here's my recommendation:

## Recommended API Structure & Naming

### 1. **Window Manager API** (Global Store)
**File:** `src/core/stores/window-manager.svelte.ts`  
**Export:** `WindowManager` or `WindowAPI`

**Responsibilities:**
- Window lifecycle (open, close)
- Visual state transitions (maximize, minimize, restore)
- Window positioning & snapping
- Z-order management
- Window list/ordering

```typescript
export const WindowManager = {
  // Lifecycle
  open(appId: AppId, props?: any): WindowId
  close(windowId: WindowId): void
  closeAll(): void
  
  // Visual State
  maximize(windowId: WindowId): void
  minimize(windowId: WindowId): void
  restore(windowId: WindowId): void
  snap(windowId: WindowId, zone: SnapZone): void
  
  // Z-order
  focus(windowId: WindowId): void
  bringToFront(windowId: WindowId): void
  
  // Queries
  getWindow(windowId: WindowId): WindowInstance | undefined
  getFocusedWindow(): WindowId | null
}
```

---

### 2. **Window Store** (Per-Window Context)
**File:** `src/core/stores/window-store.svelte.ts`  
**Export:** `createWindowStore()`, `WindowStore` type  
**Context File:** `src/core/contexts/window-context.svelte.ts`  
**Export:** `useWindow()`, `setWindowContext()`

**Responsibilities:**
- Per-window app-specific state (zoom, selection, view mode)
- Window-scoped UI state
- Performance-critical properties (size, position can be here OR in WindowManager)

```typescript
// Per-window isolated state
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    // Size & position (if you want it here for performance)
    size: { width: 800, height: 600 },
    position: { x: 100, y: 100 },
    
    // App-specific state
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as const,
    // ... extend per-app needs
  });

  return {
    get windowId() { return state.windowId; },
    get size() { return state.size; },
    get position() { return state.position; },
    // ... methods
  };
}

// Context access
export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

**Performance Note:** If size/position changes frequently (during drag/resize), keeping them in the per-window store can be more efficient than in the global WindowManager.

---

### 3. **System API** (Global Store)
**File:** `src/core/stores/system.svelte.ts`  
**Export:** `SystemAPI` or just `System`

**Responsibilities:**
- System-level dialogs (notifications, alerts, file picker, confirmations)
- System services that any window can use
- NOT window-specific

```typescript
export const System = {
  // Notifications
  notify(message: string, options?: NotificationOptions): void
  
  // Dialogs
  showFilePicker(options: FilePickerOptions): Promise<FileHandle[]>
  showAlert(message: string, type: 'info' | 'warning' | 'error'): Promise<void>
  showConfirm(message: string): Promise<boolean>
  showPrompt(message: string, defaultValue?: string): Promise<string | null>
  
  // System info
  getSystemInfo(): SystemInfo
}
```

---

### 4. **App Manager API** (Global Store)
**File:** `src/core/stores/app-manager.svelte.ts`  
**Export:** `AppManager` or `Apps`

**Responsibilities:**
- App registration
- App metadata (icons, names, default sizes)
- Launch app (delegates to WindowManager internally)

```typescript
export const AppManager = {
  // Launch app (creates window + returns windowId)
  launch(appId: AppId, props?: any): WindowId
  
  // App registry
  register(appId: AppId, config: AppConfig): void
  getApp(appId: AppId): AppConfig | undefined
  getAllApps(): AppConfig[]
  
  // App queries
  isInstalled(appId: AppId): boolean
  getDefaultSize(appId: AppId): Dimensions
}
```

**Alternative:** You could merge this with `WindowManager` if they're tightly coupled. Then you'd have:

```typescript
WindowManager.open(appId, props) // opens window with app
// vs
AppManager.launch(appId, props) // launches app (which opens window)
```

I'd keep them separate for clarity - **`AppManager.launch()`** is user-facing ("launch the app"), while **`WindowManager.open()`** is more low-level.

---

### 5. **File System API** (Global Store)
**File:** `src/core/stores/filesystem.svelte.ts`  
**Export:** `FileSystem` or `FS`

**Responsibilities:**
- File operations (read, write, delete, move, copy)
- Directory operations
- File metadata
- File watching (if needed)

```typescript
export const FileSystem = {
  // File operations
  readFile(path: string): Promise<string | ArrayBuffer>
  writeFile(path: string, content: string | ArrayBuffer): Promise<void>
  deleteFile(path: string): Promise<void>
  moveFile(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  
  // Directory operations
  readDir(path: string): Promise<FileEntry[]>
  createDir(path: string): Promise<void>
  deleteDir(path: string, recursive?: boolean): Promise<void>
  
  // Metadata
  getFileInfo(path: string): Promise<FileInfo>
  exists(path: string): Promise<boolean>
}
```

---

### 6. **Version Manager API** (Global Store)
**File:** `src/core/stores/version-manager.svelte.ts`  
**Export:** `VersionManager` or `Updater`

**Responsibilities:**
- Version checking
- Update notifications
- Version polling

```typescript
export const VersionManager = {
  // Current version
  getCurrentVersion(): string
  
  // Check for updates
  checkForUpdates(): Promise<VersionInfo>
  
  // Auto-check setup
  startAutoCheck(intervalMs: number): void
  stopAutoCheck(): void
  
  // State
  get hasUpdate(): boolean
  get latestVersion(): string | null
  get lastChecked(): Date | null
}
```

---

## Summary Table

| API Name | File | Scope | Purpose |
|----------|------|-------|---------|
| `WindowManager` | `window-manager.svelte.ts` | Global | Window lifecycle, visual state, z-order |
| `WindowStore` | `window-store.svelte.ts` + context | Per-window | App-specific state, size/position (optional) |
| `System` | `system.svelte.ts` | Global | Notifications, dialogs, file picker |
| `AppManager` | `app-manager.svelte.ts` | Global | App registry, launching |
| `FileSystem` | `filesystem.svelte.ts` | Global | File/directory operations |
| `VersionManager` | `version-manager.svelte.ts` | Global | Version checking, updates |

---

## About Size & Position

You mentioned size and position for performance reasons. Here are two approaches:

### **Option A: Keep in WindowManager (Centralized)**
```typescript
// window-manager.svelte.ts
export const WindowManager = {
  setSize(windowId: WindowId, size: Dimensions): void
  setPosition(windowId: WindowId, position: Position): void
  getSize(windowId: WindowId): Dimensions
  getPosition(windowId: WindowId): Position
}
```

**Pros:** Centralized control, easier to implement constraints  
**Cons:** All windows update when any window moves (if using global reactive state)

### **Option B: Keep in WindowStore (Per-Window)**
```typescript
// window-store.svelte.ts (per-window)
export function createWindowStore(windowId: string) {
  const state = $state({
    size: { width: 800, height: 600 },
    position: { x: 100, y: 100 },
  });
  
  return {
    setSize(size: Dimensions) { state.size = size; },
    setPosition(pos: Position) { state.position = pos; },
  };
}
```

**Pros:** Isolated reactivity - only that window re-renders  
**Cons:** WindowManager doesn't have direct access (but can via instance.store)

**My Recommendation:** Use **Option B** (WindowStore) for size/position if you're dragging/resizing frequently. The per-window store isolation prevents unnecessary re-renders of other windows.

---

## Usage Examples

```typescript
// Opening an app
const windowId = AppManager.launch('file-explorer', { path: '/home' });

// Window operations
WindowManager.maximize(windowId);
WindowManager.focus(windowId);

// System dialogs
const files = await System.showFilePicker({ multiple: true });
System.notify('File saved successfully');

// File operations
const content = await FileSystem.readFile('/documents/file.txt');
await FileSystem.writeFile('/documents/new.txt', content);

// Version checking
VersionManager.startAutoCheck(5 * 60 * 1000); // Check every 5 minutes
if (VersionManager.hasUpdate) {
  System.notify(`Update available: ${VersionManager.latestVersion}`);
}
```

```svelte
<!-- Inside a window component -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(zoom + 10)}>Zoom In</button>
```

Does this structure make sense for your needs? Would you like me to dive deeper into any specific API?

```typescript
export const WindowManager = {
  // Lifecycle
  open(appId: AppId, props?: any): WindowId
  close(windowId: WindowId): void
  closeAll(): void
  
  // Visual State
  maximize(windowId: WindowId): void
  minimize(windowId: WindowId): void
  restore(windowId: WindowId): void
  snap(windowId: WindowId, zone: SnapZone): void
  
  // Z-order
  focus(windowId: WindowId): void
  bringToFront(windowId: WindowId): void
  
  // Queries
  getWindow(windowId: WindowId): WindowInstance | undefined
  getFocusedWindow(): WindowId | null
}
```

```typescript
// Per-window isolated state
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    // Size & position (if you want it here for performance)
    size: { width: 800, height: 600 },
    position: { x: 100, y: 100 },
    
    // App-specific state
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as const,
    // ... extend per-app needs
  });

  return {
    get windowId() { return state.windowId; },
    get size() { return state.size; },
    get position() { return state.position; },
    // ... methods
  };
}

// Context access
export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```typescript
export const System = {
  // Notifications
  notify(message: string, options?: NotificationOptions): void
  
  // Dialogs
  showFilePicker(options: FilePickerOptions): Promise<FileHandle[]>
  showAlert(message: string, type: 'info' | 'warning' | 'error'): Promise<void>
  showConfirm(message: string): Promise<boolean>
  showPrompt(message: string, defaultValue?: string): Promise<string | null>
  
  // System info
  getSystemInfo(): SystemInfo
}
```

```typescript
export const AppManager = {
  // Launch app (creates window + returns windowId)
  launch(appId: AppId, props?: any): WindowId
  
  // App registry
  register(appId: AppId, config: AppConfig): void
  getApp(appId: AppId): AppConfig | undefined
  getAllApps(): AppConfig[]
  
  // App queries
  isInstalled(appId: AppId): boolean
  getDefaultSize(appId: AppId): Dimensions
}
```

```typescript
WindowManager.open(appId, props) // opens window with app
// vs
AppManager.launch(appId, props) // launches app (which opens window)
```

```typescript
export const FileSystem = {
  // File operations
  readFile(path: string): Promise<string | ArrayBuffer>
  writeFile(path: string, content: string | ArrayBuffer): Promise<void>
  deleteFile(path: string): Promise<void>
  moveFile(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  
  // Directory operations
  readDir(path: string): Promise<FileEntry[]>
  createDir(path: string): Promise<void>
  deleteDir(path: string, recursive?: boolean): Promise<void>
  
  // Metadata
  getFileInfo(path: string): Promise<FileInfo>
  exists(path: string): Promise<boolean>
}
```

```typescript
export const VersionManager = {
  // Current version
  getCurrentVersion(): string
  
  // Check for updates
  checkForUpdates(): Promise<VersionInfo>
  
  // Auto-check setup
  startAutoCheck(intervalMs: number): void
  stopAutoCheck(): void
  
  // State
  get hasUpdate(): boolean
  get latestVersion(): string | null
  get lastChecked(): Date | null
}
```

```typescript
// window-manager.svelte.ts
export const WindowManager = {
  setSize(windowId: WindowId, size: Dimensions): void
  setPosition(windowId: WindowId, position: Position): void
  getSize(windowId: WindowId): Dimensions
  getPosition(windowId: WindowId): Position
}
```

```typescript
// window-store.svelte.ts (per-window)
export function createWindowStore(windowId: string) {
  const state = $state({
    size: { width: 800, height: 600 },
    position: { x: 100, y: 100 },
  });
  
  return {
    setSize(size: Dimensions) { state.size = size; },
    setPosition(pos: Position) { state.position = pos; },
  };
}
```

```typescript
// Opening an app
const windowId = AppManager.launch('file-explorer', { path: '/home' });

// Window operations
WindowManager.maximize(windowId);
WindowManager.focus(windowId);

// System dialogs
const files = await System.showFilePicker({ multiple: true });
System.notify('File saved successfully');

// File operations
const content = await FileSystem.readFile('/documents/file.txt');
await FileSystem.writeFile('/documents/new.txt', content);

// Version checking
VersionManager.startAutoCheck(5 * 60 * 1000); // Check every 5 minutes
if (VersionManager.hasUpdate) {
  System.notify(`Update available: ${VersionManager.latestVersion}`);
}
```

```svelte
<!-- Inside a window component -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(zoom + 10)}>Zoom In</button>
```

