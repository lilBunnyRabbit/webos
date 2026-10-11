# SessionService

Key `session` · Depends on: `windows`, `apps`, `files`, `dialogs`, `notifications` · ADR: [ADR-023](../../adrs/023-session-persistence.md) (implemented, see its revision note) · Source: `src/lib/core/api/services/session/`, dialog in `src/lib/core/components/dialogs/restore-session-dialog.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Saves the open windows to `/var/lib/session/session.json` on every change and, at boot, offers to reopen them. It owns the file and the restore flow. Rebuilding windows is WindowsService's job (`windows.restore`), building app instances is AppsService's (`apps.create_instance`).

| File | Contents |
|------|----------|
| `type.ts` | `SessionService` interface, `SessionStatus` const enum |
| `persistence.ts` | `SESSION_PATH`, `SESSION_FLAGS`, `parse_session()`, `serialize_session()`, zod schema |
| `service.svelte.ts` | The class |
| `inspector.svelte` | Status, saved count, last save; detailed adds the file path |

`index.ts` exports `type.ts` only. `WindowSnapshot` and `RestoreResult` are window types, in `windows/type.ts`.

## Public API

Read-only state. There are no methods beyond IService.

| Member | Signature | Notes |
|--------|-----------|-------|
| `status` | `SessionStatus` | `none` (nothing saved to offer), `pending` (dialog open), `restored`, `declined` |
| `saved_count` | `number` | Windows in the loaded file at boot, then in the last snapshot written |
| `last_saved` | `Date \| null` | When the last snapshot was handed to the writer in this tab (queued, not confirmed on disk). `null` before the first save |
| `init` / `destroy` | IService | See Lifecycle |
| `name`, `description`, `to_string()` | IService | `to_string()`: "`SessionService: {status}, {n} saved windows`" |

## State

`status`, `saved_count`, `last_saved` are `$state`. Private: the five dependencies as `$derived(kernel.service(...))`, `writer: LatestWriter` for `SESSION_PATH`, `dispose_saving`, `destroyed`.

## Lifecycle

`init()`, async:

0. `remove_legacy_view_keys()`: deletes the five localStorage keys that held view state before `storage.window()` (`LEGACY_VIEW_KEYS`). Cheap no-op once they're gone.
1. `files.get_file(SESSION_PATH)` → `parse_session()`, or `[]` when missing. `saved_count` = its length.
2. Nothing saved → `start_saving()`, `status` stays `none`, done.
3. Otherwise `status = pending` and `offer_restore(saved)` starts **without being awaited**: the kernel awaits `init()` before mounting, and the dialogs host only renders after mount. A rejection is logged (`[SessionService] Restore failed:`) and saving starts anyway.

`offer_restore(saved)`:

1. `dialogs.show(RestoreSessionDialog, { apps }, { dismissible: false })`, one `AppManifest | null` per snapshot. No anchor, so it's centred. Not dismissible: Esc and outside clicks do nothing.
2. If `destroy()` ran meanwhile, stop.
3. `true` (Restore) → `windows.restore(saved, ({ app_id, props, state }) => apps.create_instance(app_id, props, state))`, `status = restored`. If anything was skipped: `console.warn` with the skipped snapshots and one warning toast from app id `"session"`: "N window(s) couldn't be restored" / "The app is gone or its saved data is no longer valid."
4. `false` (Start fresh) → `status = declined`. Nothing opens. `null` is treated the same, but only happens if DialogsService is destroyed while the dialog is open.
5. `start_saving()`.

`destroy()` sets `destroyed` and disposes the saving effect. A write already queued still finishes.

## Persistence

| | |
|-|-|
| Path | `/var/lib/session/session.json` (ADR-021 convention: OS component state in `/var/lib/{component}/`) |
| Format | `{ "version": 1, "windows": WindowSnapshot[] }`, pretty-printed |
| Version | `SESSION_VERSION = 1` (private) |
| Load | zod. Wrong version, bad shape or bad JSON → `[]`, so no dialog, and the first save overwrites the file. One bad window fails the whole file |
| Written | Through `LatestWriter` ([files](files.md#latestwriter)): no overlapping writes, newest wins, `/var/lib/session` created on first write. Errors → `console.error("Failed to save session:")` |

```ts
interface WindowSnapshot {
  app_id: AppId;               // z: string, min 1
  props?: AppProps;            // z: record, optional
  bounds: Bounds;              // numbers; width and height positive
  flags: WindowFlag[];         // only SESSION_FLAGS: "minimized", "maximized"
  snap_zone: SnapZone | null;
  state?: Record<string, unknown>; // z: record, optional; AppInstance.state, only when non-empty
}
```

`state` is additive: files saved before it existed still parse (version stays `1`) and their windows start every `storage.window()` key at `initial`.

## Behaviour & invariants

**Saving starts only after the decision.** Otherwise the empty desktop at boot would overwrite the saved session before the user answers. While `pending`, closing the tab keeps the old file intact.

**The saving effect** (`$effect.root`, started once) reads `snapshot()` and writes it on every change:

- `windows.sorted_list` by `order` ascending, so oldest-first in z-order and the last entry ends up on top after restore.
- Drops windows whose manifest has `restore: false`. No app sets it today.
- Per window: `app_id`, `$state.snapshot(props)`, a copy of `bounds` (the restored geometry, even for maximized or snapped windows), flags filtered to `SESSION_FLAGS` (`debug` is dropped), `snap_zone`, and `$state.snapshot(app.state)` when it has keys. A `storage.window()` change therefore rewrites the file.
- It tracks everything it reads, so any bounds, flag, snap or z-order change rewrites the file. Bounds only change on pointer release, so dragging doesn't write per frame. Focusing a window does write (its `order` changes).
- Also updates `saved_count` and `last_saved`.

The first run writes immediately, so after Start fresh with no windows open the file holds `{"version":1,"windows":[]}` and the next boot offers nothing.

**Restore** goes through [`windows.restore`](windows.md#restore) and [`apps.create_instance`](apps.md#create_instanceid-props). A snapshot is skipped when the app id is unknown, or its props fail the app's schema, or it has props and the app has no schema. Props are never dropped to open an empty window (unlike `launch`). Bounds are clamped into the container, and the topmost visible window gets focus.

**The dialog** (`RestoreSessionDialog`, props `{ apps: (AppManifest | null)[] }`, resolves `boolean`): "Pick up where you left off?", "N windows were open when WebOS last closed.", a recessed list of known apps (icon + name, max 11rem tall, scrolls), "+N from apps that no longer exist" for the `null`s, then **Start fresh** (quiet) and **Restore windows** (primary, autofocused, so Enter restores). The OS behind is dimmed. The card is `bg-background-lighter`. There's no light dismiss: one of the two buttons has to be picked.

**What isn't in the session:** notifications, dialogs, desktop state (that's [desktop](desktop.md)), app UI state (apps use `storage`), window ids and `created_at` (both new on restore; the taskbar sorts by `created_at`, so after a restore it shows windows in restore order, oldest z-order first).

## Divergence from ADR

ADR-023's body says `/var/session.json`, `RestoreResult.skipped` as a count, and is silent on dismissal and the inspector. The 2026-10-11 revision note records the code: `/var/lib/session/session.json`, `skipped` as the snapshot list, dismiss = Start fresh (since changed: the dialog is now non-dismissible, which the note doesn't cover yet), the shared `LatestWriter`, `clamp_bounds` skipping an unmeasured container, `focus_next()` after restore, the inspector and `status`.

## Known gaps

- Multiple tabs: last writer wins, and every tab writes on every window change (ADR-023 §5).
- Every focus change rewrites the file, because `order` is part of the snapshot.
- `last_saved` is set when a write is queued, not when it lands, so a failed write still updates it.
- A boot with a session always shows the dialog. There's no "always restore" or Settings opt-out (ADR-023 §4).
- One invalid snapshot (bad bounds, unknown flag) makes `parse_session` discard the whole session, not just that window.
- Restore while the window container is still 0×0 skips clamping. In practice the dialog only resolves after mount, when the container is measured.
- Notification text says "The app is gone or its saved data is no longer valid" for both causes; only the console says which.
