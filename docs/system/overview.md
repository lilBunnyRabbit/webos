# System overview

WebOS is a desktop environment that runs as a single-page Svelte 5 app, hosted statically on GitHub Pages. A kernel builds a fixed set of services (windows, files, apps, settings, session, ...) before anything renders. The shell (desktop, window manager, taskbar, toasts, dialogs) is a set of Svelte components that read those services. Apps are lazily loaded components that run inside windows and talk to the OS through the same services plus a per-window app context. There's no backend. Everything persistent lives in the browser: OPFS (user files plus OS config and state in `/etc` and `/var/lib`), localStorage (app storage only) and the service worker cache.

This page covers the CURRENT code. For intent and history, see [ADRs](../adrs/README.md). For where code goes and naming, see [CONVENTIONS](../CONVENTIONS.md).

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ Apps            src/lib/apps/{system,user}/{id}/                 │
│                 define_app() manifest (eager) + .app.svelte (lazy)│
│                 get_app_context() → window handle, storage handle │
├──────────────────────────────────────────────────────────────────┤
│ Shell           src/lib/core/components/                         │
│                 os.svelte → platform shell (desktop or mobile),   │
│                 update overlay                                    │
├──────────────────────────────────────────────────────────────────┤
│ Services        src/lib/core/api/services/{name}/                │
│                 settings windows files version notifications      │
│                 dialogs apps desktop session clipboard ui shell   │
│                 shortcuts tasks backup router                     │
├──────────────────────────────────────────────────────────────────┤
│ Kernel          src/lib/core/api/kernel/                         │
│                 registry, dependency order, init / shutdown       │
└──────────────────────────────────────────────────────────────────┘
        browser: localStorage · OPFS · Cache Storage / service worker
```

Each layer only reaches down. Shell components and apps get services with `kernel.service<T>("key")` inside `$derived` (see [kernel.md](kernel.md#consumer-rules)). Services get their dependencies the same way. The exceptions to "only reaches down" are services importing what they hand to DialogsService. AppsService imports the app glob (`$lib/apps`) and lazily imports `open-with-dialog.svelte`. DialogsService (`save-changes-dialog.svelte`) and VersionService (`intro-dialog.svelte`) lazy-import theirs the same way. BackupService lazy-imports `confirm-dialog.svelte` with the rest of its restore code. A few stay eager: SessionService's Restore dialog (boot shows it), DialogsService's `context-menu.svelte`, ShellService's `confirm-dialog.svelte` and the shortcuts command's `shortcuts-dialog.svelte` (`shortcuts/shell-run.ts`).

## Boot sequence

1. **`index.html`** paints a fixed full-screen `#splash` (Brand Dark `#17252c`, `/logo.svg`, and a progress bar with a `Loading` label under it) and an empty `#app`. Body background is hardcoded to the same colour, so nothing flashes before the theme loads. In a production build, vite-plugin-pwa also injects `registerSW.js`, and a local plugin in `vite.config.ts` adds `<link rel="preload" as="font" crossorigin>` for the hashed `InterVariable` woff2 (ADR-036).
2. **`src/main.ts`** imports `app.css` and `App.svelte`, then imports `kernel` from `src/lib/core/api/index.ts`. Evaluating that barrel creates the `Kernel` singleton, or reuses `window.kernel` (see [Debug handle](#debug-handle)). It also eagerly evaluates every app manifest (see [Circular-import rule](#the-barrel-and-the-circular-import-rule)).
3. **`await kernel.init(on_step)`**, in parallel with `load_shell(kernel.platform)`, which downloads only this platform's shell chunk. `init()` registers the default services (`init.ts`, which `import()`s only this platform's `windows` and `desktop` classes), resolves dependency order, then constructs each service and awaits its `init()`, one at a time. Before each one, `on_step` moves the splash bar and sets its label, and starts warming chunks the first screen needs: after `desktop`, the widget components on the desktop; SessionService warms the saved session's app components itself ([kernel.md](kernel.md#boot-progress)). The actual order is `files → settings → windows → notifications → dialogs → apps → desktop → session → clipboard → ui → shell → shortcuts → tasks → backup → router → version` (see [kernel.md](kernel.md#init-order)). FilesService's `init()` builds the OPFS hierarchy (`/home` with `Desktop`/`Documents`/`Downloads`, `/etc`, `/var/lib`, `/tmp`), migrates a pre-hierarchy flat root into `/home` once, and empties `/tmp` ([files](services/files.md#hierarchy)). SettingsService's `init()` reads `/etc/settings.json` (importing and removing the legacy localStorage `webos.settings`, or the v0 React `settings` key, once) and starts the effect that writes theme tokens to `<html>`. DesktopService's `init()` lists `/home/Desktop`, reads `/var/lib/desktop/layout.json`, seeds shortcuts on first boot (v0 React pins if present, else two defaults), and starts watching the folder's revision ([desktop](services/desktop.md#lifecycle)). SessionService's `init()` reads `/var/lib/session/session.json`; if it holds windows, it requests the restore dialog without awaiting it, so the dialog appears right after mount and windows are restored only if the user picks Restore ([session](services/session.md)). VersionService's `init()` reads `/var/lib/version/state.json`: no file loads the introduction's chunk and requests the full-screen introduction (above Restore), an older seen release toasts "Updated to vX" ([version](services/version.md#release-notes-and-introduction)). That's async OPFS work on the boot path, and no OPFS means no boot. The splash is still showing.
4. **`mount(App, { target: #app, props: { shell }, intro: true })`**. `App.svelte` renders `web-os.svelte`, and that renders `os.svelte`, which renders the loaded platform shell and the update overlay. Every service exists by now, so `kernel.service()` can never throw during render.
5. **`#splash` is removed** right after `mount()` returns.
6. **Shutdown hooks**: `pagehide` without `event.persisted` calls `kernel.shutdown()`. A bfcache-persisted pagehide keeps the services alive. HMR dispose unmounts the app and shuts the kernel down.

If `kernel.init()` throws (a service `init()` rejects, a dependency is missing, or there's a cycle), the kernel tears down the services that already initialized and rethrows. `main()` rejects, logs `Failed to initialize application:`, and `show_boot_error()` appends `WebOS failed to start: <message>` to the splash in the Brand Dark error colour. Nothing mounts. See [kernel.md](kernel.md#failed-init).

`App.svelte` also imports `./app.css`, which `main.ts` already imports. The duplicate is harmless.

## Shell mount tree

```
App.svelte
└─ web-os.svelte
   └─ os.svelte                       renders the platform shell main.ts loaded (ADR-016, ADR-036)
      ├─ mobile/mobile-shell.svelte   phones and tablets, see shell/mobile.md
      │  └─ … + its own dialogs/dialogs-host.svelte (anchored="sheet")
      ├─ desktop-shell.svelte         grid; layout follows settings.taskbar.position
      │  ├─ desktop/desktop.svelte
      │  │  ├─ wallpaper.svelte
      │  │  ├─ desktop-widget.svelte  (per widget item)
      │  │  └─ desktop-item.svelte  (per grid cell) → desktop-item-face.svelte
      │  ├─ window-manager/window-manager.svelte
      │  │  └─ window/window.svelte  (per open window)
      │  │     ├─ window-titlebar.svelte
      │  │     ├─ window-content.svelte  → lazy app component
      │  │     └─ window-sheets.svelte   → this window's dialog sheets (ADR-025)
      │  ├─ notifications/toast-area.svelte → notification-item.svelte
      │  ├─ taskbar/taskbar.svelte
      │  │  ├─ start-menu.svelte → start-menu-popover.svelte → brand/logo-lockup.svelte, command-mode.svelte
      │  │  ├─ taskbar-item.svelte  (per window)
      │  │  ├─ terminal-button.svelte
      │  │  └─ taskbar-tray.svelte → taskbar-clock.svelte, notifications/notification-list.svelte
      │  └─ dialogs/dialogs-host.svelte  (after the grid; native <dialog>)
      │     └─ (component from DialogsService: open-with-dialog.svelte, restore-session-dialog.svelte, ...)
      └─ update/update-overlay.svelte
```

`os.svelte` gets the shell as a prop: `main.ts` awaits `load_shell(kernel.platform)` (`components/platform-shell.ts`, the one platform branch) alongside `kernel.init()`, so only this device's shell chunk downloads.

The desktop, window manager and toast area share one grid cell, stacked with z-index. The taskbar gets the other cell. The `ov()` maps in `desktop-shell.svelte` pick the cells from the taskbar position. The grid itself paints `background-darkest`, so the floating taskbar's transparent strip shows the same shade as the desktop. Details are in [shell/](shell/).

## Source map

| Path | What lives there |
|------|------------------|
| `index.html` | Splash, favicon/PWA links, description and Open Graph/Twitter card meta (`public/og.png`, 1200×630, rendered from `scripts/og/og.html` by `bun run og`; absolute URLs because crawlers ignore `base`), `#app` mount point |
| `src/main.ts` | Boot: `kernel.init(on_step)` with the splash progress and chunk warming, `load_shell()`, mount, splash removal, boot error on the splash, pagehide/HMR shutdown |
| `src/App.svelte` | Renders `web-os.svelte` |
| `src/app.css` | Tailwind, fonts, `@theme inline` tokens (colours, type, radius, shadows, easing, `pop-in`), base layer ([theming.md](theming.md)) |
| `src/assets/fonts/` | Self-hosted Inter and Hack with licences |
| `src/lib/core/web-os.svelte` | Renders `os.svelte` (thin wrapper) |
| `src/lib/core/api/index.ts` | The barrel and the kernel singleton |
| `src/lib/core/api/type.ts` | `IService`, `ServiceDescriptor` |
| `src/lib/core/api/kernel/` | `Kernel` class and `init.ts` (service registration) |
| `src/lib/core/api/services/{name}/` | One folder per service: `type.ts` (public interface), `service.svelte.ts` (class), pure helpers |
| `src/lib/core/contexts/app/` | `get_app_context()`, window handle, storage handle (ADR-003) |
| `src/lib/core/components/{feature}/` | Shell UI: `os.svelte`, `desktop-shell.svelte`, `platform-shell.ts` (`load_shell`), desktop, window, window-manager, taskbar, mobile, files, dialogs, notifications, update (update overlay), intro (first-boot introduction), apps (`app-badge.svelte`), theme (`theme-card.svelte`), brand, inspector (building blocks for service inspectors), code (CodeMirror setup shared by Text Editor, Diff and Markdown to PDF: `token_theme`, `token_highlight`, `Language`, `language_for`, `load_language`) |
| `src/lib/core/components/ui/` | The UI kit (ADR-024): Button, IconButton (both with a `pressed` toggle state), CopyButton, Input, Textarea, Select, Slider, Switch, Checkbox, Segmented (`sm` / `md`), Section, SettingRow, SideNav, Toolbar, StatusBar, Badge, EmptyState, BoardOverlay, Spinner, Kbd, Separator, plus `variants.ts` (`button`, `field`, `badge` recipes) and `types.ts` (`IconComponent`). Imported from `$lib/core/components/ui`. Documented in [docs/design/components.md](../design/components.md) |
| `src/lib/core/utils/` | `cn` (tailwind-merge extended with the custom tokens), `tv` (tailwind-variants with the same merge config), `ov`, `format_bytes`, `format_date`, `format_datetime`, `error_message` (an `Error`'s message, anything else stringified), `clamp`, `pad2`, `escape_html` (`&`, `<`, `>`, `"`, `'`), `Flags<T>`, `Order<T>`, geometry types; `date.ts`: `day_key`, `resolve_day`, `parse_time`; `resolve_token` (canvas colour from a token, in `utils.ts`); `history.ts`: immutable undo history (`create_history`, `push` with entry and optional byte limits, default 100 entries, `undo`, `redo`, `current`, `can_undo`, `can_redo`), held in `$state.raw` (Paint, Image Editor); `image.ts`: image load, drop/paste, canvas helpers, `write_image` and `save_image`, shared by the image user apps (imported directly, not through the barrel); `image-format.ts`: the kernel-free part (formats, extension map, `format_of`), re-exported by `image.ts`; `ticker.svelte.ts`: `Ticker`, a visibility-gated reactive `now` for live clock displays; `qr.ts`: QR encode (`qr_path`) and detect (`create_qr_detector`, native `BarcodeDetector` or lazy jsQR); `qr-scan.svelte.ts`: `CameraScan`, a live camera QR scan that releases the camera while its window isn't visible (QR Reader, P2P Transfer); `install.svelte.ts`: `installer`, the PWA install prompt and state ([version](services/version.md#install)); `zip/`: the zip engine (read, write through `ZipWriter` and extract through `ZipExtractor`, one entry at a time, streaming deflate, OPFS extract and `compress_into` / `extract_to`, run as [TasksService](services/tasks.md) jobs), used by File Explorer's Compress and Extract here, by the Archive app and by backups; also `selection.ts` (multi-select rules shared by the desktop and File Explorer), `view-transition.ts`, `long-press.ts`, `device-file.ts` (`pick_device_files`), `print.ts`, `random.ts` (seeded RNG) and `detached-root.svelte.ts` |
| `src/lib/apps/index.ts` | Eager glob of `./system/*/index.ts` and `./user/*/index.ts` → `apps: AppManifest[]` |
| `src/lib/apps/system/` | OS apps: settings, file-explorer, kernel, text-editor, media-preview, pdf-viewer, html-preview, csv-viewer, activity-monitor, style-guide, calculator, app-library, terminal, getting-started ([system-apps.md](system-apps.md)) |
| `src/lib/apps/user/` | Non-OS apps (out of scope for these docs) |
| `vite-plugin-version.ts` | `__VERSION_INFO__` define and `version.json` ([services/version.md](services/version.md)) |
| `public/` | Static assets: logo, favicons, PWA icons, `robots.txt` |
| `docs/design/` | How the OS should look: foundations, components, patterns, shell. The Style Guide app renders it live |

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

Boot logs nothing on success. The Kernel system app lists `kernel.services` in the UI.

## Build & deploy

- `vite.config.ts` sets `base: "/webos/"`: the site is the GitHub Pages project site `lilbunnyrabbit.github.io/webos/`. Dev serves under the same path (`localhost:5173/webos/`). Vite rewrites `index.html` asset URLs, the PWA manifest gets `scope` and `start_url` `/webos/`, and the SW registers at `/webos/sw.js`. Runtime URLs go through `import.meta.env.BASE_URL` (only `version.json` today).
- `.github/workflows/deploy.yml` runs on every push to `master` (and manually). Job `fork` deletes `src/lib/apps/user`, then runs `bun run check` → `bun run test:unit` → `bun run build`: a fork that keeps only core must still work. Job `deploy` waits for it, then runs Bun install → `bun run check` → `bun run test:unit` → `bun run build` → `bun run budget` → upload `dist/` → `actions/deploy-pages`. A type error, a failing unit test, a broken fork or an entry chunk over budget blocks the deploy.
- Boot budget: `scripts/boot-budget.ts` gzips the module scripts `dist/index.html` loads and fails over 185 KB gz (166.9 KB at 1.0; raised from 180 on 2026-10-17 for app wave 7).
- Branches: `master` is this Svelte version. The React version (v0) is frozen on `v0-react`.

### Upgrading from v0 (React)

The origin is shared, so a v0 user's storage is still there on first load. Nothing is lost:

| v0 storage | Becomes | Where |
|------------|---------|-------|
| OPFS root (all files and folders) | `/home/...`; a v0 `Documents` folder is `/home/Documents` | `ensure_hierarchy` ([files](services/files.md#hierarchy)) |
| localStorage `settings` (zustand) | `/etc/settings.json`: taskbar position; theme only if changed from v0's defaults, else Brand Dark | `take_v0_settings` ([settings](services/settings.md)) |
| localStorage `desktop` (zustand) | `.desktop` shortcuts at the same grid cells; pins of apps that weren't ported are dropped | `take_v0_pins` ([desktop](services/desktop.md#behaviour--invariants)) |

Both localStorage keys are removed once read.
