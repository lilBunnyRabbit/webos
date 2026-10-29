# Conventions

How code is written in this repo. Derived from the code as it is, not from wishes. When this file and the code disagree, the code wins and this file gets fixed.

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
│   │   │   ├── init.ts           # THE place services get registered
│   │   │   ├── platform.ts       # desktop or mobile, detected once (ADR-016)
│   │   │   ├── mode.ts           # full or solo (`#/solo/` link), detected once (ADR-047)
│   │   │   └── test-kernel.ts    # boot_test_kernel, stub_service for browser tests
│   │   └── services/{name}/
│   │       ├── index.ts          # export * from "./type", plus pure helpers apps may use
│   │       ├── type.ts           # public interface + domain types
│   │       ├── service.svelte.ts # implementation class (runes)
│   │       ├── mobile.svelte.ts | solo.svelte.ts  # swapped implementation, picked in init.ts (ADR-016, ADR-047)
│   │       ├── shell.ts          # shell commands: definitions, eager (ADR-033)
│   │       ├── shell-run.ts      # their bodies, `import()`ed on first use (when ≥ 1 KB)
│   │       ├── inspector.svelte  # Kernel app view, lazy (ADR-020)
│   │       ├── persistence.ts    # parse/serialize for its files, when it persists
│   │       └── helper.ts | opfs.ts  # pure logic, no Svelte
│   ├── compat/                   # browser support list, UA parsing, the warning screen boot.ts shows (ADR-067)
│   ├── contexts/app/             # get_app_context(): WindowHandle, StorageHandle (ADR-003)
│   ├── components/{feature}/     # OS UI: window, desktop, taskbar, files; ui (the UI kit)
│   └── utils/                    # cn, ov, format_bytes, Flags, Order, geometry types, zip, markdown (markdown-lite parser, no HTML), worker (`spawn`, `serve`; background jobs use it)
├── kit/                          # $kit, the app kit (ADR-048): helpers only apps use
│   ├── components/code/          # shared CodeMirror setup, CodeView
│   ├── components/swipe-compare/ # SwipeCompare: wipe divider, zoom, pan, pinch
│   ├── components/crop-frame/    # CropFrame: draggable crop over a picture, crop geometry
│   ├── components/quad-frame/    # QuadFrame: four draggable corners over a picture
│   ├── components/waveform/      # Waveform: sound peaks, trim handles, selection, playhead
│   ├── games/                    # shared game helpers: play tracking, stopwatch, daily seed, grid, direction, time, paths, tetrominoes (ADR-035)
│   └── utils/                    # image, image-format, picture (downscaled WebP data URLs), codecs (the encoder table: AVIF/JXL wasm and hand-written GIF, BMP, ICO, TIFF, QOI, TGA, PPM in a worker; SSIM), view (2D camera math), perspective (homography, adaptive threshold, regions), history, qr, qr-scan, linear-barcode (1D decode where BarcodeDetector is missing), filter (canvas filters by hand where `ctx.filter` is ignored), caret, exif, p2p (WebRTC pairing by QR), audio (PCM16 WAV, region cuts with crossfade, peaks), video (capture, WebM encode and mux), roadmap (`docs/ROADMAP.md` parser), worker (re-exports core's `utils/worker`: typed calls into a dedicated worker, `spawn`, `serve`)
└── apps/
    ├── system/{id}/              # bundled OS apps
    └── user/{id}/                # everything else
        ├── index.ts              # define_app manifest (eager)
        ├── meta.ts               # description, keywords, pitch, authors: `meta: () => import("./meta")` (the build copies it into the catalogue, ADR-049, ADR-077)
        ├── icon.svelte           # the app's own icon
        ├── highlights.ts         # App Store showcase slides, `highlights: () => import("./highlights")` (lazy)
        ├── guide.md              # how to use or play it, short markdown: `guide: () => import("./guide.md?raw")` (lazy, ADR-085); the window's ? and the first open show it
        ├── package.json          # only when the app has its own packages (ADR-045)
        ├── commands.ts           # shell commands, `shell: () => import("./commands")` (lazy, ADR-034)
        ├── shell.ts              # their bodies, `import()`ed on first run
        └── {id}.app.svelte       # component (lazy)
```

**Core or kit.** Core is what the OS itself runs on: services, the shell UI, system plumbing, and helpers a service or shell component imports (zip backs File Explorer and Backup, so it's core). A helper only apps use goes in `src/lib/kit` and is imported as `$kit/…`. Core never imports `$kit`, and `src/lib/core/kit-boundary.test.ts` fails if it does. If core later needs a kit helper, the helper moves to core and the kit path re-exports it. Kit stability follows [app-api.md](system/app-api.md#app-kit-kit), same rules as core.

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
- `index.ts` exports types, plus pure helpers and constants apps need (`DesktopHelper`, `format_keys`, the shell's `arg` and `define_command`). Never the service class: only `kernel/init.ts` imports service classes.
- Registration name is lowercase singular domain: `"windows"`, `"files"`, `"apps"`. Class `name` field is the class name: `"WindowsService"`.
- Dependencies are declared in `init.ts` (`dependencies: ["windows"]`), never assumed.
- Pure logic beside the service: older services use a static helper class (`WindowsHelper`, `DesktopHelper`), files uses module-level functions (`opfs.ts`). New services follow the files style. Don't convert old helpers as a drive-by.
- Constructors only set fields. Side effects (`$effect.root`, timers, listeners, storage reads) go in `init()`, and everything `init()` starts, `destroy()` stops. `destroy()` is synchronous. Service init order comes from `dependencies`, so a service may use its dependencies in `init()` (ADR-002).
- Every service ships `inspector.svelte` beside it, wired as `inspector = () => import("./inspector.svelte")`, so the Kernel app can show it (ADR-020). Basic view always; detailed view behind the `detailed` prop. Use the building blocks in `components/inspector/` and only the service's public API.
- Persisted service state lives in the file system (ADR-021): config in `/etc/{service}.json` (`/etc/settings.json`), state in `/var/lib/{service}/` (`/var/lib/desktop/layout.json`). Versioned JSON, written through FilesService, with parse/serialize as pure functions beside the service (`settings/persistence.ts`, `desktop/layout.ts`). Validate on load and fall back to defaults; never trust the stored shape. App data goes in files too: `storage.file()` in `/var/lib/apps/{id}/` (ADR-035), never `storage.get`/`set`/`persisted` (localStorage, being retired). localStorage is only for what must be read before OPFS is up: the analytics answer `index.html` reads, dismissed browser warnings.

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
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "calculator",
  name: "Calculator",
  icon: AppIcon,
  category: AppCategory.UTILITIES,
  defaults: { constraints: { width: { min: 300 } } },
  component: () => import("./calculator.app.svelte"),
});
```

- What an app may rely on (frozen at 1.0, stable until 4.0) and what is internal: [system/app-api.md](system/app-api.md).
- Discovered by folder: the build writes every app into the catalogue, the dev server and tests glob them in `src/lib/apps/index.ts` (ADR-077). No registration.
- Flat manifest, complex config nested under `defaults` (ADR-001).
- Explicit `component: () => import(...)`. No convention-based discovery of the component.
- Display text (`description`, `keywords`, `pitch`, `authors`) goes in `meta.ts`, never in `index.ts` (ADR-049): the build copies it into the app's catalogue entry, so the OS shows it without loading the app (ADR-077).
- Shell commands: `shell: () => import("./commands")`, never an inline object. `commands.ts` default-exports the `ShellContribution` ([writing an app](system/apps/writing-an-app.md)).
- Sheets for other apps: `provides: { kind: () => import("./kind-sheet.svelte") }`, the key declared in `AppSheets`; callers use `win.request("app-id::kind")` and handle `null` ([manifest](system/apps/manifest.md#provides-adr-079), ADR-079).
- Everything a manifest imports ships with its manifest chunk (`{id}.manifest-<hash>.js`), which loads after first paint for every installed app, and a module the app's lazy code also imports is loaded with it whole. Constants and formatters the manifest needs live in a small module of their own (`pdf-tools/kinds.ts`, `game-hub/labels.ts`), never in the app's logic files. The boot budget is 180 KB gz (`bun run build && bun run budget`, `scripts/boot-budget.ts`).
- Props are always optional at the component level. An app launched from search gets none (ADR-008).
- Apps use `@container` queries (`@sm:`, `@md:`) for responsiveness, never viewport breakpoints. That's what makes mobile free (ADR-016).
- Every app can open solo from a `#/solo/{id}?{props}` link (ADR-047): one window, full page, no desktop or taskbar, and launching another app only points to Open WebOS. There's no manifest flag, so an app never assumes other apps or windows are around.

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
- TypeScript over its JS-era equivalent, always: class members use `private` / `protected` / `readonly`, never `#private` fields (owner, 2026-10-14).

---

## Svelte 5

- Runes only. No `export let`, no `$:`, no `createEventDispatcher`, no stores.
- Props: an inline type on `$props()` is fine in an app (`let { path }: { path?: string } = $props()`). Components in the UI kit (`$lib/core/components/ui`) and the app kit (`$kit/components`) declare `interface Props` + `let { ... }: Props = $props()`, or `type Props = …` when it intersects element attributes or variants. `$bindable()` only where two-way binding is the point.
- `$derived` for anything computable. `$effect` only for real side effects (DOM, timers, storage), and it must return its cleanup.
- `$state.raw` for objects that get replaced wholesale and aren't mutated (`container` bounds).
- Collections: `SvelteMap`, `SvelteSet`, `Flags<T>` (flag sets), `Order<T>` (z-order).
- DOM behaviour via attachments (`{@attach handler.drag_attachment()}`), not actions.
- Use `pointer*` events with pointer capture for drag (window handler, desktop handler).

---

## Styling & brand

How things should look (tokens, type, spacing, components, patterns) is in [docs/design](design/README.md). UI is built from the kit in `$lib/core/components/ui`; don't hand-roll buttons, inputs or toolbars.

The app follows the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/). Its LLM index at `https://lilbunnyrabbit.github.io/brand/llms.txt` is the full spec.

### Themes and tokens

- Themes live in `services/settings/themes.ts`. **Brand Dark** is the default and **Brand Light** comes second. Other presets are user themes.
- `SettingsService.theme` holds the tokens and writes each one as a kebab-case variable (`background_dark` → `--background-dark`) on `<html>`. Tailwind maps them in `src/app.css` with `@theme inline`.

| Token | Use |
|-------|-----|
| `background` … `background-darkest`/`-lightest` | The surface ladder (see below and [docs/design/foundations.md](design/foundations.md#surface-ladder)) |
| `foreground` | All text |
| `primary` | Wherever something should read as the brand: the logo, selection, the main action |
| `secondary`, `tertiary` | Supporting brand colours |
| `accent` | A loud callout, used sparingly |
| `cottontail` | Focus ring, markers. **Never text** |
| `success`, `warning`, `error`, `info` | States only |
| `mark-ears` | Fixed logo colour. The same in every theme |

- All values are OKLCH. Tailwind's default palette is **disabled** (`--color-*: initial`), so `red-500`, `white` and similar don't compile. If a colour seems to be missing, it's a token at reduced opacity, not a new colour.
- The brand's seven-shade surface ladder is in every theme (`background-darkest` … `background-lightest`, ADR-024). Desktop on darkest, windows on `background`, chrome and cards on `background-light`, fields recessed on `background-darker` (raised on `background-lightest` in light palettes). At most three shades per view. Neutral fills are `foreground` at an opacity.
- A preset that defines only the five base colours gets the rest from `derive_theme()`. It follows the brand formula: states sit at the primary colour's lightness with fixed hues, and tertiary and cottontail derive from primary. Never hand-pick extra colours for a preset.
- Interaction opacity, from the brand modifiers: hover `opacity-85`, active `opacity-70`, disabled `opacity-38`. Muted text is `text-foreground/65`, for captions and metadata only.

### Brand rules that bite in UI

- Nothing sits on white. Popovers and dialogs default to a white UA background, so always give them a surface (`bg-background-light` for menus, toasts and dialogs).
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
- No faded watermarks. One exception: the mobile home shows the mark centred at `primary/10` over a preset wallpaper (`mobile-shell.svelte`).

Current placements:

- favicon and PWA icons (`public/logo.svg` → `bun run generate:pwa-assets`, config in `tooling/pwa-assets.config.ts`)
- the boot splash in `index.html`
- the start button
- the start menu footer
- the introduction and the update overlay
- the mobile home (the watermark above)
- Settings → About
- the Kernel app header

### Fonts

Inter (`font-sans`) for everything you read. Hack (`font-mono`) for values: hexes, IDs, sizes, code, and the wordmark. Both are self-hosted in `src/assets/fonts/`, with their licences.
- `cn()` merges classes. `ov(map, key)` picks a variant from a map (see `desktop-shell.svelte` taskbar positions).
- Layout problems get solved in CSS (grid, container queries), not JS measurement.
- App icons are each app's own `icon.svelte` (rules in [design foundations](design/foundations.md#app-icons)). Every other icon: `phosphor-svelte` only. Import with an `Icon` alias, `import { Gear as GearIcon } from "phosphor-svelte"`, which keeps names from clashing with globals like `File`. Size with `class` (`class="size-4"`), not `className`. Phosphor defaults to `1em`, so set a size where the surrounding CSS doesn't.

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

Ask before adding one. The bar: browser-native API first, then own package (`@lilbunnyrabbit/*`), then small focused library. Approved: `zod` (ADR-008), `@lilbunnyrabbit/task-manager` (ADR-013, installed 1.0.1: any app, service or util with long work uses it through TasksService, see [tasks](system/services/tasks.md#writing-a-task)). Hosting is GitHub Pages, so anything needing a server is out unless an ADR says otherwise.

**Where a package goes (ADR-045).** Core (`src/lib/core`, `src/lib/components`, the shell) or the app kit (`src/lib/kit`) uses a package: the root `package.json`. Only apps use it: each app that imports it declares it in its own `package.json`, next to `index.ts`:

```json
{ "name": "@webos/svg-workbench", "private": true, "dependencies": { "svgo": "^4.1.0" } }
```

The root lists `"workspaces": ["src/lib/apps/*/*"]` and `bunfig.toml` sets `linker = "isolated"`, so `bun install` at the root installs every app's packages and a package resolves only from the workspace that declares it: core and other apps can't import it by accident. Apps without packages have no `package.json`. Import an app's packages only from lazy code (the component and what it imports), never from `index.ts`; `bun run budget` catches a slip. Deleting the app's folder deletes its packages with it.

Another app's packages are reached through that app's module, not by importing the package: Image Tools calls PDF Tools' `pdf_lib()` and takes pdf-lib's types from `pdf-tools/pdf`, and the import resolves from PDF Tools' folder. Declare the package yourself only when no such module fits. After moving a package out of the root, `rm -rf node_modules && bun install`: an incremental install leaves the old root link and hides a stray import. Today: `@codemirror/merge` (Diff), `pdf-lib` and `pdfjs-dist` (PDF Tools), `marked` (Text Editor, Markdown PDF, Docs), `svgo` and `@codemirror/merge` (SVG Workbench, which takes the merge colours from Diff's `theme.ts`), `culori` (Color Recall, whose `color.ts` Odd One Out, Gradient Sort and Hex Guess import), `@lilbunnyrabbit/chromatics` (Color Tools; other apps reach it through `color-tools/color.ts`), `bwip-js` (Cards), the `lexical` packages and `mammoth` (Warren), `onnxruntime-web` (Shopping List, which imports `onnxruntime-web/wasm`: the default entry pulls the 28 MB JSEP (WebGPU) build).

### Web platform features

Use the newest platform API that fits (PRINCIPLES, CLAUDE.md). When it isn't broadly supported, add it to the browser support list, `src/lib/core/compat/features.ts` (ADR-067, [compat](system/compat.md)), in the same commit: level, the apps that use it, `min` versions from MDN and a probe. Removing its last use removes the entry.

---

## Tooling

| Command | What |
|---------|------|
| `bun install` | Install |
| `bun dev` | Dev server |
| `bun run check` | `svelte-check` + `tsc`. Must stay at 0 errors |
| `bun run build` | Production build (also writes `version.json`) |
| `bun run test` | Vitest, both projects: `unit` (Node) and `browser` (Chromium through Playwright). First run needs `bunx playwright install chromium` |
| `bun run test:unit` | Node project only. CI runs this before `build`; the fork job also runs the core, kit and system app browser tests |
| `bun run budget` | After a build: entry chunk gz size against the 190 KB budget. CI runs it after `build` |
| `bun run og` | Renders `scripts/og/og.html` to `public/og.png` (the 1200×630 link preview card) through Playwright |

Prettier: 120 cols, double quotes, semicolons, ES5 trailing commas. 
### Tests

[ADR-027](adrs/027-testing.md). Vitest, two projects in `vite.config.ts`:

- `name.test.ts` next to `name.ts` runs in Node: pure logic, parsers, helpers.
- `name.browser.test.ts` runs in headless Chromium. Use it for anything touching OPFS, the DOM or platform APIs. No fakes: the real implementation is the point.

Rules:

- Browser tests start each case from an empty OPFS (`opfs.clear_opfs()` in `beforeEach`). The Vitest server's origin is not the dev server's, so the owner's data is never touched.
- Reactive code: call `flushSync()` after a change so effects run, then `vi.waitFor` for the async part. Dispose what you create (`DirectoryHandler.dispose()`) in `afterEach`.
- Test behaviour through the public API, not private fields. A test should fail when the behaviour breaks: break the code once on purpose and check.
- Services: `boot_test_kernel({ files: FilesService, …, session: SessionService })` from `kernel/test-kernel.ts` builds a real `Kernel` with only those services, constructed and `init()`ed in the order given (list dependencies first). A service whose answer only comes from UI (dialogs) goes in as `stub_service("dialogs", { show: vi.fn(async () => true) })`. Call the returned `shutdown()` in `afterEach`. Seed OPFS files before booting.
- No component tests (ADR-027). A test may mount a tiny host component when runes need a component context (`json-file.svelte.browser.test.ts`); it tests the module, not the host.

---

## Comments

Code comments only for a non-obvious *why*: a constraint, an edge case, a browser quirk. Public API docs go in JSDoc in `type.ts`. `TODO:` comments are fine for known gaps; don't add new ones for work you could just do.
