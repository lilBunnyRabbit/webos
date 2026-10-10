# WebOS

A desktop environment in the browser: windows, a taskbar, a desktop grid, a sandboxed file system, and apps that load on demand. Built with Svelte 5 runes, TypeScript, Tailwind v4 and Vite. The file system is the Origin Private File System. Hosting is static (GitHub Pages) with no backend.

It's a personal learning project and a home for my side projects. The architecture and the decisions behind it are the point as much as the features are.

## Run

```bash
bun install
bun dev
bun run check
bun run build
```

## How it's built

A small kernel holds a registry of services: windows, apps, desktop, files, settings and version. Components reach a service by name, so one implementation can be swapped for another, for example a mobile shell. Apps are folders with a `define_app()` manifest. The manifest is discovered by glob and the app's component loads lazily.

## Docs

| | |
|---|---|
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | Why it exists, how decisions get made |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | Code patterns and naming |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Progress and priorities |
| [docs/adrs/](docs/adrs/README.md) | Architecture decision records |
| [docs/brainstorm/](docs/brainstorm/) | Design discussions behind the ADRs |

The original React version lives on the `master` branch.
