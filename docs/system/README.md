# System reference

How WebOS works **today**, in depth. ADRs say why a decision was made, brainstorm logs record how it was reached, and the roadmap tracks what's left. This reference describes what the code does right now.

It covers all OS infrastructure: kernel, services, shell UI, the app model, persistence, theming and system apps. Non-OS user apps (`src/lib/apps/user/`) are left out.

## Keeping it current

The reference is part of the code. A change isn't finished until the page that describes it matches.

- Changing a service, the shell, the app model, persistence, theming or a system app means updating its page in the same commit.
- A new service, shell component or system app gets a page, or a section in `system-apps.md`, and an entry in the index below.
- Record any gap between code and ADR under **Divergence from ADR** on the page, and add a dated revision note to the ADR.
- Behaviour that is a known bug or missing piece goes under **Known gaps**, not hidden.

## Index

### Foundations

| Page | Covers |
|------|--------|
| [overview.md](overview.md) | Layers, boot sequence, shell mount tree, source map |
| [kernel.md](kernel.md) | Service registry, dependency order, lifecycle |
| [persistence.md](persistence.md) | Everything stored: localStorage keys, OPFS, versions, what survives reload |
| [theming.md](theming.md) | Tokens, themes, brand constraints, fonts |

### Services

| Page | Key |
|------|-----|
| [services/settings.md](services/settings.md) | `settings` |
| [services/windows.md](services/windows.md) | `windows` |
| [services/files.md](services/files.md) | `files` |
| [services/version.md](services/version.md) | `version` |
| [services/notifications.md](services/notifications.md) | `notifications` |
| [services/dialogs.md](services/dialogs.md) | `dialogs` |
| [services/apps.md](services/apps.md) | `apps` |
| [services/desktop.md](services/desktop.md) | `desktop` |

### Shell

| Page | Covers |
|------|--------|
| [shell/window.md](shell/window.md) | Window frame, titlebar, drag/resize, app content |
| [shell/window-manager.md](shell/window-manager.md) | Renders all windows |
| [shell/desktop.md](shell/desktop.md) | Desktop surface and icons |
| [shell/taskbar.md](shell/taskbar.md) | Taskbar, items, start menu |

### Apps

| Page | Covers |
|------|--------|
| [apps/manifest.md](apps/manifest.md) | Every `define_app` field |
| [apps/lifecycle.md](apps/lifecycle.md) | Discovery, launch, props, close |
| [apps/app-context.md](apps/app-context.md) | `get_app_context()`: window and storage handles |
| [apps/file-associations.md](apps/file-associations.md) | How `open(path)` picks an app |
| [apps/writing-an-app.md](apps/writing-an-app.md) | Building a new app, step by step |
| [system-apps.md](system-apps.md) | File Explorer, Settings, Kernel, Text Viewer, Media Preview, PDF Viewer |

## Page shape

Service pages follow one template, so the same thing is always in the same place:

```
# {Name}Service
Key `x` · Depends on: … · ADR: … · Source: `path/`
## Purpose
## Public API
## State
## Lifecycle
## Persistence
## Behaviour & invariants
## Divergence from ADR   (only when there is one)
## Known gaps
```

Shell and app pages cover: responsibilities, the services they read, interactions (mouse and keyboard), the platform APIs they use, and known gaps.
