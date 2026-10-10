# Conventions

How code is written in this repo. Derived from the code as it is, not from wishes. When this file and the code disagree, the code in the newest area (files service, ADR-005) wins and this file gets fixed.

For *why* things are built this way, read [PRINCIPLES.md](PRINCIPLES.md).

---

## Where code goes

```
src/lib/
├── core/
│   ├── api/
│   │   ├── index.ts              # kernel singleton (HMR-safe) + re-exports
│   │   ├── type.ts               # IService, ServiceDescriptor
│   │   ├── kernel/
│   │   │   ├── kernel.svelte.ts  # registry, dependency resolution
│   │   │   └── init.ts           # THE place services get registered
│   │   └── services/{name}/
│   │       ├── index.ts          # export * from "./type" (types only)
│   │       ├── type.ts           # public interface + domain types
│   │       ├── service.svelte.ts # implementation class (runes)
│   │       └── helper.ts | opfs.ts  # pure logic, no Svelte
│   ├── contexts/app/             # get_app_context(): WindowHandle, StorageHandle (ADR-003)
│   ├── components/{feature}/     # OS UI: window, desktop, taskbar, files
│   └── utils/                    # cn, ov, format_bytes, Flags, Order, geometry types
└── apps/
    ├── system/{id}/              # bundled OS apps
    └── user/{id}/                # everything else
        ├── index.ts              # define_app manifest (eager)
        └── {id}.app.svelte       # component (lazy)
```

### Three layers of logic

| File | Contains | Svelte? |
|------|----------|---------|
| `*.ts` | Pure functions, parsing, math, browser API calls | No |
| `*.svelte.ts` | Reactive state: services, handlers, per-instance state | Runes only |
| `*.svelte` | Rendering and wiring events to the above | Yes |

Hard logic lives in plain TS so it can be tested without Svelte. ADR-005 (`opfs.ts` → `DirectoryHandler` → `FilesService`) is the reference implementation of this split.

### Services

- Interface in `type.ts`, named the same as the class: `interface FilesService extends IService`. Class in `service.svelte.ts` does `implements IFilesService` (imported under alias).
- Document the public API with JSDoc in `type.ts`. `windows/type.ts` is the reference.
- `index.ts` exports **types only**. Only `kernel/init.ts` imports service classes.
- Registration name is lowercase singular domain: `"windows"`, `"files"`, `"apps"`. Class `name` field is the class name: `"WindowsService"`.
- Dependencies are declared in `init.ts` (`dependencies: ["windows"]`), never assumed.
- Pure logic beside the service: older services use a static helper class (`WindowsHelper`, `DesktopHelper`), files uses module-level functions (`opfs.ts`). New services follow the files style. Don't convert old helpers as a drive-by.
- Constructors only set fields. Side effects (`$effect.root`, timers, listeners, storage reads) go in `init()`, and everything `init()` starts, `destroy()` stops. `destroy()` is synchronous. Service init order comes from `dependencies`, so a service may use its dependencies in `init()` (ADR-002).
- Persisted service state: one versioned localStorage key per service (`webos.{service}`), with load/save as pure functions beside the service (`settings/persistence.ts`). Validate on load and fall back to defaults; never trust the stored shape.

### Accessing a service

```ts
const windows = $derived(kernel.service<WindowsService>("windows"));
const instance = $derived(windows.get(id)!);
```

Always wrapped in `$derived` so service swapping (ADR-016) stays possible. Never import a service class to call it.

### Components

- Folder per feature under `core/components/`. File names are kebab-case and prefixed with the feature: `file-explorer-navigation.svelte`, `window-titlebar.svelte`.
- Pointer/drag/resize logic goes in a handler class next to the component: `window.handler.svelte.ts`, exposing attachments.
- A system app's `.app.svelte` can be a thin wrapper around a core component (`file-explorer.app.svelte`).

### Apps

```ts
import { define_app } from "$lib/core/api";
import { Calculator as CalculatorIcon } from "phosphor-svelte";

export default define_app({
  id: "calculator",
  name: "Calculator",
  icon: CalculatorIcon,
  version: "1.0.0",
  categories: ["user"],
  defaults: { constraints: { width: { min: 300 } } },
  component: () => import("./calculator.app.svelte"),
});
```

- Auto-discovered by glob in `src/lib/apps/index.ts`. No registration.
- Flat manifest, complex config nested under `defaults` (ADR-001).
- Explicit `component: () => import(...)`. No convention-based discovery of the component.
- A manifest may take only types and functions from `$lib/core/api`. Manifests are evaluated while that barrel is still initializing (AppsService imports the glob), so a `const` from it is in the temporal dead zone. Import constants such as `FILE_PROPS` from their own module (`$lib/core/api/services/apps/helpers`).
- Props are always optional at the component level. An app launched from search gets none (ADR-008).
- Apps use `@container` queries (`@sm:`, `@md:`) for responsiveness, never viewport breakpoints. That's what makes mobile free (ADR-016).

---

## Naming

| Thing | Style | Example |
|-------|-------|---------|
| Variables, functions, methods, properties, props | `snake_case` | `get_root`, `path_stack`, `is_maximized` |
| Types, interfaces, classes, components | `PascalCase` | `DirectoryHandler`, `WindowInstance` |
| Files and folders | `kebab-case` | `file-explorer-status-bar.svelte` |
| Const-object enum keys | `SCREAMING_SNAKE` | `WindowFlag.MAXIMIZED` |
| Enum values | lowercase string | `"maximized"`, `"top-left"` |
| Component callback props | `on` + lowercase verb | `onnavigate`, `onnavigateback` |
| Service registry keys | lowercase | `"files"` |

snake_case is a deliberate, accepted outlier choice ([brainstorm](brainstorm/2026-01-26_code-style-conventions.md)). Don't argue it again, don't "fix" it toward camelCase. Native and library APIs obviously stay as they are (`getFileHandle`, `addEventListener`).

Everything is snake_case, including ADR snippets. The only exception is `buildTime` / `buildTimestamp` in `version.json`. That's the wire format already deployed. Renaming it would break update detection for anyone running the previous build, because their old code reads `buildTimestamp` from the new file and gets `undefined`. Brainstorm logs are historical records, so their snippets may still show camelCase. Renames go in a dedicated `refactor:` commit, not mixed into feature work.

### Enums

No TS `enum`. Use a const object plus a same-named type:

```ts
export const SnapZone = { TOP: "top", TOP_LEFT: "top-left" } as const;
export type SnapZone = (typeof SnapZone)[keyof typeof SnapZone];
```

### Types

- `interface` for object shapes, `type` for unions, intersections, mapped types.
- Discriminated unions over optional-field soup (`FileSystemItem = FileSystemFileItem | FileSystemDirectoryItem`).
- Branded-ish aliases for IDs: `type WindowId = string`, `type AppId = string`.

---

## Svelte 5

- Runes only. No `export let`, no `$:`, no `createEventDispatcher`, no stores.
- Props: `interface Props` + `let { ... }: Props = $props()`. `$bindable()` only where two-way binding is the point.
- `$derived` for anything computable. `$effect` only for real side effects (DOM, timers, storage), and it must return its cleanup.
- `$state.raw` for objects that get replaced wholesale and aren't mutated (`container` bounds).
- Collections: `SvelteMap`, `SvelteSet`, `Flags<T>` (flag sets), `Order<T>` (z-order).
- DOM behaviour via attachments (`{@attach handler.drag_attachment()}`), not actions.
- Use `pointer*` events with pointer capture for drag (window handler). The desktop item handler still uses `mouse*`, which is older code.

---

## Styling & brand

The app follows the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/). Its LLM index at `https://lilbunnyrabbit.github.io/brand/llms.txt` is the full spec.

### Themes and tokens

- Themes live in `services/settings/themes.ts`. **Brand Dark** is the default and **Brand Light** comes second. Other presets are user themes.
- `SettingsService.theme` holds the tokens and writes each one as `--{token}` on `<html>`. Tailwind maps them in `src/app.css` with `@theme inline`.

| Token | Use |
|-------|-----|
| `background` | The page/surface. `background-dark` is derived (mixed 80% with black) |
| `foreground` | All text |
| `primary` | Wherever something should read as the brand: the logo, selection, the main action |
| `secondary`, `tertiary` | Supporting brand colours |
| `accent` | A loud callout, used sparingly |
| `cottontail` | Focus ring, markers. **Never text** |
| `success`, `warning`, `error`, `info` | States only |
| `mark-ears` | Fixed logo colour. The same in every theme |

- All values are OKLCH. Tailwind's default palette is **disabled** (`--color-*: initial`), so `red-500`, `white` and similar don't compile. If a colour seems to be missing, it's a token at reduced opacity, not a new colour.
- No background ladder. The brand has seven background shades, but the owner chose not to model them. Use `background`, `background-dark`, and opacity on `foreground` for subtle fills.
- A preset that defines only the five base colours gets the rest from `derive_theme()`. It follows the brand formula: states sit at the primary colour's lightness with fixed hues, and tertiary and cottontail derive from primary. Never hand-pick extra colours for a preset.
- Interaction opacity, from the brand modifiers: hover `opacity-85`, active `opacity-70`, disabled `opacity-38`. Muted text is `text-foreground/65`, for captions and metadata only.

### Brand rules that bite in UI

- Nothing sits on white. Popovers and dialogs default to a white UA background, so always give them `bg-background`.
- No white text on a brand fill. Use `text-background` on `bg-primary` and friends.
- Two brand colours never touch. Separate them with a gap or a border.
- No gradients between brand colours.
- Light palettes are UI only. The app icon, favicon and splash are always Brand Dark.

### Logo

Components live in `core/components/brand/`:

- `logo-mark.svelte`: the bare mark, `fill="currentColor"`. Colour it with `text-primary` (brand) or `text-foreground` (neutral).
- `logo-lockup.svelte`: the mark plus `lilBunnyRabbit` in Hack 700 at 42% of the mark's height. Below 32px it shows the mark alone.
- `logo-badge.svelte`: a primary disc with the mark in `background`, for avatars and app-icon style uses.

The rules:

- Minimum width is 24px.
- Leave clear space of half the mark's height on every side.
- Never stretch, rotate, shadow, outline, fade or blur it, and don't "fix" its contrast.
- No faded watermarks.

Current placements:

- favicon and PWA icons (`public/logo.svg` → `bun run generate:pwa-assets`)
- the boot splash in `index.html`
- the start button
- the start menu header
- Settings → About
- the Kernel app header

### Fonts

Inter (`font-sans`) for everything you read. Hack (`font-mono`) for values: hexes, IDs, sizes, code, and the wordmark. Both are self-hosted in `src/assets/fonts/`, with their licences.
- `cn()` merges classes. `ov(map, key)` picks a variant from a map (see `os.svelte` taskbar positions).
- Layout problems get solved in CSS (grid, container queries), not JS measurement.
- Icons: `phosphor-svelte` only. Import with an `Icon` alias, `import { Gear as GearIcon } from "phosphor-svelte"`, which keeps names from clashing with globals like `File`. Size with `class` (`class="size-4"`), not `className`. Phosphor defaults to `1em`, so set a size where the surrounding CSS doesn't.

---

## Files

- No user-facing operation overwrites or merges. Anything that puts an entry into a folder (create, copy, move, upload, drop, paste) takes a free name from `available_name()`, giving `name (1).ext`. Read the returned handle's `name`.
- Exact-name writes are for app code that owns a known path: `create_file(..., { overwrite: true })` or `get_directory_handle(..., { create: true })`.
- User-facing file errors go to `NotificationsService`. In the explorer that's `report_file_error()`.

## Errors

No error strategy yet (roadmap P4). Current de-facto rules:

- Missing thing that the caller must have: `throw new Error(...)` (`kernel.service`, `apps.launch`).
- Operation that can legitimately no-op: return `boolean` (`windows.focus`, `windows.close`).
- Soft failure the user doesn't need to see: `console.warn` with a `[ServiceName]` or descriptive prefix.
- OPFS `NotFoundError` is checked by `DOMException.name`, not message.

---

## Dependencies

Ask before adding one. The bar: browser-native API first, then own package (`@lilbunnyrabbit/*`), then small focused library. Planned and approved: `zod` (ADR-008), `@lilbunnyrabbit/task-manager` (ADR-013). Hosting is GitHub Pages, so anything needing a server is out unless an ADR says otherwise.

---

## Tooling

| Command | What |
|---------|------|
| `bun install` | Install |
| `bun dev` | Dev server |
| `bun run check` | `svelte-check` + `tsc`. Must stay at 0 errors |
| `bun run build` | Production build (also writes `version.json`) |

Prettier: 120 cols, double quotes, semicolons, ES5 trailing commas. No test runner yet (roadmap P4). When it lands: Vitest, pure `.ts` first.

---

## Comments

Code comments only for a non-obvious *why*: a constraint, an edge case, a browser quirk. Public API docs go in JSDoc in `type.ts`. `TODO:` comments are fine for known gaps; don't add new ones for work you could just do.
