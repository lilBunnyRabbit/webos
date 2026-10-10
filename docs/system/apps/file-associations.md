# File associations

ADR: [018](../../adrs/018-file-associations.md), [019](../../adrs/019-system-dialogs.md) · Source: `src/lib/core/api/services/apps/associations.ts`, `AppsService.open()`, `src/lib/core/components/dialogs/open-with-dialog.svelte`

Given a file path, pick an app and launch it with `{ path }`. The step-by-step flow is in [services/apps.md](../services/apps.md#openpath-options-resolution-step-by-step); this page covers the rules.

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

`file_extension()` is everything from the **last** dot, lowercased (`archive.tar.gz` → `.gz`). A name with no dot, or whose only dot is the first character (`.gitignore`, `.env`), has no extension.

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

Listing an extension is how an app beats a broader type. A `.ts` file can get the MIME `video/mp2t` (MPEG transport stream), so Media Preview (`video/*`) scores 1 and Text Viewer (`.ts`) scores 3: Text Viewer opens it with no prompt.

### Current associations

| App | Entries |
|-----|---------|
| `text-viewer` | `text/*`, `.md`, `.json`, `.ts`, `.js`, `.svelte`, `.yaml`, `.yml`, `.toml`, `.ini`, `.log`, `.env` |
| `media-preview` | `image/*`, `video/*`, `audio/*` |
| `pdf-viewer` | `application/pdf`, `.pdf` |

An `.svg` (`image/svg+xml`) ties Media Preview (`image/*`, 1) with nothing else today, since `text/*` doesn't match it. Ties come from two apps on the same tier, for example two apps both listing `.md`.

## Remembered defaults

`settings.file_defaults: Record<string, AppId>`: extension (`".svg"`) → app id. Persisted in `webos.settings` ([settings.md](../services/settings.md)); on load, entries whose key doesn't start with `.` or whose value isn't a string are dropped.

- Checked before tiers. If the file has an extension and its default names a registered app, that app opens, even if it no longer lists the extension.
- A default naming a missing app is ignored (and left in settings).
- Written only by the dropdown's "Always use" checkbox.
- No UI to view or clear them yet. To reset: edit `webos.settings` in devtools.

## The Open-with dropdown

`OpenWithDialog`, shown through [DialogsService](../services/dialogs.md) with `{ file_name, extension, apps: candidates }`:

- Header "Open {file_name} with", then one row per candidate: icon + name.
- The first row is focused. ArrowUp/ArrowDown cycle; Enter or click picks and opens immediately.
- "Always use for {extension}" checkbox, hidden when there's no extension. Checked + pick → saved as the default.
- Esc or click outside → cancelled. Nothing opens, no toast, `open()` resolves `null`.
- Placement: anchored dropdown below-right of `options.anchor`, flipping at viewport edges. Without an anchor, centred over the focused window, else the desktop.

## No match

- No candidates → warning toast "No app can open {name}".
- File missing at `path` → error toast "File not found", message = the path.

Both resolve `null` and come from app id `"apps"`.

## Callers

| Caller | Anchor |
|--------|--------|
| File Explorer, double-click a file (`files/file-list.svelte`) | The pointer (`clientX`, `clientY`) |
| File Explorer, Enter on a file row | The row's bottom-left corner |

Errors thrown by `open()` (for example from `files.get_file`) are caught there and reported with `report_file_error`. Shell `open` (ADR-007) and `#/file/{path}` deep links (ADR-010) are meant to call the same method; neither exists yet.

## Receiving the file

The app gets `{ path }` and looks the file up itself, typically:

```ts
const { path }: { path?: string } = $props();
const files = $derived(kernel.service<FilesService>("files"));
const content = $derived(path ? files.get_file(path).then((file) => file?.text() ?? null) : null);
```

Handle `path` being `undefined` (launched from the start menu) and `get_file` returning `null` (deleted since). Text Viewer is the smallest reference.

## Known gaps

- `.env` in Text Viewer's list only matches `something.env`; a file named `.env` has no extension and gets "No app can open .env". Same for every dotfile.
- No "Open with…" for a single match or when a default exists: the user can't pick another app once a default is set, short of editing settings.
- No reset UI for `file_defaults` (ADR-018 defers it to the Settings app).
