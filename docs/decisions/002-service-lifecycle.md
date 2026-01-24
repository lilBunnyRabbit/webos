# ADR-002: Service Lifecycle Hooks
**Date:** 2026-01-24
**Status:** Accepted

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
  getState?(): unknown;
  setState?(state: unknown): void;

  // Debug
  to_string?(): string;
}
```

### Hook Descriptions

| Hook | When Called | Purpose |
|------|-------------|---------|
| `init()` | After instantiation, before service is available | Load persisted data, set up $effect watchers |
| `destroy()` | Before service is removed/swapped | Save final state, cleanup subscriptions |
| `getState()` | During swap, before destroy | Export current state for migration |
| `setState(state)` | During swap, after init | Import state from previous implementation |

### Kernel Triggers Lifecycle

```typescript
class Kernel {
  async register<T extends IService>(name: string, descriptor: ServiceDescriptor<T>) {
    const instance = new descriptor.instance(this);
    await instance.init?.();
    this.services.set(name, instance);
  }

  async swap<T extends IService>(name: string, newDescriptor: ServiceDescriptor<T>) {
    const old = this.services.get(name);
    const state = old?.getState?.();
    await old?.destroy?.();

    const instance = new newDescriptor.instance(this);
    await instance.init?.();
    instance.setState?.(state);

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
        this.persistState();
      });
    });
  }

  destroy() {
    this.persistState(); // Final save
  }

  private persistState() {
    localStorage.setItem('webos.settings', JSON.stringify({
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
