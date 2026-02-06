# Managing context in Svelte applications
_Exported on 10/22/2025 at 14:59:52 GMT+2 from Cursor (1.7.44)_

---

**User**

in @SVELTE_QUICK_REFERENCE.md Context reference but there is no reference on how i would keep such context each "window" instance. Is it just one context and querying by the windowId? or? can i have scoped global context like in react

Read trough @cursor_considering_alternatives_to_reac.md @SVELTE_MIGRATION_GUIDE.md @SVELTE_MIGRATION_CHECKLIST.md 

---

**Cursor**

Great question! You're right that the quick reference doesn't fully cover **per-window scoped context**. Let me clarify the different approaches in Svelte 5 for window-scoped state:

---

## **Three Approaches for Per-Window Context**

### **1. Global Store with WindowId Keys** (What I showed initially)

This is the simplest but **not scoped** - everything goes through the global store:

```typescript
// window-manager.svelte.ts
export const WindowAPI = {
  setContext(windowId: WindowId, key: string, value: any) {
    const window = state.index[windowId];
    if (!window) return;
    window.context[key] = value;
  },
  
  getContext(windowId: WindowId, key: string) {
    return state.index[windowId]?.context[key];
  },
};
```

```svelte
<!-- Usage in nested component -->
<script>
  import { WindowAPI } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  // Must pass windowId everywhere
  const zoom = $derived(WindowAPI.getContext(windowId, 'zoom') || 100);
  
  function setZoom(newZoom: number) {
    WindowAPI.setContext(windowId, 'zoom', newZoom);
  }
</script>
```

**Pros:**
- ✅ Simple and explicit
- ✅ Works everywhere with just `windowId`
- ✅ Easy to debug (all state in one place)

**Cons:**
- ❌ Must pass `windowId` down to every component
- ❌ No automatic scoping
- ❌ Feels verbose

---

### **2. Svelte Context API** (✨ **Scoped like React Context!**)

```typescript
// window-manager.svelte.ts
export const WindowAPI = {
  setContext(windowId: WindowId, key: string, value: any) {
    const window = state.index[windowId];
    if (!window) return;
    window.context[key] = value;
  },
  
  getContext(windowId: WindowId, key: string) {
    return state.index[windowId]?.context[key];
  },
};
```

```svelte
<!-- Usage in nested component -->
<script>
  import { WindowAPI } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  // Must pass windowId everywhere
  const zoom = $derived(WindowAPI.getContext(windowId, 'zoom') || 100);
  
  function setZoom(newZoom: number) {
    WindowAPI.setContext(windowId, 'zoom', newZoom);
  }
</script>
```

This is **Svelte's version of React Context** - truly scoped to component tree:

**Create the window context:**

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

interface WindowContext {
  windowId: string;
  zoom: number;
  selectedItems: Set<string>;
  // Add whatever per-window state you need
}

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(windowId: string) {
  const state = $state<WindowContext>({
    windowId,
    zoom: 100,
    selectedItems: new Set(),
  });

  const context = {
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    set zoom(value: number) { state.zoom = value; },
    get selectedItems() { return state.selectedItems; },
    
    // Helper methods
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
  };

  setContext(WINDOW_CONTEXT_KEY, context);
  return context;
}

export function useWindowContext() {
  const ctx = getContext<ReturnType<typeof setWindowContext>>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindowContext must be used within a Window component');
  }
  return ctx;
}
```

**Setup context in Window component:**

```svelte
<!-- Window.svelte -->
<script lang="ts">
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props<{ windowId: string }>();
  
  // Create scoped context for this window tree!
  const windowContext = setWindowContext(windowId);
  
  const instance = $derived(windows[windowId]);
</script>

<div class="window">
  <WindowTitle />
  <WindowContent>
    {#if AppComponent}
      <!-- All children automatically have access to window context -->
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

**Use context in nested components (no windowId prop needed!):**

```svelte
<!-- FileExplorer.svelte (nested deeply) -->
<script lang="ts">
  import { useWindowContext } from '@/core/contexts/window-context.svelte';
  
  // No windowId prop! Context is automatically scoped
  const ctx = useWindowContext();
  
  // Reactive access
  const zoom = $derived(ctx.zoom);
  const selectedCount = $derived(ctx.selectedItems.size);
</script>

<div>
  <button onclick={() => ctx.zoom = ctx.zoom + 10}>Zoom In</button>
  <span>Zoom: {zoom}%</span>
  <span>Selected: {selectedCount} items</span>
  
  <button onclick={() => ctx.selectItem('file.txt')}>
    Select File
  </button>
</div>
```

**Pros:**
- ✅ **Truly scoped** like React Context
- ✅ **No prop drilling** - access anywhere in component tree
- ✅ **Type-safe** with TypeScript
- ✅ **Reactive** automatically
- ✅ **Multiple windows have isolated contexts**

**Cons:**
- ❌ Can only be accessed within the component tree (not from external functions)
- ❌ Slightly more setup than global store

---

### **3. Per-Window Store Factory** (Most Flexible)

Create a dedicated store for each window instance:

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
  });

  return {
    // Read-only derived
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    
    // Actions
    setZoom(zoom: number) {
      state.zoom = zoom;
    },
    
    toggleViewMode() {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    },
    
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

**Store in window-manager:**

```typescript
// window-manager.svelte.ts
import { createWindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  // ... other fields
  store: WindowStore; // Each window gets its own store!
}

export const WindowAPI = {
  open(appId: AppId, props?: any): WindowId {
    const id = uuid();
    
    state.index[id] = {
      id,
      appId,
      props,
      store: createWindowStore(id), // Create isolated store
      // ... other fields
    };
    
    return id;
  },
};
```

**Usage with context:**

```svelte
<!-- Window.svelte -->
<script>
  import { setContext } from 'svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Provide store via context
  setContext('windowStore', instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte -->
<script>
  import { getContext } from 'svelte';
  import type { WindowStore } from '@/core/stores/window-store.svelte';
  
  const store = getContext<WindowStore>('windowStore');
  
  // Reactive access
  const zoom = $derived(store.zoom);
</script>

<button onclick={() => store.setZoom(zoom + 10)}>Zoom In</button>
```

**Pros:**
- ✅ **Fully isolated** state per window
- ✅ **Can grow infinitely** without affecting window-manager
- ✅ **Type-safe API** for each window
- ✅ **Easy to test** in isolation

**Cons:**
- ❌ More memory overhead (store per window)
- ❌ Need to manage store lifecycle

---

## **Comparison Table**

| Feature | Global + WindowId | Context API | Store Factory |
|---------|-------------------|-------------|---------------|
| **Scoping** | Manual | Automatic | Automatic (via context) |
| **Prop Drilling** | Yes (windowId) | No | No |
| **External Access** | ✅ Easy | ❌ No | ✅ Via store ref |
| **Memory** | Minimal | Minimal | Higher |
| **Setup Complexity** | Low | Medium | Medium-High |
| **Type Safety** | Good | Excellent | Excellent |
| **Testing** | Easy | Easy | Easiest |
| **Most like React** | ❌ | ✅✅✅ | ✅✅ |

---

## **My Recommendation for Your WebOS**

Use **Approach #2 (Context API) + Approach #3 (Store Factory)** together:

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  // Isolated state for this window
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
    // Extend as needed!
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
    // ... all your methods
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';
import type { WindowStore } from './window-store.svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Set context so children can access it
  setWindowContext(instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte (deeply nested) -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  
  // No windowId prop needed!
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(150)}>Zoom 150%</button>
<span>{zoom}%</span>
```

This gives you:
- ✅ **Scoped like React Context** - no prop drilling
- ✅ **Extensible** - add any per-window state without affecting global

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

interface WindowContext {
  windowId: string;
  zoom: number;
  selectedItems: Set<string>;
  // Add whatever per-window state you need
}

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(windowId: string) {
  const state = $state<WindowContext>({
    windowId,
    zoom: 100,
    selectedItems: new Set(),
  });

  const context = {
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    set zoom(value: number) { state.zoom = value; },
    get selectedItems() { return state.selectedItems; },
    
    // Helper methods
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
  };

  setContext(WINDOW_CONTEXT_KEY, context);
  return context;
}

export function useWindowContext() {
  const ctx = getContext<ReturnType<typeof setWindowContext>>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindowContext must be used within a Window component');
  }
  return ctx;
}
```

```svelte
<!-- Window.svelte -->
<script lang="ts">
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props<{ windowId: string }>();
  
  // Create scoped context for this window tree!
  const windowContext = setWindowContext(windowId);
  
  const instance = $derived(windows[windowId]);
</script>

<div class="window">
  <WindowTitle />
  <WindowContent>
    {#if AppComponent}
      <!-- All children automatically have access to window context -->
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

interface WindowContext {
  windowId: string;
  zoom: number;
  selectedItems: Set<string>;
  // Add whatever per-window state you need
}

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(windowId: string) {
  const state = $state<WindowContext>({
    windowId,
    zoom: 100,
    selectedItems: new Set(),
  });

  const context = {
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    set zoom(value: number) { state.zoom = value; },
    get selectedItems() { return state.selectedItems; },
    
    // Helper methods
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
  };

  setContext(WINDOW_CONTEXT_KEY, context);
  return context;
}

export function useWindowContext() {
  const ctx = getContext<ReturnType<typeof setWindowContext>>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindowContext must be used within a Window component');
  }
  return ctx;
}
```

```svelte
<!-- Window.svelte -->
<script lang="ts">
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props<{ windowId: string }>();
  
  // Create scoped context for this window tree!
  const windowContext = setWindowContext(windowId);
  
  const instance = $derived(windows[windowId]);
</script>

<div class="window">
  <WindowTitle />
  <WindowContent>
    {#if AppComponent}
      <!-- All children automatically have access to window context -->
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

```svelte
<!-- FileExplorer.svelte (nested deeply) -->
<script lang="ts">
  import { useWindowContext } from '@/core/contexts/window-context.svelte';
  
  // No windowId prop! Context is automatically scoped
  const ctx = useWindowContext();
  
  // Reactive access
  const zoom = $derived(ctx.zoom);
  const selectedCount = $derived(ctx.selectedItems.size);
</script>

<div>
  <button onclick={() => ctx.zoom = ctx.zoom + 10}>Zoom In</button>
  <span>Zoom: {zoom}%</span>
  <span>Selected: {selectedCount} items</span>
  
  <button onclick={() => ctx.selectItem('file.txt')}>
    Select File
  </button>
</div>
```

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
  });

  return {
    // Read-only derived
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    
    // Actions
    setZoom(zoom: number) {
      state.zoom = zoom;
    },
    
    toggleViewMode() {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    },
    
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

```typescript
// window-manager.svelte.ts
import { createWindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  // ... other fields
  store: WindowStore; // Each window gets its own store!
}

export const WindowAPI = {
  open(appId: AppId, props?: any): WindowId {
    const id = uuid();
    
    state.index[id] = {
      id,
      appId,
      props,
      store: createWindowStore(id), // Create isolated store
      // ... other fields
    };
    
    return id;
  },
};
```

```svelte
<!-- Window.svelte -->
<script>
  import { setContext } from 'svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Provide store via context
  setContext('windowStore', instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte -->
<script>
  import { getContext } from 'svelte';
  import type { WindowStore } from '@/core/stores/window-store.svelte';
  
  const store = getContext<WindowStore>('windowStore');
  
  // Reactive access
  const zoom = $derived(store.zoom);
</script>

<button onclick={() => store.setZoom(zoom + 10)}>Zoom In</button>
```

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  // Isolated state for this window
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
    // Extend as needed!
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
    // ... all your methods
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';
import type { WindowStore } from './window-store.svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Set context so children can access it
  setWindowContext(instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte (deeply nested) -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  
  // No windowId prop needed!
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(150)}>Zoom 150%</button>
<span>{zoom}%</span>
```

```svelte
<!-- FileExplorer.svelte (nested deeply) -->
<script lang="ts">
  import { useWindowContext } from '@/core/contexts/window-context.svelte';
  
  // No windowId prop! Context is automatically scoped
  const ctx = useWindowContext();
  
  // Reactive access
  const zoom = $derived(ctx.zoom);
  const selectedCount = $derived(ctx.selectedItems.size);
</script>

<div>
  <button onclick={() => ctx.zoom = ctx.zoom + 10}>Zoom In</button>
  <span>Zoom: {zoom}%</span>
  <span>Selected: {selectedCount} items</span>
  
  <button onclick={() => ctx.selectItem('file.txt')}>
    Select File
  </button>
</div>
```

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
  });

  return {
    // Read-only derived
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    
    // Actions
    setZoom(zoom: number) {
      state.zoom = zoom;
    },
    
    toggleViewMode() {
      state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
    },
    
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

```typescript
// window-manager.svelte.ts
import { createWindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  // ... other fields
  store: WindowStore; // Each window gets its own store!
}

export const WindowAPI = {
  open(appId: AppId, props?: any): WindowId {
    const id = uuid();
    
    state.index[id] = {
      id,
      appId,
      props,
      store: createWindowStore(id), // Create isolated store
      // ... other fields
    };
    
    return id;
  },
};
```

```svelte
<!-- Window.svelte -->
<script>
  import { setContext } from 'svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Provide store via context
  setContext('windowStore', instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte -->
<script>
  import { getContext } from 'svelte';
  import type { WindowStore } from '@/core/stores/window-store.svelte';
  
  const store = getContext<WindowStore>('windowStore');
  
  // Reactive access
  const zoom = $derived(store.zoom);
</script>

<button onclick={() => store.setZoom(zoom + 10)}>Zoom In</button>
```

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  // Isolated state for this window
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
    // Extend as needed!
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
    // ... all your methods
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';
import type { WindowStore } from './window-store.svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { windows } from '@/stores/window-manager.svelte';
  
  let { windowId } = $props();
  
  const instance = $derived(windows[windowId]);
  
  // Set context so children can access it
  setWindowContext(instance.store);
</script>
```

```svelte
<!-- FileExplorer.svelte (deeply nested) -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  
  // No windowId prop needed!
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(150)}>Zoom 150%</button>
<span>{zoom}%</span>
```

- ✅ **Extensible** - add any per-window state without affecting global
- ✅ **Type-safe** - store has defined API
- ✅ **Memory efficient** - stores are cleaned up when windows close

---

## **Updated Quick Reference Addition**

I should add this to the quick reference document:

```svelte
## Per-Window Scoped Context (Like React Context)

### React (Window Context)
```tsx
// React
const WindowContext = createContext<WindowContext | null>(null);

function Window({ windowId }) {
  const [zoom, setZoom] = useState(100);
  
  return (
    <WindowContext.Provider value={{ windowId, zoom, setZoom }}>
      <WindowContent />
    </WindowContext.Provider>
  );
}

function NestedComponent() {
  const { zoom, setZoom } = useContext(WindowContext);
  return <button onClick={() => setZoom(zoom + 10)}>Zoom</button>;
}
```

### Svelte (Window Context)
```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  
  const instance = $derived(windows[windowId]);
  setWindowContext(instance.store);
</script>

<WindowContent />
```

```svelte
<!-- NestedComponent.svelte -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(zoom + 10)}>Zoom</button>
```

---

## **Implementation in Your Migration**

Update the migration guide Phase 2 to include this:

### **Step 2.2b: Create Window Context System**

**File:** `src/core/stores/window-store.svelte.ts`

```typescript
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    // File Explorer specific
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
    
    // Media Preview specific
    playbackRate: 1,
    volume: 1,
    
    // Text Editor specific
    fontSize: 14,
    lineNumbers: true,
    
    // Extendable for any app!
  });

  return {
    // Getters (reactive)
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    get playbackRate() { return state.playbackRate; },
    get volume() { return state.volume; },
    get fontSize() { return state.fontSize; },
    get lineNumbers() { return state.lineNumbers; },
    
    // Setters
    setZoom(value: number) {
      state.zoom = Math.max(50, Math.min(200, value));
    },
    
    setViewMode(mode: 'grid' | 'list') {
      state.viewMode = mode;
    },
    
    setSortBy(sort: 'name' | 'date' | 'size') {
      state.sortBy = sort;
    },
    
    // Selection
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
    
    // Media
    setPlaybackRate(rate: number) {
      state.playbackRate = rate;
    },
    
    setVolume(vol: number) {
      state.volume = Math.max(0, Math.min(1, vol));
    },
    
    // Text Editor
    setFontSize(size: number) {
      state.fontSize = size;
    },
    
    toggleLineNumbers() {
      state.lineNumbers = !state.lineNumbers;
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

**File:** `src/core/contexts/window-context.svelte.ts`

```typescript
import { getContext, setContext } from 'svelte';
import type { WindowStore } from '@/core/stores/window-store.svelte';

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_CONTEXT_KEY, store);
  return store;
}

export function useWindow() {
  const ctx = getContext<WindowStore>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindow must be called within a Window component');
  }
  return ctx;
}

// Optional: typed helper for specific window types
export function useFileExplorerWindow() {
  const window = useWindow();
  return {
    zoom: window.zoom,
    setZoom: window.setZoom,
    selectedItems: window.selectedItems,
    selectItem: window.selectItem,
    viewMode: window.viewMode,
    setViewMode: window.setViewMode,
  };
}
```

**Update:** `src/core/stores/window-manager.svelte.ts`

```typescript
import { createWindowStore, type WindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  props: any;
  flags: Flags<WindowFlag>;
  position: Position;
  size: Dimensions;
  snapZone: SnapZone;
  createdAt: Date;
  store: WindowStore; // Per-window scoped store!
}

export const WindowAPI = {
  open<T extends AppId>(appId: T, props?: any, defaults?: Partial<WindowInstance>): WindowId {
    const id = uuid();
    const config = Apps[appId];

    state.index[id] = {
      id,
      appId,
      props: props || {},
      flags: defaults?.flags || new Flags<WindowFlag>(),
      position: defaults?.position || calculateWindowPosition(size, state.order.size),
      size,
      snapZone: defaults?.snapZone || null,
      createdAt: new Date(),
      store: createWindowStore(id), // Create isolated store!
    };

    state.order = state.order.add(id).clone();
    return id;
  },
  
  // ... rest of API
};
```

**Update:** `src/core/components/window/Window.svelte`

```svelte
<script lang="ts">
  import { WindowAPI, windows } from '@/core/stores/window-manager.svelte';
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { Apps } from '@/apps';

  let { windowId } = $props<{ windowId: string }>();

  const instance = $derived(windows[windowId]);
  
  // Provide window store to all children via context
  $effect(() => {
    if (instance?.store) {
      setWindowContext(instance.store);
    }
  });
  
  // ... rest of component
</script>

<div class="window">
  <!-- All children can now useWindow() without prop drilling! -->
  <WindowContent>
    {#if AppComponent}
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

**Usage in App:** `src/apps/file-explorer/FileExplorer.svelte`

```svelte
<script lang="ts">
  import { useWindow } from '@/core/contexts/window-context.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  
  // No windowId prop needed! Context provides it
  const window = useWindow();
  
  // Reactive access to window-scoped state
  const zoom = $derived(window.zoom);
  const selectedItems = $derived(window.selectedItems);
  const viewMode = $derived(window.viewMode);
  
  // ... rest of component
</script>

<div class="file-explorer">
  <Toolbar>
    <button onclick={() => window.setZoom(zoom + 10)}>Zoom In</button>
    <button onclick={() => window.setZoom(zoom - 10)}>Zoom Out</button>
    <span>Zoom: {zoom}%</span>
    
    <button onclick={() => window.setViewMode('grid')}>Grid</button>
    <button onclick={() => window.setViewMode('list')}>List</button>
  </Toolbar>
  
  <FileList
    {viewMode}
    onSelect={(name) => window.selectItem(name)}
    selectedCount={selectedItems.size}
  />
  
  <StatusBar selected={selectedItems.size} />
</div>
```

This approach gives you **the best of both worlds**:
1. Scoped context like React (no prop drilling)
2. Extensible per-window state (add features without touching window-manager)
3. Type-safe API for each window
4. Clean, maintainable code

Would you like me to update the migration guide files with this pattern?

```svelte
## Per-Window Scoped Context (Like React Context)

### React (Window Context)
```tsx
// React
const WindowContext = createContext<WindowContext | null>(null);

function Window({ windowId }) {
  const [zoom, setZoom] = useState(100);
  
  return (
    <WindowContext.Provider value={{ windowId, zoom, setZoom }}>
      <WindowContent />
    </WindowContext.Provider>
  );
}

function NestedComponent() {
  const { zoom, setZoom } = useContext(WindowContext);
  return <button onClick={() => setZoom(zoom + 10)}>Zoom</button>;
}
```

### Svelte (Window Context)
```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  
  const instance = $derived(windows[windowId]);
  setWindowContext(instance.store);
</script>

<WindowContent />
```

```svelte
<!-- NestedComponent.svelte -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(zoom + 10)}>Zoom</button>
```

---

## **Implementation in Your Migration**

Update the migration guide Phase 2 to include this:

### **Step 2.2b: Create Window Context System**

**File:** `src/core/stores/window-store.svelte.ts`

```typescript
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    // File Explorer specific
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
    
    // Media Preview specific
    playbackRate: 1,
    volume: 1,
    
    // Text Editor specific
    fontSize: 14,
    lineNumbers: true,
    
    // Extendable for any app!
  });

  return {
    // Getters (reactive)
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    get playbackRate() { return state.playbackRate; },
    get volume() { return state.volume; },
    get fontSize() { return state.fontSize; },
    get lineNumbers() { return state.lineNumbers; },
    
    // Setters
    setZoom(value: number) {
      state.zoom = Math.max(50, Math.min(200, value));
    },
    
    setViewMode(mode: 'grid' | 'list') {
      state.viewMode = mode;
    },
    
    setSortBy(sort: 'name' | 'date' | 'size') {
      state.sortBy = sort;
    },
    
    // Selection
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
    
    // Media
    setPlaybackRate(rate: number) {
      state.playbackRate = rate;
    },
    
    setVolume(vol: number) {
      state.volume = Math.max(0, Math.min(1, vol));
    },
    
    // Text Editor
    setFontSize(size: number) {
      state.fontSize = size;
    },
    
    toggleLineNumbers() {
      state.lineNumbers = !state.lineNumbers;
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

**File:** `src/core/contexts/window-context.svelte.ts`

```typescript
import { getContext, setContext } from 'svelte';
import type { WindowStore } from '@/core/stores/window-store.svelte';

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_CONTEXT_KEY, store);
  return store;
}

export function useWindow() {
  const ctx = getContext<WindowStore>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindow must be called within a Window component');
  }
  return ctx;
}

// Optional: typed helper for specific window types
export function useFileExplorerWindow() {
  const window = useWindow();
  return {
    zoom: window.zoom,
    setZoom: window.setZoom,
    selectedItems: window.selectedItems,
    selectItem: window.selectItem,
    viewMode: window.viewMode,
    setViewMode: window.setViewMode,
  };
}
```

**Update:** `src/core/stores/window-manager.svelte.ts`

```typescript
import { createWindowStore, type WindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  props: any;
  flags: Flags<WindowFlag>;
  position: Position;
  size: Dimensions;
  snapZone: SnapZone;
  createdAt: Date;
  store: WindowStore; // Per-window scoped store!
}

export const WindowAPI = {
  open<T extends AppId>(appId: T, props?: any, defaults?: Partial<WindowInstance>): WindowId {
    const id = uuid();
    const config = Apps[appId];

    state.index[id] = {
      id,
      appId,
      props: props || {},
      flags: defaults?.flags || new Flags<WindowFlag>(),
      position: defaults?.position || calculateWindowPosition(size, state.order.size),
      size,
      snapZone: defaults?.snapZone || null,
      createdAt: new Date(),
      store: createWindowStore(id), // Create isolated store!
    };

    state.order = state.order.add(id).clone();
    return id;
  },
  
  // ... rest of API
};
```

**Update:** `src/core/components/window/Window.svelte`

```svelte
<script lang="ts">
  import { WindowAPI, windows } from '@/core/stores/window-manager.svelte';
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { Apps } from '@/apps';

  let { windowId } = $props<{ windowId: string }>();

  const instance = $derived(windows[windowId]);
  
  // Provide window store to all children via context
  $effect(() => {
    if (instance?.store) {
      setWindowContext(instance.store);
    }
  });
  
  // ... rest of component
</script>

<div class="window">
  <!-- All children can now useWindow() without prop drilling! -->
  <WindowContent>
    {#if AppComponent}
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

**Usage in App:** `src/apps/file-explorer/FileExplorer.svelte`

```svelte
<script lang="ts">
  import { useWindow } from '@/core/contexts/window-context.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  
  // No windowId prop needed! Context provides it
  const window = useWindow();
  
  // Reactive access to window-scoped state
  const zoom = $derived(window.zoom);
  const selectedItems = $derived(window.selectedItems);
  const viewMode = $derived(window.viewMode);
  
  // ... rest of component
</script>

<div class="file-explorer">
  <Toolbar>
    <button onclick={() => window.setZoom(zoom + 10)}>Zoom In</button>
    <button onclick={() => window.setZoom(zoom - 10)}>Zoom Out</button>
    <span>Zoom: {zoom}%</span>
    
    <button onclick={() => window.setViewMode('grid')}>Grid</button>
    <button onclick={() => window.setViewMode('list')}>List</button>
  </Toolbar>
  
  <FileList
    {viewMode}
    onSelect={(name) => window.selectItem(name)}
    selectedCount={selectedItems.size}
  />
  
  <StatusBar selected={selectedItems.size} />
</div>
```

This approach gives you **the best of both worlds**:
1. Scoped context like React (no prop drilling)
2. Extensible per-window state (add features without touching window-manager)
3. Type-safe API for each window
4. Clean, maintainable code

Would you like me to update the migration guide files with this pattern?
```

```typescript
// window-store.svelte.ts
export function createWindowStore(windowId: string) {
  const state = $state({
    zoom: 100,
    selectedItems: new Set<string>(),
  });

  return {
    get zoom() { return state.zoom; },
    setZoom(value: number) { state.zoom = value; },
  };
}
```

```typescript
// window-context.svelte.ts
import { getContext, setContext } from 'svelte';

const WINDOW_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_KEY, store);
}

export function useWindow() {
  return getContext<WindowStore>(WINDOW_KEY);
}
```

```svelte
<!-- Window.svelte -->
<script>
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  
  const instance = $derived(windows[windowId]);
  setWindowContext(instance.store);
</script>

<WindowContent />
```

```svelte
<!-- NestedComponent.svelte -->
<script>
  import { useWindow } from '@/core/contexts/window-context.svelte';
  
  const window = useWindow();
  const zoom = $derived(window.zoom);
</script>

<button onclick={() => window.setZoom(zoom + 10)}>Zoom</button>
```

```typescript
export function createWindowStore(windowId: string) {
  const state = $state({
    windowId,
    // File Explorer specific
    zoom: 100,
    selectedItems: new Set<string>(),
    viewMode: 'grid' as 'grid' | 'list',
    sortBy: 'name' as 'name' | 'date' | 'size',
    
    // Media Preview specific
    playbackRate: 1,
    volume: 1,
    
    // Text Editor specific
    fontSize: 14,
    lineNumbers: true,
    
    // Extendable for any app!
  });

  return {
    // Getters (reactive)
    get windowId() { return state.windowId; },
    get zoom() { return state.zoom; },
    get selectedItems() { return state.selectedItems; },
    get viewMode() { return state.viewMode; },
    get sortBy() { return state.sortBy; },
    get playbackRate() { return state.playbackRate; },
    get volume() { return state.volume; },
    get fontSize() { return state.fontSize; },
    get lineNumbers() { return state.lineNumbers; },
    
    // Setters
    setZoom(value: number) {
      state.zoom = Math.max(50, Math.min(200, value));
    },
    
    setViewMode(mode: 'grid' | 'list') {
      state.viewMode = mode;
    },
    
    setSortBy(sort: 'name' | 'date' | 'size') {
      state.sortBy = sort;
    },
    
    // Selection
    selectItem(name: string) {
      state.selectedItems.add(name);
    },
    
    deselectItem(name: string) {
      state.selectedItems.delete(name);
    },
    
    clearSelection() {
      state.selectedItems.clear();
    },
    
    // Media
    setPlaybackRate(rate: number) {
      state.playbackRate = rate;
    },
    
    setVolume(vol: number) {
      state.volume = Math.max(0, Math.min(1, vol));
    },
    
    // Text Editor
    setFontSize(size: number) {
      state.fontSize = size;
    },
    
    toggleLineNumbers() {
      state.lineNumbers = !state.lineNumbers;
    },
  };
}

export type WindowStore = ReturnType<typeof createWindowStore>;
```

```typescript
import { getContext, setContext } from 'svelte';
import type { WindowStore } from '@/core/stores/window-store.svelte';

const WINDOW_CONTEXT_KEY = Symbol('window');

export function setWindowContext(store: WindowStore) {
  setContext(WINDOW_CONTEXT_KEY, store);
  return store;
}

export function useWindow() {
  const ctx = getContext<WindowStore>(WINDOW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useWindow must be called within a Window component');
  }
  return ctx;
}

// Optional: typed helper for specific window types
export function useFileExplorerWindow() {
  const window = useWindow();
  return {
    zoom: window.zoom,
    setZoom: window.setZoom,
    selectedItems: window.selectedItems,
    selectItem: window.selectItem,
    viewMode: window.viewMode,
    setViewMode: window.setViewMode,
  };
}
```

```typescript
import { createWindowStore, type WindowStore } from './window-store.svelte';

interface WindowInstance {
  id: WindowId;
  appId: AppId;
  props: any;
  flags: Flags<WindowFlag>;
  position: Position;
  size: Dimensions;
  snapZone: SnapZone;
  createdAt: Date;
  store: WindowStore; // Per-window scoped store!
}

export const WindowAPI = {
  open<T extends AppId>(appId: T, props?: any, defaults?: Partial<WindowInstance>): WindowId {
    const id = uuid();
    const config = Apps[appId];

    state.index[id] = {
      id,
      appId,
      props: props || {},
      flags: defaults?.flags || new Flags<WindowFlag>(),
      position: defaults?.position || calculateWindowPosition(size, state.order.size),
      size,
      snapZone: defaults?.snapZone || null,
      createdAt: new Date(),
      store: createWindowStore(id), // Create isolated store!
    };

    state.order = state.order.add(id).clone();
    return id;
  },
  
  // ... rest of API
};
```

```svelte
<script lang="ts">
  import { WindowAPI, windows } from '@/core/stores/window-manager.svelte';
  import { setWindowContext } from '@/core/contexts/window-context.svelte';
  import { Apps } from '@/apps';

  let { windowId } = $props<{ windowId: string }>();

  const instance = $derived(windows[windowId]);
  
  // Provide window store to all children via context
  $effect(() => {
    if (instance?.store) {
      setWindowContext(instance.store);
    }
  });
  
  // ... rest of component
</script>

<div class="window">
  <!-- All children can now useWindow() without prop drilling! -->
  <WindowContent>
    {#if AppComponent}
      <svelte:component this={AppComponent} {...instance.props} />
    {/if}
  </WindowContent>
</div>
```

```svelte
<script lang="ts">
  import { useWindow } from '@/core/contexts/window-context.svelte';
  import { createQuery } from '@tanstack/svelte-query';
  
  // No windowId prop needed! Context provides it
  const window = useWindow();
  
  // Reactive access to window-scoped state
  const zoom = $derived(window.zoom);
  const selectedItems = $derived(window.selectedItems);
  const viewMode = $derived(window.viewMode);
  
  // ... rest of component
</script>

<div class="file-explorer">
  <Toolbar>
    <button onclick={() => window.setZoom(zoom + 10)}>Zoom In</button>
    <button onclick={() => window.setZoom(zoom - 10)}>Zoom Out</button>
    <span>Zoom: {zoom}%</span>
    
    <button onclick={() => window.setViewMode('grid')}>Grid</button>
    <button onclick={() => window.setViewMode('list')}>List</button>
  </Toolbar>
  
  <FileList
    {viewMode}
    onSelect={(name) => window.selectItem(name)}
    selectedCount={selectedItems.size}
  />
  
  <StatusBar selected={selectedItems.size} />
</div>
```

