# ADR-003: App Context & AppData Abstraction
**Date:** 2026-01-24
**Status:** Implemented (2026-10-10, partially; see revision)

> **Revision 2026-10-10: implementation** ([brainstorm](../brainstorm/2026-10-10_app-context.md))
> - **No `on()` events** (owner decision). Apps read the handle's reactive getters with `$derived`/`$effect`, and use `onDestroy` for close. An emitter would be new pub-sub infrastructure that every mutation site, including the drag handler and a mobile WindowsService, would have to call.
> - **No `kernel` in the context** (owner decision). Apps import the singleton. `AppContext` is `{ window_id, app_id, window, storage }`.
> - **`app_data` deferred** until an app needs it. FilesService has no path API for the sketch below to wrap.
> - **WindowHandle is the core only:** `id`, `is_focused`, `is_maximized`, `is_minimized`, `bounds`, `focus()`, `close()`, `minimize()`, `maximize()`, `restore()`. Title/icon, taskbar, overlays and status bar are separate roadmap items.
> - **Storage is guarded:** `get(key, schema?)` and `persisted(key, initial, schema?)` take an optional zod schema. Missing, corrupt or invalid data returns `null` / falls back to `initial`. Write failures log.
> - Lives in `src/lib/core/contexts/app/`; import from `$lib/core/contexts/app`.
> - **Windows of one app share `persisted()` cells** (owner decision). The storage module keeps one reactive cell per key, retained by each caller and disposed when the last one unmounts, so two windows stay in sync live. The first caller's `initial` and schema win. `set()` on a key with a live cell updates the cell. Other browser tabs are not synced; that belongs to the multi-window brainstorm.
> - **Revision 2026-10-11: `storage.window()`** (owner decision). Sharing is right for app data and wrong for view state: two Settings windows switched tabs together. View state now uses `storage.window(key, initial, schema?)`, stored per window in `AppInstance.state` and saved with the session (ADR-023 revision). A new window starts at `initial`. Settings, Activity Monitor, Style Guide, Kernel and Text Viewer moved over. [Brainstorm](../brainstorm/2026-10-11_window-state.md).

## Context

Apps need access to:
- Their window (for events, controls)
- Kernel services
- Persistent storage (small settings)
- File storage (large data)

Need a clean pattern that doesn't require prop drilling and uses Svelte's native capabilities.

## Decision

### 1. Use Svelte Context for App Context

Apps receive context via Svelte's built-in `setContext`/`getContext`:

```typescript
// $lib/core/contexts/app-context.svelte.ts
import { getContext, setContext } from 'svelte';

const APP_CONTEXT_KEY = Symbol('app-context');

export interface AppContext {
  window_id: WindowId;
  app_id: AppId;
  kernel: Kernel;
  window: WindowHandle;
  storage: StorageHandle;
  app_data: AppDataHandle;
}

export function set_app_context(ctx: AppContext) {
  setContext(APP_CONTEXT_KEY, ctx);
}

export function get_app_context(): AppContext {
  const ctx = getContext<AppContext>(APP_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('get_app_context must be called within an app component');
  }
  return ctx;
}
```

### 2. Window Handle

Apps get a window reference to subscribe to events, control their window, and access window-scoped features.
The window handle is defined separately from AppContext to keep concerns clean.

```typescript
interface WindowHandle {
  // Reactive state
  readonly is_focused: boolean;
  readonly is_maximized: boolean;
  readonly is_minimized: boolean;
  readonly bounds: Bounds;

  // Event subscription (returns unsubscribe function)
  on(event: 'focus' | 'blur' | 'close' | 'resize' | 'move', callback: () => void): () => void;

  // Window controls
  close(): void;
  minimize(): void;
  maximize(): void;
  restore(): void;

  // Identity
  set_title(title: string): void;
  set_icon(icon: Component): void;

  // Taskbar
  request_attention(): void;
  set_badge(count: number | null): void;

  // Overlays (promise-based, rendered as full window overlay)
  pick_file(options?: PickFileOptions): Promise<FilePickerResult | null>;
  pick_directory(options?: PickDirectoryOptions): Promise<DirectoryPickerResult | null>;
  confirm(message: string, options?: ConfirmOptions): Promise<boolean>;
  prompt(message: string, options?: PromptOptions): Promise<string | null>;

  // Status bar (reactive — window renders if any value is set)
  readonly status_bar: StatusBarHandle;
}

interface PickFileOptions {
  multiple?: boolean;
  accept?: string[];    // e.g., [".txt", ".md"]
  start_path?: string;  // initial directory
}

interface PickDirectoryOptions {
  start_path?: string;
}

interface ConfirmOptions {
  title?: string;
  confirm_label?: string;  // default: "OK"
  cancel_label?: string;   // default: "Cancel"
}

interface PromptOptions {
  title?: string;
  placeholder?: string;
  default_value?: string;
}

interface StatusBarHandle {
  left: string | null;
  right: string | null;
  progress: number | null;  // 0-1 for determinate, -1 for indeterminate, null to hide
}
```

**File picker** is a window-scoped overlay that wraps FilesService internally. When `pick_file()` is called,
the window component renders a built-in file browser overlay. The promise resolves when the user picks or cancels.
This keeps the file picker reusable across apps without each app implementing its own.

### 3. Storage Handle (localStorage, small data)

For app settings and small persistent data:

```typescript
interface StorageHandle {
  // Manual get/set
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;

  // Auto-persisted reactive state
  persisted<T>(key: string, initial: T): { value: T };
}
```

**Storage location:** `localStorage['app.{app_id}.{key}']`

**Implementation of persisted():**
```typescript
function create_storage_handle(app_id: string): StorageHandle {
  const prefix = `app.${app_id}.`;

  return {
    get<T>(key: string): T | null {
      const raw = localStorage.getItem(prefix + key);
      return raw ? JSON.parse(raw) : null;
    },

    set<T>(key: string, value: T): void {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },

    remove(key: string): void {
      localStorage.removeItem(prefix + key);
    },

    persisted<T>(key: string, initial: T) {
      const stored = localStorage.getItem(prefix + key);
      let value = $state<T>(stored ? JSON.parse(stored) : initial);

      $effect(() => {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      });

      return {
        get value() { return value; },
        set value(v: T) { value = v; },
      };
    },
  };
}
```

### 4. AppData Handle (OPFS, large data)

For large files, documents, and binary data:

```typescript
interface AppDataHandle {
  // Binary data
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;

  // Text convenience
  read_text(path: string): Promise<string>;
  write_text(path: string, content: string): Promise<void>;

  // Directory operations
  list(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}
```

**Storage location:** OPFS at `/apps/{app_id}/...`

**Implementation** wraps FilesService with app-specific root:

```typescript
function create_app_data_handle(app_id: string, files_service: FilesService): AppDataHandle {
  const root = `/apps/${app_id}`;

  return {
    async read(path: string): Promise<Uint8Array> {
      return files_service.read(`${root}/${path}`);
    },

    async write(path: string, data: Uint8Array): Promise<void> {
      return files_service.write(`${root}/${path}`, data);
    },

    async read_text(path: string): Promise<string> {
      const data = await this.read(path);
      return new TextDecoder().decode(data);
    },

    async write_text(path: string, content: string): Promise<void> {
      const data = new TextEncoder().encode(content);
      return this.write(path, data);
    },

    async list(path: string): Promise<string[]> {
      return files_service.list(`${root}/${path}`);
    },

    async exists(path: string): Promise<boolean> {
      return files_service.exists(`${root}/${path}`);
    },

    async delete(path: string): Promise<void> {
      return files_service.delete(`${root}/${path}`);
    },

    async mkdir(path: string): Promise<void> {
      return files_service.mkdir(`${root}/${path}`);
    },
  };
}
```

### 5. Context Setup (Window Component)

```svelte
<!-- window-content.svelte -->
<script lang="ts">
  import { set_app_context } from '$lib/core/contexts/app-context.svelte';
  import kernel from '$lib/core/api';

  let { window_id, app } = $props();

  const files_service = kernel.service('files');

  // Set context BEFORE app mounts (Svelte requirement)
  set_app_context({
    window_id,
    app_id: app.id,
    kernel,
    window: create_window_handle(window_id),
    storage: create_storage_handle(app.id),
    app_data: create_app_data_handle(app.id, files_service),
  });
</script>

{#await app.component then Component}
  <Component {...app.props} />
{/await}
```

### 6. Usage in App

```svelte
<!-- calculator.app.svelte -->
<script lang="ts">
  import { get_app_context } from '$lib/core/api';
  import { onMount } from 'svelte';

  const { window, storage, app_data } = get_app_context();

  // Auto-persisted state (localStorage)
  let history = storage.persisted('history', []);

  // Regular state
  let current_value = $state(0);

  onMount(() => {
    // Subscribe to window events
    const unsub = window.on('focus', () => {
      console.log('Calculator focused');
    });

    return unsub;
  });

  async function save_to_file() {
    // Save to OPFS
    await app_data.write_text('history.json', JSON.stringify(history.value));
  }
</script>
```

## Alternatives Considered

### 1. Manifest callbacks (on_mount, on_focus, etc.)
```typescript
define_app({
  on_mount: (ctx) => { ... },
  on_focus: (ctx) => { ... },
});
```
**Rejected:** Doesn't use Svelte's native patterns, less flexible.

### 2. Props drilling
```typescript
<Calculator window_id={window_id} kernel={kernel} storage={storage} />
```
**Rejected:** Verbose, every component needs all props.

### 3. Global imports
```typescript
import { kernel } from '$lib/core/api';
import { get_window_id } from '$lib/core/window';
```
**Rejected:** Can't have multiple windows of same app (no isolation).

## Consequences

### Positive
- Uses Svelte's native context system
- Apps use familiar `onMount`/`onDestroy` patterns
- Clean separation: small data (storage) vs large data (app_data)
- Apps are isolated - each has its own storage namespace
- Window reference gives apps control without tight coupling

### Negative
- `get_app_context()` must be called during component init (Svelte limitation)
- Apps must understand storage vs app_data distinction

## Related
- ADR-001: App Manifest Structure
- ADR-002: Service Lifecycle
- Brainstorm: `/docs/brainstorm/2026-01-24_lifecycles-persistence.md`
