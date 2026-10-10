# Session persistence

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

A standalone PWA is the project's main goal. Today a reload keeps only settings, app storage and files. Open windows (app, props, bounds, flags, snap zone, z-order) and the desktop arrangement are lost ([persistence.md](../system/persistence.md)).

Earlier work:
- ADR-014 §Session Persistence: save windows to SettingsService, on `beforeunload` plus every 30 s. Restore by launching each app with its saved props and geometry, and skip missing manifests. A Settings opt-out, plus manifest `restore: false`.
- ADR-002 revision: `get_state()`/`set_state()`/`swap()` are deferred "until session persistence defines the state shape". `pagehide` replaced `beforeunload` (unreliable on mobile).
- [2026-01-24 lifecycles-persistence](2026-01-24_lifecycles-persistence.md): a single `webos.session` key with windows plus desktop, and app `onSave`/`onRestore` state.
- ADR-011 revision (2026-10-11): DesktopService `layout` is what gets persisted.
- CONVENTIONS: one versioned localStorage key per service, with load/save as pure functions beside the service (`settings/persistence.ts`).

Constraints from the code:
- WindowsService has no dependencies. A window holds an `AppInstance` (manifest, lazy component, validated props), and only AppsService can build one (`launch()` → `windows.open()`). So restoring windows requires AppsService.
- `launch()` validates props against the manifest's zod schema and discards invalid ones with a toast (ADR-008).
- Bounds change only on pointer release (the drag state is separate), so saving reactively doesn't write during a drag.

## Topics

### Round 1

| Question | Decision | Rejected |
|----------|----------|----------|
| What's restored | Windows: app, props, bounds, flags, snap zone, z-order, focus. Notifications and dialogs stay transient. | Windows only; windows + notification history |
| Who owns it | A new **SessionService** that owns saving and restoring windows | Per-service keys with AppsService restoring; ADR-002 `get_state`/`set_state` hooks |
| When to save | Reactive `$effect` on change. Bounds only change on pointer release, and a killed PWA never fires `pagehide`. | `pagehide` + 30 s periodic (ADR-014); debounced |
| Opt-outs | Manifest `restore: false` only | Plus a Settings toggle; none |

**Owner correction:** the desktop arrangement is **not session state**. It's permanent user data and should probably live in the file system (OPFS), not in the session. That splits desktop persistence out of this topic (round 2).

### Round 2

| Question | Decision | Rejected |
|----------|----------|----------|
| Desktop in the file system | A **Desktop folder** with shortcut files (`Settings.app` → `{ app_id, props }`). Real files can live there too and open by association. Positions go in a layout file. | Layout JSON in a system folder; localStorage `webos.desktop` |
| Restore API | Undecided. The owner added: **prompt the user whether to restore**, not automatic. | Re-asked in round 3/4 |
| Invalid props on restore | Skip the window, one summary toast ("N windows couldn't be restored"), details in the console | Open without props; skip silently |
| Two tabs | Last writer wins, documented as a known limitation (multi-window sync owns the real fix) | Web Locks single owner |

**Owner direction:** define a special **system storage, Linux/Unix-inspired**: a real hierarchy in OPFS, not ad-hoc dot-folders.

### Round 3: file system hierarchy

| Question | Decision | Rejected |
|----------|----------|----------|
| Hierarchy | **Unix-lite**: `/home` (user, Explorer start; `Desktop/`, `Documents/`, `Downloads/`), `/etc` (OS config), `/var` (OS state), `/tmp` (cleared at boot). System folders visible but marked. | FHS with usernames (future-proofing); `/home` + hidden `/.system` |
| What moves to the file system | Session → `/var/session.json`, desktop → `/home/Desktop`. `webos.settings` and app storage stay in localStorage for now. | Everything OS-owned to the file system now (async StorageHandle, ADR-003 change); session in localStorage |
| Existing root files | Move into `/home` once, on the first boot with the new layout (auto-rename on clash) | Leave at root; move to `/home/Documents` |
| Restore prompt | **Dialog at boot** (DialogsService, centered) | Toast with Restore action; toast + "always restore" setting |

### Round 4: mechanics

| Question | Decision | Rejected |
|----------|----------|----------|
| Restore API | **`windows.restore(snapshot, create)`**: WindowsService rebuilds windows from the snapshot. SessionService supplies a factory that turns `(app_id, props)` into an `AppInstance` through AppsService (validated, `null` when invalid). | `launch()` window options; launch then setters |
| Shortcut files | `.desktop` files with a zod-validated JSON body `{ app_id, props? }`. `apps.open(path)` handles `.desktop` before association matching and launches the target. | A Shortcut app associated with `.desktop`; freedesktop INI |
| Desktop refresh | A FilesService **revision signal**, bumped on every mutation made through FilesService. DesktopService re-reads `/home/Desktop` when it changes. The first piece of multi-window sync; changes from other tabs aren't covered. | Re-read on focus/visibility; own changes only |
| Hierarchy bootstrap | `FilesService.init()`: create the folders, migrate once, clear `/tmp`. Paths in `files/hierarchy.ts`. | A separate kernel boot step |

**Platform check (Chrome 154, owner's browser):** `FileSystemFileHandle.move()` exists and moves files natively. `FileSystemDirectoryHandle` has no `move()`. Migration moves folders by recreating them and moving each file natively. `move_file` can switch from copy-then-delete to native `move()`.

## Key takeaways

1. A Unix-lite hierarchy in OPFS (`/home`, `/etc`, `/var`, `/tmp`) becomes the OS's storage layout. User files live in `/home`.
2. The desktop is a folder: `/home/Desktop` with `.desktop` shortcuts and real files. Positions go in `.layout.json`. It's permanent user data, not session.
3. The session (open windows) is OS state in `/var/session.json`, owned by a new SessionService, saved reactively, and offered through a dialog at boot.
4. FilesService gets a revision signal, the first step toward multi-window sync.
5. Settings and app storage stay in localStorage for now.

Written up as [ADR-021](../adrs/021-file-system-hierarchy.md), [ADR-022](../adrs/022-desktop-folder.md) and [ADR-023](../adrs/023-session-persistence.md).

## Action items

- [x] ADR-021, ADR-022, ADR-023, roadmap
- [ ] Implement (steps in ADR-023 § Implementation order)

## Next session topics

- Moving settings to `/etc` and app storage to `/var` (async StorageHandle, ADR-003).
- Multi-window sync beyond the revision signal (other tabs, Explorer ↔ Explorer).
- Window `set_title`, so restored windows can show what they hold.
