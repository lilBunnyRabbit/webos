# App context

ADR: [003](../../adrs/003-app-context.md) · Source: `src/lib/core/contexts/app/` · Set in: `src/lib/core/components/window/window-content.svelte`

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
| `storage` | `StorageHandle` | `localStorage` under `app.{app_id}.` |

- Svelte `getContext` under a private symbol. Call it during component init, in any component inside the app's window (children included).
- Outside a window, or outside init, it throws "get_app_context must be called during init of a component inside a window".
- One context per window, created once by `window-content.svelte` before the app component mounts.
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
| `bounds` | `Readonly<Bounds>` getter | `{ x, y, width, height }` from the instance. A frozen zero rect once the window is gone |
| `focus()` | `void` | `windows.focus(id)` |
| `close()` | `void` | `windows.close(id)`. Immediate, no confirmation |
| `minimize()` | `void` | Minimizes if not already minimized |
| `maximize()` | `void` | Un-minimizes first if minimized, then maximizes if not maximized |
| `restore()` | `void` | If minimized: un-minimize only (a minimized-and-maximized window comes back maximized). Else if maximized: un-maximize. Else nothing |

All controls are idempotent; the service's `toggle_*` calls are wrapped so the handle never toggles the wrong way.

Window sheets (ADR-025), rendered over this window only ([services/dialogs.md](../services/dialogs.md#window-sheets-adr-025)):

| Member | Type | Behaviour |
|--------|------|-----------|
| `confirm(message, options?)` | `Promise<boolean>` | `ConfirmDialog` sheet, `dismissible: false`. `false` on Cancel or if the window closes. Options: `detail`, `confirm_label`, `danger` |
| `prompt(message, options?)` | `Promise<string \| null>` | `PromptDialog` sheet. Esc or Cancel → `null`. Options: `detail`, `initial`, `placeholder`, `confirm_label`, `validate`, `select_stem` |

Not there (ADR-003, deferred): `on()` events (owner decided against them; use getters plus `onDestroy`), `set_title`, `set_icon`, taskbar attention/badge, `pick_file` / `pick_directory` (ADR-025 step 5), status bar.

## `StorageHandle`

Built by `create_storage_handle(app_id)`. Keys are stored as `app.{app_id}.{key}`, JSON-encoded. Small data only; files go through [FilesService](../services/files.md). Storage conventions overall: [persistence.md](../persistence.md).

| Member | Signature | Behaviour |
|--------|-----------|-----------|
| `get` | `<T>(key, schema?: ZodType<T>): T \| null` | Reads and parses. Missing, unparseable JSON, a throwing `localStorage`, or a failed `schema.safeParse` → `null`. Without a schema the parsed value is cast, unchecked |
| `set` | `<T>(key, value: T): void` | If a `persisted()` cell is live for the key, sets the cell (which then saves). Otherwise writes directly. Write errors are `console.error`ed. No schema check |
| `remove` | `(key): void` | `localStorage.removeItem` (errors logged, not thrown), then resets a live cell to its `initial` without saving; see below |
| `persisted` | `<T>(key, initial: T, schema?: ZodType<T>): { value: T }` | A reactive cell that saves on change. Must be called during component init |

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

## Divergence from ADR

ADR-003's revision note describes the implemented subset accurately. The original sketch's `kernel`, `app_data`, `on()`, identity, taskbar, overlays and status bar are not in the code. The error message differs from the sketch's.
