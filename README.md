# WebOS

A desktop environment in the browser: windows, a taskbar, a desktop grid, a sandboxed file system, and apps that load on demand. Built with Svelte 5 runes, TypeScript, Tailwind v4 and Vite. The file system is the Origin Private File System. Hosting is static (GitHub Pages) with no backend.

It's a personal learning project and a home for my side projects. The architecture and the decisions behind it are the point as much as the features are.

## Run

```bash
bun install
bun dev
bun run check   # svelte-check + tsc, must stay at 0 errors
bun run test    # unit (Node) + browser (Chromium) tests
bun run build
```

First test run needs `bunx playwright install chromium`.

## How it's built

A small kernel holds a registry of 20 services: settings, windows, files, notifications, dialogs, apps, desktop, session, extract, clipboard, ui, shell, shortcuts, scheduler, tasks, offline, backup, ai, router and version. Each declares its dependencies, and `kernel.init()` builds them in that order while the splash shows progress. Components reach a service by name, so one implementation can be swapped for another: phones get their own windows and desktop services and their own shell, and each device downloads only its own shell. Apps are folders with a `define_app()` manifest. The manifest is discovered by glob and the app's component loads lazily. Everything persistent lives in the Origin Private File System under a Unix-lite tree.

```mermaid
flowchart TD
  subgraph boot["Boot (src/main.ts)"]
    main["main.ts"] --> init["kernel.init()<br/>BootStep → splash progress bar"]
    main --> load["load_shell(platform)<br/>lazy import"]
    init --> mount["mount App → os.svelte"]
    load --> mount
  end

  subgraph kernel["Kernel: service registry, init in dependency order"]
    files["files<br/>OPFS"]
    settings["settings"]
    windows["windows<br/>desktop or mobile"]
    notifications["notifications"]
    dialogs["dialogs"]
    apps["apps"]
    desktop["desktop<br/>desktop or mobile"]
    session["session"]
    clipboard["clipboard"]
    ui["ui"]
    shell["shell"]
    shortcuts["shortcuts"]
    extract["extract<br/>pop-out window, desktop only"]
    scheduler["scheduler<br/>alarms and timers"]
    tasks["tasks<br/>background jobs"]
    offline["offline<br/>apps kept offline"]
    backup["backup<br/>zip to the device"]
    ai["ai<br/>on-device model"]
    router["router"]
    version["version"]

    settings --> files
    dialogs --> windows
    apps --> windows
    apps --> files
    apps --> settings
    apps --> dialogs
    apps --> notifications
    desktop --> apps
    desktop --> files
    session --> apps
    session --> files
    clipboard --> files
    ui --> windows
    ui --> dialogs
    shell --> files
    shell --> dialogs
    shortcuts --> shell
    shortcuts --> windows
    extract --> windows
    extract --> dialogs
    scheduler --> shell
    scheduler --> apps
    tasks --> notifications
    offline --> apps
    offline --> tasks
    backup --> files
    backup --> dialogs
    backup --> notifications
    backup --> windows
    backup --> tasks
    ai --> tasks
    ai --> files
    router --> session
    router --> clipboard
    version --> apps
    version --> notifications
    version --> session
    version --> settings
  end

  subgraph shellui["Shell UI (one per platform)"]
    desktopshell["Desktop shell<br/>desktop, windows, taskbar, start menu"]
    mobileshell["Mobile shell<br/>home, dock, switcher, nav bar"]
  end

  subgraph appsdir["Apps (src/lib/apps)"]
    manifests["index.ts manifests<br/>glob, eager"]
    components["{id}.app.svelte<br/>lazy import on launch"]
    manifests -.-> components
  end

  subgraph opfs["OPFS"]
    home["/home<br/>Desktop, Documents, Downloads"]
    etc["/etc<br/>settings.json"]
    var["/var/lib<br/>session, desktop, shell, version, apps"]
    tmp["/tmp"]
  end

  init --> kernel
  mount --> shellui
  shellui -->|"kernel.service(key)"| kernel
  apps -->|"registry"| manifests
  windows -->|"window renders"| components
  files -->|"opfs.ts"| opfs
```

Arrows inside the kernel point at a dependency. Some edges are left out to keep it readable; [kernel/init.ts](src/lib/core/api/kernel/init.ts) has the full list.

## Docs

| | |
|---|---|
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | Why it exists, how decisions get made |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Code patterns and naming |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Progress and priorities |
| [docs/system/](docs/system/README.md) | How every part of the OS works today |
| [docs/design/](docs/design/README.md) | How WebOS should look: foundations, UI kit, patterns, shell |
| [docs/adrs/](docs/adrs/README.md) | Architecture decision records |
| [docs/brainstorm/](docs/brainstorm/) | Design discussions behind the ADRs |

The original React version lives on the `v0-react` branch.
