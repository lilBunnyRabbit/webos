# App context

ADR: [003](../../adrs/003-app-context.md) · Source: `src/lib/core/contexts/app/` · Set in: `src/lib/core/components/window/window.svelte`

What an app knows about where it runs: its window and its storage. Import from `$lib/core/contexts/app`.

## `get_app_context()`

```ts
const { window_id, app_id, window, storage } = get_app_context();
```

| Field | Type | |
|-------|------|-|
| `window_id` | `WindowId` | This window |
| `app_id` | `AppId` | The manifest id |
| `window` | `WindowHandle` | Window state and controls |
| `storage` | `StorageHandle` | `localStorage` under `app.{app_id}.`, plus this window's state (`window()`) |

- Svelte `getContext` under a private symbol. Call it during component init, in any component inside the app's window (children included).
- Outside a window, or outside init, it throws "get_app_context must be called during init of a component inside a window".
- One context per window, created once by `window.svelte` before the app component mounts. It's set on the window, not the app content, so the window's sheets (a file picker reusing File Explorer) get the same context.
- Destructuring is fine: the handles read the service on every access. Destructuring `window` shadows the global `window` in that component; rename it (`window: win`) if you need the global.
- No `kernel` in the context (ADR-003 revision). Apps import the singleton: `import kernel from "$lib/core/api"`.

## `WindowHandle`

Built by `create_window_handle(id)`. Every member calls `kernel.service<WindowsService>("windows")` fresh, so reactivity comes from the service's state and a swapped WindowsService just works. Read the getters in markup, `$derived` or `$effect`.

| Member | Type | Behaviour |
|--------|------|-----------|
| `id` | `WindowId` | Plain value |
| `is_focused` | `boolean` getter | `windows.is_focused(id)`: the window has the top `order` |
| `is_maximized` | `boolean` getter | Has the `maximized` flag. `false` once the window is gone |
| `is_minimized` | `boolean` getter | Has the `minimized` flag. `false` once the window is gone |
| `is_visible` | `boolean` getter | `windows.is_visible(id)`: not minimized (mobile: on screen) and the tab isn't hidden (ADR-035). Derive loops and timers from it: `$derived(playing && win.is_visible)` |
| `bounds` | `Readonly<Bounds>` getter | `{ x, y, width, height }` from the instance. A frozen zero rect once the window is gone |
| `focus()` | `void` | `windows.focus(id)` |
| `close()` | `void` | `windows.close(id)`: asks first when the window is dirty (ADR-029). Call `set_dirty(false)` before closing after your own save |
| `set_title(title)` | `void` | The document title shown instead of the app name (titlebar with the app's icon, taskbar tooltip "{title} — {app}", switcher card, Activity Monitor). `null` restores the app name. Not persisted: set it again after a restore |
| `set_dirty(dirty, { save? })` | `void` | Unsaved changes: closing shows "Save changes to {title}?" with Cancel / Don't save / Save (Save only with `save`, which resolves `true` once saved), the titlebar shows a `primary` dot, and a tab close or reload makes the browser ask. Use `$effect(() => window.set_dirty(dirty, { save }))` |
| `minimize()` | `void` | Minimizes if not already minimized |
| `maximize()` | `void` | Un-minimizes first if minimized, then maximizes if not maximized |
| `on_back(handler)` | `() => void` (disposer) | Claims the mobile nav bar's Back (ADR-003 revision 2026-10-12). `handler` returns `true` when it handled back. Handlers stack per window, newest first: `windows.add_back_handler(id, handler)`. Use `$effect(() => window.on_back(...))`. Desktop never calls it |
| `restore()` | `void` | If minimized: un-minimize only (a minimized-and-maximized window comes back maximized). Else if maximized: un-maximize. Else nothing |

All controls are idempotent; the service's `toggle_*` calls are wrapped so the handle never toggles the wrong way.

Window sheets (ADR-025), rendered over this window only ([services/dialogs.md](../services/dialogs.md#window-sheets-adr-025)):

| Member | Type | Behaviour |
|--------|------|-----------|
| `confirm(message, options?)` | `Promise<boolean>` | `ConfirmDialog` sheet, `dismissible: false`. `false` on Cancel or if the window closes. Options: `detail`, `confirm_label`, `danger` |
| `prompt(message, options?)` | `Promise<string \| null>` | `PromptDialog` sheet. Esc or Cancel → `null`. Options: `detail`, `initial`, `placeholder`, `confirm_label`, `validate`, `select_stem` |
| `pick_file(options?)` | `Promise<string \| null>` | `FilePickerDialog` sheet (imported on first use, like the other two pickers): File Explorer in picker mode. Options: `accept` (association syntax: `.md`, `image/*`), `start_path` (default `/home`), `title`. Resolves the chosen path |
| `pick_directory(options?)` | `Promise<string \| null>` | The same for folders: "Select folder" takes the selected subfolder or the open folder |
| `pick_save(options?)` | `Promise<string \| null>` | The picker in save mode: a folder plus a typed name. Options: `name` (suggested), `accept` (dims files that don't match), `start_path`, `title` (default "Save as"). Asks before replacing ("Replace" button). Refuses system folders (`/etc`, `/var`, `/tmp`). Resolves the full path; the app writes the file ([files.md](../services/files.md#picker-mode-adr-025)) |

Files from the real device aren't a handle member: `pick_device_files({ accept, multiple })` from `$lib/core/utils/device-file` resolves `File[]` in memory, with no OPFS copy (ADR-031).

Not there (ADR-003, deferred): `on()` events (owner decided against them; use getters plus `onDestroy`), `set_icon`, taskbar attention/badge, status bar.

## `StorageHandle`

Built by `create_storage_handle(app_id, instance.app.state)` in `window.svelte`. Keys are stored as `app.{app_id}.{key}`, JSON-encoded. Small data only; files go through [FilesService](../services/files.md). Storage conventions overall: [persistence.md](../persistence.md).

| Member | Signature | Behaviour |
|--------|-----------|-----------|
| `get` | `<T>(key, schema?: ZodType<T>): T \| null` | Reads and parses. Missing, unparseable JSON, a throwing `localStorage`, or a failed `schema.safeParse` → `null`. Without a schema the parsed value is cast, unchecked |
| `set` | `<T>(key, value: T): void` | If a `persisted()` cell is live for the key, sets the cell (which then saves). Otherwise writes directly. Write errors are `console.error`ed. No schema check |
| `remove` | `(key): void` | `localStorage.removeItem` (errors logged, not thrown), then resets a live cell to its `initial` without saving; see below |
| `persisted` | `<T>(key, initial: T, schema?: ZodType<T>): { value: T }` | A reactive cell that saves on change, shared by every window of the app. Must be called during component init. For app data |
| `window` | `<T>(key, initial: T, schema?: ZodType<T>): { value: T }` | State of this window only, saved with the session. For view state (open tab, expanded rows, toggles) |
| `file` | `<T>(name, initial: T, schema: ZodType<T>): { value: T; ready; error }` | A JSON file in the app's data folder `/var/lib/apps/{app_id}/{name}`, shared by every window. For app data bigger than settings (ADR-035). Must be called during component init |

### `persisted()`

```ts
const count = storage.persisted("count", 0, z.number());
count.value++; // saved
```

- Initial value: `get(key, schema) ?? initial`. Invalid stored data falls back to `initial`.
- The cell saves with an `$effect` (inside its own `$effect.root`) on `$state.snapshot(value)`. The effect runs once right away, so the key is written on first use even if it held nothing or held invalid data, which gets replaced by `initial`.
- Saving is deep: mutating a nested property of an object value is tracked and saved.
- Saves happen when effects flush (microtask), so a `get()` right after assigning `value` can still read the old string.
- The calling component registers an `$effect` whose cleanup releases the cell. That's why it must run during init.

### Shared persisted cells

A module-level `Map<full_key, PersistedCell>` holds one cell per `app.{id}.{key}` across all windows.

- The first `persisted()` call for a key creates the cell; later calls (any window of the same app) get the same object. Its `initial` and `schema` win; later callers' arguments are ignored while the cell lives.
- Each call retains the cell; each unmount releases it. When the count hits zero the save effect is disposed and the cell is deleted from the map. The next `persisted()` re-reads storage.
- `set(key, …)` from any window updates the live cell, so every window sees it instantly.

Two windows of the Example app: incrementing in one updates the other live, and both write the same value. Close one, the other keeps working. Close both, reopen: the last saved value loads.

Edge cases:

- `remove(key)` while a cell is live: storage is cleared and the cell resets to a clone of its `initial` in every window, without writing. The key stays absent until the next change. The reset target is the first caller's `initial`, cloned when the cell was created.
- A launch prop used as `initial` (the Example app's `count`) only counts when nothing is stored and no cell is live. After that the stored value wins over the prop.
- Other browser tabs aren't synced; there's no `storage` event listener.
- Two different components in the same window calling `persisted()` on the same key also share the cell.

### `window()`

```ts
const section = storage.window<Section>("section", "appearance", z.enum(SECTION_IDS));
section.value = "about"; // this window only
```

- The value lives in `AppInstance.state` (`$state`, created by `apps.instantiate`), keyed by `key`. Two windows of one app never share it.
- A new window starts at `initial`. A restored window gets its saved value back if it passes `schema`, else `initial`. Without a schema the saved value is used unchecked.
- Nothing is written to localStorage. SessionService snapshots `app.state` with the window and passes it back through `windows.restore` → `apps.create_instance(id, props, state)` ([session](../services/session.md)).
- Gone when the window closes. Not tied to component lifetime, so it can be called anywhere a context is available.
- A launch prop can be the `initial` (Settings' `section`): it counts for a new window, but a restored window's saved state wins over its saved props.

Used by Settings, Activity Monitor and Style Guide (`section`), Kernel (`expanded`) and Text Editor (`wrap`, `markdown`; Text Viewer's `wrap` before the rename). Before 2026-10-11 these were `persisted()` cells, so every window of the app switched together; SessionService's `init()` removes their old `app.{id}.*` keys ([persistence](../persistence.md)).

### `file()` (ADR-035)

```ts
const board = storage.file("board.json", EMPTY_BOARD, BoardSchema);
{#if board.ready} … board.value.columns.push(column) … {/if}
```

- Built on `json_file(path, initial, schema)` from `$lib/core/contexts/app` (`json-file.svelte.ts`), which also works outside an app (a widget, another app's file, the game kit) and returns a handle with `release()`. `app_data_path(app_id, name)` builds the path.
- One cell per path across the page, reference-counted; the last release stops it. Its effects run in a `detached_root` (`$lib/core/utils/detached-root.svelte.ts`), created from a microtask: a root made during component init is linked into that component's effect tree, and a change landing while the component plays its outro (a closing window) left the root dirty and dead for every holder. `persisted()` cells and the Quick Notes, Kanban badge and Pomodoro timer roots use it for the same reason.
- `ready` is `false` until the first read. Nothing is written before it, so a slow read never overwrites the file with `initial`.
- Re-reads whenever the folder's `files.revision()` changes: another window, Text Editor, Explorer, a delete (back to `initial`, no write). Texts it wrote itself recently are recognized and not read back over newer edits. A re-read while its own write is queued or in flight waits for `LatestWriter.idle()` first: the folder's revision also moves for a sibling file's write or for the folder being created, and disk would still hold the old text (or nothing). A read matching its own write clears `error`.
- Deep changes save pretty-printed through `LatestWriter` (serialized, newest wins, folders created). A change made right before the last release is still written.
- Missing file → `initial`. Invalid JSON or schema → `initial` and `error` set; the file stays on disk until the next change overwrites it.
- Unit of sync is the folder: a write to any file in it makes every cell in that folder re-read (cheap: one small read each).

### `live_file()` for shell code

```ts
const boards = live_file(BOARDS_PATH, default_file(), KanbanFileSchema);
const file = await boards.read();
await boards.edit((file) => ({ ...file, boards: [...file.boards, board] }));
```

- `$lib/core/contexts/app/live-file.svelte.ts`. Each `read()` or `edit(change)` takes the `json_file` cell for the path, so an open window holding it shows the change at once, waits until it is `ready`, and returns a snapshot (`edit` returns the new value).
- An invalid file (`error` set) throws a `ShellError` ("… isn't valid; it was left as it is") instead of acting on `initial`.
- The cell is released `LINGER_MS` (3 s) after use: the save runs in an effect, and dropping the cell at once could let the next command read the file before that write lands.
- Used by the Kanban, Calendar, Time Since and Game Hub commands.

### `confirm_discard()`

`confirm_discard(win, name)` from `$lib/core/contexts/app` shows the danger sheet "Discard changes to “{name}”?" ("Your unsaved changes will be lost.", Discard) and resolves the answer. Document apps (Text Editor, Paint, Image Editor, Markdown to PDF, the Nonogram editor) call it as `!dirty || confirm_discard(win, name)` before New, Open or a dropped file. The close prompt is the OS's (ADR-029), not this.

## Divergence from ADR

ADR-003's revision note describes the implemented subset accurately. The original sketch's `kernel`, `app_data`, `on()`, identity, taskbar, overlays and status bar are not in the code. The error message differs from the sketch's.
