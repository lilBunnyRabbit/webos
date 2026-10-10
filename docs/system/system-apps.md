# System apps

The apps bundled with the OS, in `src/lib/apps/system/{id}/`. Each one is an `index.ts` manifest made with `define_app` plus a lazy `{id}.app.svelte`, and they're auto-discovered like any other app ([manifest](apps/manifest.md), [writing an app](apps/writing-an-app.md)). Apps in `src/lib/apps/user/` aren't OS and aren't covered here.

All of them have `categories: ["system"]`. Nothing reads `categories` yet: system apps appear wherever user apps do. None of them use `get_app_context()` ([app context](apps/app-context.md)).

| id | Name | Associations | Props | Window `defaults` | Services |
|----|------|--------------|-------|-------------------|----------|
| `file-explorer` | File Explorer | none | none | none | files, apps, notifications (through the shared components) |
| `settings` | Settings | none | none | none | settings, version |
| `kernel` | Kernel | none | none | none | the kernel itself |
| `text-viewer` | Text Viewer | `text/*` + `.md .json .ts .js .svelte .yaml .yml .toml .ini .log .env` | `FILE_PROPS` | none | files |
| `media-preview` | Media Preview | `image/*`, `video/*`, `audio/*` | `FILE_PROPS` | min 400×300 | files |
| `pdf-viewer` | PDF Viewer | `application/pdf`, `.pdf` | `FILE_PROPS` | min 400×300 | files |

"None" for window defaults means the windows service fallback applies ([windows](services/windows.md)). `FILE_PROPS` is `z.object({ path: z.string() })`, an absolute OPFS path (ADR-018). Manifests import it from `services/apps/helpers`, not from the barrel, to avoid the TDZ problem described in [CONVENTIONS](../CONVENTIONS.md#apps).

The desktop's default grid places `settings` and `file-explorer` (`services/desktop/service.svelte.ts:43`).

---

## File Explorer

`file-explorer` · `Folder` icon · source `system/file-explorer/`

**Purpose.** Browse and manage OPFS.

**Implementation.** `file-explorer.app.svelte` only renders `<FileExplorer />` from `core/components/files/`. Everything is documented in [FilesService → File explorer components](services/files.md#file-explorer-components): navigation, interactions, opening files and error handling.

**Features.** Breadcrumbs plus back, reload, substring search over the current directory, new folder (`prompt()`), upload, delete (`confirm()`; folders recursive), open a file in its associated app (double-click or Enter, through `apps.open`), and a status bar with counts and storage usage.

**Known gaps.**

- Takes no props, so it can't be opened at a path. Every window starts at `~`.
- No associations, so a folder path can't be "opened" with it.
- No rename, move, copy, context menu, drag-and-drop or multi-select.
- No sync between two windows (see the files doc).
- `author: "John Doe"` is a placeholder.

---

## Settings

`settings` · `Gear` icon · source `system/settings/`

**Purpose.** Edit the theme and taskbar position, see version info, and check for updates. The file starts with `<!-- TODO: vibed for testing -->`. Treat it as a placeholder UI.

**Services.** `settings` ([settings](services/settings.md)) and `version` ([version](services/version.md)). Both are accessed through `$derived(kernel.service(...))`.

**Layout.** A fixed 12rem (`w-48`) sidebar with Theme, Taskbar and About, plus a Reset Settings button. The content pane on the right scrolls.

| Section | What it does |
|---------|--------------|
| Theme | One row per token in `settings.theme`: a text input (writes on every keystroke) and an `<input type="color">` (writes on change). The colour picker only reflects values starting with `#`, anything else shows black. Below that, a grid of `THEME_PRESETS` swatches. Clicking one replaces the theme with a copy ([theming](theming.md)) |
| Taskbar | Four buttons, top/bottom/left/right, that set `settings.taskbar.position` |
| About | Logo, version, commit, branch, mode (dev/prod), build time from `version.info`. In prod: "Check for Updates" (`version.check()`), plus "Refresh to Update" (`version.apply_update()`) when an update is available. In dev: a notice that checking is off. Links to the GitHub repo |
| Reset Settings | Sets taskbar to `BOTTOM` and theme to a copy of `BRAND_DARK`. It doesn't touch `file_defaults` |

Every write goes straight to service state. Persistence is the settings service's job.

**Interactions.** Mouse only. Theme text inputs accept any string, with no validation.

**Known gaps / oddities.**

- `update_status` is `$derived(() => …)`, a derived *function* called as `update_status()`. `$derived.by` was presumably meant.
- No way to view or reset remembered file defaults (ADR-018 lists this as a later Settings item).
- The fixed-width sidebar has no `@container` responsiveness, against the app rule in CONVENTIONS.
- `positions` is typed as a string-literal union instead of `TaskbarPosition`. The `#each` loops over tokens and positions have no keys.
- The footer copyright is hardcoded `© 2025`. `author: "John Doe"` is a placeholder.
- The "checks every 30 minutes" text is correct (`version/service.svelte.ts:5`), but it's hardcoded copy.

---

## Kernel

`kernel` · `Brain` icon · source `system/kernel/`

**Purpose.** A debug view of the service registry.

**Implementation.** Imports the `kernel` singleton directly and lists `kernel.services` (a `SvelteMap`): the count, then per service `name: description` and `to_string()` in a `<pre>`. It updates reactively as far as `to_string()` reads reactive state (for example, AppsService's registry size).

**Known gaps.** Read-only, with nothing beyond those three strings. Most services set `description` to the class name, so each line repeats it. No dependency graph, no init state. `author: "John Doe"` is a placeholder.

---

## Text Viewer

`text-viewer` · `FileText` icon · source `system/text-viewer/`

**Purpose.** Read-only text display. It's the seed of the future Text Editor (ROADMAP).

**Associations.** `text/*` (tier 1) plus explicit extensions (tier 3). The extensions win over any MIME-wildcard app, for example `.ts` even if the browser reports a `video/` type for it.

**Behaviour.** `content` is `$derived` from `path` as a promise: `files.get_file(path)` → `file.text()`. The header shows the path, or "No file". The body is a wrapped monospace `<pre>`. The states are: no path (hint), loading, not found, read error, and text.

**Interactions.** Scroll and select only.

**Known gaps.**

- No size limit or binary check. It reads the whole file into one string and renders it in one `<pre>`.
- No syntax highlighting, editing, or saving (`get_file` returns no handle).
- The `.env` association never matches a file literally named `.env`: `file_extension()` treats dotfiles as having no extension (`services/apps/associations.ts:6`). It matches only names like `prod.env`. Without a MIME type, a bare `.env` gets "No app can open".
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

Layout: a toolbar with the file name and controls, a scrolling stage, and a footer with type, size and last-modified time.

| Kind | Rendering | Controls |
|------|-----------|----------|
| image | `<img>`, `object-contain` in fit mode | Zoom out/in (0.25 to 5, step 0.25; zooming leaves fit mode), rotate +90°, fit (resets zoom, rotation and fit), download |
| video | `<video controls>` | download |
| audio | music icon + `<audio controls>` | download |
| unsupported | "Cannot preview {type}" | download |

**Interactions.**

| Input | Effect |
|-------|--------|
| Ctrl + wheel over the image (trackpad pinch too) | Zoom by ±0.25, default scroll prevented |
| Toolbar buttons | As above |
| Native media controls | Play, seek, volume |

Download builds its own `<a download>` from the current object URL. It can't use `files.download_file`, because it has no handle.

**Known gaps.**

- Zoom is a CSS `transform: scale()` around the centre, with no panning. The zoomed overflow up and to the left is probably unreachable by scrolling (not verified).
- No keyboard shortcuts for zoom or rotate. Rotation doesn't apply to video.
- No gallery or next/previous through the folder.
- `file` and `error` aren't reset if `path` changes. That's harmless today, because props don't change after launch.

---

## PDF Viewer

`pdf-viewer` · `FilePdf` icon · source `system/pdf-viewer/` (ADR-018 revision: a separate app because it's a different interaction model)

**Purpose.** View PDFs with the browser's built-in viewer.

**Associations.** `application/pdf` (tier 2) and `.pdf` (tier 3), so it wins on extension even when the MIME type is empty.

**Behaviour.** The same load pattern as Media Preview. It then wraps the file in `new Blob([file], { type: "application/pdf" })` before `createObjectURL`. Chrome only hands a blob to its PDF viewer when the blob's type says PDF, and would otherwise download it. The result is a full-size `<iframe src={blob url}>`, with states for no path, error, not found and loading.

**Interactions.** Whatever the native viewer offers: zoom, page navigation, search, print, download. The app adds no UI of its own.

**Known gaps.** It depends entirely on the browser's PDF viewer: no viewer means a blank or downloading iframe. There's no app-level toolbar or file info.
