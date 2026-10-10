# ADR-021: File System Hierarchy
**Date:** 2026-10-11
**Status:** Accepted

## Context

OPFS has no structure: user files sit at the root and File Explorer opens there. The OS now needs places for its own data (the session, the desktop), and the owner wants a real, Unix-inspired system storage instead of ad-hoc dot-folders. Brainstorm: [2026-10-11 Session persistence](../brainstorm/2026-10-11_session-persistence.md), round 3.

## Decision

### 1. Unix-lite layout

```
/
├ home/          the user's space; File Explorer opens here
│ ├ Desktop/     desktop folder (ADR-022)
│ ├ Documents/
│ └ Downloads/
├ etc/           OS config
├ var/           OS state that changes at runtime (session.json, ADR-023)
└ tmp/           emptied at every boot
```

Single user, so there are no usernames. Paths are constants in `files/hierarchy.ts`:

```ts
export const PATHS = {
  home: "/home",
  desktop: "/home/Desktop",
  documents: "/home/Documents",
  downloads: "/home/Downloads",
  etc: "/etc",
  var: "/var",
  tmp: "/tmp",
} as const;
```

System folders (`/etc`, `/var`, `/tmp`) stay visible in File Explorer but are marked as system.

### 2. Bootstrap in `FilesService.init()`

FilesService owns OPFS, and both DesktopService and SessionService depend on it, so the layout exists before they run:

1. If `/home` doesn't exist, this is the first boot with the hierarchy. Every root entry that isn't one of the system names moves into `/home`, auto-renamed on clash (`available_name`).
2. Create every folder in `PATHS` that's missing (`mkdir -p`).
3. Empty `/tmp`.

### 3. Native moves

Chrome 154 has `FileSystemFileHandle.move()`. `move_file` uses it instead of copy-then-delete. Directory handles have no `move()`, so the migration and future folder moves recreate the folder and move each file natively, recursively.

### 4. Revision signal, per directory

FilesService tracks a reactive revision per directory path. Every mutation it performs (create, write, delete, copy, move, upload, clear) bumps the parent directory's revision. Consumers read `files.revision(path)` inside an effect and re-read that folder when it changes. DesktopService uses it for `/home/Desktop`, and File Explorer can use it later. It only covers changes made through FilesService in this tab. The multi-window sync brainstorm owns other tabs.

```ts
revision(path: string): number;   // reactive; 0 until something under `path` changes
```

## Alternatives Considered

- **FHS with usernames** (`/home/{user}`, `/usr/share`): future-proofing for users that don't exist.
- **`/home` + hidden `/.system/`**: less to build, but not the Unix shape the owner asked for.
- **Leave root files where they are**: no moves, but `/` stays cluttered and Explorer's new start folder doesn't show them.
- **A separate kernel boot step for setup**: keeps FilesService thin, but adds a step to the boot sequence.
- **One global revision counter**: simpler, but every write anywhere (including the session file on every window move) would make the desktop re-read.

## Consequences

### Positive
- The OS has a real place for its data, and users can browse it.
- The desktop and the session can live in the file system.
- Native file moves are faster and atomic.

### Negative
- The first boot moves the user's existing root files into `/home`. It's a one-time, irreversible reorganisation.
- Boot does a little async OPFS work in `FilesService.init()`.
- Settings and app storage still live in localStorage, so OS state is split for now.

## Related
- ADR-005 (files service), ADR-022 (desktop folder), ADR-023 (session persistence)
