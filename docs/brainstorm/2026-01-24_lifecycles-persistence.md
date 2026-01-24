# Lifecycles & Persistence Design
**Date:** 2026-01-24
**Participants:** Developer + Claude (Opus 4.5)

---

## Context

Designing service lifecycle hooks and app lifecycle hooks, plus how persistence integrates with both. Current implementation has no persistence - settings reset on reload.

---

## Decisions Made

### Service Lifecycle ✓
**DECIDED:** Add `init()`, `destroy()`, `getState()`, `setState()` hooks to IService.
Kernel triggers all lifecycle hooks.

**See:** [ADR-002: Service Lifecycle](/docs/decisions/002-service-lifecycle.md)

---

## Service Lifecycle

### Proposed Hooks

```typescript
interface IService {
  name: string;

  // Lifecycle
  init?(): Promise<void> | void;      // Called when service registered
  destroy?(): Promise<void> | void;   // Called on shutdown/swap

  // For service swapping
  getState?(): unknown;               // Export current state
  setState?(state: unknown): void;    // Import state (after swap)
}
```

### Lifecycle Flow

```
register()
  → check dependencies
  → instantiate service
  → call init()
  → service ready

swap(newService)
  → oldService.getState()
  → oldService.destroy()
  → instantiate newService
  → newService.init()
  → newService.setState(oldState)
  → newService ready

shutdown()
  → for each service (reverse order):
    → service.destroy()
```

### Example: SettingsService with Persistence

```typescript
class SettingsService implements IService {
  name = "settings";

  public theme = $state<Theme>(DEFAULT_THEME);
  public taskbar = $state<Taskbar>({ position: 'bottom' });

  async init() {
    // Load from localStorage
    const saved = localStorage.getItem('system.settings');
    if (saved) {
      const data = JSON.parse(saved);
      this.theme = data.theme ?? DEFAULT_THEME;
      this.taskbar = data.taskbar ?? { position: 'bottom' };
    }

    // Auto-save on changes
    $effect.root(() => {
      $effect(() => {
        localStorage.setItem('system.settings', JSON.stringify({
          theme: this.theme,
          taskbar: this.taskbar,
        }));
      });
    });
  }

  destroy() {
    // Final save (already auto-saved, but ensure)
    localStorage.setItem('system.settings', JSON.stringify({
      theme: this.theme,
      taskbar: this.taskbar,
    }));
  }

  getState() {
    return { theme: this.theme, taskbar: this.taskbar };
  }

  setState(state: { theme: Theme; taskbar: Taskbar }) {
    this.theme = state.theme;
    this.taskbar = state.taskbar;
  }
}
```

---

## App Lifecycle

### Approach: Window Reference (not manifest callbacks) ✓

Instead of `onMount`, `onFocus`, etc. in manifest, give apps a window reference and let them subscribe to events using Svelte's native patterns.

**Rationale:**
- Uses Svelte's built-in `onMount`/`onDestroy`
- App decides what events to care about
- No magic callbacks in manifest
- App has full control

### How getAppContext Works (Svelte Context)

Svelte has built-in context like React:

```typescript
// Parent sets context
import { setContext } from 'svelte';
setContext('key', value);

// Child reads context
import { getContext } from 'svelte';
const value = getContext('key');
```

**Flow:**
1. Window component calls `setAppContext({ windowId, kernel, window, storage, appData })`
2. App component (child) calls `getAppContext()` to retrieve it
3. Context is hierarchical - only children of Window can access it

### AppContext Shape

```typescript
interface AppContext {
  windowId: WindowId;
  appId: AppId;
  kernel: Kernel;

  // Window reference - subscribe to events
  window: {
    readonly isFocused: boolean;
    readonly isMaximized: boolean;
    readonly bounds: Bounds;
    on(event: 'focus' | 'blur' | 'close' | 'resize', cb: () => void): () => void;
    close(): void;
    minimize(): void;
    maximize(): void;
  };

  // Small settings (localStorage)
  storage: {
    get<T>(key: string): T | null;
    set<T>(key: string, value: T): void;
    remove(key: string): void;
    persisted<T>(key: string, initial: T): { value: T }; // Auto-saves
  };

  // Large data (OPFS) - abstraction over FilesService
  appData: {
    read(path: string): Promise<Uint8Array>;
    write(path: string, data: Uint8Array): Promise<void>;
    readText(path: string): Promise<string>;
    writeText(path: string, content: string): Promise<void>;
    list(path: string): Promise<string[]>;
    delete(path: string): Promise<void>;
  };
}
```

### Usage in App

```svelte
<script lang="ts">
  import { getAppContext } from '$lib/core/api';
  import { onMount } from 'svelte';

  const { window, storage, appData } = getAppContext();

  // Auto-persisted state
  let lastResult = storage.persisted('lastResult', 0);

  onMount(() => {
    // Subscribe to window events
    const unsubClose = window.on('close', () => {
      console.log('Window closing, state already auto-saved');
    });

    return () => unsubClose();
  });
</script>
```

### Context Setup (Window Component)

```svelte
<!-- window-content.svelte -->
<script lang="ts">
  import { setAppContext } from '$lib/core/contexts/app-context.svelte';

  let { windowId, app } = $props();

  // Set context BEFORE app component mounts
  setAppContext({
    windowId,
    appId: app.id,
    kernel,
    window: createWindowHandle(windowId),
    storage: createStorageHandle(app.id),
    appData: createAppDataHandle(app.id),
  });
</script>

{#await app.component then Component}
  <Component {...app.props} />
{/await}
```

---

## Window State Persistence

### What to Persist

```typescript
interface PersistedWindowState {
  appId: AppId;
  bounds: Bounds;           // Position + size
  flags: WindowFlag[];      // Maximized, etc.
  appState?: unknown;       // From app's onSave()
}

interface PersistedSession {
  windows: PersistedWindowState[];
  focusedWindowId?: WindowId;
  desktop?: {
    items: DesktopItem[];   // Icon positions
  };
}
```

### Storage Key

```
localStorage['webos.session'] = JSON.stringify(PersistedSession)
```

### Restore Flow

```typescript
// On page load
async function restoreSession() {
  const saved = localStorage.getItem('webos.session');
  if (!saved) return;

  const session: PersistedSession = JSON.parse(saved);

  for (const win of session.windows) {
    const windowId = apps.launch(win.appId, {
      // Pass saved bounds as defaults
      defaults: {
        bounds: win.bounds,
        flags: win.flags,
      }
    });

    // Restore app-specific state
    if (win.appState) {
      // App's onRestore will be called with this state
      pendingRestores.set(windowId, win.appState);
    }
  }

  if (session.focusedWindowId) {
    windows.focus(session.focusedWindowId);
  }
}
```

---

## Persistence Layers Summary

| Layer | Storage | What |
|-------|---------|------|
| System settings | `localStorage['webos.settings']` | Theme, taskbar position |
| Session state | `localStorage['webos.session']` | Open windows, positions |
| App settings | `localStorage['app.{id}.settings']` | Per-app preferences |
| App instance state | `localStorage['webos.session'].windows[].appState` | Per-window app state |
| App data (files) | OPFS `/apps/{appId}/` | Large data, documents |

---

## Svelte Persistence Helpers

### Simple Persisted State

```typescript
// $lib/core/utils/persisted.svelte.ts

export function persisted<T>(key: string, initial: T) {
  // Load
  const stored = localStorage.getItem(key);
  let value = $state<T>(stored ? JSON.parse(stored) : initial);

  // Auto-save
  $effect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  });

  return {
    get value() { return value; },
    set value(v: T) { value = v; },
  };
}
```

### Usage in Service

```typescript
class SettingsService {
  private _theme = persisted('webos.settings.theme', DEFAULT_THEME);
  private _taskbar = persisted('webos.settings.taskbar', { position: 'bottom' });

  get theme() { return this._theme.value; }
  set theme(v) { this._theme.value = v; }

  get taskbar() { return this._taskbar.value; }
  set taskbar(v) { this._taskbar.value = v; }
}
```

---

## Serialize/Deserialize (Future Exploration)

For complex app state restoration, apps may need explicit serialization:

```typescript
defineApp({
  id: "text-editor",

  serialize: (ctx) => ({
    openFile: ctx.storage.get('openFile'),
    cursorPosition: ctx.storage.get('cursor'),
  }),

  deserialize: (ctx, state) => {
    ctx.storage.set('openFile', state.openFile);
    ctx.storage.set('cursor', state.cursorPosition);
  },
});
```

**Status:** Needs more exploration. May not be needed if `storage.persisted()` pattern is sufficient.

---

## AppData (OPFS Abstraction) ✓

**DECIDED:** Apps get an `appData` handle for large file storage, backed by OPFS.

- Path: `/apps/{appId}/...`
- Async API (OPFS is async-only)
- Abstraction over FilesService

**Details to explore later:**
- Storage quota per app
- Cleanup on app uninstall
- Migration between app versions

---

## Session Restore (P2 - Later)

**Status:** Not priority 1. Needs exploration.

**Questions to answer:**
- When to save window positions? (every move vs close vs debounced)
- How to handle corrupted saved state?
- "Don't restore session" option?
- Storage quota management for localStorage (5MB limit)

---

## Open Questions

1. How should `storage.persisted()` handle complex objects with $state?
2. Should `window.on()` events be synchronous or async?
3. How to handle app crash during save?

---

## Summary of Decisions

| Topic | Decision | ADR |
|-------|----------|-----|
| Service lifecycle | `init`, `destroy`, `getState`, `setState` | ADR-002 |
| App lifecycle | Window reference + Svelte's onMount | ADR-003 |
| App context | Svelte's setContext/getContext | ADR-003 |
| Small storage | `storage` via localStorage | ADR-003 |
| Large storage | `appData` via OPFS | ADR-003 |
| Session restore | P2 - explore later | - |

---

## Next Steps

- [ ] Add lifecycle hooks to IService interface (ADR-002)
- [ ] Implement `setAppContext` / `getAppContext`
- [ ] Implement `createWindowHandle` for window.on() events
- [ ] Implement `createStorageHandle` with persisted() helper
- [ ] Implement `createAppDataHandle` as OPFS wrapper
