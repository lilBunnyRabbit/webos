# App Architecture Design
**Date:** 2026-01-24
**Participants:** Developer + Claude (Opus 4.5)

---

## Context

Reviewing the app definition and loading system. Goals:
- Isolated app logic
- Dynamic loading on first request
- Metadata definition
- Service access from apps
- Separate workspace loading for user apps

---

## Current Implementation Analysis

### Structure
```
src/lib/apps/
├── index.ts                 # Manual registration
├── system/
│   ├── settings/
│   │   ├── index.ts         # Manifest
│   │   └── settings.app.svelte
│   └── ...
└── user/
    └── example/
        ├── index.ts         # Manifest
        └── example.app.svelte
```

### Current Manifest
```typescript
export default {
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["user"],
  window_options: { ... },
  component: () => import("./example.app.svelte").then((m) => m.default),
} satisfies AppManifest;
```

### Current Registration
```typescript
// Manual - not scalable
export function register_apps(register: (app: AppManifest) => void): void {
  register(example);
  register(kernel);
  register(settings);
  register(fileExplorer);
}
```

### Issues Identified
1. **Manual registration** - Must update `index.ts` for every new app
2. **No service access pattern** - Apps must import kernel directly
3. **No app context** - Apps don't have access to their own metadata/window
4. **No lifecycle hooks** - No mount/unmount/focus events
5. **Props typing is weak** - Generic `AppProps` loses type safety

---

## Professional Approaches

### Approach A: Enhanced Current (Minimal Change)

Keep current structure but add:
- Vite glob import for auto-registration
- App context for service access

```typescript
// Auto-registration via Vite glob
const appModules = import.meta.glob('./*/index.ts', { eager: true });
const manifests = Object.values(appModules).map(m => m.default);
```

**Pros:** Minimal change, works now
**Cons:** Still no lifecycle, weak typing

---

### Approach B: App Factory Pattern

Apps export a factory function instead of plain manifest:

```typescript
// apps/user/example/index.ts
export default defineApp({
  id: "example",
  name: "Example",
  // ...
  setup(ctx) {
    // Called once when app is first loaded
    return {
      component: () => import("./example.app.svelte"),
      // Optional lifecycle
      onMount(windowId) { },
      onUnmount(windowId) { },
    };
  }
});
```

**Pros:** Lifecycle hooks, setup phase for initialization
**Cons:** More boilerplate

---

### Approach C: Component-First with Metadata

Metadata lives in the component file via module context:

```svelte
<!-- example.app.svelte -->
<script lang="ts" module>
  import { HandIcon } from "@lucide/svelte";

  export const manifest = {
    id: "example",
    name: "Example",
    icon: HandIcon,
    // ...
  };
</script>

<script lang="ts">
  import { getAppContext } from "$lib/core/api";

  const app = getAppContext(); // { windowId, services, manifest }
  let count = $state(0);
</script>
```

**Pros:** Single file, co-located metadata
**Cons:** Can't separate manifest from component loading

---

### Approach D: Workspace-Based Loading (Recommended)

Separate system apps from user workspace:

```
src/lib/apps/
├── system/           # Bundled, always available
│   └── ...
└── workspaces/       # User workspaces, loaded separately
    └── default/
        ├── workspace.json
        └── apps/
            └── example/
```

```typescript
// workspace.json
{
  "name": "Default Workspace",
  "apps": ["example", "notes", "calculator"]
}
```

**Pros:** Clean separation, supports multiple workspaces
**Cons:** More infrastructure

---

## Recommendation

**Hybrid of A + B + D:**

1. **Auto-registration** via Vite glob (from A)
2. **App factory** with optional lifecycle (from B)
3. **Workspace separation** for user apps (from D)
4. **App context** for service access

---

## Proposed Implementation

### 1. App Definition Helper

```typescript
// $lib/core/api/app.ts
export function defineApp<TProps extends Record<string, any> = {}>(
  config: AppConfig<TProps>
): AppManifest<TProps> {
  return {
    ...config,
    component: () => config.load().then(m => m.default),
  };
}

interface AppConfig<TProps> {
  id: string;
  name: string;
  icon: Component;
  version: string;
  author?: string;
  categories: AppCategory[];
  window_options?: WindowOptions;

  // Component loader
  load: () => Promise<{ default: Component<TProps> }>;

  // Optional lifecycle
  onMount?: (ctx: AppContext) => void | (() => void);
  onFocus?: (ctx: AppContext) => void;
  onBlur?: (ctx: AppContext) => void;
}
```

### 2. App Usage

```typescript
// apps/user/example/index.ts
import { defineApp } from "$lib/core/api";
import { HandIcon } from "@lucide/svelte";

export default defineApp({
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  categories: ["user"],

  load: () => import("./example.app.svelte"),

  onMount(ctx) {
    console.log("App mounted in window:", ctx.windowId);
    // Return cleanup function
    return () => console.log("App unmounted");
  },
});
```

### 3. App Context (for components)

```typescript
// Inside app component
<script lang="ts">
  import { getAppContext } from "$lib/core/api";

  const { windowId, kernel, manifest } = getAppContext();

  // Access services safely
  const files = kernel.service("files");
</script>
```

### 4. Auto-Registration

```typescript
// apps/system/index.ts
const modules = import.meta.glob<{ default: AppManifest }>(
  './**/index.ts',
  { eager: true }
);

export const systemApps = Object.values(modules).map(m => m.default);

// apps/user/index.ts (or workspace loader)
const modules = import.meta.glob<{ default: AppManifest }>(
  './**/index.ts',
  { eager: true }
);

export const userApps = Object.values(modules).map(m => m.default);
```

### 5. Workspace Loading (Future)

```typescript
// Load workspace apps dynamically
async function loadWorkspace(path: string): Promise<AppManifest[]> {
  const workspace = await import(`${path}/workspace.json`);
  return Promise.all(
    workspace.apps.map(appId =>
      import(`${path}/apps/${appId}/index.ts`).then(m => m.default)
    )
  );
}
```

---

## App Context Implementation

```typescript
// $lib/core/contexts/app-context.svelte.ts
import { getContext, setContext } from "svelte";
import type { Kernel, WindowId, AppManifest } from "$lib/core/api";

const APP_CONTEXT_KEY = Symbol("app");

export interface AppContext {
  windowId: WindowId;
  kernel: Kernel;
  manifest: Omit<AppManifest, "component">;
}

export function setAppContext(ctx: AppContext) {
  setContext(APP_CONTEXT_KEY, ctx);
}

export function getAppContext(): AppContext {
  const ctx = getContext<AppContext>(APP_CONTEXT_KEY);
  if (!ctx) {
    throw new Error("getAppContext must be called within an app component");
  }
  return ctx;
}
```

---

## Migration Path

1. **Phase 1:** Add `defineApp` helper (backwards compatible)
2. **Phase 2:** Add app context provider in Window component
3. **Phase 3:** Switch to glob-based auto-registration
4. **Phase 4:** Add lifecycle hooks
5. **Phase 5:** Implement workspace loading

---

## Open Questions

- Should props be part of `defineApp` config or separate?
- How to handle app-specific settings/storage?
- Should apps declare their service dependencies?

---

## Follow-up: Metadata Structure Discussion

### Glob Import Confirmed
User confirmed glob-based auto-discovery is the desired approach:
- Metadata loads eagerly (via glob)
- Component loads lazily (via dynamic import in manifest)
- No manual import list needed

### Structure Options Explored

**Option A: Nested metadata wrapper**
```typescript
{ id, metadata: { name, version, ... }, window: { ... }, component }
```

**Option B: Flat (package.json-ish)**
```typescript
{ id, name, version, author, window: { ... }, component }
```

**Option C: Fully flat**
```typescript
{ id, name, version, windowMinWidth, windowMaxWidth, ... }
```

### The Window Config Problem

With flat structure, `window: { }` being nested feels inconsistent.

Options:
1. **Keep `window` nested** - Like `scripts` in package.json (complex things nest)
2. **Rename to `defaults`** - More generic, covers window + future app defaults
3. **Fully flat** - `defaultWidth`, `minWidth`, etc. (verbose but consistent)
4. **Two groups** - Metadata flat, runtime config nested

### package.json Pattern
- Simple values: flat (`name`, `version`, `license`)
- Complex objects: nested (`scripts`, `dependencies`, `repository`)

This suggests: `window` nested is fine, it's a complex config object.

### Final Decision: `defaults` ✓

**DECIDED:** Use flat structure with nested `defaults` for window configuration.
- Follows package.json convention (simple flat, complex nested)
- `defaults` is more semantic than `window`
- Expandable for future non-window defaults

### Lazy Loading Pattern: Explicit ✓

Explored options:
- Convention-based glob (no component field, discover *.app.svelte)
- Path strings (doesn't work with bundlers)
- Explicit dynamic import

**DECIDED:** Keep explicit `component: () => import(...)` pattern.
- `defineApp` helper handles `.default` extraction
- Clear, no magic, easy to debug

**See:** [ADR-001: App Manifest Structure](/docs/adrs/001-app-manifest-structure.md)

---

## Next Steps

- [ ] Implement `defineApp` helper
- [ ] Update `AppManifest` type with new structure
- [ ] Add app context to Window component
- [ ] Switch to glob-based auto-registration
- [ ] Refactor one app as proof of concept
