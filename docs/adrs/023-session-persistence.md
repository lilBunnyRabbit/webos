# ADR-023: Session Persistence
**Date:** 2026-10-11
**Status:** Implemented (2026-10-11)

> **Revision 2026-10-12: frames and closed windows** ([brainstorm](../brainstorm/2026-10-12_window-polish.md))
> - `session.json` is version `2`: `{ version, windows, frames }`. `frames` maps an app id to the frame its last closed window had (ADR-014 revision). Session loads them into `windows.load_frames()` at init, whatever the restore answer, and saves `windows.frames` with the windows. A v1 file still parses, with no frames.
> - SessionService keeps a stack of recently closed windows: it diffs consecutive snapshots, pushes a window that disappeared (newest first, max 10, memory only), and `reopen_closed()` restores the newest, un-minimized. Alt+Shift+T.

> **Revision 2026-10-11: window state**
> - `WindowSnapshot` gains an optional `state` (`AppInstance.state`, written by `storage.window()`). The version stays `1`, so older files still load, and their windows start at each key's `initial`.
> - `windows.restore`'s `create` takes the whole snapshot. `apps.create_instance(id, props, state)` seeds the instance's state. See the [window state brainstorm](../brainstorm/2026-10-11_window-state.md).

> **Revision 2026-10-11: implementation notes**
> - The file is `/var/lib/session/session.json`, not `/var/session.json`. It follows the convention set in the same session: OS component state goes in `/var/lib/{component}/` (ADR-021, ADR-022).
> - `RestoreResult.skipped` is the list of skipped snapshots, not a count, so the console can show what was dropped.
> - ~~Dismissing the dialog counts as Start fresh.~~ Superseded the same day: the dialog is shown with `dismissible: false` (ADR-019 revision), so only Restore or Start fresh close it.
> - Settings and session share `files/latest-writer.ts` (`LatestWriter`): writes never overlap, the newest text wins, and missing parent folders are created.
> - `windows.restore` clamps bounds into the container (`WindowsHelper.clamp_bounds`), but skips clamping while the container is unmeasured (0×0). It then calls `focus_next()`, so a minimized top window never holds focus.
> - SessionService has an inspector (status, saved count, last save, file path) and a `status` of `none | pending | restored | declined`.
> - Verified in the browser: 4 windows (props, maximized, minimized, positions, z-order) restored exactly; a session with an unknown app and invalid props skipped both with one toast and clamped an oversized window; Start fresh emptied the saved session.

## Context

A standalone PWA is the main goal, and a reload loses every open window. ADR-014 sketched session restore through SettingsService on `beforeunload` plus a 30 s timer. ADR-002 later replaced `beforeunload` with `pagehide`, which is unreliable on mobile and never fires when an installed PWA is killed. Brainstorm: [2026-10-11 Session persistence](../brainstorm/2026-10-11_session-persistence.md).

## Decision

### 1. SessionService owns the session

New service `session`, depending on `windows`, `apps`, `files`, `dialogs` and `notifications`. It stores `/var/session.json` (ADR-021):

```json
{
  "version": 1,
  "windows": [
    { "app_id": "text-viewer", "props": { "path": "/home/a.md" },
      "bounds": { "x": 100, "y": 100, "width": 600, "height": 400 },
      "flags": ["maximized"], "snap_zone": null }
  ]
}
```

Windows are stored oldest-first in z-order, so the last entry ends up on top. Only the `minimized` and `maximized` flags are kept. Apps whose manifest says `restore: false` are left out. Notifications and dialogs aren't part of the session.

### 2. Saving: reactive

An `$effect` serializes the snapshot whenever it changes. Writes are chained, so the latest snapshot always lands last. Bounds only change on pointer release, so dragging doesn't write. **Saving starts only after the restore decision.** Otherwise the empty desktop at boot would overwrite the saved session before the user answers.

### 3. Restoring: a dialog at boot, then `windows.restore()`

- `init()` loads and validates `/var/session.json`. If it has windows, `init()` starts the restore dialog **without awaiting it**: the kernel awaits `init()` before mounting, and the dialogs host only renders after mount.
- The dialog lists the apps and offers **Restore** or **Start fresh**.
- Restore calls:

```ts
// WindowsService
restore(windows: SavedWindow[], create: (app_id: AppId, props: unknown) => AppInstance | null): RestoreResult;

// AppsService: what launch() does, minus opening a window and the toasts
create_instance(id: AppId, props?: unknown): AppInstance | null;
```

- WindowsService opens each window with its saved bounds, flags and snap zone, assigns orders in sequence, and focuses the top visible window. Bounds are clamped into the current container.
- `create` returns `null` for a missing manifest or props that fail validation, and that window is skipped. After restore, one warning toast says "N windows couldn't be restored", with details in the console.

### 4. Opt-out

The manifest gets `restore?: boolean` (default `true`). There's no Settings toggle.

### 5. Multiple tabs

Last writer wins. This is a documented limitation; the multi-window sync brainstorm owns the real fix.

## Alternatives Considered

- **Per-service keys, with AppsService restoring:** follows the localStorage convention, but restore logic spans two services.
- **ADR-002 `get_state`/`set_state` hooks:** generic, but windows can't rebuild app instances on their own. Still deferred.
- **`launch()` with window options; launch then setters:** the owner picked a WindowsService-level restore.
- **`pagehide` plus periodic saving:** loses up to 30 s when the PWA is killed.
- **Automatic restore, or a toast with a Restore action:** the owner wants an explicit prompt.
- **Opening invalid windows without props:** they'd come back empty.

## Consequences

### Positive
- An installed PWA comes back the way it was left.
- Nothing is lost when the app is killed.

### Negative
- One more service, and a dialog at every boot that has a saved session.
- A new public API: `windows.restore`, `apps.create_instance`, manifest `restore`.

### Supersedes
- ADR-014 §Session Persistence (storage in SettingsService, `beforeunload` plus periodic saving, Settings opt-out).

## Implementation order

1. ADR-021: `hierarchy.ts`, bootstrap and migration in `FilesService.init()`, native `move_file`, per-directory `revision`, File Explorer starts at `/home`, system folders marked.
2. ADR-022: DesktopService on `/home/Desktop`, `.desktop` shortcuts, `.layout.json`, the `open()` special case, Pin to Desktop, file and folder items.
3. ADR-023: `apps.create_instance`, `windows.restore`, manifest `restore`, SessionService (load, save, restore dialog, summary toast).

## Related
- ADR-002, ADR-008, ADR-014, ADR-019, ADR-021, ADR-022
