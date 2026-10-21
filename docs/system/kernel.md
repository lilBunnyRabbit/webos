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
  destroy?(): void | Promise<void>;  // the kernel never awaits it (pagehide can't); only the test kernel does
  to_string(): string;    // debug text; the Kernel app's fallback when there's no inspector
  inspector?: () => Promise<{ default: Component<InspectorProps<never>> }>;  // ADR-020
  shell?(): ShellContribution;  // commands, completers, value types (ADR-033)
}

interface InspectorProps<T extends IService = IService> {
  service: T;
  detailed: boolean;      // basic view always; true adds the detailed view
}

interface ServiceDescriptor<T extends IService> {
  instance: new (kernel: Kernel) => T;   // class; constructed by the kernel with itself
  dependencies?: string[];               // registry keys
}
```

**Inspectors (ADR-020).** Every service ships `services/{key}/inspector.svelte`, wired as `inspector = () => import("./inspector.svelte")`. It's lazy, so inspector code is split out of boot and loads when the Kernel app opens. An inspector receives the concrete service and reads only its public API. It always renders the basic view (a row of `InspectorStat`s) and adds tables or other detail when `detailed` is true. Shared building blocks live in `src/lib/core/components/inspector/` (`InspectorStat`, `InspectorStats`, `InspectorTable`). The props are typed `InspectorProps<never>` so that a component typed for one service fits the shared field. The Kernel app casts once when rendering, which is safe because each service ships its own inspector.

There's a `// TODO: kernel to interface` in `type.ts`. `ServiceDescriptor` references the concrete `Kernel` class.

## Public API (`Kernel`)

| Member | Signature | Notes |
|--------|-----------|-------|
| `platform` | `readonly platform: Platform` (`"desktop" \| "mobile"`) | `detect_platform()` from `kernel/platform.ts`, read once when the singleton is built (ADR-016). `?platform=mobile\|desktop` in the URL wins; otherwise a phone (`navigator.userAgentData.mobile`, User-Agent Client Hints) or a coarse primary pointer that can't hover (`(pointer: coarse) and (hover: none)`, tablets) is mobile. The hint comes first because Samsung Internet on Galaxy phones reports `hover: hover`. Not reactive, never changes. Read in two places: `init.ts` imports and registers `MobileWindowsService` / `MobileDesktopService` under `windows` / `desktop` on mobile, and `main.ts` loads the mobile or desktop shell through `load_shell()` (`components/platform-shell.ts`) ([shell/mobile.md](shell/mobile.md)). Both are `import()`s, so the other platform's code is never downloaded (ADR-036). |
| `mode` | `readonly mode: Mode` (`"full" \| "solo"`) | `detect_mode()` from `kernel/mode.ts`, read once: solo when the boot hash starts with `#/solo/` (ADR-047). Never changes; the router reloads on a hash that crosses modes. Read in two places: `init.ts` registers `SoloAppsService` / `SoloSessionService` / `SoloVersionService` under `apps` / `session` / `version` (`mode_services`), and `load_shell(platform, mode)` loads the solo shell on any platform ([shell/solo.md](shell/solo.md)). Every key still exists in solo, so nothing an app reaches for throws |
| `services` | `readonly services: Map<string, IService>` | A `SvelteMap`, so lookups inside `$derived` are reactive to set/replace. Holds only fully initialized services. Public: the Kernel app iterates it. |
| `init` | `init(on_step?: (step: BootStep) => void): Promise<Kernel>` | Idempotent while initialized. Resolves the order of what was registered, then for each key: `on_step?.({ key, done, total })`, `new descriptor.instance(this)`, `await instance.init?.()`, `services.set(key, instance)`. `done` counts the services already initialised, `total` is the length of the order; the splash uses it ([Boot progress](#boot-progress)). Sets `is_initialized`. If a construction or `init()` throws, it tears down what already initialized and rethrows (see [Failed init](#failed-init)). |
| `register` | `register<T extends IService>(name: string, descriptor: ServiceDescriptor<T>): void` | Records a descriptor only, constructing nothing. Throws if called after init. Warns `Overwriting service "x"` on a duplicate key. |
| `service` | `service<T extends IService>(name: string): T` | Synchronous lookup. Throws `Service "x" not found` if absent. Unchecked cast to `T`. |
| `shutdown` | `shutdown(): void` | No-op unless initialized. Runs the private `teardown()`, then clears `is_initialized`. |

Private: `is_initialized`, `descriptors: Map<string, ServiceDescriptor>`, `init_order: string[]`, `resolve_order()`, `teardown()`.

`teardown()` calls `destroy?.()` on every service in `services`, in reverse init order. Each call is wrapped in try/catch so one failure doesn't stop the rest (`console.error`). Then it clears `services`, `descriptors` and `init_order`, so the next `init()` starts from nothing. Used by `shutdown()` and by a failed `init()`.

## Registration

`init.ts` → `register_default_services(kernel)` is **the** place services are registered. It is the only file that imports service classes. `main.ts` awaits it right before `kernel.init()`, so registration happens at boot, not at import time. The kernel module doesn't import it: `init.ts` reaches the app registry and the build stamp, which must stay out of the shared `core` chunk ([overview](overview.md#build--deploy), ADR-036 revision 2026-10-21). It's async: the platform variants of `windows` and `desktop` are `import()`ed for `kernel.platform` only (ADR-016, ADR-036), so they live in their own chunks.

`init.ts` also has a side-effect import of `services/windows/type`. AppsService loads every app manifest, and some read `WindowFlag` through the `$lib/core/api` barrel while the barrel is still mid-cycle. The windows service used to evaluate that module first; now that it's lazy, the explicit import keeps the order.

| Key | Class | `dependencies` |
|-----|-------|----------------|
| `settings` | `SettingsService` | `files`, `notifications` |
| `windows` | `WindowsService` | none |
| `files` | `FilesService` | none |
| `version` | `VersionService` | `files`, `notifications`, `dialogs`, `apps`, `session` |
| `notifications` | `NotificationsService` | none |
| `dialogs` | `DialogsService` | `windows` |
| `apps` | `AppsService` | `windows`, `notifications`, `files`, `settings`, `dialogs` |
| `desktop` | `DesktopService` | `files`, `apps` |
| `session` | `SessionService` | `windows`, `apps`, `files`, `dialogs`, `notifications` |
| `clipboard` | `ClipboardService` | `files` |
| `ui` | `UiService` | `windows`, `dialogs` |
| `shell` | `ShellService` | `files`, `dialogs`, `notifications` |
| `shortcuts` | `ShortcutsService` | `windows`, `dialogs`, `shell` |
| `tasks` | `TasksService` | `notifications` |
| `backup` | `BackupService` | `files`, `dialogs`, `notifications`, `windows`, `tasks` |
| `ai` | `AiService` | `files`, `tasks`, `notifications`. `MobileAiService` on mobile, picked by `platform_services` (ADR-046) |
| `scheduler` | `SchedulerService` | `files`, `notifications`, `apps`, `shell`. The same class in solo (ADR-062) |
| `router` | `RouterService` | `windows`, `apps`, `session`, `clipboard`, `notifications` |
| `extract` | `ExtractService` | `windows`, `dialogs`, `notifications`. Desktop only: registered by `platform_services` (ADR-043) |

### Dependency graph

```
files, notifications ───────────────────────────────► settings
windows ────────────────────────────────────────────► dialogs
windows, notifications, files, settings, dialogs ───► apps
files, apps ────────────────────────────────────────► desktop
windows, apps, files, dialogs, notifications ───────► session
files, dialogs, notifications ──────────────────────► shell
windows, dialogs, shell ────────────────────────────► shortcuts
notifications ──────────────────────────────────────► tasks
files, notifications, apps, shell ──────────────────► scheduler
files, dialogs, notifications, windows, tasks ──────► backup
files, tasks, notifications ────────────────────────► ai
windows, apps, session, clipboard, notifications ───► router
windows, dialogs, notifications ────────────────────► extract (desktop)
files, notifications, dialogs, apps, session ───────► version
```

### Init order

`resolve_order()` is a depth-first topological sort. It visits keys in **registration order** and pushes each one after its dependencies. `settings` is registered first but depends on `files` and `notifications`, so both are pushed before it. With the registrations above, the order is:

```
files → notifications → settings → windows → dialogs → apps → desktop → session → extract (desktop) → clipboard → ui → shell → shortcuts → scheduler → tasks → backup → ai → router → version
```

Shutdown runs the reverse: `version → router → ai → backup → tasks → scheduler → shortcuts → shell → ui → clipboard → extract → session → desktop → apps → dialogs → windows → settings → notifications → files`.

`version` is registered last on purpose: its `init()` requests the introduction after SessionService requested the Restore dialog, so the introduction is the topmost modal at boot and Restore shows once it closes (ADR-026).

Errors thrown during resolution, before anything is constructed:

- `Circular service dependency: a -> b -> a`
- `Service "x" not registered (required by "y")`

## Lifecycle

| Phase | What happens |
|-------|--------------|
| Construct | `new Class(kernel)`. By convention ([CONVENTIONS → Services](../CONVENTIONS.md#services)) the constructor only sets fields. Most services capture dependencies in the constructor as `$derived(kernel.service(...))`; only FilesService and the windows services don't, having no dependencies. It's safe because the dependencies are already in `services`. |
| `init()` | Awaited serially. A service may use its dependencies here, because they're already initialized and registered. Side effects (`$effect.root`, timers, listeners, storage reads) belong here. |
| Registered | Only after `init()` resolves does the service enter `services`. No consumer ever sees a half-initialized service. |
| `destroy()` | Its cleanup is synchronous and must undo everything `init()` started. It may return a promise for work already on its way (a save), which the kernel never awaits; only the test kernel's `shutdown()` does. |

Which services implement which hooks today:

| Service | `init` | `destroy` |
|---------|--------|-----------|
| settings | read `/etc/settings.json` (import + remove legacy `webos.settings` / v0 `settings`), start token + save effects | dispose effects |
| version | start 30-min poll, `visibilitychange` listener; read `/var/lib/version/state.json`, then request the introduction (first boot) or toast "Updated to vX" and, once Restore is answered, announce the apps those releases introduce ([version](services/version.md#release-notes-and-introduction)) | clear both |
| notifications | listen for clicks on its OS notifications (`listen_clicks`, [notifications](services/notifications.md#system-notifications)) | stop listening, clear toast timers |
| dialogs | register the close prompt with windows (save-changes sheet, ADR-029), start the effect that resolves a closed window's sheets ([dialogs](services/dialogs.md)) | dispose both, resolve every open entry `null` |
| files | `ensure_hierarchy`: create the folder layout, migrate a flat root once, empty `/tmp` ([files](services/files.md#hierarchy)) | none |
| desktop | list `/home/Desktop`, read `/var/lib/desktop/layout.json`, seed on first boot (from v0 pins if any), start the revision watcher; the desktop variant then adds default widgets not yet recorded in `/var/lib/desktop/additions.json` ([desktop](services/desktop.md#lifecycle)) | dispose the watcher |
| session | read `/var/lib/session/session.json`; empty → start saving; else start the restore dialog **without awaiting it** (it renders after mount) and save only after the answer ([session](services/session.md#lifecycle)) | dispose the saving effect |
| router | listen to `hashchange`; an effect opens the hash's link once the session status leaves `pending` ([router](services/router.md#lifecycle)) | remove the listener, dispose the effect |
| shell | read the shared history from `/var/lib/shell/history` ([shell](services/shell.md#lifecycle)) | return the pending history save |
| ui | `pointerup` / `keydown` (capture) listeners that arm the back guard, and a `popstate` listener ([ui](services/ui.md#back)) | remove them |
| windows (both, in `BaseWindowsService`) | `beforeunload` listener (warns while a window is dirty, ADR-029), `visibilitychange` listener (page hidden state) | remove them |
| shortcuts | register the OS defaults, global `keydown` listener ([shortcuts](services/shortcuts.md)) | remove the listener, dispose the defaults |
| scheduler | read `/var/lib/scheduler/jobs.json`, open the `webos:scheduler` BroadcastChannel, wake-up listeners (`visibilitychange`, `resume`, `pageshow`, `focus`), the folder-revision and uninstalled-app effects, the notification-click listener, post `webos:ready` to the service worker, request the leader lock **without awaiting it** ([scheduler](services/scheduler.md#lifecycle)) | clear the timer, abort the lock request or release the lock, close the channel, remove every listener and effect |
| apps, clipboard, tasks, backup | none | none |
| ai | asks the browser which features it has, **without awaiting** (every feature reads `no` until it answers) ([ai](services/ai.md#lifecycle)); the mobile variant has no `init` | destroy kept model sessions |
| extract | `pointerdown` / `keydown` (capture) listeners on `window` for `input_inside`, an `$effect.root` that closes a closed window's mini window; while one is out, a `pagehide` listener and two `MutationObserver`s ([extract](services/extract.md)) | dispose it, close the mini window |

### Test kernel

`kernel/test-kernel.ts` (tests only, ADR-027): `boot_test_kernel(services)` constructs and initialises the listed services into a real `Kernel`, in the order given. Its `shutdown()` is async: it awaits each service's `destroy()` in reverse order, then clears `services`. Callers await it (`afterEach(async () => await shutdown?.())`), so a save still on its way lands before the next test's `clear_opfs()`. `stub_service(name, members)` stands in for a service only UI can resolve.

### Shell hook

`IService.shell?(): ShellContribution` is optional. A service that has it adds commands, completers and value types to the shell. ShellService reads it from every service in `services` through a `$derived`, so it doesn't matter which one initialises first ([shell](services/shell.md#contributions), ADR-033).

### Boot progress

`main.ts` passes `on_step` to `kernel.init()` (ADR-036). The kernel stays serial (ADR-002); the callback only reports.

- **Splash.** `index.html` has `#splash-progress` under the logo: a 160px, 3px track (`#splash-bar`, `transform: scaleX(done / total)`, 150 ms ease-out) and a 12px label (`#splash-label`, `Loading` until the first step). Colours are Brand Dark tokens hardcoded as OKLCH (track `background_lightest`, bar `primary`, label `foreground`), since no theme exists before boot and the brand keeps the splash dark. `main.ts` maps each key to a short label (`files` → "Files", `ui` → "Interface", `scheduler` → "Alarms", `tasks` → "Tasks", `backup` → "Backup", `ai` → "On-device AI", `extract` → "Windows", `router` → "Links", `version` → "Updates"; an unknown key shows as-is). The splash knows keys only, no service logic.
- **Warm.** On each step `main.ts` runs the warmers whose service is already initialised. The `desktop` warmer `import()`s the widget component of every widget in `desktop.items()` (the mobile home lists no widgets, so nothing). SessionService warms the components of the saved session's apps itself, in its `init()`. Warms are fire-and-forget and ignore errors; the real import retries. Nothing renders before mount.
- **Shell.** `main.ts` starts `load_shell(kernel.platform, kernel.mode)` alongside `kernel.init()` and awaits both, then passes the component to `App` as the `shell` prop (`App` → `web-os` → `os.svelte`). It renders in the same frame the splash goes.
- **Errors.** A failed shell import rejects `main()` like a failed init: the splash shows the boot error and `#splash-progress` is removed.

### Failed init

If a constructor or `init()` throws or rejects, `kernel.init()` calls `teardown()` and rethrows. Services that already finished `init()` get `destroy()` in reverse order, and the kernel is left empty with `is_initialized === false`. There's no partial OS (ADR-002).

`main.ts` catches the rejection, logs `Failed to initialize application:` and calls `show_boot_error()`. That appends `WebOS failed to start: <message>` to `#splash`, in monospace and the Brand Dark error colour (`oklch(0.745 0.1398 30)`, hardcoded because no theme token exists yet). Nothing mounts and the splash stays up with the message.

Two cases teardown doesn't cover:

- The service that failed isn't in `services` yet, so its own `destroy()` never runs. Anything its `init()` started before throwing (an effect root, a listener) leaks.
- `resolve_order()` runs before the `try`. A missing dependency or a cycle rejects `init()` without clearing `descriptors`. Nothing was constructed, so nothing leaks, but a retry in the same page logs `Overwriting service` for every key.

### HMR

`api/index.ts` reuses `window.kernel` when it exists, so a module re-evaluation keeps the same `Kernel` instance. `main.ts`'s `import.meta.hot.dispose` unmounts the app and calls `kernel.shutdown()`, which empties `services` and `descriptors`. When `main.ts` runs again, `kernel.init()` sees `is_initialized === false`, re-registers the fifteen services into empty maps and reconstructs them into the same `SvelteMap`. Between shutdown and re-init, `kernel.service()` throws `not found`.

Because the old instance is reused, edits to `kernel.svelte.ts` itself don't take effect until a full reload.

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
- A failed `init()` doesn't destroy the service that threw, only the ones before it.
- A `resolve_order()` failure (missing dependency, cycle) leaves `descriptors` filled.
- The boot error is a line of text on the splash. No retry button, no reset-settings escape hatch.
