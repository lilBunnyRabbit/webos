# AppsService

Key `apps` · Depends on: `windows`, `notifications`, `files`, `settings`, `dialogs` · ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md), [022](../../adrs/022-desktop-folder.md) (shortcuts), [023](../../adrs/023-session-persistence.md) (`create_instance`, manifest `restore`) · Source: `src/lib/core/api/services/apps/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The app registry. Holds every discovered manifest, launches an app into a new window with validated props, and resolves a file path to the app that should open it. A `.desktop` shortcut file resolves to the app it points at.

| File | Contents |
|------|----------|
| `type.ts` | `AppsService` interface, `AppManifest`, `AppConfig`, `AppInstance`, `OpenOptions`, `AppCategory`, `AppProps` |
| `helpers.ts` | `define_app()`, `FILE_PROPS` |
| `associations.ts` | Pure matching: `file_extension()`, `association_tier()`, `best_apps_for()` |
| `shortcut.ts` | `.desktop` shortcut files: `SHORTCUT_EXTENSION`, `Shortcut`, `parse_shortcut()`, `serialize_shortcut()`, `shortcut_label()` (ADR-022) |
| `service.svelte.ts` | The class |

Manifest fields are documented in [apps/manifest.md](../apps/manifest.md). The full launch path, window included, is in [apps/lifecycle.md](../apps/lifecycle.md).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `registry` | `Map<string, AppManifest>` (a `SvelteMap`) | Public on the class, not on the interface. Reactive |
| `list()` | `(): IterableIterator<[AppId, AppManifest]>` | Iterator over `registry`, insertion order. The start menu renders this |
| `get(id)` | `(id: AppId): AppManifest \| undefined` | |
| `register(manifest)` | `(manifest: AppManifest): void` | `registry.set`. Same id overwrites silently. No `unregister` |
| `launch(id, props?)` | `(id: AppId, props?: unknown): WindowId` | Throws `App ${id} not found` for an unknown id. Always opens a new window |
| `create_instance(id, props?)` | `(id: AppId, props?: unknown): AppInstance \| null` | The instance `launch()` would open, without a window and without toasts. Used by session restore. See below |
| `open(path, options?)` | `(path: string, options?: OpenOptions): Promise<WindowId \| null>` | File → app resolution, below |

`OpenOptions` is `{ anchor?: Position }`: the viewport point the "Open with" dropdown anchors to.

Pure helpers, exported from the barrel:

| Function | Behaviour |
|----------|-----------|
| `file_extension(name)` | `"Notes.TXT"` → `".txt"`. Lowercased. A dotfile is its own extension (`.env` → `".env"`). Returns `""` only when there's no dot |
| `association_tier(entry, file)` | `3` exact extension, `2` exact MIME, `1` MIME wildcard (`image/*`), `0` no match. Case-insensitive. Empty `file.type` never matches a MIME entry |
| `best_apps_for(apps, file)` | Every app tied on the highest non-zero tier, in iteration order. `[]` when nothing matches |
| `parse_shortcut(text)` | `Shortcut \| null`. See [Shortcuts](#shortcuts-desktop-files) |
| `serialize_shortcut(shortcut)` | Pretty-printed JSON |
| `shortcut_label(file_name)` | `"Settings.desktop"` → `"Settings"`. Strips the last 8 characters without checking them |

`SHORTCUT_EXTENSION` (`".desktop"`) and the `Shortcut` interface are exported too.

## Shortcuts (`.desktop` files)

A shortcut is a file whose `file_extension()` is `.desktop` (any case) and whose body is JSON:

```ts
interface Shortcut { app_id: AppId; props?: AppProps }
// zod: { app_id: z.string().min(1), props: z.record(z.string(), z.unknown()).optional() }
```

```json
{ "app_id": "text-viewer", "props": { "path": "/home/notes.md" } }
```

`parse_shortcut` returns `null` for bad JSON or a failed schema, never throws. Unknown keys are stripped. `app_id` isn't checked against the registry there; `open()` does that. `props` must be an object, and the target app's own schema validates it at launch.

Who reads and writes them: `open()` (below), DesktopService (lists, writes on pin and first-boot seed; [desktop](desktop.md)), and File Explorer's `file-row.svelte`, which parses each `.desktop` row to draw `ShortcutIcon` with the target's icon ([files](files.md#file-explorer-components)).

## State

Only `registry`. Filled in the constructor from the eager glob in `src/lib/apps/index.ts` (see [lifecycle](../apps/lifecycle.md#1-discovery)). The constructor also wires `$derived` references to its five dependencies. There is no `init()` and no `destroy()`.

## Lifecycle

Constructed by the kernel after its dependencies. Registration happens in the constructor, which bends the CONVENTIONS rule "constructors only set fields", but it has no side effects outside the instance.

Importing `service.svelte.ts` imports `$lib/apps`, which evaluates every manifest eagerly. This happens while the `$lib/core/api` barrel is still initializing, which is why manifests may not import constants from the barrel ([manifest.md](../apps/manifest.md#the-import-rule)).

## Persistence

None of its own. `open()` writes remembered defaults into `settings.file_defaults`, which SettingsService persists in `/etc/settings.json` ([settings.md](settings.md), [persistence.md](../persistence.md)).

## Behaviour & invariants

### `launch(id, props?)`

1. Look up the manifest. Missing → `throw`.
2. Validate props (below).
3. Private `instantiate(manifest, props)`: split off `component` (the window gets the manifest without it) and call `component()` now, so the lazy import starts at launch, not at render. The instance holds the promise.
4. `windows.open({ id, manifest, component, props })` → the new `WindowId`.

No single-instance mode, no "focus the existing window". Every call is a new window.

### `create_instance(id, props?)`

Silent and strict, for callers that would rather skip than open an empty window (ADR-023):

| Input | Result |
|-------|--------|
| Unknown id | `null` |
| `props === undefined` | Instance with no props |
| Props, but the manifest has no schema | `null` |
| `schema.safeParse(props)` fails | `null` |
| Passes | Instance with the **parsed** props |

No `console.warn`, no notification, no window. A returned instance has already started its component import (`instantiate`, shared with `launch`). [SessionService](session.md) passes it straight to `windows.restore`.

### Props validation (ADR-008)

| Input | Result |
|-------|--------|
| `props === undefined` | `undefined`, silent |
| Manifest has no `props` schema | Discarded |
| `schema.safeParse(props)` fails | Discarded |
| Passes | `result.data`, the **parsed** value (a `z.object` strips unknown keys) |

Discarding does two things: `console.warn("[AppsService] \"{id}\" {reason}, discarding:", detail)` and a warning notification from the app's id: "{name} opened without its data" / "It was launched with invalid arguments." The window still opens, with no props.

### `open(path, options?)`: resolution, step by step

1. `files.get_file(path)`. `null` → error notification "File not found" (app id `"apps"`, message = path) → resolve `null`. If `get_file` throws, the promise rejects; the caller handles it.
2. `extension = file_extension(file.name)`.
3. **Shortcut.** If the extension is `.desktop`: read the file and `parse_shortcut()` it. Unparseable, or the `app_id` isn't registered → error notification "Broken shortcut" (app id `"apps"`, message = path) → `null`. Otherwise → `launch(app_id, props)`, with the shortcut's props, not `{ path }`. This runs before remembered defaults and associations, so no default or Open-with choice can capture `.desktop`.
4. **Remembered default.** If there is an extension, `settings.file_defaults[extension]` names an app, and that app is in the registry → `launch(default_id, { path })`. The default app does not have to list the extension in its associations. A default pointing at a missing app is skipped, not deleted.
5. **Candidates.** `best_apps_for(registry.values(), file)`, matching on `file.name` and `file.type` (the MIME the browser assigns to the OPFS `File`).
6. Zero candidates → warning notification "No app can open {name}" (app id `"apps"`) → `null`.
7. One candidate → `launch(candidate.id, { path })`.
8. Several → `dialogs.show(OpenWithDialog, { file_name, extension, apps }, { anchor: options.anchor })`.
   - `null` (Esc, outside click, shutdown) → resolve `null`. Nothing opens, no notification.
   - `{ app_id, always }`: if `always` and there is an extension, `settings.file_defaults[extension] = app_id`. Then `launch(app_id, { path })`.

Outside the shortcut case, the props passed are always `{ path }`, which fits `FILE_PROPS`. The receiving app looks the file up again itself.

Details on tiers, the dropdown and remembered defaults: [apps/file-associations.md](../apps/file-associations.md).

### Callers

| Caller | Call |
|--------|------|
| Start menu (`taskbar/start-menu-popover.svelte`) | `launch(id)` |
| `DesktopService.open()` for a shortcut or file (desktop double-click / Enter) | `open(path, { anchor })`; rejections go to `console.error` |
| `DesktopService.open()` for a folder | `launch("file-explorer", { path })` |
| SessionService restore | `create_instance(app_id, props)` per saved window ([session](session.md)) |
| File Explorer file row, double-click / Enter (`files/file-list.svelte`) | `open(path, { anchor })`, so a `.desktop` file there launches its target; rejections go to `report_file_error` |

## Divergence from ADR

- ADR-001's glob is `./**/index.ts`. The code globs `./system/*/index.ts` and `./user/*/index.ts`, one level deep.
- ADR-018's resolution matches the code. The `open()` JSDoc says it resolves `null` "when the file is missing or no app matches (both notify)"; it also resolves `null`, silently, when the chooser is dismissed.

## Known gaps

- Duplicate app ids overwrite silently. User apps register after system apps (glob order), so a user app can replace a system one with no warning.
- No unregister, no way to change a running window's props.
- Stale `file_defaults` entries (pointing at removed apps) stay in settings until the Settings app's global Reset Settings. There's no per-extension removal (ADR-018 calls it a later Settings item).
