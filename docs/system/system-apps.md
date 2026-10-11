# System apps

The apps bundled with the OS, in `src/lib/apps/system/{id}/`. Each one is an `index.ts` manifest made with `define_app` plus a lazy `{id}.app.svelte`, and they're auto-discovered like any other app ([manifest](apps/manifest.md), [writing an app](apps/writing-an-app.md)). Apps in `src/lib/apps/user/` aren't OS and aren't covered here.

All of them have `categories: ["system"]`. Nothing reads `categories` except the apps inspector's count: system apps appear wherever user apps do. All UI is built from the kit in `$lib/core/components/ui` and follows the app frames in [docs/design/patterns.md](../design/patterns.md) (ADR-024).

| id | Name | Associations | Props | Window `defaults` | Services | App storage ([app context](apps/app-context.md)) |
|----|------|--------------|-------|-------------------|----------|-------------|
| `file-explorer` | File Explorer | none | `FILE_PROPS` (a folder path) | none | files, apps, notifications (through the shared components) | none |
| `settings` | Settings | none | none | min 640×480 | settings, version, apps | `section` |
| `kernel` | Kernel | none | none | none | the kernel itself | `expanded` |
| `text-viewer` | Text Viewer | `text/*` + `.md .json .ts .js .svelte .yaml .yml .toml .ini .log .env` | `FILE_PROPS` | none | files | `wrap` |
| `media-preview` | Media Preview | `image/*`, `video/*`, `audio/*` | `FILE_PROPS` | min 400×300 | files | none |
| `pdf-viewer` | PDF Viewer | `application/pdf`, `.pdf` | `FILE_PROPS` | min 400×300 | files | none |
| `style-guide` | Style Guide | none | none | min 720×520 | none | `section` |

"None" for window defaults means the windows service fallback applies ([windows](services/windows.md)). `FILE_PROPS` is `z.object({ path: z.string() })`, an absolute OPFS path (ADR-018). Manifests import it from `services/apps/helpers`, not from the barrel, to avoid the TDZ problem described in [CONVENTIONS](../CONVENTIONS.md#apps). App storage keys are `storage.persisted()` cells, stored as localStorage `app.{id}.{key}` ([persistence](persistence.md#app-storage-handle)).

On first boot the desktop seeds shortcuts to `settings` and `file-explorer` (`DEFAULT_SHORTCUTS` in `services/desktop/service.svelte.ts`, [desktop](services/desktop.md#behaviour--invariants)).

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
- **Actions:** open a file in its associated app (double-click or Enter, through `apps.open`; a `.desktop` shortcut launches its target), enter a folder, delete (Delete or Cmd+Backspace, `confirm()`; folders recursive).
- **Status bar:** one truncating line: item count (folder/file breakdown from `@sm`), and a storage meter with usage of quota (from `@md`).

**Known gaps.**

- Doesn't read `files.revision()` yet, so changes from elsewhere (pinning to the desktop, another window) need a manual reload.
- System folders are only marked, not protected: they can be deleted like any folder.
- No associations, so `apps.open()` on a folder path doesn't reach it. Only `launch("file-explorer", { path })` does.
- No rename, move, copy, context menu, drag-and-drop or multi-select yet (ADR-025 steps 2–4). New folder and delete use window sheets (`window.prompt` with name validation, `window.confirm` with `danger`).
- No sync between two windows (see the files doc).

---

## Settings

`settings` · `Gear` icon · source `system/settings/`

**Purpose.** Edit the theme, taskbar position and remembered default apps, see build info, check for updates, and reset.

**Services.** `settings` ([settings](services/settings.md)), `version` ([version](services/version.md)) and `apps` (Default apps names and icons). All through `$derived(kernel.service(...))`.

**Files.**

| File | Contents |
|------|----------|
| `settings.app.svelte` | `SideNav` + the open page, `max-w-2xl` centered, `h1` with the section name |
| `sections/appearance.svelte` | Theme cards and the colour customiser |
| `sections/theme-card.svelte` | One preset as a miniature OS (desktop, window with titlebar, text lines, primary/secondary chips, taskbar) in the preset's own colours |
| `sections/taskbar.svelte` | Position `Segmented` + live preview |
| `sections/files.svelte` | Default apps |
| `sections/about.svelte` | Build info, updates, reset, source link |
| `color.ts` | `to_hex()` and `to_oklch()` for the colour picker, through a probe element and relative colour syntax |

**Layout.** The settings-style frame: `SideNav` (sidebar at `@2xl`, a tab row below) with Appearance, Taskbar, Default apps and About. The open section is `storage.persisted("section", "appearance", z.enum([...]))` → `app.settings.section`, shared live by every Settings window.

| Section | What it does |
|---------|--------------|
| Appearance → Theme | A grid of `ThemeCard`s, one per `THEME_PRESETS` entry. Clicking one replaces the theme with a copy. The active preset is the one whose 17 tokens all equal `settings.theme`; it gets a `primary` ring and a check. The section description names it, or says "A customised theme is active." ([theming](theming.md)) |
| Appearance → Customise colours | A `<details>` disclosure, closed by default. Tokens grouped Surfaces (the seven ladder shades), Text and brand (foreground, primary, secondary, tertiary, accent, cottontail) and States. Each token: a swatch that opens `<input type="color">`, the label, and a mono text field. Both write on `change` (the text field on blur or Enter). The rows only render while the disclosure is open (`bind:open`), so the hex conversions cost nothing when it's closed. The picker shows `to_hex(value)` (sRGB, clipped) and stores `to_oklch(hex)`, the computed `oklch(from <hex> l c h)`. Picking or typing a derived token replaces its live expression with a fixed value |
| Taskbar | A `Segmented` (Bottom, Top, Left, Right, with icons) bound to `settings.taskbar.position`, and a miniature screen preview that moves its dock to the chosen edge |
| Default apps | Lists `settings.file_defaults` sorted by extension: the extension in mono, the app's icon and name (or "{id} (no longer installed)" in `error`), and a Forget `IconButton` that removes that entry. "Forget all" in the section header sets `{}`. Empty: "No default apps yet". Entries are added by "Always use" in the Open-with menu ([file associations](apps/file-associations.md)) |
| About | A card with the logo lockup, a one-line blurb, a Development/Production badge and the version. Build: Version, Commit, Branch, Built (`version.info`, `format_datetime`: medium date, 24-hour time). Updates: "Update and reload" (`version.apply_update()`) when an update is available, otherwise "Check now" (`version.check()`), disabled in dev and while checking. Reset: a `danger` button that sets taskbar to `BOTTOM`, theme to a copy of `BRAND_DARK` and `file_defaults` to `{}`, with no confirmation. A "Source on GitHub" link |

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

**Persistence.** The set of open cards is `storage.persisted("expanded", string[])` → localStorage `app.kernel.expanded` (ADR-003). It's shared live by every Kernel window in the tab. Another browser tab writes the same key, and the last one to write wins.

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

**Persistence.** Line wrap is `storage.persisted("wrap", true, z.boolean())` → `app.text-viewer.wrap`, shared by every Text Viewer window.

**Interactions.** Scroll, select, the two toolbar buttons. No keyboard shortcuts.

**Known gaps.**

- No size limit or binary check. It reads the whole file into one string and renders two spans per line, so a large file builds a very large DOM.
- No syntax highlighting, editing, or saving (`get_file` returns no handle).
- No window defaults, so it opens at the windows-service default size.

---

## Media Preview

`media-preview` · `FileImage` icon · source `system/media-preview/` · ported from `master` (ADR-009, ADR-018)

**Purpose.** Show images, play video and audio.

**Associations.** MIME wildcards only, so a match depends on the `File.type` the browser reports. A file with an empty type never matches.

**Behaviour.**

1. `$effect` on `path`: `files.get_file(path)` sets `file` (`undefined` while loading, `null` if not found) or `error`. The result of an earlier, cancelled path is dropped.
2. `$effect` on `file`: creates an object URL, and revokes it on cleanup.
3. `kind` comes from `file.type`: `image` / `video` / `audio` / `unsupported`.

States before the frame: no path ("Nothing to preview"), error ("Couldn't read the file"), loading (`Spinner`), not found. Then the document frame: a `Toolbar` with the file name and controls, a stage on `background-darker` (a scoped `.stage` style), and a `StatusBar` with type, size and last-modified time (`format_datetime`).

| Kind | Rendering | Controls |
|------|-----------|----------|
| image | `<img>` centered in a `minmax(0,1fr)` grid cell with `p-6`. In fit mode it's `size-full object-contain`, so it fills the cell and small images scale up; the definite cell size is what makes fit work | Zoom out / level / zoom in (0.25 to 5, step 0.25; zooming leaves fit mode; the level reads "Fit" in fit mode), rotate +90°, fit (resets zoom, rotation and fit), a separator, download |
| video | `<video controls>`, `max-h-full max-w-full` | download |
| audio | a large music-note tile, the file name, `<audio controls>` | download |
| unsupported | "Can't preview this file" empty state with the type | download |

Transforms (`scale`, `rotate`) animate over 200ms.

**Interactions.**

| Input | Effect |
|-------|--------|
| Ctrl + wheel over the image (trackpad pinch too) | Zoom by ±0.25, default scroll prevented |
| Toolbar buttons | As above. Each is a labelled `IconButton`; zoom buttons disable at the limits |
| Native media controls | Play, seek, volume |

Download builds its own `<a download>` from the current object URL. It can't use `files.download_file`, because it has no handle.

**Known gaps.**

- Zoom is a CSS `transform: scale()` around the centre, with no panning. The zoomed overflow up and to the left is probably unreachable by scrolling (not verified).
- Rotating a non-square image by 90° in fit mode can overflow the stage, because fit sizes the unrotated box (not verified).
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
