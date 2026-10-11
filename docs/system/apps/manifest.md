# App manifest

ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md) · Source: `src/lib/core/api/services/apps/type.ts`, `helpers.ts`

Every app is a folder with an `index.ts` that default-exports `define_app({...})`. The folder layout is in [CONVENTIONS](../../CONVENTIONS.md#apps).

## `define_app(config)`

```ts
function define_app<TProps extends AppProps = {}>(config: AppConfig<TProps>): AppManifest<TProps>
```

Takes an `AppConfig`, returns an `AppManifest`. It does two things:

- `categories` defaults to `["user"]`.
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
| `categories` | `AppCategory[]` | no, default `["user"]` | Stored only. Nothing filters or groups by it yet |
| `description` | `string` | no | Stored only |
| `keywords` | `string[]` | no | Start menu search matches them (substring, case-insensitive), alongside `name` and `id` |
| `author` | `string` | no | Stored only |
| `license` | `string` | no | Stored only |
| `repository` | `string` | no | Stored only |
| `defaults` | `WindowOptions` | no | Initial window state, below |
| `associations` | `string[]` | no | File types this app opens ([file-associations.md](file-associations.md)) |
| `tools` | `string[]` | no | File types this app works on as a tool: listed under "Open with", never the default ([file-associations.md](file-associations.md#tools)) |
| `props` | `ZodType<TProps>` | no | Launch props schema. No schema = the app never receives props |
| `restore` | `boolean` | no, default `true` | `false` keeps the app's windows out of saved sessions ([session](../services/session.md), ADR-023). No app sets it today |

"Stored only" means the field is on the manifest and visible in code, but no UI or service reads it at the moment.

### `categories`

`AppCategory = "system" | "user" | \`custom-${string}\``. ADR-001's `"utilities"` doesn't type-check; it would have to be `"custom-utilities"`. The folder (`system/` vs `user/`) and the category are independent: the default is `"user"` even for an app in `system/`, so system apps set `categories: ["system"]` explicitly.

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
```

Why: manifests are evaluated eagerly while the barrel is still initializing. The chain is `$lib/core/api` → `kernel` → `init.ts` → `apps/service.svelte.ts` → `$lib/apps` (eager glob) → your `index.ts` → `$lib/core/api` again, which is mid-evaluation. Function declarations are hoisted, so `define_app` works. A `const` from a module that hasn't run yet is in the temporal dead zone and throws.

`FILE_PROPS` lives in `helpers.ts`, which nothing on that chain has evaluated yet, so importing it via the barrel throws. Importing `helpers.ts` directly evaluates it on the spot.

Oddity: the Example app imports the const `WindowFlag` from the barrel and works. That's luck: `init.ts` imports `WindowsService` before `AppsService`, so `windows/type.ts` has already run. Don't rely on it.

## Example

```ts
import { define_app } from "$lib/core/api";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";

export default define_app({
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: FilePdfIcon,
  version: "1.0.0",
  categories: ["system"],
  associations: ["application/pdf", ".pdf"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 400 }, height: { min: 300 } } },
  component: () => import("./pdf-viewer.app.svelte"),
});
```

## Divergence from ADR

- ADR-001 `defaults.size`: not implemented.
- ADR-001 glob `./**/index.ts`: the code uses `./system/*/index.ts` and `./user/*/index.ts`.
- ADR-001 categories example `"utilities"`: not a valid `AppCategory`.
- ADR-008 sketches `define_app<TSchema extends ZodType>`. The code is generic over `TProps` with `props?: ZodType<TProps>`; inference works the same.
