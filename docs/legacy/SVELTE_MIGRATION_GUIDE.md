# Complete Svelte 5 Migration Guide for WebOS

**Decision Date:** October 22, 2025  
**Target Framework:** Svelte 5 (with Runes)  
**Build Tool:** Vite  
**Language:** TypeScript

---

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Phase 1: Project Setup](#phase-1-project-setup)
3. [Phase 2: Core Infrastructure](#phase-2-core-infrastructure)
4. [Phase 3: Components Migration](#phase-3-components-migration)
5. [Phase 4: Apps Migration](#phase-4-apps-migration)
6. [Phase 5: Testing & Polish](#phase-5-testing--polish)
7. [File-by-File Mapping](#file-by-file-mapping)
8. [Breaking Changes & Gotchas](#breaking-changes--gotchas)
9. [Performance Optimization](#performance-optimization)
10. [Rollback Plan](#rollback-plan)

---

## Migration Overview

### What Changes
- ✅ **100% of React components** → Svelte components
- ✅ **All contexts/providers** → Svelte stores (runes-based)
- ✅ **Component file extensions** → `.tsx` to `.svelte`
- ✅ **JSX syntax** → Svelte template syntax
- ✅ **Hooks** → Runes (`$state`, `$derived`, `$effect`)

### What Stays the Same
- ✅ **API layer** (`src/core/api/`) - 100% unchanged
- ✅ **Utilities** (`src/core/lib/`) - 100% unchanged
- ✅ **Types** (`src/core/types/`) - 100% unchanged
- ✅ **Constants** - 100% unchanged
- ✅ **Tailwind CSS** - 100% unchanged
- ✅ **OPFS logic** - 100% unchanged

### Estimated Timeline
- **Setup:** 2-4 hours
- **Core stores:** 1-2 days
- **Core components:** 2-3 days
- **Apps migration:** 2-3 days
- **Testing & polish:** 1-2 days
- **Total:** 6-10 days

---

## Phase 1: Project Setup

### Step 1.1: Create New Branch

```bash
git checkout -b feat/svelte-migration
git push -u origin feat/svelte-migration
```

### Step 1.2: Install Svelte Dependencies

```bash
# Remove React dependencies
npm uninstall react react-dom @types/react @types/react-dom

# Install Svelte core
npm install svelte@^5.0.0
npm install -D @sveltejs/vite-plugin-svelte
npm install -D svelte-check

# Install Svelte ecosystem
npm install -D @sveltejs/adapter-static
npm install -D svelte-preprocess

# Keep these (they work with Svelte)
# - vite (already installed)
# - typescript (already installed)
# - tailwindcss (already installed)
# - @tanstack/svelte-query (install this)
npm install @tanstack/svelte-query

# Svelte UI libraries
npm install bits-ui # Headless UI components (like Radix)
npm install formsnack # Form handling
npm install mode-watcher # Dark mode
```

### Step 1.3: Update Vite Config

**File:** `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Enable runes mode
        runes: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
  },
});
```

### Step 1.4: Create Svelte Config

**File:** `svelte.config.js`

```javascript
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
};
```

### Step 1.5: Update TypeScript Config

**File:** `tsconfig.json`

```json
{
  "extends": "@tsconfig/svelte/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Step 1.6: Update Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-check --tsconfig ./tsconfig.json --watch"
  }
}
```

### Step 1.7: Install shadcn-svelte (Optional but Recommended)

```bash
npx shadcn-svelte@latest init
```

Follow prompts:
- Style: **New York** (to match your current setup)
- Base color: **Neutral**
- CSS variables: **Yes**
- Tailwind prefix: **(none)**

### Step 1.8: Update index.html

**File:** `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/logo.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebOS</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### Step 1.9: Create New Entry Point

**File:** `src/main.ts`

```typescript
import './index.css';
import App from './App.svelte';

const app = new App({
  target: document.getElementById('app')!,
});

export default app;
```

### Step 1.10: Verify Setup

```bash
npm run check
npm run dev
```

You should see Vite start, though the app won't work yet since we haven't migrated components.

---

## Phase 2: Core Infrastructure

### Step 2.1: Keep Unchanged Files

These directories need **zero changes**:

```
src/core/api/          ✅ Copy as-is
src/core/lib/          ✅ Copy as-is
src/core/types/        ✅ Copy as-is
src/core/constants/    ✅ Copy as-is
src/core/emitters/     ✅ Copy as-is (if using events)
```

**Action:** No changes needed! These are pure TypeScript.

### Step 2.2: Migrate Window Manager Store

**File:** `src/core/stores/window-manager.svelte.ts`

```typescript
import { v4 as uuid } from 'uuid';
import type { AppId } from '@/apps';
import { Apps } from '@/apps';
import { Flags } from '@/core/lib/flags';
import { Order } from '@/core/lib/order';
import { 
  calculateWindowPosition, 
  adjustWindowSize 
} from '@/core/lib/windows';

// Window flags
export const WindowFlag = {
  MINIMIZED: 'minimized',
  MAXIMIZED: 'maximized',
} as const;

export type WindowFlag = (typeof WindowFlag)[keyof typeof WindowFlag];

// Window Manager flags
export const WindowManagerFlag = {
  PROFILER_ENABLED: 'profiler-enabled',
} as const;

export type WindowManagerFlag = (typeof WindowManagerFlag)[keyof typeof WindowManagerFlag];

// Types
export type WindowId = string;

export type SnapZone =
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'bottom'
  | null;

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface WindowInstance {
  id: WindowId;
  appId: AppId;
  props: any;
  flags: Flags<WindowFlag>;
  position: Position;
  size: Dimensions;
  snapZone: SnapZone;
  createdAt: Date;
  // Per-window context (extendable!)
  context: Record<string, any>;
}

// State with runes
const state = $state({
  flags: new Flags<WindowManagerFlag>(),
  index: {} as Record<WindowId, WindowInstance>,
  order: new Order<WindowId>(),
});

// Derived values
export const windows = $derived(state.index);
export const windowOrder = $derived(state.order);
export const windowManagerFlags = $derived(state.flags);

// Container bounds (set by WindowManagerContainer)
let containerBounds = $state({
  x: 0,
  y: 0,
  width: window.innerWidth,
  height: window.innerHeight,
});

export const bounds = $derived(containerBounds);

// Imperative API
export const WindowAPI = {
  // Set container bounds
  setContainerBounds(newBounds: typeof containerBounds) {
    containerBounds = newBounds;
  },

  // Open a new window
  open<T extends AppId>(appId: T, props?: any, defaults?: Partial<WindowInstance>): WindowId {
    const id = uuid();
    const config = Apps[appId];

    const size = adjustWindowSize(
      defaults?.size || config.WINDOW_CONFIG?.size || { width: 600, height: 400 }
    );

    state.index[id] = {
      id,
      appId,
      props: props || {},
      flags: defaults?.flags || new Flags<WindowFlag>(),
      position: defaults?.position || calculateWindowPosition(size, state.order.size),
      size,
      snapZone: defaults?.snapZone || null,
      createdAt: new Date(),
      context: {},
    };

    state.order = state.order.add(id).clone();

    // Handle profiler flag
    if (appId === 'profiler') {
      state.flags = state.flags.add(WindowManagerFlag.PROFILER_ENABLED);
    }

    return id;
  },

  // Close a window
  close(windowId: WindowId) {
    const window = state.index[windowId];
    if (!window) return;

    const appId = window.appId;
    delete state.index[windowId];
    state.order = state.order.remove(windowId).clone();

    // Handle profiler flag
    if (
      appId === 'profiler' &&
      !Object.values(state.index).some((w) => w.appId === 'profiler')
    ) {
      state.flags = state.flags.remove(WindowManagerFlag.PROFILER_ENABLED);
    }
  },

  // Focus a window
  focus(windowId: WindowId) {
    const window = state.index[windowId];
    if (!window) return;

    // If minimized, restore it
    if (window.flags.has(WindowFlag.MINIMIZED)) {
      window.flags = window.flags.clone().remove(WindowFlag.MINIMIZED);
    }

    // Move to front if not already focused
    if (!state.order.isFocused(windowId)) {
      state.order = state.order.toFront(windowId).clone();
    }
  },

  // Toggle minimize
  minimize(windowId: WindowId) {
    const window = state.index[windowId];
    if (!window) return;
    window.flags = window.flags.clone().toggle(WindowFlag.MINIMIZED);
  },

  // Toggle maximize
  maximize(windowId: WindowId) {
    const window = state.index[windowId];
    if (!window) return;
    window.flags = window.flags.clone().toggle(WindowFlag.MAXIMIZED);

    // Focus if maximizing
    if (window.flags.has(WindowFlag.MAXIMIZED) && !state.order.isFocused(windowId)) {
      state.order = state.order.toFront(windowId).clone();
    }
  },

  // Minimize all windows
  minimizeAll() {
    Object.values(state.index).forEach((window) => {
      window.flags = window.flags.clone().add(WindowFlag.MINIMIZED);
    });
  },

  // Restore all windows
  restoreAll() {
    Object.values(state.index).forEach((window) => {
      window.flags = window.flags.clone().remove(WindowFlag.MINIMIZED);
    });
  },

  // Set snap zone
  setSnapZone(windowId: WindowId, snapZone: SnapZone) {
    const window = state.index[windowId];
    if (!window) return;
    window.snapZone = snapZone;
  },

  // Update window position
  setPosition(windowId: WindowId, position: Position) {
    const window = state.index[windowId];
    if (!window) return;
    window.position = position;
  },

  // Update window size
  setSize(windowId: WindowId, size: Dimensions) {
    const window = state.index[windowId];
    if (!window) return;
    window.size = size;
  },

  // Per-window context (extendable without rerenders!)
  setContext(windowId: WindowId, key: string, value: any) {
    const window = state.index[windowId];
    if (!window) return;
    window.context[key] = value;
  },

  getContext(windowId: WindowId, key: string) {
    return state.index[windowId]?.context[key];
  },

  // Get window by ID
  getWindow(windowId: WindowId): WindowInstance | undefined {
    return state.index[windowId];
  },

  // Get all windows
  getWindows(): Record<WindowId, WindowInstance> {
    return state.index;
  },

  // Get window z-index
  getZIndex(windowId: WindowId): number {
    return state.order.get(windowId);
  },
};

// Keyboard shortcuts
if (typeof window !== 'undefined') {
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        switch (e.key) {
          case 'ArrowDown':
            WindowAPI.minimizeAll();
            e.preventDefault();
            break;
          case 'ArrowUp':
            WindowAPI.restoreAll();
            e.preventDefault();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });
}
```

**Migration notes:**
- ✅ Replaces 6 React files with 1 Svelte file
- ✅ Uses `$state` rune for reactivity
- ✅ Uses `$derived` for computed values
- ✅ Uses `$effect` for side effects (keyboard shortcuts)
- ✅ Imperative API is now natural and clean!

### Step 2.3: Migrate Settings Store

**File:** `src/core/stores/settings.svelte.ts`

```typescript
interface SettingsState {
  theme: {
    background: string;
    foreground: string;
    primary: string;
    secondary: string;
    accent: string;
  };
  taskbar: {
    position: 'left' | 'right' | 'top' | 'bottom';
  };
}

// Helper to update CSS variables
function updateTheme(theme: Partial<SettingsState['theme']>) {
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
}

// Load from localStorage
function loadSettings(): SettingsState {
  const stored = localStorage.getItem('settings');
  if (stored) {
    return JSON.parse(stored);
  }

  const computed = getComputedStyle(document.documentElement);
  return {
    theme: {
      background: computed.getPropertyValue('--background').trim(),
      foreground: computed.getPropertyValue('--foreground').trim(),
      primary: computed.getPropertyValue('--primary').trim(),
      secondary: computed.getPropertyValue('--secondary').trim(),
      accent: computed.getPropertyValue('--accent').trim(),
    },
    taskbar: {
      position: 'bottom',
    },
  };
}

// State
const state = $state<SettingsState>(loadSettings());

// Derived
export const settings = $derived(state);

// Auto-save effect
$effect(() => {
  localStorage.setItem('settings', JSON.stringify(state));
  updateTheme(state.theme);
});

// API
export const SettingsAPI = {
  setTheme(theme: Partial<SettingsState['theme']>) {
    Object.assign(state.theme, theme);
  },

  setTaskbarPosition(position: SettingsState['taskbar']['position']) {
    state.taskbar.position = position;
  },

  reset() {
    const initial = loadSettings();
    Object.assign(state, initial);
  },

  getState(): SettingsState {
    return state;
  },
};

// Initialize theme
updateTheme(state.theme);
```

### Step 2.4: Migrate Desktop Store

**File:** `src/core/stores/desktop.svelte.ts`

```typescript
// Copy your existing desktop.store.ts and convert to runes
import { writable } from 'svelte/store';

// Or use runes if it's simple state
const state = $state({
  // Your desktop state
});

export const desktop = $derived(state);

export const DesktopAPI = {
  // Your desktop methods
};
```

### Step 2.5: Migrate Version Store

**File:** `src/core/stores/version.svelte.ts`

```typescript
interface VersionInfo {
  version: string;
  buildDate: string;
  commit?: string;
}

const state = $state({
  current: null as VersionInfo | null,
  available: null as VersionInfo | null,
  isChecking: false,
  isUpdating: false,
});

export const version = $derived(state);

export const VersionAPI = {
  async checkForUpdates() {
    state.isChecking = true;
    try {
      const response = await fetch('/version.json');
      const data = await response.json();
      state.available = data;
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      state.isChecking = false;
    }
  },

  async applyUpdate() {
    state.isUpdating = true;
    try {
      // Reload the page to get new version
      window.location.reload();
    } catch (error) {
      console.error('Failed to apply update:', error);
      state.isUpdating = false;
    }
  },

  hasUpdate(): boolean {
    if (!state.current || !state.available) return false;
    return state.current.version !== state.available.version;
  },
};

// Auto-check on mount
if (typeof window !== 'undefined') {
  $effect(() => {
    VersionAPI.checkForUpdates();
  });
}
```

### Step 2.6: Create File Manager Store with TanStack Query

**File:** `src/core/stores/file-manager.svelte.ts`

```typescript
import { QueryClient } from '@tanstack/svelte-query';
import * as FileAPI from '@/core/api/file';
import type { FileSystemItem } from '@/core/api/file.types';

// Query client (singleton)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: true,
    },
  },
});

// Query keys
export const fileKeys = {
  all: ['files'] as const,
  directory: (path: string[]) => [...fileKeys.all, 'directory', path] as const,
  item: (path: string[]) => [...fileKeys.all, 'item', path] as const,
};

// Selection state (per-window or global)
const state = $state({
  selectedItems: new Set<string>(),
});

export const fileManager = $derived(state);

// Imperative API
export const FileManagerAPI = {
  // Get directory handle
  async getHandle(path: string[]): Promise<FileSystemDirectoryHandle> {
    let handle = await FileAPI.getOPFSRoot();
    for (const segment of path) {
      handle = await FileAPI.getDirectoryHandle(handle, segment);
    }
    return handle;
  },

  // Create folder with cache invalidation
  async createFolder(path: string[], name: string) {
    const handle = await this.getHandle(path);
    await FileAPI.createDirectory(handle, name);
    
    // Invalidate cache - all windows update!
    queryClient.invalidateQueries({ queryKey: fileKeys.directory(path) });
  },

  // Delete item
  async deleteItem(path: string[], name: string) {
    const handle = await this.getHandle(path);
    await FileAPI.deleteEntry(handle, name, { recursive: true });
    
    queryClient.invalidateQueries({ queryKey: fileKeys.directory(path) });
  },

  // Upload file
  async uploadFile(path: string[], file: File) {
    const handle = await this.getHandle(path);
    const fileHandle = await handle.getFileHandle(file.name, { create: true });
    await FileAPI.writeFile(fileHandle, file);
    
    queryClient.invalidateQueries({ queryKey: fileKeys.directory(path) });
  },

  // Selection management
  selectItem(name: string) {
    state.selectedItems.has(name)
      ? state.selectedItems.delete(name)
      : state.selectedItems.add(name);
  },

  clearSelection() {
    state.selectedItems.clear();
  },

  isSelected(name: string): boolean {
    return state.selectedItems.has(name);
  },
};
```

---

## Phase 3: Components Migration

### Step 3.1: Main App Component

**File:** `src/App.svelte`

```svelte
<script lang="ts">
  import OS from '@/core/components/OS.svelte';
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import { queryClient } from '@/core/stores/file-manager.svelte';
</script>

<QueryClientProvider client={queryClient}>
  <OS />
</QueryClientProvider>
```

### Step 3.2: OS Component

**File:** `src/core/components/OS.svelte`

```svelte
<script lang="ts">
  import Desktop from './desktop/Desktop.svelte';
  import Taskbar from './taskbar/Taskbar.svelte';
  import WindowManagerContainer from './window/WindowManagerContainer.svelte';
  import VersionNotification from './VersionNotification.svelte';
  import { settings } from '@/core/stores/settings.svelte';
</script>

<div class="h-screen w-screen overflow-hidden flex flex-col bg-background">
  <!-- Desktop area -->
  <div class="flex-1 relative">
    <Desktop />
    <WindowManagerContainer />
  </div>

  <!-- Taskbar -->
  <Taskbar position={settings.taskbar.position} />

  <!-- Version notification -->
  <VersionNotification />
</div>
```

### Step 3.3: Window Component

**File:** `src/core/components/window/Window.svelte`

```svelte
<script lang="ts">
  import { WindowAPI, windows, windowOrder, WindowFlag } from '@/core/stores/window-manager.svelte';
  import { Apps } from '@/apps';
  import WindowTitle from './WindowTitle.svelte';
  import WindowContent from './WindowContent.svelte';
  import ResizeHandlers from './ResizeHandlers.svelte';
  import { cn } from '@/core/lib/utils';

  let { windowId } = $props<{ windowId: string }>();

  // Reactive window data
  const instance = $derived(windows[windowId]);
  const isMinimized = $derived(instance?.flags.has(WindowFlag.MINIMIZED) || false);
  const isMaximized = $derived(instance?.flags.has(WindowFlag.MAXIMIZED) || false);
  const zIndex = $derived(WindowAPI.getZIndex(windowId));

  // App component (lazy loaded)
  let AppComponent = $state<any>(null);
  let loading = $state(true);
  let error = $state<Error | null>(null);

  // Load app component
  $effect(() => {
    if (!instance) return;

    loading = true;
    error = null;

    Apps[instance.appId]
      .App()
      .then((module) => {
        AppComponent = module.default;
        loading = false;
      })
      .catch((err) => {
        error = err;
        loading = false;
      });
  });

  // Focus handler
  function handleMouseDown() {
    WindowAPI.focus(windowId);
  }
</script>

{#if instance}
  <div
    class={cn(
      'window absolute overflow-hidden pointer-events-auto',
      'bg-foreground shadow-window rounded-sm border-2 border-foreground',
      'grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors',
      isMaximized && 'rounded-none border-none',
      instance.snapZone && !isMaximized && 'bg-primary border-primary'
    )}
    style:visibility={isMinimized ? 'hidden' : 'visible'}
    style:opacity={isMinimized ? 0 : 1}
    style:pointer-events={isMinimized ? 'none' : 'auto'}
    style:inset={isMaximized ? '0' : null}
    style:left={!isMaximized ? `${instance.position.x}px` : null}
    style:top={!isMaximized ? `${instance.position.y}px` : null}
    style:width={!isMaximized ? `${instance.size.width}px` : null}
    style:height={!isMaximized ? `${instance.size.height}px` : null}
    style:z-index={zIndex}
    onmousedown={handleMouseDown}
    role="dialog"
    aria-label={Apps[instance.appId].NAME}
  >
    <WindowTitle {windowId} {instance} />
    
    <WindowContent {loading} {error} {windowId}>
      {#if AppComponent}
        <svelte:component this={AppComponent} {...instance.props} {windowId} />
      {/if}
    </WindowContent>

    {#if !isMaximized && !isMinimized && !instance.snapZone}
      <ResizeHandlers {windowId} />
    {/if}
  </div>
{/if}
```

### Step 3.4: Window Title Component

**File:** `src/core/components/window/WindowTitle.svelte`

```svelte
<script lang="ts">
  import { WindowAPI } from '@/core/stores/window-manager.svelte';
  import { Apps } from '@/apps';
  import type { WindowInstance } from '@/core/stores/window-manager.svelte';
  import { Minus, Square, X } from 'lucide-svelte';

  let { windowId, instance } = $props<{
    windowId: string;
    instance: WindowInstance;
  }>();

  const AppIcon = Apps[instance.appId].ICON;
</script>

<div
  class="window-title flex items-center gap-2 px-3 py-2 bg-foreground border-b border-border"
  data-window-drag-handle
>
  <!-- Icon & Title -->
  <svelte:component this={AppIcon} class="w-4 h-4" />
  <span class="flex-1 text-sm font-medium truncate">
    {Apps[instance.appId].NAME}
  </span>

  <!-- Window controls -->
  <div class="flex items-center gap-1">
    <button
      class="p-1 hover:bg-accent rounded"
      onclick={() => WindowAPI.minimize(windowId)}
      aria-label="Minimize"
    >
      <Minus class="w-4 h-4" />
    </button>

    <button
      class="p-1 hover:bg-accent rounded"
      onclick={() => WindowAPI.maximize(windowId)}
      aria-label="Maximize"
    >
      <Square class="w-4 h-4" />
    </button>

    <button
      class="p-1 hover:bg-destructive hover:text-destructive-foreground rounded"
      onclick={() => WindowAPI.close(windowId)}
      aria-label="Close"
    >
      <X class="w-4 h-4" />
    </button>
  </div>
</div>
```

### Step 3.5: Window Content Component

**File:** `src/core/components/window/WindowContent.svelte`

```svelte
<script lang="ts">
  import { Loader, AlertTriangle, RotateCcw } from 'lucide-svelte';
  import { WindowAPI } from '@/core/stores/window-manager.svelte';

  let {
    children,
    loading = $bindable(false),
    error = $bindable<Error | null>(null),
    windowId,
  } = $props<{
    children?: any;
    loading?: boolean;
    error?: Error | null;
    windowId: string;
  }>();

  // Get zoom from window context
  const zoom = $derived(WindowAPI.getContext(windowId, 'zoom') || 1);

  function handleRetry() {
    const instance = WindowAPI.getWindow(windowId);
    if (!instance) return;

    WindowAPI.close(windowId);
    setTimeout(() => {
      WindowAPI.open(instance.appId, instance.props);
    }, 100);
  }
</script>

<div class="overflow-hidden bg-background rounded-t-sm">
  <div
    class="h-full w-full overflow-auto @container"
    style:zoom
  >
    {#if loading}
      <!-- Loading state -->
      <div class="flex items-center justify-center h-full">
        <Loader class="w-8 h-8 animate-spin text-primary" />
      </div>
    {:else if error}
      <!-- Error state -->
      <div class="flex flex-col items-center justify-center h-full text-center px-6 py-8">
        <AlertTriangle class="w-12 h-12 text-accent mb-4" />
        <h2 class="mb-2 text-xl font-semibold">Failed to Load App</h2>
        <p class="mb-6 text-sm opacity-70 max-w-md">
          {error.message}
        </p>
        <button
          class="px-4 py-2 rounded bg-primary text-background"
          onclick={handleRetry}
        >
          <RotateCcw class="w-4 h-4 inline mr-2" />
          Retry
        </button>
      </div>
    {:else}
      <!-- App content -->
      {@render children?.()}
    {/if}
  </div>
</div>
```

### Step 3.6: Window Manager Container

**File:** `src/core/components/window/WindowManagerContainer.svelte`

```svelte
<script lang="ts">
  import { WindowAPI, windows } from '@/core/stores/window-manager.svelte';
  import Window from './Window.svelte';
  import { onMount } from 'svelte';

  let containerRef = $state<HTMLDivElement | null>(null);

  // Update bounds when container resizes
  onMount(() => {
    if (!containerRef) return;

    const updateBounds = () => {
      if (!containerRef) return;
      const rect = containerRef.getBoundingClientRect();
      WindowAPI.setContainerBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };

    updateBounds();

    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(containerRef);

    return () => resizeObserver.disconnect();
  });
</script>

<div
  bind:this={containerRef}
  id="desktop"
  class="absolute inset-0 pointer-events-none"
>
  <!-- Render all windows -->
  {#each Object.keys(windows) as windowId (windowId)}
    <Window {windowId} />
  {/each}
</div>
```

### Step 3.7: Desktop Component

**File:** `src/core/components/desktop/Desktop.svelte`

```svelte
<script lang="ts">
  import DesktopItem from './DesktopItem.svelte';
  import { Apps } from '@/apps';
  import { WindowAPI } from '@/core/stores/window-manager.svelte';

  // Filter desktop apps (you might have a better way)
  const desktopApps = Object.entries(Apps).filter(
    ([_, config]) => config.TAGS.includes('system')
  );

  function handleOpenApp(appId: string) {
    WindowAPI.open(appId);
  }
</script>

<div class="absolute inset-0 p-4">
  <div class="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-4">
    {#each desktopApps as [appId, config] (appId)}
      <DesktopItem
        name={config.NAME}
        icon={config.ICON}
        onclick={() => handleOpenApp(appId)}
      />
    {/each}
  </div>
</div>
```

### Step 3.8: Taskbar Component

**File:** `src/core/components/taskbar/Taskbar.svelte`

```svelte
<script lang="ts">
  import { windows, WindowAPI } from '@/core/stores/window-manager.svelte';
  import TaskbarItem from './TaskbarItem.svelte';
  import StartMenu from './start-menu/StartMenu.svelte';
  import DateTime from './DateTime.svelte';
  import { Apps } from '@/apps';

  let { position = 'bottom' } = $props<{
    position?: 'left' | 'right' | 'top' | 'bottom';
  }>();

  // Get all open windows as array
  const openWindows = $derived(Object.values(windows));
</script>

<div
  class="taskbar bg-foreground border-t border-border flex items-center gap-2 px-2 py-1"
  data-position={position}
>
  <!-- Start menu -->
  <StartMenu />

  <!-- Divider -->
  <div class="w-px h-6 bg-border" />

  <!-- Window items -->
  {#each openWindows as window (window.id)}
    <TaskbarItem
      name={Apps[window.appId].NAME}
      icon={Apps[window.appId].ICON}
      windowId={window.id}
      isMinimized={window.flags.has('minimized')}
      onclick={() => WindowAPI.focus(window.id)}
    />
  {/each}

  <!-- Spacer -->
  <div class="flex-1" />

  <!-- Date & time -->
  <DateTime />
</div>

<style>
  .taskbar {
    height: 3rem;
  }

  .taskbar[data-position='left'],
  .taskbar[data-position='right'] {
    width: 3rem;
    height: 100%;
    flex-direction: column;
  }
</style>
```

---

## Phase 4: Apps Migration

### Step 4.1: App Definition Pattern

**File:** `src/apps/file-explorer/index.ts`

```typescript
import { HardDriveIcon } from 'lucide-svelte';
import type { AppTag } from '@/core/types';

export const ID = 'file-explorer';
export const NAME = 'File Explorer';
export const ICON = HardDriveIcon;
export const TAGS: AppTag[] = ['system'];

export const WINDOW_CONFIG = {
  size: {
    width: 900,
    height: 650,
  },
};

// Lazy load
export const App = () => import('./FileExplorer.svelte');
```

### Step 4.2: File Explorer App

**File:** `src/apps/file-explorer/FileExplorer.svelte`

```svelte
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { FileManagerAPI, fileKeys } from '@/core/stores/file-manager.svelte';
  import FileList from '@/core/components/file-explorer/FileList.svelte';
  import FolderNavigation from '@/core/components/file-explorer/FolderNavigation.svelte';
  import StatusBar from '@/core/components/file-explorer/StatusBar.svelte';
  import * as FileAPI from '@/core/api/file';

  let { windowId } = $props<{ windowId: string }>();

  // Current path state
  let currentPath = $state<string[]>([]);

  // Query for directory contents (cached & synced!)
  const directoryQuery = createQuery(() => ({
    queryKey: fileKeys.directory(currentPath),
    queryFn: async () => {
      const handle = await FileManagerAPI.getHandle(currentPath);
      return await FileAPI.listDirectory(handle);
    },
  }));

  // Handlers
  async function handleCreateFolder() {
    const name = prompt('Folder name:');
    if (name) {
      await FileManagerAPI.createFolder(currentPath, name);
    }
  }

  async function handleDeleteItem(name: string) {
    if (confirm(`Delete ${name}?`)) {
      await FileManagerAPI.deleteItem(currentPath, name);
    }
  }

  function handleNavigate(path: string[]) {
    currentPath = path;
  }
</script>

<div class="flex flex-col h-full">
  <!-- Navigation -->
  <FolderNavigation
    path={currentPath}
    onNavigate={handleNavigate}
    onCreateFolder={handleCreateFolder}
  />

  <!-- File list -->
  <div class="flex-1 overflow-auto">
    {#if $directoryQuery.isLoading}
      <div class="flex items-center justify-center h-full">
        Loading...
      </div>
    {:else if $directoryQuery.error}
      <div class="flex items-center justify-center h-full text-destructive">
        Error: {$directoryQuery.error.message}
      </div>
    {:else if $directoryQuery.data}
      <FileList
        items={$directoryQuery.data}
        onDelete={handleDeleteItem}
        onOpen={(item) => {
          if (item.kind === 'directory') {
            currentPath = [...currentPath, item.name];
          }
        }}
      />
    {/if}
  </div>

  <!-- Status bar -->
  <StatusBar
    itemCount={$directoryQuery.data?.length || 0}
    selectedCount={0}
  />
</div>
```

### Step 4.3: Apps Index

**File:** `src/apps/index.ts`

```typescript
import * as fileExplorer from './file-explorer';
import * as files from './files';
import * as mediaPreview from './media-preview';
import * as profiler from './profiler';
import * as settings from './settings';
import * as styleGuide from './style-guide';
import * as test from './test';
import * as ticTacToe from './tic-tac-toe';

export const Apps = {
  'file-explorer': fileExplorer,
  files,
  'media-preview': mediaPreview,
  profiler,
  settings,
  'style-guide': styleGuide,
  test,
  'tic-tac-toe': ticTacToe,
} as const;

export type AppId = keyof typeof Apps;
export type AppsConfig = typeof Apps;
```

### Step 4.4: Migrate Remaining Apps

Repeat the pattern for each app:

1. **Rename file**: `*.app.tsx` → `*.svelte` (e.g., `Settings.svelte`)
2. **Update script section**: Use `<script lang="ts">` with `$props`
3. **Convert JSX**: Use Svelte template syntax
4. **Convert hooks**: 
   - `useState` → `$state`
   - `useEffect` → `$effect`
   - `useMemo` → `$derived`
5. **Update imports**: Import from stores instead of contexts
6. **Update index.ts**: Change lazy import to Svelte file

---

## Phase 5: Testing & Polish

### Step 5.1: Create Test Checklist

- [ ] All apps open successfully
- [ ] Window drag & resize works
- [ ] Minimize/maximize/close works
- [ ] Multi-window file manager syncs
- [ ] Keyboard shortcuts (Alt+Arrow keys)
- [ ] Settings persist
- [ ] OPFS operations work
- [ ] Lazy loading works
- [ ] Error boundaries catch errors
- [ ] Theme switching works
- [ ] Taskbar shows all windows
- [ ] Desktop icons work

### Step 5.2: Performance Testing

```bash
# Build production
npm run build

# Preview
npm run preview

# Check bundle size
npx vite-bundle-visualizer
```

Expected improvements:
- 🎯 **Bundle size**: 40-50% smaller
- 🎯 **Initial load**: 30-40% faster
- 🎯 **Runtime performance**: 2-3x faster window operations

### Step 5.3: Browser Testing

Test in:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (if available)

---

## File-by-File Mapping

### Complete Migration Map

```
REACT                                    →  SVELTE
================================================================================

ENTRY POINTS
------------
src/main.tsx                            →  src/main.ts (updated)
src/App.tsx                             →  src/App.svelte

CONTEXTS → STORES (6 files → 1 each)
------------------------------------
src/core/contexts/window-manager/
  - window-manager.context.tsx          →  src/core/stores/window-manager.svelte.ts
  - window-manager.hooks.tsx            →  (merged into store)
  - window-manager.provider.tsx         →  (merged into store)
  - window-manager.reducer.ts           →  (merged into store)
  - window-manager.type.ts              →  (merged into store)
  - index.ts                            →  (not needed)

src/core/contexts/window/
  - window.context.tsx                  →  (merged into window-manager store)
  - window.hooks.tsx                    →  (merged into window-manager store)
  - window.provider.tsx                 →  (not needed - CSS visibility)
  - index.ts                            →  (not needed)

src/core/contexts/version/
  - version.context.tsx                 →  src/core/stores/version.svelte.ts
  - version.hooks.tsx                   →  (merged into store)
  - version.provider.tsx                →  (merged into store)
  - version.type.ts                     →  (merged into store)
  - index.ts                            →  (not needed)

src/core/contexts/apps/
  - apps.hooks.tsx                      →  (merged into window-manager)
  - apps.type.ts                        →  src/core/types/apps.ts
  - index.ts                            →  (not needed)

src/core/stores/                        →  src/core/stores/ (keep + convert)
  - desktop.store.ts                    →  desktop.svelte.ts
  - settings.store.ts                   →  settings.svelte.ts

COMPONENTS (*.tsx → *.svelte)
-----------------------------
src/core/components/
  - os.tsx                              →  OS.svelte

src/core/components/desktop/
  - desktop.tsx                         →  Desktop.svelte
  - desktop-item.tsx                    →  DesktopItem.svelte
  - index.ts                            →  (not needed)

src/core/components/taskbar/
  - taskbar.tsx                         →  Taskbar.svelte
  - taskbar-item.tsx                    →  TaskbarItem.svelte
  - date-time.tsx                       →  DateTime.svelte
  - index.ts                            →  (not needed)

src/core/components/taskbar/start-menu/
  - start-menu.tsx                      →  StartMenu.svelte
  - start-menu-content.tsx              →  StartMenuContent.svelte
  - index.ts                            →  (not needed)

src/core/components/window/
  - window.tsx                          →  Window.svelte
  - window-title.tsx                    →  WindowTitle.svelte
  - window-content.tsx                  →  WindowContent.svelte
  - resize-handlers.tsx                 →  ResizeHandlers.svelte
  - index.ts                            →  (not needed)

src/core/components/file-explorer/
  - file-icon.tsx                       →  FileIcon.svelte
  - file-item.tsx                       →  FileItem.svelte
  - file-list.tsx                       →  FileList.svelte
  - folder-navigation.tsx               →  FolderNavigation.svelte
  - status-bar.tsx                      →  StatusBar.svelte
  - index.ts                            →  (not needed)

src/core/components/
  - version-notification.tsx            →  VersionNotification.svelte
  - profiler-wrapper.tsx                →  ProfilerWrapper.svelte

UI COMPONENTS (shadcn)
----------------------
src/core/ui/
  - button.tsx                          →  Button.svelte (use shadcn-svelte CLI)
  - dialog.tsx                          →  Dialog.svelte
  - context-menu.tsx                    →  ContextMenu.svelte
  - popover.tsx                         →  Popover.svelte
  - command.tsx                         →  Command.svelte

APPS (*.app.tsx → *.svelte)
---------------------------
src/apps/file-explorer/
  - index.ts                            →  index.ts (update lazy import)
  - file-explorer.app.tsx               →  FileExplorer.svelte

src/apps/files/
  - index.ts                            →  index.ts
  - files.app.tsx                       →  Files.svelte

src/apps/media-preview/
  - index.ts                            →  index.ts
  - media-preview.app.tsx               →  MediaPreview.svelte

src/apps/profiler/
  - index.ts                            →  index.ts
  - profiler.app.tsx                    →  Profiler.svelte

src/apps/settings/
  - index.ts                            →  index.ts
  - settings.app.tsx                    →  Settings.svelte

src/apps/style-guide/
  - index.ts                            →  index.ts
  - style-guide.app.tsx                 →  StyleGuide.svelte

src/apps/test/
  - index.ts                            →  index.ts
  - test.app.tsx                        →  Test.svelte

src/apps/tic-tac-toe/
  - index.ts                            →  index.ts
  - tic-tac-toe.app.tsx                 →  TicTacToe.svelte

src/apps/
  - apps.ts                             →  index.ts (rename + update)
  - index.tsx                           →  (remove)

NO CHANGES (Copy as-is)
-----------------------
src/core/api/                           ✅  (100% same)
  - file.ts
  - file.types.ts
  - file.hooks.ts                       →  can be used as query helpers
  - file-2/                             ✅  (100% same)

src/core/lib/                           ✅  (100% same)
  - utils.ts
  - windows.ts
  - flags.ts
  - order.ts
  - update.ts

src/core/types/                         ✅  (100% same)
  - index.ts

src/core/constants/                     ✅  (100% same)
  - index.ts

src/core/emitters/                      ✅  (100% same)
  - profiler.emitter.ts

ASSETS & CONFIG
---------------
src/assets/                             ✅  (100% same)
src/index.css                           ✅  (100% same)
src/global.d.ts                         →  Update for Svelte
public/                                 ✅  (100% same)

CONFIG FILES
------------
vite.config.ts                          →  Update for Svelte plugin
tsconfig.json                           →  Update for Svelte
tsconfig.app.json                       →  Update or remove
tsconfig.node.json                      ✅  (keep)
package.json                            →  Update dependencies
components.json                         →  Delete (use shadcn-svelte)
```

### Files to Delete

```
DELETE (Not needed in Svelte)
-----------------------------
- All index.ts files in component folders
- All React context/provider files
- src/core/contexts/ (entire directory)
- components.json (will regenerate with shadcn-svelte)
```

### File Count Summary

```
BEFORE (React)                          AFTER (Svelte)
================================================================================
Entry: 2 files                          Entry: 2 files
Contexts: ~24 files                     Stores: ~5 files (-80%)
Components: ~35 .tsx files              Components: ~35 .svelte files
Apps: ~16 .tsx files                    Apps: ~16 .svelte files
API/Lib: ~20 files                      API/Lib: ~20 files (unchanged)
UI: ~5 .tsx files                       UI: ~5 .svelte files

TOTAL: ~102 files                       TOTAL: ~83 files (-19%)
Lines of code: ~15,000                  Lines of code: ~10,000 (-33%)
```

---

## Breaking Changes & Gotchas

### JSX → Template Syntax

```tsx
// React
{condition && <div>Content</div>}
{items.map(item => <div key={item.id}>{item.name}</div>)}

// Svelte
{#if condition}
  <div>Content</div>
{/if}

{#each items as item (item.id)}
  <div>{item.name}</div>
{/each}
```

### Props

```tsx
// React
interface Props {
  name: string;
  optional?: number;
}

function Component({ name, optional = 0 }: Props) {
  // ...
}

// Svelte
<script lang="ts">
  let { name, optional = 0 } = $props<{
    name: string;
    optional?: number;
  }>();
</script>
```

### State

```tsx
// React
const [count, setCount] = useState(0);
setCount(count + 1);

// Svelte
let count = $state(0);
count = count + 1; // or: count++
```

### Effects

```tsx
// React
useEffect(() => {
  console.log('count changed:', count);
}, [count]);

// Svelte
$effect(() => {
  console.log('count changed:', count);
});
```

### Class vs ClassName

```tsx
// React
<div className="text-lg font-bold" />

// Svelte
<div class="text-lg font-bold" />
```

### Event Handlers

```tsx
// React
<button onClick={() => handleClick()}>Click</button>

// Svelte
<button onclick={() => handleClick()}>Click</button>
```

### Refs

```tsx
// React
const ref = useRef<HTMLDivElement>(null);
<div ref={ref} />

// Svelte
let ref = $state<HTMLDivElement | null>(null);
<div bind:this={ref} />
```

### Children

```tsx
// React
function Component({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

// Svelte
<script lang="ts">
  let { children } = $props<{ children?: any }>();
</script>

<div>
  {@render children?.()}
</div>
```

---

## Performance Optimization

### Code Splitting

Svelte automatically code-splits with dynamic imports:

```typescript
// Automatically creates separate chunks
export const App = () => import('./FileExplorer.svelte');
```

### Lazy Loading Images

```svelte
<img src={url} loading="lazy" alt={name} />
```

### Virtual Scrolling

For large file lists:

```bash
npm install svelte-virtual
```

```svelte
<script>
  import VirtualList from 'svelte-virtual';
  
  let items = [...]; // Large array
</script>

<VirtualList {items} let:item>
  <FileItem {item} />
</VirtualList>
```

### Transitions

```svelte
<script>
  import { fade, fly } from 'svelte/transition';
</script>

<div transition:fade>Fades in and out</div>
<div in:fly={{ y: 200 }} out:fade>Custom transitions</div>
```

---

## Rollback Plan

### If Migration Fails

1. **Keep React branch:**
   ```bash
   git checkout master
   ```

2. **Svelte branch remains for future:**
   ```bash
   git checkout feat/svelte-migration
   ```

3. **No data loss** - All OPFS data persists across builds

### If Partial Migration Needed

You can run both frameworks side-by-side:

```typescript
// main.ts
import React from 'react';
import { createRoot } from 'react-dom/client';
import SvelteApp from './SvelteApp.svelte';
import ReactApp from './ReactApp';

// Mount Svelte
new SvelteApp({ target: document.getElementById('svelte-root')! });

// Mount React
createRoot(document.getElementById('react-root')!).render(<ReactApp />);
```

---

## Next Steps

1. ✅ **Read this guide completely**
2. ⬜ **Create migration branch**
3. ⬜ **Setup Svelte (Phase 1)**
4. ⬜ **Migrate one store (Phase 2.2)**
5. ⬜ **Migrate one component (Phase 3.3)**
6. ⬜ **Migrate one app (Phase 4.2)**
7. ⬜ **Test the migration**
8. ⬜ **Complete remaining migrations**
9. ⬜ **Performance testing**
10. ⬜ **Merge to master**

---

## Resources

### Documentation
- **Svelte 5 Docs**: https://svelte-5-preview.vercel.app/docs/introduction
- **Runes**: https://svelte-5-preview.vercel.app/docs/runes
- **shadcn-svelte**: https://www.shadcn-svelte.com/
- **TanStack Query**: https://tanstack.com/query/latest/docs/svelte/overview

### Tools
- **Svelte REPL**: https://svelte.dev/repl
- **Component Library**: https://www.shadcn-svelte.com/docs/components
- **Icons**: https://lucide.dev/ (same as React)

### Community
- **Discord**: https://discord.gg/svelte
- **GitHub**: https://github.com/sveltejs/svelte

---

## Questions?

If you hit issues during migration:

1. Check this guide's "Breaking Changes & Gotchas" section
2. Search Svelte 5 docs for runes examples
3. Check shadcn-svelte for UI component patterns
4. Ask in Svelte Discord (very helpful community!)

---

**Good luck with the migration! Svelte 5 is going to make your window management so much cleaner.** 🎉

