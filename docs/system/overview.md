# System overview

WebOS is a desktop environment that runs as a single-page Svelte 5 app, hosted statically on GitHub Pages. A kernel builds a fixed set of services (windows, files, apps, settings, ...) before anything renders. The shell (desktop, window manager, taskbar, toasts, dialogs) is a set of Svelte components that read those services. Apps are lazily loaded components that run inside windows and talk to the OS through the same services plus a per-window app context. There's no backend. Everything persistent lives in the browser: localStorage, OPFS and the service worker cache.

This page covers the CURRENT code. For intent and history, see [ADRs](../adrs/README.md). For where code goes and naming, see [CONVENTIONS](../CONVENTIONS.md).

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ Apps            src/lib/apps/{system,user}/{id}/                 │
│                 define_app() manifest (eager) + .app.svelte (lazy)│
│                 get_app_context() → window handle, storage handle │
├──────────────────────────────────────────────────────────────────┤
│ Shell           src/lib/core/components/                         │
│                 os.svelte → desktop, window-manager, toasts,      │
│                 taskbar, dialogs-host                             │
├──────────────────────────────────────────────────────────────────┤
│ Services        src/lib/core/api/services/{name}/                │
│                 settings windows files version notifications      │
│                 dialogs apps desktop                              │
├──────────────────────────────────────────────────────────────────┤
│ Kernel          src/lib/core/api/kernel/                         │
│                 registry, dependency order, init / shutdown       │
└──────────────────────────────────────────────────────────────────┘
        browser: localStorage · OPFS · Cache Storage / service worker
```

Each layer only reaches down. Shell components and apps get services with `kernel.service<T>("key")` inside `$derived` (see [kernel.md](kernel.md#consumer-rules)). Services get their dependencies the same way. The two exceptions to "only reaches down" are both in AppsService. It imports the app glob (`$lib/apps`), and it imports `open-with-dialog.svelte` from the shell to pass to DialogsService.

## Boot sequence

1. **`index.html`** paints a fixed full-screen `#splash` (Brand Dark `#17252c`, `/logo.svg`) and an empty `#app`. Body background is hardcoded to the same colour, so nothing flashes before the theme loads. In a production build, vite-plugin-pwa also injects `registerSW.js`.
2. **`src/main.ts`** imports `app.css` and `App.svelte`, then imports `kernel` from `src/lib/core/api/index.ts`. Evaluating that barrel creates the `Kernel` singleton, or reuses `window.kernel` (see [Debug handle](#debug-handle)). It also eagerly evaluates every app manifest (see [Circular-import rule](#the-barrel-and-the-circular-import-rule)).
3. **`await kernel.init()`** registers the default services (`init.ts`), resolves dependency order, then constructs each service and awaits its `init()`, one at a time. The actual order is `settings → windows → files → version → notifications → dialogs → apps → desktop` (see [kernel.md](kernel.md#init-order)). SettingsService's `init()` loads `webos.settings` and starts the effect that writes theme tokens to `<html>`. The splash is still showing.
4. **`mount(App, { target: #app, intro: true })`**. `App.svelte` renders `web-os.svelte`, and that renders `os.svelte`. Every service exists by now, so `kernel.service()` can never throw during render.
5. **`#splash` is removed** right after `mount()` returns.
6. **Shutdown hooks**: `pagehide` without `event.persisted` calls `kernel.shutdown()`. A bfcache-persisted pagehide keeps the services alive. HMR dispose unmounts the app and shuts the kernel down.

If `kernel.init()` throws (a service `init()` rejects, a dependency is missing, or there's a cycle), `main()` rejects and logs `Failed to initialize application:`. Nothing mounts and **the splash stays up forever**. There's no error screen.

`App.svelte` also imports `./app.css`, which `main.ts` already imports. The duplicate is harmless.

## Shell mount tree

```
App.svelte
└─ web-os.svelte
   └─ os.svelte                       grid; layout follows settings.taskbar.position
      ├─ desktop/desktop.svelte
      │  └─ desktop-item.svelte  (per grid cell)
      ├─ window-manager/window-manager.svelte
      │  └─ window/window.svelte  (per open window)
      │     ├─ window-titlebar.svelte
      │     └─ window-content.svelte  → set_app_context(), lazy app component
      ├─ notifications/toast-area.svelte
      ├─ taskbar/taskbar.svelte
      │  ├─ start-menu.svelte → start-menu-popover.svelte → brand/logo-lockup.svelte
      │  └─ taskbar-item.svelte  (per window)
      └─ dialogs/dialogs-host.svelte  (sibling of the grid; native <dialog>)
         └─ (component from DialogsService.stack, e.g. open-with-dialog.svelte)
```

The desktop, window manager and toast area share one grid cell, stacked with z-index. The taskbar gets the other cell. The `ov()` maps in `os.svelte` pick the cells from the taskbar position. Details are in [shell/](shell/) (written separately).

## Source map

| Path | What lives there |
|------|------------------|
| `index.html` | Splash, favicon/PWA links, `#app` mount point |
| `src/main.ts` | Boot: `kernel.init()`, mount, splash removal, pagehide/HMR shutdown |
| `src/App.svelte` | Renders `web-os.svelte` |
| `src/app.css` | Tailwind, fonts, `@theme inline` token mapping ([theming.md](theming.md)) |
| `src/assets/fonts/` | Self-hosted Inter and Hack with licences |
| `src/lib/core/web-os.svelte` | Renders `os.svelte` (thin wrapper) |
| `src/lib/core/api/index.ts` | The barrel and the kernel singleton |
| `src/lib/core/api/type.ts` | `IService`, `ServiceDescriptor` |
| `src/lib/core/api/kernel/` | `Kernel` class and `init.ts` (service registration) |
| `src/lib/core/api/services/{name}/` | One folder per service: `type.ts` (public interface), `service.svelte.ts` (class), pure helpers |
| `src/lib/core/contexts/app/` | `get_app_context()`, window handle, storage handle (ADR-003) |
| `src/lib/core/components/{feature}/` | Shell UI: `os.svelte`, desktop, window, window-manager, taskbar, files, dialogs, notifications, brand |
| `src/lib/core/utils/` | `cn`, `ov`, `format_bytes`, `Flags<T>`, `Order<T>`, geometry types |
| `src/lib/apps/index.ts` | Eager glob of `./system/*/index.ts` and `./user/*/index.ts` → `apps: AppManifest[]` |
| `src/lib/apps/system/` | OS apps: settings, file-explorer, kernel, text-viewer, media-preview, pdf-viewer ([system-apps.md](system-apps.md)) |
| `src/lib/apps/user/` | Non-OS apps (out of scope for these docs) |
| `vite-plugin-version.ts` | `__VERSION_INFO__` define and `version.json` ([services/version.md](services/version.md)) |
| `public/` | Static assets: logo, PWA icons, `files/` sample media (static only, not seeded into OPFS) |

## The barrel and the circular-import rule

`$lib/core/api` (`src/lib/core/api/index.ts`) re-exports `./kernel`, `./services` (each service's `index.ts`, which exports types plus a few pure values like `TaskbarPosition`, `THEME_PRESETS` and `define_app`), and `./type`. Its default export is the kernel singleton.

Evaluating the barrel causes this import cycle:

```
api/index.ts → kernel/kernel.svelte.ts → kernel/init.ts → services/apps/service.svelte.ts
  → $lib/apps (import.meta.glob, eager) → every {id}/index.ts manifest → $lib/core/api   ← still initializing
```

So while manifests evaluate, the barrel's `const` exports are in the temporal dead zone. **A manifest may import only types and hoisted functions from `$lib/core/api`.** Constants come from their own module, for example `FILE_PROPS` from `$lib/core/api/services/apps/helpers`. See [CONVENTIONS → Apps](../CONVENTIONS.md#apps).

## Debug handle

`src/lib/core/api/index.ts` stores the singleton on `window.kernel` and reuses an existing `window.kernel` on re-evaluation. This keeps one kernel across HMR, and it also gives you a console handle:

```js
kernel.services                       // SvelteMap of live services
kernel.service("windows").to_string()
```

`main.ts` logs `Application initialized` with the kernel after boot, and `src/lib/apps/index.ts` logs `Apps Found`. The Kernel system app lists `kernel.services` in the UI.
