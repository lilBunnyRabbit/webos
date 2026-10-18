# SessionService

Key `session` · Depends on: `windows`, `apps`, `files`, `dialogs`, `notifications` · ADR: [ADR-023](../../adrs/023-session-persistence.md) (implemented, see its revision note), [ADR-044](../../adrs/044-folder-mounts-and-sources.md) (mounts left out), [ADR-047](../../adrs/047-solo-app-open.md) (solo) · Source: `src/lib/core/api/services/session/`, dialog in `src/lib/core/components/dialogs/restore-session-dialog.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Saves the open windows and the remembered window frames to `/var/lib/session/session.json` on every change and, at boot, offers to reopen the windows. It also keeps the stack of recently closed windows (Alt+Shift+T). It owns the file and the restore flow. Rebuilding windows is WindowsService's job (`windows.restore`), building app instances is AppsService's (`apps.create_instance`).

| File | Contents |
|------|----------|
| `type.ts` | `SessionService` interface, `SessionStatus` const enum |
| `persistence.ts` | `SESSION_PATH`, `SESSION_FLAGS`, `SessionFile`, `parse_session()`, `serialize_session()`, zod schema (v1 and v2), `shows_mount()`, `remove_legacy_view_keys()` (drops old per-app view keys from localStorage, run at init) |
| `shell.ts` | `win reopen`, see [Shell](#shell) |
| `service.svelte.ts` | The class |
| `solo.svelte.ts` | `SoloSessionService`, registered instead in solo mode (see [Solo mode](#solo-mode)) |
| `inspector.svelte` | Status, saved count, last save; detailed adds the file path |

`index.ts` exports `type.ts` only. `WindowSnapshot` and `RestoreResult` are window types, in `windows/type.ts`.

## Public API

Read-only state plus `reopen_closed()`.

| Member | Signature | Notes |
|--------|-----------|-------|
| `status` | `SessionStatus` | `none` (nothing saved to offer), `pending` (dialog open), `restored`, `declined` |
| `saved_count` | `number` | Windows in the loaded file at boot, then in the last snapshot written |
| `last_saved` | `Date \| null` | When the last snapshot was handed to the writer in this tab (queued, not confirmed on disk). `null` before the first save |
| `closed` | `WindowSnapshot[]` | `$state.raw`. Recently closed windows, newest first, max 10, memory only (ADR-023 revision) |
| `reopen_closed` | `() => WindowId \| null` | Pops the newest, drops `minimized`, `windows.restore([it])`, then `windows.focus(id)` (mobile's restore goes home). `null` when empty or the app can't be created (the entry is dropped either way). Alt+Shift+T |
| `init` / `destroy` | IService | See Lifecycle |
| `name`, `description`, `to_string()` | IService | `to_string()`: "`SessionService: {status}, {n} saved windows`" |

## State

`status`, `saved_count`, `last_saved` are `$state`. Private: the five dependencies as `$derived(kernel.service(...))`, `writer: LatestWriter` for `SESSION_PATH`, `dispose_saving`, `destroyed`.

## Lifecycle

`init()`, async:

0. `remove_legacy_view_keys()`: deletes the five localStorage keys that held view state before `storage.window()` (`LEGACY_VIEW_KEYS`). Cheap no-op once they're gone.
1. `files.get_file(SESSION_PATH)` → `parse_session()`, or empty when missing. `saved_count` = the windows' length. `windows.load_frames(frames)` runs now, whatever the restore answer: Start fresh drops windows, not where apps open.
2. Nothing saved → `start_saving()`, `status` stays `none`, done.
3. Otherwise it starts importing each saved app's component (`manifest.component()`, once per app, errors ignored), so the chunks load while the rest of boot runs and the Restore dialog is up (ADR-036). Then `status = pending` and `offer_restore(saved)` starts **without being awaited**: the kernel awaits `init()` before mounting, and the dialogs host only renders after mount. A rejection is logged (`[SessionService] Restore failed:`) and saving starts anyway.

`offer_restore(saved)`:

1. `dialogs.show(RestoreSessionDialog, { apps }, { dismissible: false })`, one `AppManifest | null` per snapshot. No anchor, so it's centred. Not dismissible: Esc and outside clicks do nothing.
2. If `destroy()` ran meanwhile, stop.
3. `true` (Restore) → `windows.restore(saved, ({ app_id, props, state }) => apps.create_instance(app_id, props, state))`, `status = restored`. If anything was skipped: `console.warn` with the skipped snapshots and one warning toast from app id `"session"`: "N window(s) couldn't be restored" / "The app is gone or its saved data is no longer valid."
4. `false` (Start fresh) → `status = declined`. Nothing opens. `null` is treated the same, but only happens if DialogsService is destroyed while the dialog is open.
5. `start_saving()`.

`destroy()` sets `destroyed` and disposes the saving effect. A write already queued still finishes.

### Solo mode

A `#/solo/` link registers `SoloSessionService` (`session/solo.svelte.ts`, ADR-047) under the same key: it extends this class with an empty `init()`. No Restore dialog, no saving, no frames loaded, `status` stays `none`, `closed` stays empty. The person's saved session is untouched for their own WebOS tab.

## Persistence

| | |
|-|-|
| Path | `/var/lib/session/session.json` (ADR-021 convention: OS component state in `/var/lib/{component}/`) |
| Format | `{ "version": 2, "windows": WindowSnapshot[], "frames": Record<AppId, Bounds> }`, pretty-printed |
| Version | `SESSION_VERSION = 2` (private). A v1 file (no `frames`) still loads, with no frames |
| Load | zod discriminated union on `version`. Unknown version, bad shape or bad JSON → no windows and no frames, so no dialog, and the first save overwrites the file. One bad window fails the whole file |
| Written | Through `LatestWriter` with `delay: 300` ([files](files.md#latestwriter)): a burst of window changes (20 focus clicks) saves once, 300 ms after the last; flushed when the tab hides. No overlapping writes, newest wins, `/var/lib/session` created on first write. Seeded with the text read at boot, so a restore that reproduces the file writes nothing. Errors → `console.error("Failed to save session:")` |

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

`state` is additive: files saved before it existed still parse and their windows start every `storage.window()` key at `initial`.

## Behaviour & invariants

**Saving starts only after the decision.** Otherwise the empty desktop at boot would overwrite the saved session before the user answers. While `pending`, closing the tab keeps the old file intact.

**The saving effect** (`$effect.root`, started once) reads `snapshot()` and writes it on every change:

- `windows.sorted_list` by `order` ascending, so oldest-first in z-order and the last entry ends up on top after restore.
- Drops windows whose manifest has `restore: false`. No app sets it today.
- Drops windows with a `/mnt/…` path in their props, alone or in an array (`shows_mount`): after a reload the mount is locked until a click reconnects it, so the window couldn't open its file (ADR-044).
- Per window: `app_id`, `$state.snapshot(props)`, a copy of `bounds` (the restored geometry, even for maximized or snapped windows), flags filtered to `SESSION_FLAGS` (`debug` is dropped), `snap_zone`, and `$state.snapshot(app.state)` when it has keys. A `storage.window()` change therefore rewrites the file.
- It tracks everything it reads, so any bounds, flag, snap or z-order change rewrites the file. Bounds only change on pointer release, so dragging doesn't write per frame. Focusing a window does write (its `order` changes).
- Writes `windows.frames` alongside, so a close (which records a frame) rewrites the file.
- Also updates `saved_count` and `last_saved`.
- Then, untracked, compares the snapshot's window ids with the previous run's: every window that disappeared is pushed onto `closed` (topmost first). Windows with `restore: false` aren't in the snapshot, so they can't be reopened. Closes before the restore decision aren't tracked.

The first run writes immediately, so after Start fresh with no windows open the file holds `{"version":2,"windows":[],"frames":{…}}` and the next boot offers nothing.

**Restore** goes through [`windows.restore`](windows.md#restore) and [`apps.create_instance`](apps.md#create_instanceid-props). A snapshot is skipped when the app id is unknown, or its props fail the app's schema, or it has props and the app has no schema. Props are never dropped to open an empty window (unlike `launch`). Bounds are clamped into the container, and the topmost visible window gets focus.

**The dialog** (`RestoreSessionDialog`, props `{ apps: (AppManifest | null)[] }`, resolves `boolean`): "Pick up where you left off?", "N windows were open when WebOS last closed.", a recessed list of known apps (icon + name, max 11rem tall, scrolls), "+N from apps that no longer exist" for the `null`s, then **Start fresh** (quiet) and **Restore windows** (primary, autofocused, so Enter restores). The OS behind is dimmed. The card is `bg-background-lighter`. There's no light dismiss: one of the two buttons has to be picked.

**What isn't in the session:** notifications, dialogs, desktop state (that's [desktop](desktop.md)), app UI state (apps use `storage`), window ids and `created_at` (both new on restore; the taskbar sorts by `created_at`, so after a restore it shows windows in restore order, oldest z-order first).

## Divergence from ADR

The 2026-10-12 revision covers v2 (`frames`) and the closed stack. ADR-023's body says `/var/session.json`, `RestoreResult.skipped` as a count, and is silent on dismissal and the inspector. The 2026-10-11 revision note records the code: `/var/lib/session/session.json`, `skipped` as the snapshot list, dismiss = Start fresh (struck the same day: the dialog is non-dismissible), the shared `LatestWriter`, `clamp_bounds` skipping an unmeasured container, `focus_next()` after restore, the inspector and `status`.

## Shell

Contributes `win reopen` (`session/shell.ts`). See [shell](shell.md#contributions).

## Known gaps

- On mobile, `windows.restore` ignores the saved geometry and lands on the home screen with the restored apps in the switcher ([windows.md](windows.md#mobile)). Both platforms share the file, so a session saved on mobile restores on desktop with fullscreen-sized windows.

- Multiple tabs: last writer wins, and every tab writes on every window change (ADR-023 §5).
- Every focus change rewrites the file, because `order` is part of the snapshot.
- `last_saved` is set when a write is queued, not when it lands, so a failed write still updates it.
- A boot with a session always shows the dialog. There's no "always restore" or Settings opt-out (ADR-023 §4).
- One invalid snapshot (bad bounds, unknown flag) makes `parse_session` discard the whole session, not just that window.
- Restore while the window container is still 0×0 skips clamping. In practice the dialog only resolves after mount, when the container is measured.
- Notification text says "The app is gone or its saved data is no longer valid" for both causes; only the console says which.
