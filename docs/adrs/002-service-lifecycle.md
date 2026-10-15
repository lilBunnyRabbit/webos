# ADR-002: Service Lifecycle Hooks
**Date:** 2026-01-24
**Status:** Implemented (2026-10-10, partially; see revision)

> **Revision 2026-10-15: settings live in OPFS** ([ADR-021](./021-file-system-hierarchy.md)). Since 2026-10-11 settings are `/etc/settings.json`, not `localStorage["webos.settings"]` as the implementation note and the sketch below say. SettingsService depends on `files` and loads in `init()`; the old key is imported once and removed.

> **Revision 2026-10-15: init progress** ([ADR-036](./036-boot-loading-screen.md)). `kernel.init(on_step?)` calls `on_step({ key, done, total })` before each service's `init()`, so the splash can show a bar and a label. Init stays serial; `register_default_services()` is async because it `import()`s the platform's `windows` and `desktop` classes.

> **Revision 2026-10-14: shell hook** ([ADR-033](./033-shell.md)). `IService` gains an optional `shell?(): ShellContribution` (commands, completers, value types). The shell service reads it from every initialised service.

> **Revision 2026-10-10: implementation** (owner decisions, see [brainstorm](../brainstorm/2026-10-10_service-lifecycle.md))
> - **Boot waits for everything.** `register()` only records the descriptor. `kernel.init()` resolves dependency order (it throws on a cycle or a missing dependency), constructs each service, awaits `init()`, and only then puts it in `kernel.services`. `main.ts` mounts after `kernel.init()`, so `kernel.service()` stays synchronous and never sees a half-ready service. Registering after init throws. `await_service()` and the pending-service machinery were removed; they had no callers.
> - **`destroy()` is synchronous.** Unload never awaits promises, so async cleanup would silently not run.
> - **Shutdown on `pagehide`, not `beforeunload`.** `beforeunload` is unreliable on mobile (ADR-016). It's skipped when `event.persisted` is true, because a bfcache restore needs live services. Also runs on HMR dispose. Services are destroyed in reverse init order, and one failing `destroy()` doesn't stop the rest.
> - **No `swap()`, `get_state()` or `set_state()` yet.** Nothing calls them: ADR-016 rejected runtime swapping for v1. Add them together with session persistence, when the state shape is known.
> - **`init()` throwing fails the boot.** No partial OS.
> - **Settings persistence is in.** `localStorage["webos.settings"]` holds `{ version: 1, theme, taskbar }` (localStorage over IndexedDB or an OPFS dotfile: synchronous, cross-tab `storage` event, matches ADR-014). Loading keeps only known theme tokens, merged over Brand Dark, so tokens added later still get a value. An unknown version is ignored, not migrated.
> - `WindowsService.destroy(id)` / `destroy_all()` were renamed to `close(id)` / `close_all()`. They clashed with the hook, and `close` pairs with `open` and ADR-003's `WindowHandle.close()`.

## Context

Services need lifecycle management for:
- Initialization (load persisted state, set up effects)
- Cleanup (save state, release resources)
- Service swapping (export/import state between implementations)

## Decision

Add lifecycle hooks to the `IService` interface:

```typescript
interface IService {
  name: string;
  description?: string;

  // Lifecycle hooks
  init?(): Promise<void> | void;
  destroy?(): Promise<void> | void;

  // For service swapping
  get_state?(): unknown;
  set_state?(state: unknown): void;

  // Debug
  to_string?(): string;
}
```

### Hook Descriptions

| Hook | When Called | Purpose |
|------|-------------|---------|
| `init()` | After instantiation, before service is available | Load persisted data, set up $effect watchers |
| `destroy()` | Before service is removed/swapped | Save final state, cleanup subscriptions |
| `get_state()` | During swap, before destroy | Export current state for migration |
| `set_state(state)` | During swap, after init | Import state from previous implementation |

### Kernel Triggers Lifecycle

```typescript
class Kernel {
  async register<T extends IService>(name: string, descriptor: ServiceDescriptor<T>) {
    const instance = new descriptor.instance(this);
    await instance.init?.();
    this.services.set(name, instance);
  }

  async swap<T extends IService>(name: string, new_descriptor: ServiceDescriptor<T>) {
    const old = this.services.get(name);
    const state = old?.get_state?.();
    await old?.destroy?.();

    const instance = new new_descriptor.instance(this);
    await instance.init?.();
    instance.set_state?.(state);

    this.services.set(name, instance);
  }

  async shutdown() {
    for (const [name, service] of [...this.services].reverse()) {
      await service.destroy?.();
    }
  }
}
```

### Shutdown Trigger

```typescript
// In main app initialization
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    kernel.shutdown();
  });
}
```

## Example: SettingsService with Persistence

```typescript
class SettingsService implements IService {
  name = "settings";

  public theme = $state<Theme>(DEFAULT_THEME);
  public taskbar = $state<Taskbar>({ position: 'bottom' });

  async init() {
    // Load persisted state
    const saved = localStorage.getItem('webos.settings');
    if (saved) {
      const data = JSON.parse(saved);
      this.theme = data.theme ?? DEFAULT_THEME;
      this.taskbar = data.taskbar ?? { position: 'bottom' };
    }

    // Auto-save on changes
    $effect.root(() => {
      $effect(() => {
        this.persist_state();
      });
    });
  }

  destroy() {
    this.persist_state(); // Final save
  }

  private persist_state() {
    localStorage.setItem('webos.settings', JSON.stringify({
      theme: this.theme,
      taskbar: this.taskbar,
    }));
  }

  get_state() {
    return { theme: this.theme, taskbar: this.taskbar };
  }

  set_state(state: { theme: Theme; taskbar: Taskbar }) {
    this.theme = state.theme;
    this.taskbar = state.taskbar;
  }
}
```

## Alternatives Considered

### 1. No lifecycle hooks
```typescript
// Just constructor
class SettingsService {
  constructor() {
    // All init here
  }
}
```
**Rejected:** Can't handle async init, no cleanup mechanism, no swap support.

### 2. Event-based lifecycle
```typescript
kernel.on('service:registered', (service) => service.init?.());
kernel.on('shutdown', () => /* cleanup */);
```
**Rejected:** More complex, services don't know their own lifecycle.

## Consequences

### Positive
- Clear initialization point for async operations
- Guaranteed cleanup on shutdown
- Enables service hot-swapping with state preservation
- Services can load persisted data before being used

### Negative
- All services need to consider lifecycle (even if hooks are optional)
- Async init means services aren't immediately available after register

## Related
- Brainstorm: `/docs/brainstorm/2026-01-24_lifecycles-persistence.md`
