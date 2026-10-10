# AppsService

Key `apps` · Depends on: `windows`, `notifications`, `files`, `settings`, `dialogs` · ADR: [001](../../adrs/001-app-manifest-structure.md), [008](../../adrs/008-app-props-validation.md), [018](../../adrs/018-file-associations.md) · Source: `src/lib/core/api/services/apps/`

## Purpose

The app registry. Holds every discovered manifest, launches an app into a new window with validated props, and resolves a file path to the app that should open it.

| File | Contents |
|------|----------|
| `type.ts` | `AppsService` interface, `AppManifest`, `AppConfig`, `AppInstance`, `OpenOptions`, `AppCategory`, `AppProps` |
| `helpers.ts` | `define_app()`, `FILE_PROPS` |
| `associations.ts` | Pure matching: `file_extension()`, `association_tier()`, `best_apps_for()` |
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
| `open(path, options?)` | `(path: string, options?: OpenOptions): Promise<WindowId \| null>` | File → app resolution, below |

`OpenOptions` is `{ anchor?: Position }`: the viewport point the "Open with" dropdown anchors to.

Pure helpers, exported from the barrel:

| Function | Behaviour |
|----------|-----------|
| `file_extension(name)` | `"Notes.TXT"` → `".txt"`. Lowercased. Returns `""` when there's no dot **or the only dot is at index 0**, so dotfiles (`.gitignore`, `.env`) have no extension |
| `association_tier(entry, file)` | `3` exact extension, `2` exact MIME, `1` MIME wildcard (`image/*`), `0` no match. Case-insensitive. Empty `file.type` never matches a MIME entry |
| `best_apps_for(apps, file)` | Every app tied on the highest non-zero tier, in iteration order. `[]` when nothing matches |

## State

Only `registry`. Filled in the constructor from the eager glob in `src/lib/apps/index.ts` (see [lifecycle](../apps/lifecycle.md#1-discovery)). The constructor also wires `$derived` references to its five dependencies. There is no `init()` and no `destroy()`.

## Lifecycle

Constructed by the kernel after its dependencies. Registration happens in the constructor, which bends the CONVENTIONS rule "constructors only set fields", but it has no side effects outside the instance.

Importing `service.svelte.ts` imports `$lib/apps`, which evaluates every manifest eagerly. This happens while the `$lib/core/api` barrel is still initializing, which is why manifests may not import constants from the barrel ([manifest.md](../apps/manifest.md#the-import-rule)).

## Persistence

None of its own. `open()` writes remembered defaults into `settings.file_defaults`, which SettingsService persists in `webos.settings` ([settings.md](settings.md), [persistence.md](../persistence.md)).

## Behaviour & invariants

### `launch(id, props?)`

1. Look up the manifest. Missing → `throw`.
2. Split off `component`; the window gets the manifest without it.
3. Call `component()` now, so the lazy import starts at launch, not at render. The window holds the promise.
4. Validate props (below).
5. `windows.open({ id, manifest, component, props })` → the new `WindowId`.

No single-instance mode, no "focus the existing window". Every call is a new window.

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
3. **Remembered default.** If there is an extension, `settings.file_defaults[extension]` names an app, and that app is in the registry → `launch(default_id, { path })`. The default app does not have to list the extension in its associations. A default pointing at a missing app is skipped, not deleted.
4. **Candidates.** `best_apps_for(registry.values(), file)`, matching on `file.name` and `file.type` (the MIME the browser assigns to the OPFS `File`).
5. Zero candidates → warning notification "No app can open {name}" (app id `"apps"`) → `null`.
6. One candidate → `launch(candidate.id, { path })`.
7. Several → `dialogs.show(OpenWithDialog, { file_name, extension, apps }, { anchor: options.anchor })`.
   - `null` (Esc, outside click, shutdown) → resolve `null`. Nothing opens, no notification.
   - `{ app_id, always }`: if `always` and there is an extension, `settings.file_defaults[extension] = app_id`. Then `launch(app_id, { path })`.

The props passed are always `{ path }`, which fits `FILE_PROPS`. The receiving app looks the file up again itself.

Details on tiers, the dropdown and remembered defaults: [apps/file-associations.md](../apps/file-associations.md).

### Callers

| Caller | Call |
|--------|------|
| Start menu (`taskbar/start-menu-popover.svelte`) | `launch(id)` |
| Desktop icon double-click (`desktop/desktop-item.svelte`) | `launch(item.app_id, item.props)` |
| File Explorer file row, double-click / Enter (`files/file-list.svelte:41`) | `open(path, { anchor })`; rejections go to `report_file_error` |

## Divergence from ADR

- ADR-001's glob is `./**/index.ts`. The code globs `./system/*/index.ts` and `./user/*/index.ts`, one level deep.
- ADR-018's resolution matches the code. The `open()` JSDoc says it resolves `null` "when the file is missing or no app matches (both notify)"; it also resolves `null`, silently, when the chooser is dismissed.

## Known gaps

- `class AppsService implements AppsService` (`service.svelte.ts:8`) implements itself, not the imported `IAppsService` alias. The interface conformance is never checked and the alias import is unused.
- Duplicate app ids overwrite silently. User apps register after system apps (glob order), so a user app can replace a system one with no warning.
- `src/lib/apps/index.ts:12` logs `"Apps Found"` on every load.
- No unregister, no way to change a running window's props.
- Stale `file_defaults` entries (pointing at removed apps) stay in settings forever; there's no reset UI yet (ADR-018 calls it a later Settings item).
- Text Viewer lists `.env`, which only matches names like `prod.env`. A file called `.env` has no extension by `file_extension()` and usually no MIME, so it gets "No app can open .env".
