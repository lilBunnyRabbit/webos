# App manifest

ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [034](../../adrs/034-app-extension-points.md), [049](../../adrs/049-lazy-app-metadata.md), [062](../../adrs/062-background-scheduler.md) · Source: `src/lib/core/api/services/apps/type.ts`, `helpers.ts`, `meta.ts`, `search.ts`, discovery in `src/lib/apps/index.ts`

Every app is a folder with an `index.ts` that default-exports `define_app({...})`, and usually a `meta.ts` with its display text. The folder layout is in [CONVENTIONS](../../CONVENTIONS.md#apps).

## `define_app(config)`

```ts
function define_app<TProps extends AppProps = {}>(config: AppConfig<TProps>): AppDefinition<TProps>
```

Takes an `AppConfig`, returns an `AppDefinition`: the manifest without `system`. Discovery (`src/lib/apps/index.ts`) turns each one into an `AppManifest` by adding `system: true` for apps under `./system/`. `define_app` itself does two things:

- It validates `widget_size` when given (spans 1–8, `min ≤ default ≤ max`) and throws `[define_app] {id}: widget_size needs …` otherwise, so a bad manifest fails at boot.
- `component` is wrapped: `() => config.component().then((m) => m.default)`. You write a plain dynamic import; the manifest's loader resolves straight to the component.

`TProps` is inferred from the `props` schema.

## Fields

| Field | Type | Required | Effect today |
|-------|------|----------|--------------|
| `id` | `AppId` (`string`) | yes | Registry key. Matched by start menu search. Used by `launch(id)`, `.desktop` shortcuts (`app_id`), `file_defaults`, storage prefix `app.{id}.`, notification `app_id`. Must be unique; a duplicate silently replaces the earlier app |
| `name` | `string` | yes | Start menu (tile label, search, sort order), the file name of a pinned shortcut (`{name}.desktop`, so the desktop label), window title, Open-with list, notification titles |
| `version` | `string` | yes | The apps inspector's registry table, and the App Library details when the changelog says nothing about the app (it shows "Added v… · Updated v…" from the release notes otherwise, ADR-038) |
| `icon` | `Component` | yes | Start menu, desktop, titlebar, taskbar, Open-with. Usually given a `class` for size. The app's own `icon.svelte`, drawn to the [app icon rules](../../design/foundations.md#app-icons); it takes `class` and ignores `weight` like a Phosphor icon. An app that needs on-device AI wraps it: `icon: ai_icon(AppIcon)` from `$kit/components/ai-icon` adds the sparkle ([app icons](../../design/foundations.md#app-icons)) |
| `component` | `() => Promise<{ default: Component<Partial<TProps>> }>` | yes | Lazy loader, see below |
| `category` | `AppCategory` | yes | The launcher section a user app sits in, and searchable by its label. See below |
| `system` | `boolean` | set by discovery | `true` for apps in `src/lib/apps/system/`. Puts the app in the launcher's System section; the apps inspector counts it. Not written in `define_app` |
| `meta` | `() => Promise<{ default: AppMeta }>` | no | The app's display text: `description`, `keywords`, `pitch`, `authors`, as `meta: () => import("./meta")` (ADR-049). Lazy and loaded all at once after boot, see [below](#meta-metats) |
| `highlights` | `() => Promise<{ default: AppHighlight[] }>` (`{ icon: Component; title: string; text: string }`) | no | Three or four cards on what the app does: the new-app announcement and the App Library's "What it does" (ADR-038). Lazy, like `preview`: `highlights: () => import("./highlights")`, with the cards as the default export of `highlights.ts` (`satisfies AppHighlight[]`). Manifests load at boot, and eager cards cost ~1 KB gz each app, mostly their icons. Without them the announcement shows the description only |
| `preview` | `() => Promise<{ default: string }>` | no | A picture of the app for the announcement, as a lazy URL import (`() => import("./preview.webp?url")`), so it never weighs on boot |
| `author` | `string` | no | **Deprecated**, removed in 4.0. Stored only. Older than `authors` (now in `meta`); nothing reads it |
| `license` | `string` | no | **Deprecated**, removed in 4.0. Stored only |
| `repository` | `string` | no | **Deprecated**, removed in 4.0. Stored only |
| `defaults` | `WindowOptions` | no | Initial window state, below |
| `associations` | `string[]` | no | File types this app opens ([file-associations.md](file-associations.md)) |
| `tools` | `string[]` | no | File types this app works on as a tool: listed under "Open with", never the default ([file-associations.md](file-associations.md#tools)) |
| `props` | `ZodType<TProps>` | no | Launch props schema. No schema = the app never receives props |
| `daily_rank` | `DailyRank` (`time`, `score-asc`, `score-desc`), or `DailyRanks` (mode id → `DailyRank`) | no, default `time` | How a game's daily results rank in `/var/lib/games/plays.json`: by time, or by the score passed to `tracker.daily(day, ms, score)`, lower or higher first, time breaking a tie (ADR-035). Game Hub shows the score with the time. A record gives the game one daily per mode (ADR-050): `tracker.daily(day, ms, score, mode)` stores under `{app_id}/{mode}`, ranked by that mode's entry, and Game Hub lists a row per mode ("Color Games · Recall", the id in sentence case, a size id like `6x6` as "6×6") that launches with `{ daily, mode }`. Import `DailyRank` from `$lib/core/api/services/apps/type` (or `$kit/games/daily`, which re-exports it) |
| `shell` | `() => import("./commands")` | no | Commands, completers and value types that work with no window open, loaded on first use (ADR-034) |
| `badge` | `() => number \| null` | no | Count on the app's icon wherever it shows, even with no window open (ADR-034) |
| `on_uninstall_data` | `() => Promise<{ default: () => Promise<void> }>` | no | Deletes the app's own stores the OS can't see (IndexedDB, caches) when it's uninstalled with "Also delete its saved data" ([apps](../services/apps.md), owner call 2026-10-22). Moonrabbit deletes `webos.moonrabbit` |
| `on_fire` | `() => Promise<{ default: OnFire }>` | no | Runs when one of the app's scheduler jobs fires or is missed, with nothing of the app loaded ([below](#on_fire-adr-062), ADR-062) |
| `widget` | `() => Promise<{ default: Component<WidgetProps> }>` | no | What the app renders on the desktop for its `.widget` files (ADR-034) |
| `widget_size` | `{ min: WidgetSize; max: WidgetSize; default: WidgetSize }` | no | The widget's size range in cells and the size new widgets get. Without it the widget keeps its file's size and can't be resized |
| `default_widget` | `boolean` | no | Puts the app's widget on every desktop once, at `widget_size.default` ([desktop](../services/desktop.md)). Removing it sticks. Needs `widget` |
| `restore` | `boolean` | no, default `true` | `false` keeps the app's windows out of saved sessions ([session](../services/session.md), ADR-023). No app sets it today |

"Stored only" means the field is on the manifest and visible in code, but no UI or service reads it at the moment.

### `meta` (`meta.ts`)

Display text that boot never reads lives in a sibling `meta.ts`, not in the manifest (ADR-049, 3.0). Manifests are discovered eagerly, so anything in `index.ts` ships in the boot chunk; the text was ~9.5 KB gz of it and grew with every app.

```ts
// meta.ts
import type { AppMeta } from "$lib/core/api";

export default {
  description: "Edit images and stitch them together.",
  keywords: ["photo", "crop"],
  pitch: { problem: "…", solution: "…" },
} satisfies AppMeta;
```

| `AppMeta` field | Type | Read by |
|-----------------|------|---------|
| `description` | `string` | Launcher search (lowest rank, with the category label; weight 2 in the sentence search), the App Library (tile title, list row, details), the Showcase fallback, Game Hub, the intro's suggestions, the new-app announcement, `app info` / `app list` |
| `keywords` | `string[]` | Launcher and App Library search, ranked with `id` below any name match (weight 3 in the sentence search, each multi-word keyword also joined); the App Library details' Keywords chips |
| `pitch` | `AppPitch` (`{ problem: string; solution: string }`) | The sentence search (weight 1, with the category label). The App Library's Showcase card and detail: the problem the app solves, from the user's side, and what it does about it, one short sentence each, user-facing (no ADR numbers or service names). Without it the Showcase shows `description` as the answer and no problem line. Every bundled app has one (2.2) |
| `authors` | `AppAuthor[]` (`{ name: string; github?: string; url?: string }`) | Who made the app. Omitted or empty means the owner, `OWNER = { name: "lilBunnyRabbit", github: "lilBunnyRabbit" }`. `app_authors(meta)` in `services/apps/authors.ts` resolves it; the credit links to `github.com/{github}`, else `url`. Shown as "By …" in the App Library details and the new-app announcement, in Settings › About › Credits, and as `author` in `app info` and an `authors` column in `app list` |

How it loads: AppsService imports every app's `meta` once, in `requestIdleCallback` after boot, and `listings()` fills in when it lands ([apps](../services/apps.md#app-meta-adr-049)). Vite's `manualChunks` puts every `apps/*/*/meta.ts` into one `app-meta` chunk. Until it arrives, the launcher matches names, ids and categories only, and the text fills in; it's one small chunk, so that window is short. Readers get each manifest combined with its meta as an `AppListing` (`AppManifest & AppMeta`) from `apps.listings()`.

### `category` and `system`

`AppCategory` is a const object: `PRODUCTIVITY`, `MEDIA`, `UTILITIES`, `DEVELOPER`, `GAMES`. One per app, required, closed: a new kind is a core edit. Labels live in `APP_CATEGORY_LABELS` (`search.ts`).

Whether an app is a system app is where it lives, not what it declares. A system app still sets a `category`; it only feeds search, since every system app is grouped under System.

### Launcher search and sections (`search.ts`)

- `search_apps(apps, query)`: an empty (trimmed) query returns every app A–Z. Otherwise it hands the apps to `search_ranked` (`core/utils/search.ts`, shared with Settings' search; `rank_word` ranks one word), with the name, then `id` and keywords, then `description` and the category label as the fields; `search.ts` re-exports `within_one_edit`. The query splits into words and **every word must match** (owner, 2026-10-15: "word puzzle", "card game"). Each word is a case-insensitive substring, ranked: name starts with it, then a word of the name (split on spaces and hyphens) starts with it, then the name contains it, then `id` or a keyword, then `description` or the category label. A word of five letters or more that matches nothing else may match a word one edit away (insert, delete, substitute or swap neighbours: `within_one_edit`), ranked last ("puzle"). An app ranks by its weakest word, then the sum; a multi-word query that is a prefix of the whole name ranks first. Ties sort A–Z. This replaces the plain ranked substring of ADR-001's 2026-10-12 revision, which rejected fuzzy matching as noisy on short queries; short words stay exact for that reason. The start menu and drawer launch the first result on Enter. Below these strict results, the start menu, the drawer and the App Library add the sentence search's "Related" apps (`sentence.ts`, lazy: stop words, stemming, weighted fields including the `pitch`, rarer words counting more), see [apps](../services/apps.md#sentence-search).
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

`shell: () => import("./commands")`. The sibling `commands.ts` default-exports the same `ShellContribution` a service returns from `shell()`; zod schemas and `define_command` calls live there, out of the boot chunk:

```ts
// commands.ts
import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  values: { note: { columns: ["id", "text"], text: (note) => String(note.text) } },
  commands: [
    define_command({
      id: "note",
      description: "Add a note",
      args: z.object({ text: z.array(z.string()) }),
      positional: ["text"],
      run: async (context) => (await logic()).note(context),
    }),
  ],
} satisfies ShellContribution;
```

AppsService puts every app's module behind its contribution's `lazy` and tags each command with `app: <id>`. ShellService loads them all on first use (Terminal, the palette, a run, completion, a shortcut to an app command, shortcut lists; see [shell](../services/shell.md#lazy-parts)). Keep `run()` light and dynamic-import the logic: the commands module is loaded for every app at once. Something both `index.ts` and `commands.ts` need (a props schema, an enum) is exported from `index.ts` and imported by `commands.ts`, never the other way round.

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

### `on_fire` (ADR-062)

What runs when one of the app's scheduler jobs fires or is counted as missed, with no window, widget or anything else of the app loaded. `on_fire: () => import("./on-fire")`, the module default-exporting an `OnFire`:

```ts
import type { OnFire } from "$lib/core/api";

const on_fire: OnFire = async (job, { outcome, due }) => {
  // outcome: "fired" | "missed"; due: the occurrence (the job's last_fired or missed_at)
};
export default on_fire;
```

The leader tab loads it on first use and calls it once per occurrence, after the notification, one handler at a time. A throw becomes an error toast from the app; it isn't retried. It runs like a shell command: no app context, services through `kernel.service`, app data through `json_file`. Pomodoro counts a phase's end and schedules the next phase in it; Calendar points a repeating reminder's click at the next occurrence's day, or cancels a finished one. Details: [scheduler](../services/scheduler.md#on-fire-hook).

### `widget` (ADR-034)

A lazy component the desktop renders inside a widget frame for every `.widget` file naming this app. It gets `WidgetProps`: `props` (the file's, validated against the manifest's `props`), `size` (`{ w, h }` in cells), `name` (the file) and `style` (`card`, `glass` or `clear`, picked by the user; adapt on `clear`, where there's no background, as Clock does). It runs with no window and no app context; use services through `kernel.service`. Create widgets with `desktop.pin_widget(app_id, { label, props, size? })`. See [desktop](../services/desktop.md#behaviour--invariants).

### `widget_size` (ADR-034 revision 2026-10-15)

```ts
widget_size: { min: { w: 2, h: 1 }, max: { w: 5, h: 3 }, default: { w: 3, h: 1 } },
```

Cells, each span 1–8, `min ≤ default ≤ max` on both axes; `define_app` throws otherwise (`widget_size_schema` in `apps/widget.ts`). `pin_widget` without `size` writes `default`; a given `size` is clamped into the range. The desktop clamps a file's stored size into the range when it reads it (the file isn't rewritten) and lets the user resize within it. The widget gets the current `size` prop and should lay out for every size in the range: `size` for what to show, container queries for scale.

| App | min | default | max | What changes with size |
|-----|-----|---------|-----|------------------------|
| Quick Notes | 2×2 | 3×2 | 6×5 | Sticky text grows from 4×3; the todo list shows more rows |
| Game Hub | 3×1 | 4×2 | 6×4 | 1 row: stats only. Taller or wider: one row of daily games per extra cell row, `max(4, w)` per row |
| Pomodoro | 2×2 | 2×2 | 4×4 | The ring fits the smaller side and its text scales with it |
| Clock | 2×2 | 3×2 | 6×4 | Analog face fills the height; digital time and date scale to the body |
| Time Since | 2×1 | 3×1 | 5×3 | 1 row: name, live time, reset. 2+ rows: adds the start date (or run count) and the time scales up |
| Work Hours | 2×1 | 2×2 | 4×3 | 1 row: today's total and a clock in/out icon button. 2+ rows: label, total, session line, full button; the total scales |
| Calendar | 2×2 | 3×3 | 5×5 | 4+ rows: the next 7 days, grouped under day headers, instead of today only |

Quick Notes: a sticky for one note (`{ note: id }`, editable in place) or the todo list (no props), both 3×2 when added. Added from the app (a note's right-click menu, or the "Add to desktop" toggle, which reads "On desktop" while the widget exists and removes it on a second click) or with `quno pin <note>` / `quno t pin`.

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
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pdf-viewer",
  name: "PDF Viewer",
  icon: AppIcon,
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
