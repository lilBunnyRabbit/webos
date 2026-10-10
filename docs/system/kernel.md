# Kernel

Source: `src/lib/core/api/kernel/` (`kernel.svelte.ts`, `init.ts`), `src/lib/core/api/type.ts`, singleton in `src/lib/core/api/index.ts` · ADR: [ADR-002](../adrs/002-service-lifecycle.md), [ADR-016](../adrs/016-mobile-support.md) (why services are swappable)

## Purpose

The kernel is a service registry with dependency resolution. It builds every service in dependency order before the UI mounts, hands them out by key, and tears them down in reverse. Its reason to exist is swappability: consumers look services up by key, never by class, so one implementation can be replaced by another (desktop vs mobile, ADR-016). It is **not** a security boundary. Apps import the same singleton and can reach every service.

## Types (`type.ts`)

```ts
interface IService {
  name: string;           // class name, e.g. "WindowsService"
  description: string;
  init?(): Promise<void> | void;
  destroy?(): void;       // sync on purpose: pagehide never awaits
  to_string(): string;
}

interface ServiceDescriptor<T extends IService> {
  instance: new (kernel: Kernel) => T;   // class; constructed by the kernel with itself
  dependencies?: string[];               // registry keys
}
```

There's a `// TODO: kernel to interface` in `type.ts`. `ServiceDescriptor` references the concrete `Kernel` class.

## Public API (`Kernel`)

| Member | Signature | Notes |
|--------|-----------|-------|
| `services` | `readonly services: Map<string, IService>` | A `SvelteMap`, so lookups inside `$derived` are reactive to set/replace. Holds only fully initialized services. Public: the Kernel app iterates it. |
| `init` | `init(): Promise<Kernel>` | Idempotent while initialized. Calls `register_default_services(this)`, resolves order, then for each key: `new descriptor.instance(this)`, `await instance.init?.()`, `services.set(key, instance)`. Sets `is_initialized`. |
| `register` | `register<T extends IService>(name: string, descriptor: ServiceDescriptor<T>): void` | Records a descriptor only, constructing nothing. Throws if called after init. Warns `Overwriting service "x"` on a duplicate key. |
| `service` | `service<T extends IService>(name: string): T` | Synchronous lookup. Throws `Service "x" not found` if absent. Unchecked cast to `T`. |
| `shutdown` | `shutdown(): void` | No-op unless initialized. Calls `destroy?.()` on each service in reverse init order. Each is wrapped in try/catch so one failure doesn't stop the rest (`console.error`). Then clears `is_initialized`. |

Private: `is_initialized`, `descriptors: Map<string, ServiceDescriptor>`, `init_order: string[]`, `resolve_order()`.

## Registration

`init.ts` → `register_default_services(kernel)` is **the** place services are registered. It is the only file that imports service classes. Called from `init()`, so registration happens at boot, not at import time.

| Key | Class | `dependencies` |
|-----|-------|----------------|
| `settings` | `SettingsService` | none |
| `windows` | `WindowsService` | none |
| `files` | `FilesService` | none |
| `version` | `VersionService` | none |
| `notifications` | `NotificationsService` | none |
| `dialogs` | `DialogsService` | `windows` |
| `apps` | `AppsService` | `windows`, `notifications`, `files`, `settings`, `dialogs` |
| `desktop` | `DesktopService` | `apps` |

### Dependency graph

```
settings ──────────────┐
windows ──┬─► dialogs ─┤
          └────────────┼─► apps ─► desktop
files ─────────────────┤
notifications ─────────┘
version   (standalone)
```

### Init order

`resolve_order()` is a depth-first topological sort. It visits keys in **registration order** and pushes each one after its dependencies. With the registrations above, the order is:

```
settings → windows → files → version → notifications → dialogs → apps → desktop
```

Shutdown runs the reverse: `desktop → apps → dialogs → notifications → version → files → windows → settings`.

Errors thrown during resolution, before anything is constructed:

- `Circular service dependency: a -> b -> a`
- `Service "x" not registered (required by "y")`

## Lifecycle

| Phase | What happens |
|-------|--------------|
| Construct | `new Class(kernel)`. By convention ([CONVENTIONS → Services](../CONVENTIONS.md#services)) the constructor only sets fields. Some services capture dependencies in the constructor as `$derived(kernel.service(...))`. AppsService does this, and it's safe because the dependencies are already in `services`. |
| `init()` | Awaited serially. A service may use its dependencies here, because they're already initialized and registered. Side effects (`$effect.root`, timers, listeners, storage reads) belong here. |
| Registered | Only after `init()` resolves does the service enter `services`. No consumer ever sees a half-initialized service. |
| `destroy()` | Synchronous. It must undo everything `init()` started. |

Which services implement which hooks today:

| Service | `init` | `destroy` |
|---------|--------|-----------|
| settings | load `webos.settings`, start token + save effects | dispose effects |
| version | start 30-min poll, `visibilitychange` listener | clear both |
| notifications | none | clear toast timers |
| dialogs | none | yes (see [dialogs](services/dialogs.md)) |
| windows, files, apps, desktop | none | none |

### Failed init

If any `init()` throws or rejects, `kernel.init()` rejects. `main.ts` logs it and never mounts, and the splash stays up. There's no partial OS (ADR-002). Services that **already** finished `init()` stay in `services` and are not destroyed. Their effects, timers and listeners keep running, and `is_initialized` stays `false`, so `shutdown()` won't clean them up either.

### HMR

`api/index.ts` reuses `window.kernel` when it exists, so a module re-evaluation keeps the same `Kernel` instance and its services. `main.ts`'s `import.meta.hot.dispose` unmounts the app and calls `kernel.shutdown()`. When `main.ts` runs again, `kernel.init()` sees `is_initialized === false` and does a full re-init. It reconstructs every service into the existing `SvelteMap`.

Side effects worth knowing:

- `shutdown()` clears neither `descriptors` nor `services`. The re-init re-registers all eight keys and logs `Overwriting service "…"` eight times. Between shutdown and re-init, `kernel.service()` still returns the destroyed instances.
- Because the old instance is reused, edits to `kernel.svelte.ts` itself don't take effect until a full reload.

## Consumer rules

```ts
import kernel, { type WindowsService } from "$lib/core/api";

const windows = $derived(kernel.service<WindowsService>("windows"));
windows.focus(id);      // always through the prefix
```

- Always wrap the lookup in `$derived`. `services` is a `SvelteMap`, so the derived value follows a replaced instance. That's what keeps a future swap possible (ADR-016).
- Never destructure (`const { focus } = windows`). Destructuring detaches you from the instance and from reactivity.
- Never import a service class to call it. Import the interface type from the barrel. Only `init.ts` imports classes.
- Non-component code that can't use `$derived` should read through a function on every access, as `create_window_handle()` does (`const windows = () => kernel.service<WindowsService>("windows")`).
- `kernel.service()` throws for an unknown key. That's intended: a missing service is a programming error.

## Divergence from ADR

ADR-002's revision note matches the code. The original ADR body (`swap()`, `get_state()`/`set_state()`, async `destroy`, `beforeunload`) is superseded by that note. `swap()` and state export are deliberately not built.

## Known gaps

- No `swap()`. `services` is reactive, but nothing replaces an entry after boot (ROADMAP: deferred until session persistence).
- `type.ts` → `Kernel` is a class, not an interface (`TODO: kernel to interface`).
- A failed init leaks the services that did initialize, and the splash never goes away (no boot error UI).
- `shutdown()` leaves stale `services`/`descriptors`, which causes the overwrite warnings on HMR re-init.
