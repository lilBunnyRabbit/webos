# App manifest

ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [034](../../adrs/034-app-extension-points.md), [049](../../adrs/049-lazy-app-metadata.md), [062](../../adrs/062-background-scheduler.md), [077](../../adrs/077-app-store.md), [079](../../adrs/079-app-sheets.md), [081](../../adrs/081-background-apps.md) · Source: `src/lib/core/api/services/apps/type.ts`, `helpers.ts`, `catalogue.ts`, `search.ts`; the build reads manifests in `tooling/vite-plugin-catalogue.ts`, the dev server and tests in `src/lib/apps/index.ts`

Every app is a folder with an `index.ts` that default-exports `define_app({...})`, and usually a `meta.ts` with its display text. The folder layout is in [CONVENTIONS](../../CONVENTIONS.md#apps).

## `define_app(config)`

```ts
function define_app<TProps extends AppProps = {}>(config: AppConfig<TProps>): AppDefinition<TProps>
```

Takes an `AppConfig`, returns an `AppDefinition`: the manifest without `system`. The OS never imports a manifest at boot (ADR-077): the build turns each one into a catalogue entry, and AppsService loads the manifest's own chunk later, adding `system` and `version` from the entry. In the dev server and tests the glob in `src/lib/apps/index.ts` stands in for the build. `define_app` itself does two things:

- It validates `widget_size` when given (spans 1–8, `min ≤ default ≤ max`) and throws `[define_app] {id}: widget_size needs …` otherwise, so a bad manifest fails the build.
- `component` is wrapped: `() => config.component().then((m) => m.default)`. You write a plain dynamic import; the manifest's loader resolves straight to the component.

`TProps` is inferred from the `props` schema.

## Fields

| Field | Type | Required | Effect today |
|-------|------|----------|--------------|
| `id` | `AppId` (`string`) | yes | Registry key. Matched by start menu search. Used by `launch(id)`, `.desktop` shortcuts (`app_id`), `file_defaults`, storage prefix `app.{id}.`, notification `app_id`. Must be unique; a duplicate silently replaces the earlier app |
| `name` | `string` | yes | Start menu (tile label, search, sort order), the file name of a pinned shortcut (`{name}.desktop`, so the desktop label), window title, Open-with list, notification titles |
| `version` | `string` | no, deprecated | Ignored since ADR-077 stage 2: the OS shows the catalogue's version, the release the app's files last changed in ("Version 3.67.0" in the App Store details, `app info`, the apps inspector). Optional and `@deprecated` since 2026-10-27, removed in 4.0; no app sets it |
| `icon` | `Component` | yes | Start menu, desktop, titlebar, taskbar, Open-with. Usually given a `class` for size. The app's own `icon.svelte`, drawn to the [app icon rules](../../design/foundations.md#app-icons); it takes `class` and ignores `weight` like a Phosphor icon. An app that needs on-device AI wraps it: `icon: ai_icon(AppIcon)` from `$kit/components/ai-icon` adds the sparkle ([app icons](../../design/foundations.md#app-icons)) |
| `component` | `() => Promise<{ default: Component<Partial<TProps>> }>` | yes | Lazy loader, see below |
| `category` | `AppCategory` | yes | The launcher section a user app sits in, and searchable by its label. See below |
| `system` | `boolean` | set from the catalogue | `true` for apps in `src/lib/apps/system/`. Puts the app in the launcher's System section; the apps inspector counts it. Not written in `define_app` |
| `meta` | `() => Promise<{ default: AppMeta }>` | no | The app's display text: `description`, `keywords`, `pitch`, `authors`, as `meta: () => import("./meta")` (ADR-049). The build copies it into the catalogue; the OS never calls it, see [below](#meta-metats) |
| `highlights` | `() => Promise<{ default: AppHighlight[] }>` (`{ icon: Component; title: string; text: string }`) | no | Three or four cards on what the app does: the new-app announcement and the App Store's "What it does" (ADR-038). Lazy, like `preview`: `highlights: () => import("./highlights")`, with the cards as the default export of `highlights.ts` (`satisfies AppHighlight[]`). Only the announcement and the App Store need them. Without them the announcement shows the description only |
| `guide` | `() => Promise<{ default: string }>` | no | How to use or play the app, as short markdown: `guide: () => import("./guide.md?raw")` (ADR-085). The window's guide overlay shows it under the name and pitch, with the highlights after it ([window](../shell/window.md#guide)); it opens by itself on the app's first launch with no props ([apps](../services/apps.md#first-open)). Rendered by the markdown-lite `MarkdownView`: `#`–`###` headings, `-` lists, paragraphs, `**bold**`, `*italic*`, `` `code` ``, links; no HTML, no ordered lists, no tables. Lazy and flagged in the catalogue, never loaded at boot. Without it the overlay shows the description instead and never opens by itself |
| `preview` | `() => Promise<{ default: string }>` | no | A picture of the app for the announcement, as a lazy URL import (`() => import("./preview.webp?url")`), so it never weighs on boot |
| `author` | `string` | no | **Deprecated**, removed in 4.0. Stored only. Older than `authors` (now in `meta`); nothing reads it |
| `license` | `string` | no | **Deprecated**, removed in 4.0. Stored only |
| `repository` | `string` | no | **Deprecated**, removed in 4.0. Stored only |
| `defaults` | `WindowOptions` | no | Initial window state, below |
| `associations` | `string[]` | no | File types this app opens ([file-associations.md](file-associations.md)) |
| `tools` | `string[]` | no | File types this app works on as a tool: listed under "Open with", never the default ([file-associations.md](file-associations.md#tools)) |
| `props` | `ZodType<TProps>` | no | Launch props schema. No schema = the app never receives props |
| `daily_rank` | `DailyRank` (`time`, `score-asc`, `score-desc`), or `DailyRanks` (mode id → `DailyRank`) | no, default `time` | How a game's daily results rank in `/var/lib/games/plays.json`: by time, or by the score passed to `tracker.daily(day, ms, score)`, lower or higher first, time breaking a tie (ADR-035). Game Hub shows the score with the time. A record gives the game one daily per mode (ADR-050): `tracker.daily(day, ms, score, mode)` stores under `{app_id}/{mode}`, ranked by that mode's entry, and Game Hub lists a row per mode ("Sudoku · 9×9", the id in sentence case, a size id like `6x6` as "6×6") that launches with `{ daily, mode }`. Import `DailyRank` from `$lib/core/api/services/apps/type` (or `$kit/games/daily`, which re-exports it) |
| `replaces` | `AppReplacement[]` (`{ app: AppId; props?: AppProps }`) | no | Ids this app took over (ADR-071). A launch, a `.desktop` or `.widget` file, an `#/app/` or `#/solo/` link, an installed-list or offline-pick entry naming an id no app has resolves here: the entry whose `props` all match the given props wins (most props first), those props are dropped, and an entry without `props` takes the rest. Color Recall: `[{ app: "color-games" }, { app: "color-games", props: { mode: "recall" } }]`. See [replaced app ids](../services/apps.md#replaced-app-ids-adr-071) |
| `shell` | `() => import("./commands")` | no | Commands, completers and value types that work with no window open, loaded on first use (ADR-034) |
| `badge` | `() => number \| null` | no | Count on the app's icon wherever it shows, even with no window open (ADR-034) |
| `achievements` | `Achievement[]` (`{ id, title, text, goal?, secret? }`) | no | What can be earned, as plain data in `index.ts` (ADR-078). Reported through `get_app_context().achievements`; `goal` makes it progress-style, `secret` hides it until unlocked. The build puts the count in the catalogue entry and the list in `store/achievements.json`. The catalogue test fails on a duplicate, empty or `os.` id or a goal that isn't a whole number above 0 ([achievements](../services/achievements.md)) |
| `on_uninstall_data` | `() => Promise<{ default: () => Promise<void> }>` | no | Deletes the app's own stores the OS can't see (IndexedDB, caches) when it's uninstalled with "Also delete its saved data" ([apps](../services/apps.md), owner call 2026-10-22). Moonrabbit deletes `webos.moonrabbit` |
| `on_fire` | `() => Promise<{ default: OnFire }>` | no | Runs when one of the app's scheduler jobs fires or is missed, with nothing of the app loaded ([below](#on_fire-adr-062), ADR-062) |
| `background` | `() => Promise<{ default: BackgroundRun }>` | no | Code that runs with no window, one job per app per browser, started by `background.start(id)` ([below](#background-adr-081), ADR-081) |
| `provides` | `Record<string, () => Promise<{ default: Component<AppSheetProps> }>>` | no | Sheets other apps open over their own window with `win.request("{id}::{kind}", input)` (ADR-079): kind → a lazy component. See [below](#provides-adr-079) |
| `widget` | `() => Promise<{ default: Component<WidgetProps> }>` | no | What the app renders on the desktop for its `.widget` files (ADR-034) |
| `widget_size` | `{ min: WidgetSize; max: WidgetSize; default: WidgetSize }` | no | The widget's size range in cells and the size new widgets get. Without it the widget keeps its file's size and can't be resized |
| `default_widget` | `boolean` | no | Puts the app's widget on every desktop once, at `widget_size.default` ([desktop](../services/desktop.md)). Removing it sticks. Needs `widget` |
| `restore` | `boolean` | no, default `true` | `false` keeps the app's windows out of saved sessions ([session](../services/session.md), ADR-023). No app sets it today |

"Stored only" means the field is on the manifest and visible in code, but no UI or service reads it at the moment.

### `meta` (`meta.ts`)

Display text lives in a sibling `meta.ts`, not in the manifest (ADR-049, 3.0). Since ADR-077 stage 2 the build copies it into the app's catalogue entry, so the OS reads it without loading anything of the app.

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
| `description` | `string` | Launcher search (lowest rank, with the category label; weight 2 in the sentence search), the App Store (tile title, list row, details), the Showcase fallback, Game Hub, the intro's suggestions, the new-app announcement, `app info` / `app list` |
| `keywords` | `string[]` | Launcher and App Store search, ranked with `id` below any name match (weight 3 in the sentence search, each multi-word keyword also joined); the App Store details' Keywords chips |
| `pitch` | `AppPitch` (`{ problem: string; solution: string }`) | The sentence search (weight 1, with the category label). The App Store's Showcase card and detail: the problem the app solves, from the user's side, and what it does about it, one short sentence each, user-facing (no ADR numbers or service names). Without it the Showcase shows `description` as the answer and no problem line. Every bundled app has one (2.2) |
| `authors` | `AppAuthor[]` (`{ name: string; github?: string; url?: string }`) | Who made the app. Omitted or empty means the owner, `OWNER = { name: "lilBunnyRabbit", github: "lilBunnyRabbit" }`. `app_authors(meta)` in `services/apps/authors.ts` resolves it; the credit links to `github.com/{github}`, else `url`. Shown as "By …" in the App Store details and the new-app announcement, in Settings › About › Credits, and as `author` in `app info` and an `authors` column in `app list` |

How it loads: it doesn't, at runtime. The build calls `meta()` in Node and writes the text into `store/catalogue.json`; the dev server and tests run the same `manifest_data()` on the glob. Readers get each app with its text as an `AppListing` (`AppManifest & AppMeta`, plus `daily`) from `apps.listings()`, or one app's through `apps.meta(id)` ([apps](../services/apps.md#app-text)).

### `category` and `system`

`AppCategory` is a const object: `PRODUCTIVITY`, `MEDIA`, `UTILITIES`, `DEVELOPER`, `GAMES`. One per app, required, closed: a new kind is a core edit. Labels live in `APP_CATEGORY_LABELS` (`search.ts`).

Whether an app is a system app is where it lives, not what it declares. A system app still sets a `category`; it only feeds search, since every system app is grouped under System. Being a system app doesn't make it installed: only the core apps (`CORE_APPS`: App Store, Settings, File Explorer, Terminal) are always installed and locked (ADR-077).

### Launcher search and sections (`search.ts`)

- `search_apps(apps, query)`: an empty (trimmed) query returns every app A–Z. Otherwise it hands the apps to `search_ranked` (`core/utils/search.ts`, shared with Settings' search; `rank_word` ranks one word), with the name, then `id` and keywords, then `description` and the category label as the fields; `search.ts` re-exports `within_one_edit`. The query splits into words and **every word must match** (owner, 2026-10-15: "word puzzle", "card game"). Each word is a case-insensitive substring, ranked: name starts with it, then a word of the name (split on spaces and hyphens) starts with it, then the name contains it, then `id` or a keyword, then `description` or the category label. A word of five letters or more that matches nothing else may match a word one edit away (insert, delete, substitute or swap neighbours: `within_one_edit`), ranked last ("puzle"). An app ranks by its weakest word, then the sum; a multi-word query that is a prefix of the whole name ranks first. Ties sort A–Z. This replaces the plain ranked substring of ADR-001's 2026-10-12 revision, which rejected fuzzy matching as noisy on short queries; short words stay exact for that reason. The start menu launches the first result on Enter. Below these strict results, the start menu and the App Store add the sentence search's "Related" apps (`sentence.ts`, lazy: stop words, stemming, weighted fields including the `pitch`, rarer words counting more), see [apps](../services/apps.md#sentence-search).
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

A sync function that `AppBadge` (`core/components/apps/app-badge.svelte`) reads inside a `$derived`. It shows on the desktop tile, the taskbar button, the start menu, the mobile home's rows and the mobile app list. `null` or `0` shows nothing; above 99 it shows `99+`.

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

### `background` (ADR-081)

Code the app runs with no window open: `background: () => import("./watch.svelte")`, the module default-exporting a `BackgroundRun`:

```ts
import type { BackgroundRun } from "$lib/core/api";

const run: BackgroundRun = async (ctx) => {
  // ctx: app_id, props, signal, status(text), share(view), resumable(props?), spawn(WorkerCtor, options?)
};
export default run;
```

The app starts it from its own UI with `background.start(id, props)` and stops it with `background.stop(id)`; the job runs until its signal aborts or it returns, with or without windows. One per app per browser (a Web Lock, never stolen); the app's windows read it through `background.get(id)` (`view` is what the job shared, in the tab that runs it). Inside a job, spawn workers with `ctx.spawn`, so they're listed under it and end with it. Like `on_fire` it has no app context: services through `kernel.service`, app data through `json_file`. Motion Watch is the one user. Details: [background](../services/background.md).

### `provides` (ADR-079)

Sheets this app lends to other apps. Each kind is a lazy Svelte component; another app opens it over its own window with `win.request("{app-id}::{kind}", input)` ([app context](app-context.md#windowhandle)) and gets back what the sheet resolves.

```ts
// index.ts
provides: { scan: () => import("./scan-sheet.svelte") },

// sheet-types.ts: typed keys, so a caller's typo fails to compile
declare module "$lib/core/api/services/apps/type" {
  interface AppSheets {
    "doc-scan::scan": { input: ScanInput; output: Blob };
  }
}

// scan-sheet.svelte
let { input, resolve }: AppSheetProps<ScanInput, Blob> = $props();
```

- The sheet renders in the caller's window, with the caller's app context: `get_app_context()` there gives the caller's handle (use it for pickers and confirms) and the caller's storage (keep your own data out of it).
- Size it like the file picker (`w-[min(46rem,calc(100cqw-2rem))]`, a height under `100cqh`): on a phone it docks to the bottom of the window.
- `resolve(value)` once with the result, `resolve(null)` on Cancel. Esc and a swipe down resolve `null` too.
- It may fail, and that's normal: the caller sees `null` for anything that goes wrong (offline, not loadable, a throw while rendering, which a `<svelte:boundary>` in `window-sheets.svelte` catches). Errors in your own handlers aren't caught; resolve `null` from them.
- The kinds go into the app's catalogue entry (`provides: ["scan"]`), so `app provides` and a stub know them before the code loads.

Doc Scan provides `scan` ([doc-scan](../../apps/doc-scan.md)); Shopping List calls it beside its camera ([shopping-list](../../apps/shopping-list.md)).

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

Always explicit; there's no convention-based lookup. The import starts when the app is launched, not at discovery, and the window opens at once without waiting for it: `launch()` hands the window the pending import, and an app whose manifest isn't loaded yet gets its manifest first, then its component (`open_pending`, ADR-077). Each launch calls the loader again; the browser's module cache makes repeats free.

## Node-safe

The build imports every manifest in Node to write the app catalogue and the icon sprite (ADR-077, [overview](../overview.md#build--deploy)): `index.ts`, everything it imports, its `meta()` and its icon component, rendered with `svelte/server`. So none of them may touch the DOM, `window`, `location`, `navigator`, `localStorage` or OPFS **at module level**: read them inside functions that run later (`badge`, `component`, a lazy import). A manifest that breaks this fails `bun run build` with `catalogue: … can't run in Node`, and `tooling/vite-plugin-catalogue.test.ts` fails first. The `$lib/core/api` barrel builds the kernel singleton on import, so `detect_platform()` and `detect_mode()` answer desktop and full when there's no browser. The component itself must also keep `component: () => import("./x.app.svelte")` written literally: the build reads the path from the source to find its chunk.

Only `src/lib/apps/system/*` and `src/lib/apps/user/*` are read; nothing else under `src/lib/apps/` reaches the catalogue.

## The import rule (lifted)

Until ADR-077 stage 2 a manifest could import only types and functions from `$lib/core/api`: manifests were evaluated while the barrel was still initializing (`$lib/core/api` → `kernel` → `init.ts` → `apps/service.svelte.ts` → the eager glob → your `index.ts` → the barrel again), so a `const` from it was in the temporal dead zone. Now the build's Node step, the dev glob (a dynamic import in `source.ts`) and the runtime all load manifests after the barrel has finished, so constants such as `FILE_PROPS` and `AppCategory` can come from `$lib/core/api` too. Lifted by the owner on 2026-10-27; the existing direct imports stay as they are.

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
  category: AppCategory.PRODUCTIVITY,
  associations: ["application/pdf", ".pdf"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 400 }, height: { min: 300 } } },
  component: () => import("./pdf-viewer.app.svelte"),
});
```

## Divergence from ADR

- ADR-001 `defaults.size`: not implemented.
- ADR-001 glob `./**/index.ts`: the build reads `src/lib/apps/{system,user}/*/index.ts`; the dev and test glob is `./system/*/index.ts` and `./user/*/index.ts`.
- ADR-001 `categories: ["utilities"]` (an array): replaced by one `category` plus a folder-derived `system` (ADR-001 revision 2026-10-12).
- ADR-008 sketches `define_app<TSchema extends ZodType>`. The code is generic over `TProps` with `props?: ZodType<TProps>`; inference works the same.
