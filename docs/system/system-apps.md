# System apps

The apps bundled with the OS, in `src/lib/apps/system/{id}/`. Each one is an `index.ts` manifest made with `define_app` plus a lazy `{id}.app.svelte`, and they're auto-discovered like any other app ([manifest](apps/manifest.md), [writing an app](apps/writing-an-app.md)). Apps in `src/lib/apps/user/` aren't OS and aren't covered here.

All of them live in `src/lib/apps/system/`, so discovery sets `system: true`: the launcher lists them under System, last. Each still declares a `category` for search. All UI is built from the kit in `$lib/core/components/ui` and follows the app frames in [docs/design/patterns.md](../design/patterns.md) (ADR-024).

| id | Name | Associations | Props | Window `defaults` | Services | App storage ([app context](apps/app-context.md)) |
|----|------|--------------|-------|-------------------|----------|-------------|
| `file-explorer` | File Explorer | none | `FILE_PROPS` (a folder path) | none | files, apps, notifications (through the shared components) | none |
| `settings` | Settings | none | `{ section }` (one of the section ids) | min 640×480 | settings, version, apps | window: `section` |
| `kernel` | Kernel | none | none | none | the kernel itself | window: `expanded` |
| `text-viewer` | Text Viewer | `text/*` + `.md .json .ts .js .svelte .yaml .yml .toml .ini .log .env` | `FILE_PROPS` | none | files | window: `wrap` |
| `media-preview` | Media Preview | `image/*`, `video/*`, `audio/*` | `FILE_PROPS` | min 400×300 | files | none |
| `pdf-viewer` | PDF Viewer | `application/pdf`, `.pdf` | `FILE_PROPS` | min 400×300 | files | none |
| `html-preview` | HTML Preview | `text/html`, `.html`, `.htm` | `FILE_PROPS` | min 400×300 | files | none |
| `csv-viewer` | CSV Viewer | `text/csv`, `text/tab-separated-values`, `.csv`, `.tsv` | `FILE_PROPS` | min 400×300 | files | none |
| `activity-monitor` | Activity Monitor | none | none | min 480×360 | windows, files, apps | window: `section` |
| `style-guide` | Style Guide | none | none | min 720×520 | none | window: `section` |

"None" for window defaults means the windows service fallback applies ([windows](services/windows.md)). `FILE_PROPS` is `z.object({ path: z.string() })`, an absolute OPFS path (ADR-018). Manifests import it from `services/apps/helpers`, not from the barrel, to avoid the TDZ problem described in [CONVENTIONS](../CONVENTIONS.md#apps). "window:" keys are `storage.window()` state, per window and saved with the session ([app context](apps/app-context.md#window)). Others are `storage.persisted()` cells, localStorage `app.{id}.{key}` shared by every window of the app ([persistence](persistence.md#app-storage-handle)).

**Phones and tablets** (ADR-016 apps pass). Every app runs fullscreen in the [mobile shell](shell/mobile.md). Layout adapts through container queries and the kit's `pointer-coarse:` sizes; File Explorer reads `kernel.platform` to open on tap and uses long press for menus, and claims the Back button with `window.on_back`.

On first boot the desktop seeds shortcuts to `settings` and `file-explorer` (`DEFAULT_SHORTCUTS` in `services/desktop/folder.svelte.ts`, [desktop](services/desktop.md#behaviour--invariants)).

---

## File Explorer

`file-explorer` · `Folder` icon · source `system/file-explorer/`

**Purpose.** Browse and manage OPFS.

**Props.** `props: FILE_PROPS`, `{ path }` = the folder to open at, default `/home`. The desktop launches it with `{ path: "/home/Desktop/{folder}" }` when a desktop folder is opened. A missing folder shows an error empty state, "Couldn't open this folder".

**Implementation.** `file-explorer.app.svelte` only renders `<FileExplorer {path} />` from `core/components/files/`. Everything is documented in [FilesService → File explorer components](services/files.md#file-explorer-components): navigation, interactions, opening files and error handling.

**Features.** A document-style frame: toolbar, list, status bar.

- **Toolbar:** Back (history only), Reload, a breadcrumb of the real path (`/ home › Desktop`, every segment clickable), a filter field (always shown, wider from `@lg`), New folder (`prompt()`) and Upload.
- **Places sidebar** (from `@3xl`): Home, Desktop, Documents, Downloads, and the System folders `/etc`, `/var`, `/tmp`, with the current one highlighted (clicking it is a no-op).
- **List:** a grid with sticky overline headers (Name, Size, Modified; Modified from `@md`), 32px rows, folders first in `primary`, files as duotone icons, `.desktop` rows drawn as `ShortcutIcon` with the target app's icon, and a "system" badge on `/etc`, `/var`, `/tmp` and below. Skeleton rows while loading, empty states for an empty folder and for a filter with no matches.
- **Actions:** open a file in its associated app (double-click or Enter; a tap on mobile, through `apps.open`; a `.desktop` shortcut launches its target), enter a folder, delete (Delete or Cmd+Backspace, `confirm()`; folders recursive).
- **Multi-select and drag** (desktop pointer): click, Ctrl+click, Shift+click, Ctrl+A, a rectangle from empty space; Cut, Copy, Delete and Open act on the selection. Drag rows onto a folder, into another Explorer window or onto the desktop to move them ([details](services/files.md#multi-select-and-drag-and-drop)).
- **Status bar:** one truncating line: item count (folder/file breakdown from `@sm`), and a storage meter with usage of quota (from `@md`).

**Known gaps.**

- Folders update live when another window or a service changes them (each `DirectoryHandler` watches its revision). A folder deleted or moved elsewhere sends the window to the nearest existing parent with a toast. Changes in other browser tabs still need a manual reload.
- System folders are only marked, not protected: they can be deleted like any folder.
- No associations, so `apps.open()` on a folder path doesn't reach it. Only `launch("file-explorer", { path })` does.
- No multi-select on phones and tablets and no arrow-key selection. Real files and folders dropped from the OS are imported (folders need Chromium). New folder and delete use window sheets (`window.prompt` with name validation, `window.confirm` with `danger`).

---

## Settings

`settings` · `Gear` icon · source `system/settings/`

**Purpose.** Edit the theme, taskbar position and remembered default apps, read every release's notes, see build info, check for updates, replay the introduction, and reset.

**Services.** `settings` ([settings](services/settings.md)), `version` ([version](services/version.md)) and `apps` (Default apps names and icons). All through `$derived(kernel.service(...))`.

**Files.**

| File | Contents |
|------|----------|
| `settings.app.svelte` | `SideNav` + the open page, `max-w-2xl` centered, `h1` with the section name |
| `sections/appearance.svelte` | Theme cards and the colour customiser |
| `sections/taskbar.svelte` | Position `Segmented` + live preview |
| `sections/files.svelte` | Default apps |
| `sections/whats-new.svelte` | The changelog (ADR-026) |
| `sections.ts` | `SECTIONS` (id, label, icon) and `SECTION_IDS`, shared by the manifest's props schema and the app |
| `sections/about.svelte` | Build info, updates, introduction replay, reset, source link |
| `color.ts` | `to_hex()` and `to_oklch()` for the colour picker, through a probe element and relative colour syntax |

**Layout.** The settings-style frame: `SideNav` (sidebar at `@2xl`, a tab row below) with Appearance, Taskbar, Default apps, What's new and About. The open section is `storage.window("section", section_prop ?? "appearance", z.enum(SECTION_IDS))`: each Settings window has its own, and a restored window reopens on its section. The "Updated to vX" toast launches `{ section: "whats-new" }`. Theme cards are `ThemeCard` from `$lib/core/components/theme/` (one preset as a miniature OS in its own colours), shared with the introduction.

| Section | What it does |
|---------|--------------|
| Appearance → Theme | A grid of `ThemeCard`s, one per `THEME_PRESETS` entry. Clicking one replaces the theme with a copy. The active preset is the one whose 17 tokens all equal `settings.theme`; it gets a `primary` ring and a check. The section description names it, or says "A customised theme is active." ([theming](theming.md)) |
| Appearance → Customise colours | A `<details>` disclosure, closed by default. Tokens grouped Surfaces (the seven ladder shades), Text and brand (foreground, primary, secondary, tertiary, accent, cottontail) and States. Each token: a swatch that opens `<input type="color">`, the label, and a mono text field. Both write on `change` (the text field on blur or Enter). The rows only render while the disclosure is open (`bind:open`), so the hex conversions cost nothing when it's closed. The picker shows `to_hex(value)` (sRGB, clipped) and stores `to_oklch(hex)`, the computed `oklch(from <hex> l c h)`. Picking or typing a derived token replaces its live expression with a fixed value |
| Taskbar | A `Segmented` (Bottom, Top, Left, Right, with icons) bound to `settings.taskbar.position`, and a miniature screen preview that moves its dock to the chosen edge |
| Default apps | Lists `settings.file_defaults` sorted by extension: the extension in mono, the app's icon and name (or "{id} (no longer installed)" in `error`), and a Forget `IconButton` that removes that entry. "Forget all" in the section header sets `{}`. Empty: "No default apps yet". Entries are added by "Always use" in the Open-with menu ([file associations](apps/file-associations.md)) |
| What's new | `version.changelog`, newest first: one `background-light` card per release with title, mono version `Badge`, a primary "New to you" `Badge` for releases in `version.unseen`, and the date (`format_date` of the local day). Each change is a row: kind `Badge` (New `primary`, Improved `info`, Fixed `success`) and the text |
| About | A card with the logo lockup, a one-line blurb, a Development/Production badge and the version. Build: Version, Commit, Branch, Built (`version.info`, `format_datetime`: medium date, 24-hour time). Updates: "Update and reload" (`version.apply_update()`) when an update is available, otherwise "Check now" (`version.check()`), disabled in dev and while checking. Introduction: "Show again" calls `version.show_intro()` (doesn't touch the seen marker). Reset: a `danger` button that sets taskbar to `BOTTOM`, theme to a copy of `BRAND_DARK` and `file_defaults` to `{}`, with no confirmation. A "Source on GitHub" link |

Every write goes straight to service state. Persistence is the settings service's job (`/etc/settings.json`).

**Interactions.** Mouse and keyboard through native controls (buttons, radios, `<details>`, inputs). Token text fields accept any string, with no validation.

**Known gaps / oddities.**

- While the customiser is open, `to_hex()` appends and removes a probe `<span>` per token on every theme change (17 per render).
- Theme cards re-declare only the five base variables on the miniature, so its `shadow-raised` uses the active theme's darkest shade.
- The "checks every 30 minutes" copy matches `version/service.svelte.ts`, but it's hardcoded.
- The Updates row shows a success check whenever no check is running in production, even before the first check has completed.

---

## Kernel

`kernel` · `Brain` icon · source `system/kernel/`

**Purpose.** An inspector for the service registry (ADR-020).

**Implementation.** Imports the `kernel` singleton directly and lists `kernel.services` (a `SvelteMap`) in init order, as a dashboard column (`max-w-4xl`, `p-6`). The header has the logo mark, "Kernel", the service count and an Expand all / Collapse all quiet button. Each service is a `rounded-xl bg-background-light` card:

- The header button shows a chevron, the class `name`, the registry key as a `Badge` and the `description` (from `@lg`).
- The body lazily loads `service.inspector()` and renders it with `detailed` set to whether the card is open. A service without an inspector falls back to `to_string()` in a `<pre>`. A failed import shows an error line.

**Interactions.**

| Action | Effect |
|--------|--------|
| Click a card header | Toggles that card between basic and detailed. `aria-expanded`/`aria-controls` are set. |
| Expand all / Collapse all | Opens every card, or closes all of them when all are open. |

**Persistence.** The set of open cards is `storage.window("expanded", string[])`: per Kernel window, restored with the session.

**Inspectors** (basic → detailed):

| Service | Basic | Detailed |
|---------|-------|----------|
| settings | preset name or "Custom", taskbar position, file-default count | token swatches with values; file-defaults table (extension → app, flags missing apps) |
| windows | open count, focused app, container size | table by z-order: order, app, short id, bounds, flags and snap zone; focused row highlighted |
| files | OPFS usage / quota, persistent or best effort | root listing: name, kind, size |
| version | version, commit, update status | running vs available build, field by field |
| notifications | total, unread, toasts | last 10: time, type, app, title (read ones dimmed) |
| dialogs | open count | stack: id, component name, point, anchored or centered |
| apps | registered, system / user, association count | registry table: icon, id, name, version, props schema, associations |
| session | status (`none`/`pending`/`restored`/`declined`), saved windows, last save time | file path |
| desktop | grid size, icon count, cell size | occupancy map of the grid; table of cell, entry name, kind (`shortcut`/`file`/`directory`) and target (the shortcut's app name, `{id} (missing)` for an unregistered app, `—` otherwise); empty text "Desktop folder is empty." |

Inspector building blocks (`components/inspector/`) follow the kit's type scale: `text-ui` values, `text-2xs` labels at 80%, and tables in a `rounded-lg` hairline ring with overline-style headers.

**Known gaps.**
- Inspectors are read-only. Whether they get actions (check for updates, close a window) is still open.
- The files inspector reads storage once per mount. It doesn't read `files.revision("/")`, so root changes made through the service don't refresh it either.
- The desktop inspector only sees the visible grid, so icons that are hidden on a small screen don't show up.
- No dependency graph view.

---

## Text Viewer

`text-viewer` · `FileText` icon · source `system/text-viewer/`

**Purpose.** Read-only text display. It's the seed of the future Text Editor (ROADMAP).

**Associations.** `text/*` (tier 1) plus explicit extensions (tier 3). The extensions win over any MIME-wildcard app, for example `.ts` even if the browser reports a `video/` type for it.

**Behaviour.** `file` is `$derived` from `path` as the `files.get_file(path)` promise; the template awaits it plus `file.text()`. States: no path ("No file open" empty state), loading (`Spinner`), not found and read error (error empty states), and text.

Text uses the document frame:

- **Toolbar:** a file icon, the full path in mono (truncated, full path as `title`), a wrap toggle (`aria-pressed`, filled when on) and Copy all (switches to a green check for 1.2 s; the timer is cleared on unmount). A clipboard failure is reported through `report_file_error` ("Couldn't copy to the clipboard").
- **Body:** one `grid-cols-[auto_minmax(0,1fr)]` grid with a sticky line-number gutter (`tabular-nums`, not selectable) and the lines in mono `text-ui`. Gutter and text share the grid, so a wrapped line keeps its number on its first visual row. Wrap on: `whitespace-pre-wrap wrap-anywhere`; the `minmax(0,1fr)` column lets long unbroken lines wrap instead of overflowing. Off: `whitespace-pre`, scrolling horizontally.
- **Status bar:** file name, line count, character count, size, MIME type (`text/plain` when empty).

**Persistence.** Line wrap is `storage.window("wrap", true, z.boolean())`: per window, on by default, restored with the session.

**Interactions.** Scroll, select, the two toolbar buttons. No keyboard shortcuts.

**Known gaps.**

- No size limit or binary check. It reads the whole file into one string and renders two spans per line, so a large file builds a very large DOM.
- No syntax highlighting, editing, or saving (`get_file` returns no handle).
- No window defaults, so it opens at the windows-service default size.

---

## Media Preview

`media-preview` · `FileImage` icon · source `system/media-preview/` · ported from v0 (`v0-react`) (ADR-009, ADR-018)

**Purpose.** Show images, play video and audio.

**Associations.** MIME wildcards only, so a match depends on the `File.type` the browser reports. A file with an empty type never matches.

**Behaviour.**

1. `$effect` on `path`: `files.get_file(path)` sets `file` (`undefined` while loading, `null` if not found) or `error`. The result of an earlier, cancelled path is dropped.
2. `$effect` on `file`: creates an object URL, and revokes it on cleanup.
3. `kind` comes from `file.type`: `image` / `video` / `audio` / `unsupported`.

States before the frame: no path ("Nothing to preview"), error ("Couldn't read the file"), loading (`Spinner`), not found. Then the document frame: a `Toolbar` with the file name and controls, a stage on `background-darker` (a scoped `.stage` style), and a `StatusBar` with type, size and last-modified time (`format_datetime`).

Below the `@lg` container width the name takes the toolbar's first row (`order-first basis-full`) and the controls wrap onto the next, with Save to disk… pushed right; from `@lg` up it's one row with the name truncating in between.

| Kind | Rendering | Controls |
|------|-----------|----------|
| image | A box sized in layout to the rotated image times the scale, centred in a `min-w-full min-h-full w-max` grid with padding (24px desktop, 8px mobile). The `<img>` inside is absolutely centred at its natural size times the scale and rotated by `transform`. Fit's scale is `fit_scale()` of the rotated size into the stage (`bind:clientWidth/Height`) minus padding, so small images scale up and a 90° turn still fits | Zoom out / level / zoom in (step 0.25 within 0.25 to 5, the limits widened to include the fit scale; zooming leaves fit mode starting from the fit scale; the level reads "Fit" in fit mode), rotate +90°, fit (resets zoom, rotation and fit), a separator, Save to disk… |
| video | `<video controls>`, `max-h-full max-w-full` | Save to disk… |
| audio | a large music-note tile, the file name, `<audio controls>` | Save to disk… |
| unsupported | "Can't preview this file" empty state with the type | Save to disk… |

Rotation animates over 200ms; size changes are instant. Because zoom changes the layout size rather than a transform, the scroll area grows with the image and every edge is reachable. The wrapper's `overflow-clip` keeps the image's corners mid-rotation from adding scrollbars. Pure math (`clamp`, `distance`, `midpoint`, `rotated_size`, `fit_scale`) is in `zoom.ts`, tested in `zoom.test.ts`.

Every zoom goes through `zoom_at(scale, anchor)`. It reads the box rect, applies the zoom, `flushSync()`s, and adjusts the stage's `scrollLeft/Top` so the image point under the anchor stays put.

**Interactions.**

| Input | Effect |
|-------|--------|
| Ctrl + wheel over the image (trackpad pinch too) | Zoom by ±0.25 around the cursor, default scroll prevented |
| Two-finger pinch (touch, pen) | Zoom around the pinch midpoint, and pan as the midpoint moves. Ending a pinch at or below the fit scale snaps back to fit |
| One-finger drag (touch, pen) | Pan the zoomed image by scrolling the stage |
| Toolbar buttons | As above, zooming around the stage centre. Each is a labelled `IconButton`; zoom buttons disable at the limits |
| Native media controls | Play, seek, volume |

The toolbar's "Save to disk…" (`HardDrives` icon) calls `save_to_disk(path)` from `components/files/file-actions.ts`, the same action as File Explorer and the desktop: `files.export_to_disk` plus a "Saved to disk" toast or an error toast.

Touch and pen pointers are tracked in a plain `Map` (up to two) with pointer capture; the image wrapper is `touch-none`, so the browser neither scrolls nor page-zooms under it, and the app does both. Gestures end on `lostpointercapture`, which also covers `pointercancel`. Mouse pointers are ignored there: the mouse keeps scrollbars and Ctrl + wheel.

**Known gaps.**

- Touch pan has no momentum, and there's no double-tap to zoom.
- Mouse drag doesn't pan; use the scrollbars.
- No keyboard shortcuts for zoom or rotate. Rotation doesn't apply to video.
- No gallery or next/previous through the folder.
- `file` and `error` aren't reset if `path` changes. That's harmless today, because props don't change after launch.

---

## PDF Viewer

`pdf-viewer` · `FilePdf` icon · source `system/pdf-viewer/` (ADR-018 revision: a separate app because it's a different interaction model)

**Purpose.** View PDFs with the browser's built-in viewer.

**Associations.** `application/pdf` (tier 2) and `.pdf` (tier 3), so it wins on extension even when the MIME type is empty.

**Behaviour.** The same load pattern as Media Preview. It then wraps the file in `new Blob([file], { type: "application/pdf" })` before `createObjectURL`. Chrome only hands a blob to its PDF viewer when the blob's type says PDF, and would otherwise download it. The result is a full-size borderless `<iframe src={blob url}>` on `background-darker`, titled with the file name. Other states use the kit: "No PDF open" and error empty states, a `Spinner` ("Loading PDF") while loading.

**Interactions.** Whatever the native viewer offers: zoom, page navigation, search, print, download. The app adds no UI of its own.

**Known gaps.** It depends entirely on the browser's PDF viewer: no viewer means a blank or downloading iframe. There's no app-level toolbar or file info.

---

## HTML Preview

`html-preview` · `FileHtml` icon · source `system/html-preview/`

**Purpose.** Render an HTML file the way a browser would, or read its source.

**Associations.** `text/html` (tier 2) plus `.html` and `.htm` (tier 3), so it beats Text Viewer's `text/*` (tier 1) with no prompt.

**Behaviour.** `path` is local state seeded from the prop (`untrack`), and "Open…" swaps it. A `$derived.by` turns `path` into a `files.get_file(path)` + `file.text()` promise and also reads a `revision` counter. Reload bumps the counter, which re-reads the file and remounts the iframe. The states are: no path ("No file open" with "Open a file…"), loading (`Spinner`), not found and read error (error empty states), then the document frame:

- **Toolbar:** Open…, Reload, the full path in mono (truncated, `title` = path), and a `Segmented` Preview / Source switch.
- **Preview:** a borderless full-size `<iframe srcdoc={text} sandbox="allow-scripts">`. There is no `allow-same-origin`, so the page runs in an opaque origin. Its scripts run, but they can't reach the OS, localStorage or OPFS. The document paints its own background.
- **Source:** the text in a read-only `<pre>`, mono `text-ui`, `whitespace-pre-wrap wrap-anywhere`.
- **Status bar:** file name, line count, size, MIME type (`text/html` when empty).

**Persistence.** None. The view resets to Preview in every new window.

**Known gaps.**

- Relative URLs (`style.css`, `img.png`, sibling pages) don't resolve. `srcdoc` has no base URL, and nothing maps OPFS paths to URLs.
- External resources and network requests from the page aren't blocked.
- No auto-reload when the file changes. Source view has no line numbers or highlighting.

---

## CSV Viewer

`csv-viewer` · `FileCsv` icon · source `system/csv-viewer/`

**Purpose.** Read CSV and TSV files as a table.

**Associations.** `text/csv`, `text/tab-separated-values` (tier 2) plus `.csv`, `.tsv` (tier 3), so it beats Text Viewer's `text/*`.

**Behaviour.** The same `path` pattern as HTML Preview. The `get_file` promise resolves into `{ file, delimiter, rows, column_count }`. The delimiter comes from the extension: `.tsv` is tab, anything else is comma.

`parse_csv` (`csv.ts`) is a hand-written RFC 4180 parser: quoted fields, `""` escapes, CRLF or LF, line breaks inside quotes. It is lenient:

- a stray quote inside an unquoted field is kept
- text after a closing quote is appended
- a trailing newline adds no empty row
- a leading BOM is dropped

`column_count` is the longest row; short rows render empty cells. After the no-path, loading, not-found and read-error states, an empty file shows "This file is empty". Otherwise the app renders:

- **Toolbar:** Open…, the full path in mono, and a "First row is header" `Switch` (on by default; "Header row" below `@md`).
- **Table:** each row is its own grid on one shared fixed template: `{digits+3}ch` for row numbers, then `12rem` per column. Rows line up without a `<table>`, so each body row can use `content-visibility: auto` with `contain-intrinsic-block-size: auto 1.75rem`, and the browser skips rendering off-screen rows with no JS virtualization. Table rows can't do this, because containment doesn't apply to them. The header row is sticky on `background-light`: the first row, or A, B, … AA when the header is off. The row-number column is sticky on the left. Cells are mono `text-ui`, truncated, with the full value as `title`. Clicking or tapping a cell (one delegated handler on the scroller) highlights it `primary/12` and shows its full value, wrapped and selectable, in a strip above the status bar with its row number and column; the same cell again closes it, and so does a new file or a header toggle. That's the touch path to long values.
- **Status bar:** file name, `{rows} rows × {columns} columns` (excluding the header), delimiter (Comma / Tab), size.

**Persistence.** None. The header toggle is per window.

**Known gaps.**

- Fixed column width: long values are truncated (tooltip, or tap for the value strip), short columns waste space.
- Parses on the main thread and builds every row's DOM; `content-visibility` only skips layout and paint.
- No delimiter detection (semicolon CSVs show as one column), UTF-8 only, read-only, no sorting or filtering.

---

## Activity Monitor

`activity-monitor` · `Pulse` icon · source `system/activity-monitor/`

**Purpose.** A task manager for the web OS: activity per window, page-wide performance, network requests and storage use. It replaces the planned Profiler ([brainstorm](../brainstorm/2026-10-11_app-ports.md)).

**Services.** `windows` (`list`, `get` for manifests, `close`), `files` (`get_directory`, `get_directory_size`), `apps` (names for app storage).

**Zero cost when closed.** All monitoring lives in the app, in three classes next to the component: `WindowMonitor`, `PerformanceMonitor` and `NetworkMonitor`. No service or shell code knows the app exists. Each class has two methods, and each returns its cleanup to an `$effect`:

- `observe()`: the event-driven observers (long animation frames, CPU pressure, resource timing, the connection `change` listener). They run for the window's lifetime.
- `sample()`: the 1 s ticks, the rAF frame counter and the per-window MutationObservers. They run only while the window isn't minimized.

Samples are 60-entry ring buffers (`Series`, `$state.raw`) held in memory. `untrack` wraps the start calls so a window opening doesn't restart the samplers.

**Sections** (`SideNav`, Settings-style frame):

- **Windows:**
  - One row per window from `windows.list()`: manifest icon and name, a 4-character id, and badges for "this window" and "minimized".
  - **Mutations:** a MutationObserver (subtree, childList, attributes, characterData) on each `[data-window-id]` element, read and reset every second. Shown as mutations per second, peak, and a 60 s sparkline.
  - **Other columns:** DOM node count, and media (canvases, playing/total video and audio, iframes).
  - **Live rows:** rows follow the window list. The tick attaches observers to new windows and disconnects closed ones.
  - **Sorting:** by name, rate, peak or nodes. Unsorted rows keep open order, so End buttons don't move under the cursor. Peak, media and sparkline columns hide in narrow windows (container queries); below `@md` (a phone) Nodes and the short id hide too and the own-window badge shortens to "this". The long-frames table drops its Blocking column there.
  - **End:** calls `windows.close(id)`, the same as ×.
- **Performance:**
  - Frame rate (rAF), event-loop lag (drift of a chained 1 s `setTimeout`) and JS heap (`performance.memory`, copied field by field because its fields are prototype getters), each with a sparkline.
  - CPU pressure (`PressureObserver`, `"cpu"`, 1 s) as a badge. "Not allowed here" if `observe()` is rejected.
  - The newest 50 long animation frames (`buffered: false`): age, duration, blocking duration, and the longest script's invoker and source.
- **Network:**
  - Online state (`svelte/reactivity/window`), plus `navigator.connection` effective type, downlink, rtt and save-data.
  - Resource timing since the window opened, newest first, capped at 500: path, initiator, transfer size, duration, with totals.
  - "Include earlier" merges `performance.getEntriesByType("resource")`; "Clear" empties the list.
- **Storage:**
  - `storage.estimate()` as a meter, plus `usageDetails` and `storage.persisted()`.
  - OPFS size of `/home /etc /var /tmp`, only when Measure is clicked, because it reads every file.
  - localStorage bytes per `app.{id}.` prefix (UTF-16), plus "Other keys".
  - Service worker controller and registration states.
  - Refresh is manual; this tab has no timers.

An API the browser doesn't have shows "Not available in this browser". There are no polyfills.

**Persistence.** App storage `section`. Samples are never stored.

**Known gaps.**

- No Workers tab: no browser API lists workers, and no app spawns one yet. A Workers Service comes with its first consumer. TasksService jobs (ADR-013) become a tab once that service lands.
- Windows have no titles, so rows show the app name and a short id.
- Its own row counts the mutations from re-rendering its own table.
- Monitors keep running while another section is shown; only minimizing pauses sampling. A hidden browser tab gets no rAF, so FPS reads 0.
- Cross-origin resources without `Timing-Allow-Origin` report 0 bytes.

---

## Style Guide

`style-guide` · `Swatches` icon · source `system/style-guide/` (ADR-024)

**Purpose.** Render every design token and UI kit component live in the current theme, as the in-OS companion to [docs/design](../design/README.md). Change the theme in Settings and the Style Guide follows. Its manifest sets `description` and `keywords` (`design`, `components`, `tokens`), so the start menu search finds it by those words.

**Layout.** The settings-style frame: `SideNav` + a `max-w-3xl` page with a header ("Live in the current theme…"). The open section is `storage.persisted("section", "colour", z.enum([...]))` → `app.style-guide.section`.

| Section | Shows |
|---------|-------|
| Colour | The surface ladder as a strip, text and brand swatches, state swatches, the opacity modifiers. Swatches read `var(--{token})` and print the CSS variable |
| Type | The type scale, from `text-lg` titles to mono `text-2xs` values |
| Surfaces | Radius tokens, the four shadows, and a sample app frame (Toolbar, content, StatusBar) |
| Actions | `Button` variants and sizes, `IconButton`s |
| Inputs | `Input` (plain and with a leading icon), `Select`, `Segmented`, `Switch`, `Checkbox` inside `SettingRow`s |
| Feedback | `Badge` tones, `Kbd`, `Spinner`, `EmptyState` with an action |

The controls are bound to local `$state` and do nothing else. Nothing but the open section is persisted.

**Known gaps.**

- Hand-maintained: a new kit component or token only appears once someone adds it here. `Separator` isn't shown at all; `SideNav` only appears as the app's own navigation.
- The token lists are hard-coded arrays, not read from `ThemeToken`.

## "Open…" in the viewers (ADR-025)

Text Viewer, Media Preview, PDF Viewer, HTML Preview and CSV Viewer have an "Open…" toolbar button and an "Open a file…" action in their empty state. It calls `window.pick_file({ accept: manifest.associations })` and swaps the file in place: each viewer keeps the launched `path` as local state seeded from its prop (`untrack`), and Media Preview / PDF Viewer reset their loading state and view when it changes. PDF Viewer gained a toolbar for this.
