# DialogsService

Key `dialogs` · Depends on: `windows` · ADR: [019](../../adrs/019-system-dialogs.md) · Source: `src/lib/core/api/services/dialogs/`, `src/lib/core/components/dialogs/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

System dialogs that belong to no window. Any service or component calls `show()` with a component and gets a promise for the user's answer. One host component renders the stack above everything.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `stack` | `DialogEntry[]` | Reactive `$state`, bottom first. `readonly` on the interface, mutable on the class |
| `show(component, props, options?)` | `<T, P extends object>(component: Component<P & DialogProps<T>>, props: P, options?: DialogOptions): Promise<T \| null>` | Resolves with what the component passes to `resolve`, or `null` when dismissed |

Types (`type.ts`):

| Type | Shape |
|------|-------|
| `DialogProps<T>` | `{ resolve(value: T \| null): void }`. The host injects it; your component declares it in its `Props` |
| `DialogOptions` | `{ anchor?: Position; dismissible?: boolean }`. `anchor`: viewport point, e.g. the click. `dismissible` (default `true`): `false` for a question that must be answered, so Esc and outside clicks do nothing and only the dialog's own buttons close it |
| `DialogEntry` | `{ id, component, props, point: Position, anchored: boolean, dismissible: boolean, resolve(value: unknown): void }` |
| `DialogId` | `string` (uuid) |

`show()` is typed on the component's props: `P` is everything the component takes except `resolve`, and `T` is what it resolves with.

## State

`stack` only. An entry is pushed by `show()` and removed by its own `resolve`. Nothing else mutates it.

## Lifecycle

- No `init()`.
- `destroy()` resolves every open entry with `null`, top first. Each resolve splices its entry, so the host unmounts the dialogs.

## Persistence

None.

## Behaviour & invariants

### `show()`

1. Creates an entry with a fresh uuid.
2. `point = options.anchor ?? fallback_point()`, `anchored = options.anchor !== undefined`.
3. `entry.resolve(value)` finds the entry by id. Already gone → no-op. Otherwise it splices the entry and settles the promise with `value`.
4. Pushes the entry. The promise never rejects.

Because `resolve` is idempotent, a dialog that resolves a value and is then closed natively (which fires `close` → `resolve(null)`) settles once, with the value.

### Fallback point

Computed once, at `show()` time, and never updated:

1. Centre of the focused window's element (`document.querySelector('[data-window-id="…"]')`).
2. Else the centre of `windows.container.element`.
3. Else the viewport centre (`innerWidth / 2`, `innerHeight / 2`).

The service reads the DOM directly here; it's the only DOM query in a service.

### Host: `dialogs-host.svelte`

Mounted once in `os.svelte`, after the main grid. For each entry:

- A `fixed`, 0×0, `pointer-events-none` div at `point`, with `anchor-name: --dialog-{id}`.
- A native `<dialog>`, opened with `showModal()` by an attachment. The attachment's cleanup calls `close()` if it's still open.
  - `closedby="any"` when `entry.dismissible`, `closedby="none"` otherwise. A non-dismissible dialog also `preventDefault()`s `cancel`, so Esc can't close it.
  - `onclose` → `entry.resolve(null)`. For a dismissible dialog, Esc and outside click both end up here.
  - `position-anchor: --dialog-{id}`.
  - Anchored: `position-area: bottom span-right`, `position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline`. A dropdown below-right of the point that flips at the viewport edges.
  - Unanchored: `position-area: center`, centred on the fallback point.
  - The `<dialog>` itself is unstyled (transparent, no padding, no border). The `::backdrop` is the shared scrim `--overlay` (`background-darkest` at 60%, defined on `html` in `app.css`) for every dialog; unanchored ones (centred questions) also blur it 2px. The component draws its own surface and must give it one (floating layers use `bg-background-lighter`, see [docs/design/patterns.md](../../design/patterns.md#dialogs-and-menus)) and its own entrance (`animate-pop-in`).
- Renders `<entry.component {...entry.props} resolve={entry.resolve} />`.

What the platform gives for free: the top layer (above every window and toast), modality, focus trap and return, Esc, outside-click dismissal, and stacking. Stacked dialogs are separate modal dialogs; an outside click closes the topmost only, and the click does not reach what's underneath.

### First consumer: `OpenWithDialog`

`src/lib/core/components/dialogs/open-with-dialog.svelte`, shown by `AppsService.open()` when several apps tie for a file ([file-associations.md](../apps/file-associations.md#the-open-with-dropdown)).

| Prop | Type | |
|------|------|-|
| `file_name` | `string` | Overline header: "Open {file_name} with" |
| `extension` | `string` | `""` hides the "Always use" checkbox |
| `apps` | `AppManifest[]` | One 36px `menuitem` button per app: icon in a small tile + name, on a `bg-background-lighter` menu |
| `resolve` | `DialogProps<OpenWithChoice>["resolve"]` | |

Resolves `OpenWithChoice = { app_id: AppId; always: boolean }` (exported from the component's module script). Shown dismissible. The first app button gets `autofocus`. ArrowUp/ArrowDown cycle the buttons; from the checkbox, ArrowDown goes to the first app and ArrowUp to the last. Enter or a click picks.

### Second consumer: `RestoreSessionDialog`

`src/lib/core/components/dialogs/restore-session-dialog.svelte`, shown by [SessionService](session.md) at boot when a saved session has windows, with `dismissible: false`. Unanchored, so centred on the fallback point. It's requested during `init()`, before mount, and renders once the host mounts. The fallback point is computed at `show()` time, when there's no window and no measured container yet, so it's the viewport centre.

| Prop | Type | |
|------|------|-|
| `apps` | `(AppManifest \| null)[]` | One per saved window, oldest first; `null` for an app that no longer exists |
| `resolve` | `DialogProps<boolean>["resolve"]` | |

A `rounded-2xl bg-background-lighter` card: a tinted `primary` icon tile, "Pick up where you left off?", the window count, the known apps (icon + name) in a recessed `background-darker` list, "+N from apps that no longer exist", then **Start fresh** (quiet, `false`) and **Restore windows** (primary, `true`, autofocused). Esc and outside clicks do nothing: the user has to pick one. It only resolves `null` if DialogsService is destroyed first.

## Divergence from ADR

- ADR-019 sketches `show<T>(component: Component<DialogProps<T>>, props: object, …)`. The code types `props` against the component (`P`), so wrong props don't compile.

## Known gaps

- Mobile presentation is undecided (ADR-019, ADR-016). Today it's the same anchored dialog.
- Window-scoped overlays from ADR-003 (`confirm`, `prompt`, `pick_file`) don't exist; File Explorer still uses `window.confirm()` for deletes.
- Two `show()` calls in a row stack two modals; there's no queueing or dedup (two quick `open()` calls on ambiguous files show two choosers).
