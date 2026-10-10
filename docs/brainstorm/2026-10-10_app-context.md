# App Context (ADR-003) Implementation

**Date:** 2026-10-10
**Participants:** Owner, Claude

## Context

ADR-003 (accepted 2026-01-24, expanded 2026-01-31 by the window API brainstorm) is the next P0 item. Nothing is implemented: `window-content.svelte` renders the app component with `instance.app.props` and sets no context. Apps that need services import `kernel` directly (settings, kernel apps).

What the code says about the ADR, checked before asking:

- **Scope drift.** The ROADMAP P0 items are context, WindowHandle events, StorageHandle, AppDataHandle. The ADR's WindowHandle has since grown overlays (`pick_file`, `confirm`, `prompt`), a status bar, `set_title`/`set_icon`, `request_attention`/`set_badge`. Each of those needs window chrome and some need new `WindowInstance` fields.
- **`on(event, cb)` is a new pub-sub mechanism.** Nothing in the repo emits events today. Window state already lives in a reactive `SvelteMap` in WindowsService, so apps could read it with `$derived`/`$effect`. `close` is already covered by the app's own `onDestroy`.
- **No non-toggle controls.** WindowsService has `toggle_minimize`/`toggle_maximize`; the handle's `minimize()`/`maximize()`/`restore()` either wrap those with a state check or need new service methods.
- **StorageHandle vs the persistence convention.** ADR-002's convention is one versioned key per service, validated on load, try/catch around parse. ADR-003's `persisted()` sketch has no version, no validation, and an unguarded `JSON.parse`.
- **Two windows, same app.** `app.{app_id}.{key}` is shared. Two `persisted("x")` calls in two windows hold separate `$state`; neither sees the other's writes, last write wins on reload.
- **AppDataHandle has nothing to wrap.** The sketch calls `files_service.read(path)`/`write(path)`/`list(path)`; FilesService is handle-based (ADR-005) and has none of those. `/apps/{id}/` would also show up at the OPFS root in File Explorer. No current app needs it.
- **Mobile (ADR-016).** The context must be set by whatever hosts the app component, so the mobile fullscreen container needs the same setter call. The handle must only use the `WindowsService` interface so a swapped implementation works.

## Topics

### Round 1

Asked without a brief first. After the brief the owner confirmed scope, storage and AppData, and changed the events answer.

| Question | Decision | Rejected |
|----------|----------|----------|
| Scope | Core only: context, reactive window state, `focus`/`close`/`minimize`/`maximize`/`restore`, storage. Overlays, status bar, `set_title`/`set_icon`, badge, attention become separate roadmap items | Core + `set_title`; full ADR |
| Window events | Reactive state only. No `on()`; apps use `$derived`/`$effect` on the handle's getters, and `onDestroy` for close. First answer was the `on()` emitter, dropped after the brief | `on()` emitter (new pub-sub; every mutation site, including the drag handler and the mobile service, would have to emit); state + `before_close` |
| Storage | `get`/`set`/`remove`/`persisted`, optional zod schema, try/catch on parse, invalid or corrupt data falls back to `initial`. No version field | ADR as written; shared cell per key; `persisted()` only |
| AppData | Deferred until the first app needs it | Wrap `DirectoryHandler` now; add a path API to FilesService |

Accepted trade-off: `app_data` is missing from `AppContext` until a consumer exists.

### Round 2

| Question | Decision | Rejected |
|----------|----------|----------|
| `kernel` in context | Dropped. Context carries per-window things only; apps import the kernel singleton like the rest of the codebase | Keep per ADR (two access paths to the same singleton) |

### Round 3: two windows, one key

Problem: each `persisted()` call held its own `$state`, so two windows of one app read the key once and then overwrote each other.

| Decision | Rejected |
|----------|----------|
| One shared cell per key in the storage module, ref-counted, its own `$effect.root` saves. All windows get the same object | Leave it and document (nothing used storage yet); per-window keys (window ids are random per launch, data lost); shared cell + `storage` event for cross-tab (belongs to the multi-window brainstorm) |

Against it, stated before deciding: it is a cache layer built before a real consumer exists. First caller's `initial`/schema win.

### Defaults Claude chose (no shape change, inside the decisions above)

- Files live in `src/lib/core/contexts/app/`, as the ADR names `core/contexts`. Apps import from `$lib/core/contexts/app`, not `$lib/core/api`: the handle reads the kernel, so re-exporting it from the API barrel would be circular.
- `minimize`/`maximize`/`restore` wrap the existing `toggle_*` methods behind a state check. No WindowsService API change. `restore()` un-minimizes first, otherwise un-maximizes.
- Handle getters read `windows.get(id)` on each access, so a swapped WindowsService (ADR-016) works as long as it keeps the interface.
- `get` takes the same optional schema as `persisted`. Write failures (quota) log and continue, like settings.
- `persisted()` uses `$effect`, so it must be called during component init, same constraint as `get_app_context()`.
- `set()` on a key that has a live cell writes through the cell, so the manual API can't be overwritten by the cell's next save.

## Key takeaways

1. Svelte state is the event system. Apps react to `window.is_focused`/`bounds` with `$effect`; no emitter.
2. P0 is the core handle plus storage. Overlays, status bar, title/icon, taskbar badge and attention are separate items.
3. App storage follows the persistence convention: guarded parse, optional zod validation, fallback to `initial`.
4. `app_data` waits for its first consumer.

## Action items

- [x] ADR-003 revision note
- [x] Implement context, WindowHandle, StorageHandle; wire into `window-content.svelte`
- [x] Example app uses the context
- [ ] Mobile host (ADR-016) must call `set_app_context` too

## Next session topics

- `app_data` when the first app needs OPFS (text editor, shell). Needs a path API or a `DirectoryHandler` wrapper, and a decision on hiding `/apps` in File Explorer.
- Window overlays (`pick_file`, `confirm`, `prompt`) and status bar.
- `set_title`/`set_icon` together with ADR-014 taskbar grouping.
- Cross-tab sync of app storage (`storage` event) as part of the multi-window brainstorm.
