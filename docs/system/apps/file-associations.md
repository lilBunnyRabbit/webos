# File associations

ADR: [018](../../adrs/018-file-associations.md), [019](../../adrs/019-system-dialogs.md), [022](../../adrs/022-desktop-folder.md) (shortcuts) · Source: `src/lib/core/api/services/apps/associations.ts`, `apps/shortcut.ts`, `AppsService.open()`, `src/lib/core/components/dialogs/open-with-dialog.svelte`

Given a file path, pick an app and launch it with `{ path }`. The step-by-step flow is in [services/apps.md](../services/apps.md#openpath-options-resolution-step-by-step); this page covers the rules.

## Shortcuts come first

A `.desktop` file isn't matched against associations at all. `open()` checks the extension first, parses the file and launches the app it names with the shortcut's own `props` (not `{ path }`). An unparseable shortcut or an unregistered `app_id` → error toast "Broken shortcut". Remembered defaults and the Open-with dropdown never see `.desktop`, so no app can claim it. Format: [services/apps.md → Shortcuts](../services/apps.md#shortcuts-desktop-files).

## Declaring associations

```ts
define_app({
  associations: ["image/*", "video/*", ".heic"],
  props: FILE_PROPS,
  // ...
});
```

| Entry | Meaning | Example |
|-------|---------|---------|
| Starts with `.` | Extension, compared with `file_extension(name)` | `".md"` |
| Ends with `/*` | MIME wildcard, prefix match on `File.type` | `"text/*"` |
| Anything else | Exact MIME | `"application/pdf"` |

All comparisons are lowercase. The MIME is `File.type` as the browser reports it for the OPFS file, which the browser derives from the extension. An empty type matches no MIME entry.

`file_extension()` is everything from the **last** dot, lowercased (`archive.tar.gz` → `.gz`). A dotfile is its own extension (`.env` → `.env`, `.gitignore` → `.gitignore`), so Text Editor's `.env` entry matches both `.env` and `prod.env`. A name with no dot has no extension.

An app that declares associations should also declare `props: FILE_PROPS` (or a schema that accepts `{ path: string }`). Otherwise every open discards the props with a warning and the app opens empty.

## Tiers

Each app scores its best entry against the file:

| Tier | Match |
|------|-------|
| 3 | Exact extension |
| 2 | Exact MIME |
| 1 | MIME wildcard |
| 0 | No match |

Only the apps on the highest tier are candidates. One → launch it. Several → the Open-with dropdown. None → toast.

Listing an extension is how an app beats a broader type. A `.ts` file can get the MIME `video/mp2t` (MPEG transport stream), so Media Preview (`video/*`) scores 1 and Text Editor (`.ts`) scores 3: Text Editor opens it with no prompt.

### Current associations

| App | Entries |
|-----|---------|
| `text-editor` | `text/*`, `.md`, `.json`, `.ts`, `.js`, `.svelte`, `.yaml`, `.yml`, `.toml`, `.ini`, `.log`, `.env` |
| `media-preview` | `image/*`, `video/*`, `audio/*` |
| `pdf-viewer` | `application/pdf`, `.pdf` |
| `html-preview` | `text/html`, `.html`, `.htm` |
| `csv-viewer` | `text/csv`, `text/tab-separated-values`, `.csv`, `.tsv` |

HTML and CSV files used to open in Text Viewer (now Text Editor) through `text/*`. Now the dedicated viewers win, and since "Open with" only appears when two or more apps qualify, Text Editor can't be picked for them from File Explorer. Its own Open… still accepts them.

An `.svg` (`image/svg+xml`) ties Media Preview (`image/*`, 1) with nothing else today, since `text/*` doesn't match it. Ties come from two apps on the same tier, for example two apps both listing `.md`.

## Tools

`tools` on the manifest uses the same syntax as `associations`, for apps that work on a file without being its viewer, such as the image tools (Image Crop, Background Remove, …: `tools: ["image/*"]`) or GIF Player (`image/gif`, `.gif`, `video/*`).

- A tool match never counts toward `open()`: it can't win the default, can't cause a tie, and never shows the chooser.
- File Explorer's "Open with" lists tool apps after the associated apps, behind a separator, by name (`tools_for`). An app that's both associated and a tool for the file appears once, with the associated apps.
- The submenu still needs two or more entries, so a file with one viewer and one tool now gets "Open with".

| App | Tools |
|-----|-------|
| `image-crop`, `background-remove`, `image-concat`, `image-split`, `image-editor`, `sprite-extract`, `qr-reader` | `image/*` |
| `gif-player` | `image/gif`, `.gif`, `video/*` |
| `paint` | `image/*` |
| `music-visualizer`, `soundboard` | `audio/*` |
| `diff` | `text/*`, `.txt`, `.md`, … (`DIFF_ACCEPT`) |
| `markdown-pdf` | `.md`, `.markdown`, `text/markdown` |
| `pdf-tools` | `.pdf`, `application/pdf` |
| `speed-reader` | `text/plain`, `.txt`, `.md` |

## Remembered defaults

`settings.file_defaults: Record<string, AppId>`: extension (`".svg"`) → app id. Persisted in `/etc/settings.json` ([settings.md](../services/settings.md)); on load, entries whose key doesn't start with `.` or whose value isn't a string are dropped.

- Checked before tiers. If the file has an extension and its default names a registered app, that app opens, even if it no longer lists the extension.
- A default naming a missing app is ignored (and left in settings).
- Written only by the dropdown's "Always use" checkbox.
- Viewed and cleared in Settings → Default apps: one row per extension with its app (or "no longer installed"), Forget per entry, Forget all. Settings → About → Reset clears them too, along with theme and taskbar.

## The Open-with dropdown

`OpenWithDialog`, shown through [DialogsService](../services/dialogs.md) with `{ file_name, extension, apps: candidates }`:

- An overline header "Open {file_name} with", then one 36px row per candidate: icon tile + name. A `rounded-xl bg-background-lighter` menu, no backdrop.
- The first row is focused. ArrowUp/ArrowDown cycle (from the checkbox: Down → first, Up → last); Enter or click picks and opens immediately.
- "Always use for {extension}" checkbox, hidden when there's no extension. Checked + pick → saved as the default.
- Esc or click outside → cancelled. Nothing opens, no toast, `open()` resolves `null`.
- Placement: anchored dropdown below-right of `options.anchor`, flipping at viewport edges. Without an anchor, centred over the focused window, else the desktop.

## No match

- No candidates → warning toast "No app can open {name}".
- File missing at `path` → error toast "File not found", message = the path.
- Broken `.desktop` shortcut → error toast "Broken shortcut", message = the path.

All three resolve `null` and come from app id `"apps"`.

## Callers

| Caller | Anchor |
|--------|--------|
| File Explorer, double-click a file (`files/file-list.svelte`) | The pointer (`clientX`, `clientY`) |
| File Explorer, Enter on a file row | The row's bottom-left corner |
| Desktop, double-click a file or shortcut icon (`DesktopService.open`) | The pointer |
| Desktop, Enter on a file or shortcut icon | The icon's bottom-left corner |
| Shell `open` command and clicking a file row in Terminal output (`services/apps/shell.ts`; folders go to File Explorer) | None: centred over the focused window |

Errors thrown by `open()` (for example from `files.get_file`) are caught there and reported with `report_file_error` (File Explorer) or `console.error` (desktop). `#/file/{path}` deep links (ADR-010) are meant to call the same method; they don't exist yet (the router only handles `#/app/`).

## Receiving the file

The app gets `{ path }` and looks the file up itself, typically:

```ts
const { path }: { path?: string } = $props();
const files = $derived(kernel.service<FilesService>("files"));
const content = $derived(path ? files.get_file(path).then((file) => file?.text() ?? null) : null);
```

Handle `path` being `undefined` (launched from the start menu) and `get_file` returning `null` (deleted since). Text Editor and Media Preview are the references.

## Known gaps

- No "Open with…" for a single match or when a default exists: the user can't pick another app once a default is set, short of editing settings.
