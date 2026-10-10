# Service Lifecycle Implementation
**Date:** 2026-10-10
**Participants:** @lilbunnyrabbit, Claude

## Context

ADR-002 (2026-01-24) was written before the current kernel. Checked against the code:

- `register()` was synchronous and constructed services as soon as their dependencies existed. `kernel.service()` throws if a service is missing and is called synchronously during render.
- Services had uncleaned side effects in constructors: an `$effect.root` in Settings, an interval plus a `visibilitychange` listener in Version, toast timers in Notifications.

## Gaps in the ADR

1. Its async `register()` would let components render before a service exists.
2. `beforeunload` plus async `destroy()`: the browser never awaits, and mobile often skips `beforeunload`.
3. `swap()` and `get_state`/`set_state` have no caller. ADR-016 rejected runtime swapping for v1.
4. The Settings example quietly decided persistence (key, format), which is a separate decision.
5. `WindowsService.destroy(id)` collides with the `destroy()` hook.

## Decisions

| Question | Decision | Rejected |
|----------|----------|----------|
| Boot | Await every `init()` in dependency order, then mount | Register now and init in the background (`is_ready` flags everywhere); async `register` as written |
| Scope | `init`/`destroy`/`shutdown` only | Full ADR including `swap` (state shape would be a guess) |
| Shutdown | `pagehide`, synchronous `destroy`, plus HMR dispose | `beforeunload`; no unload shutdown at all |
| Settings persistence | Now, in localStorage | Leave it for later |
| Storage medium | localStorage | IndexedDB (overkill, async, needs a dependency or a verbose API); an OPFS dotfile (async, the user can delete it in the explorer, needs a no-overwrite exception, no cross-tab event) |
| Name clash | `windows.destroy` → `close`, `destroy_all` → `close_all` | `remove`; renaming the hook to `dispose` |

The owner asked whether IndexedDB or a file in the filesystem would be better than localStorage. The case for the OPFS file was the OS feel: settings visible to the future terminal. Counter-point: a virtual read-only file (like `/proc`) can provide that later without making the file the source of truth.

## Decided by Claude (defaults, flag if wrong)

- `init()` throwing fails the boot.
- `pagehide` with `persisted: true` skips shutdown, so bfcache restores keep working.
- Stored settings with an unknown `version` are ignored, not migrated.

## Next session topics

- `get_state`/`set_state` shape, with session persistence (ADR-014)
- Whether an OPFS `/proc`-style view of settings belongs in the shell design (ADR-007)
