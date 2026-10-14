# App manifest

ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [034](../../adrs/034-app-extension-points.md) · Source: `src/lib/core/api/services/apps/type.ts`, `helpers.ts`, `search.ts`, discovery in `src/lib/apps/index.ts`

Every app is a folder with an `index.ts` that default-exports `define_app({...})`. The folder layout is in [CONVENTIONS](../../CONVENTIONS.md#apps).

## `define_app(config)`

```ts
function define_app<TProps extends AppProps = {}>(config: AppConfig<TProps>): AppDefinition<TProps>
```

Takes an `AppConfig`, returns an `AppDefinition`: the manifest without `system`. Discovery (`src/lib/apps/index.ts`) turns each one into an `AppManifest` by adding `system: true` for apps under `./system/`. `define_app` itself does one thing:

- `component` is wrapped: `() => config.component().then((m) => m.default)`. You write a plain dynamic import; the manifest's loader resolves straight to the component.

`TProps` is inferred from the `props` schema.

## Fields

| Field | Type | Required | Effect today |
|-------|------|----------|--------------|
| `id` | `AppId` (`string`) | yes | Registry key. Matched by start menu search. Used by `launch(id)`, `.desktop` shortcuts (`app_id`), `file_defaults`, storage prefix `app.{id}.`, notification `app_id`. Must be unique; a duplicate silently replaces the earlier app |
| `name` | `string` | yes | Start menu (tile label, search, sort order), the file name of a pinned shortcut (`{name}.desktop`, so the desktop label), window title, Open-with list, notification titles |
| `version` | `string` | yes | Stored only. Nothing reads it |
| `icon` | `Component` | yes | Start menu, desktop, titlebar, taskbar, Open-with. Usually given a `class` for size. Use a `phosphor-svelte` icon |
| `component` | `() => Promise<{ default: Component<Partial<TProps>> }>` | yes | Lazy loader, see below |
| `category` | `AppCategory` | yes | The launcher section a user app sits in, and searchable by its label. See below |
| `system` | `boolean` | set by discovery | `true` for apps in `src/lib/apps/system/`. Puts the app in the launcher's System section; the apps inspector counts it. Not written in `define_app` |
| `description` | `string` | no | Launcher search (lowest rank, with the category label) |
| `keywords` | `string[]` | no | Launcher search, ranked with `id` below any name match |
| `author` | `string` | no | Stored only |
| `license` | `string` | no | Stored only |
| `repository` | `string` | no | Stored only |
| `defaults` | `WindowOptions` | no | Initial window state, below |
| `associations` | `string[]` | no | File types this app opens ([file-associations.md](file-associations.md)) |
| `tools` | `string[]` | no | File types this app works on as a tool: listed under "Open with", never the default ([file-associations.md](file-associations.md#tools)) |
| `props` | `ZodType<TProps>` | no | Launch props schema. No schema = the app never receives props |
| `shell` | `ShellContribution` | no | Commands, completers and value types that work with no window open (ADR-034) |
| `badge` | `() => number \| null` | no | Count on the app's icon wherever it shows, even with no window open (ADR-034) |
| `widget` | `() => Promise<{ default: Component<WidgetProps> }>` | no | What the app renders on the desktop for its `.widget` files (ADR-034) |
| `restore` | `boolean` | no, default `true` | `false` keeps the app's windows out of saved sessions ([session](../services/session.md), ADR-023). No app sets it today |

"Stored only" means the field is on the manifest and visible in code, but no UI or service reads it at the moment.

### `category` and `system`

`AppCategory` is a const object: `PRODUCTIVITY`, `MEDIA`, `UTILITIES`, `DEVELOPER`, `GAMES`. One per app, required, closed: a new kind is a core edit. Labels live in `APP_CATEGORY_LABELS` (`search.ts`).

Whether an app is a system app is where it lives, not what it declares. A system app still sets a `category`; it only feeds search, since every system app is grouped under System.

### Launcher search and sections (`search.ts`)

- `search_apps(apps, query)`: an empty (trimmed) query returns every app A–Z. Otherwise the query splits into words and **every word must match** (owner, 2026-10-15: "word puzzle", "card game"). Each word is a case-insensitive substring, ranked: name starts with it, then a word of the name (split on spaces and hyphens) starts with it, then the name contains it, then `id` or a keyword, then `description` or the category label. A word of five letters or more that matches nothing else may match a word one edit away (insert, delete, substitute or swap neighbours: `within_one_edit`), ranked last ("puzle"). An app ranks by its weakest word, then the sum; a multi-word query that is a prefix of the whole name ranks first. Ties sort A–Z. This replaces the plain ranked substring of ADR-001's 2026-10-12 revision, which rejected fuzzy matching as noisy on short queries; short words stay exact for that reason. The start menu and drawer launch the first result on Enter.
- `group_apps(apps)`: `AppSection[]` (`{ id, label, apps }`) in `AppCategory` order, then System; each sorted A–Z; empty sections are dropped.

### `defaults: WindowOptions`

| Field | Type | Effect |
|-------|------|--------|
| `constraints` | `{ width?: { min?, max? }, height?: { min?, max? } }` | `min` is enforced while resizing (falls back to the handler's `MIN_WIDTH`/`MIN_HEIGHT`). `max` is ignored. Neither affects the initial size |
| `flags` | `Iterable<WindowFlag>` | Initial flags: `"maximized"`, `"minimized"`, `"debug"`. `debug` renders the window's debug children (see the Example app) |
| `snap_zone` | `SnapZone \| null` | Initial snap zone |

The initial size is always 600×400 (capped to the container) in a cascade, whatever the constraints say, so a `min` above that starts the window below its own minimum. ADR-001's `defaults.size` does not exist. Window details: [services/windows.md](../services/windows.md).

### `props`

A zod schema that must describe an object (`AppProps = Record<string, unknown>`). Validated at every `launch()` and `create_instance()` (session restore); the full rules are in [services/apps.md](../services/apps.md#props-validation-adr-008). The component type is `Component<Partial<TProps>>`, so a component with a required prop fails to compile: an app launched from the start menu or desktop gets no props.

File-opening apps use `FILE_PROPS` (`z.object({ path: z.string() })`) or extend it.

### `shell` (ADR-034)

The same `ShellContribution` a service returns from `shell()`. AppsService merges every app's into its own contribution and tags each command with `app: <id>`. It's read eagerly, so ids, args and descriptions show in the palette and in `help`. Keep `run()` light and dynamic-import the logic.

- Ids are free (`note`, not `quick-notes note`).
- **A service wins an id clash.** The app command is dropped with a warning. When two apps clash, the later one discovered wins, again with a warning.
- Commands run with no window. Window-scoped app commands don't exist yet: in-app shortcuts still register with `run` (ADR-030).
- App value types merge under AppsService's, so an app can't replace `app` or `file.open`.

### `badge` (ADR-034)

A sync function that `AppBadge` (`core/components/apps/app-badge.svelte`) reads inside a `$derived`. It shows on the desktop tile, the taskbar button, the start menu, the mobile home and dock tiles, and the app drawer. `null` or `0` shows nothing; above 99 it shows `99+`.

Back the count with `createSubscriber` (`svelte/reactivity`). Then the app only does work while an icon is mounted: the first read starts it, and unmounting the last icon stops it.

```ts
let open = $state<number | null>(null);
const subscribe = createSubscriber(() => $effect.root(() => {
  $effect(() => { files.revision(DIR); void read().then((n) => (open = n)); });
}));
export const badge = () => (subscribe(), open);
```

Quick Notes counts open todos (`badge.svelte.ts`).

### `widget` (ADR-034)

A lazy component the desktop renders inside a widget frame for every `.widget` file naming this app. It gets `WidgetProps`: `props` (the file's, validated against the manifest's `props`), `size` (`{ w, h }` in cells) and `name` (the file). It runs with no window and no app context; use services through `kernel.service`. Create widgets with `desktop.pin_widget(app_id, { label, props, size })`. See [desktop](../services/desktop.md#behaviour--invariants).

Quick Notes: a sticky for one note (`{ note: id }`, 3×2, editable in place) or the todo list (no props, 3×3). Added from the app (a note's right-click menu, or the "Add to desktop" toggle, which reads "On desktop" while the widget exists and removes it on a second click) or with `quno pin <note>` / `quno t pin`.

### `component`

```ts
component: () => import("./my-app.app.svelte"),
```

Always explicit; there's no convention-based lookup. The import runs when the app is launched (in `launch()`, before the window renders), not at discovery. Each launch calls the loader again; the browser's module cache makes repeats free.

## The import rule

A manifest may import only **types and functions** from `$lib/core/api`. Import constants from their own module:

```ts
import { define_app } from "$lib/core/api";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { AppCategory } from "$lib/core/api/services/apps/type";
```

Why: manifests are evaluated eagerly while the barrel is still initializing. The chain is `$lib/core/api` → `kernel` → `init.ts` → `apps/service.svelte.ts` → `$lib/apps` (eager glob) → your `index.ts` → `$lib/core/api` again, which is mid-evaluation. Function declarations are hoisted, so `define_app` works. A `const` from a module that hasn't run yet is in the temporal dead zone and throws.

`FILE_PROPS` (`helpers.ts`) and `AppCategory` (`type.ts`) live in modules nothing on that chain has evaluated yet, so importing them via the barrel throws. Importing the module directly evaluates it on the spot.

Oddity: the Example app imports the const `WindowFlag` from the barrel and works. That's luck: `init.ts` imports `WindowsService` before `AppsService`, so `windows/type.ts` has already run. Don't rely on it.

## Example

```ts
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";

export default define_app({
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: FilePdfIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  associations: ["application/pdf", ".pdf"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 400 }, height: { min: 300 } } },
  component: () => import("./pdf-viewer.app.svelte"),
});
```

## Divergence from ADR

- ADR-001 `defaults.size`: not implemented.
- ADR-001 glob `./**/index.ts`: the code uses `./system/*/index.ts` and `./user/*/index.ts`.
- ADR-001 `categories: ["utilities"]` (an array): replaced by one `category` plus a folder-derived `system` (ADR-001 revision 2026-10-12).
- ADR-008 sketches `define_app<TSchema extends ZodType>`. The code is generic over `TProps` with `props?: ZodType<TProps>`; inference works the same.
