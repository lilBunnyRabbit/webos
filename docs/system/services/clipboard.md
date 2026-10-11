# ClipboardService

Key `clipboard` · Depends on: `files` · ADR: [ADR-025](../../adrs/025-menus-sheets-clipboard.md) · Source: `src/lib/core/api/services/clipboard/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Copy, cut and paste for files and folders across File Explorer windows and the desktop, plus text to the system clipboard. Files never leave WebOS: the browser clipboard can't carry OPFS entries.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `content` | `FilesClipboard \| null` | `$state`: `{ kind: "files", mode: "copy" \| "cut", paths: string[] }` (absolute paths). In memory only |
| `copy_files` | `(paths: string[]) => void` | Replaces the content. Empty `paths` clears it |
| `cut_files` | `(paths: string[]) => void` | Same, in `cut` mode. Callers dim cut entries |
| `is_cut` | `(path: string) => boolean` | Reactive; File Explorer rows and desktop icons use it to dim |
| `clear` | `() => void` | |
| `paste_files` | `(target: string, on_conflict: (name) => Promise<ConflictChoice>) => Promise<string[]>` | Copies or moves each entry into the folder at `target`. Returns the new paths. Clears the clipboard after a cut |
| `copy_text` | `(text: string) => Promise<void>` | `navigator.clipboard.writeText`; rejects if the browser refuses |

`ConflictChoice` = `"replace" | "keep_both" | "skip"`.

## Behaviour & invariants

`paste_files`, per entry:

1. A folder pasted into itself or a descendant throws `Can't paste "x" into itself` (before anything is written).
2. Cut and paste back into the same folder: a no-op, the path is returned unchanged.
3. Copy into the same folder: always keeps both (`x (1).txt`) without asking, because "Replace" would delete the source.
4. Otherwise, if the name exists in the target, `on_conflict(name)` decides: `skip` drops it, `replace` deletes the existing entry (recursively) first, `keep_both` lets the copy or move auto-rename.
5. Files: `files.copy_file` / `files.move_file` (native move). Folders: `files.copy_directory` / `files.move_directory` (recursive). All bump revisions.

The caller shows the conflict question: File Explorer as a window sheet (`ConflictDialog`, `dismissible: false`, Keep both focused), the desktop as a system dialog.

## Lifecycle

No `init` or `destroy`.

## Persistence

None. A reload empties the clipboard, as on a real OS.

## Known gaps

- Single entries only: there's no multi-select yet, so no "apply to all" for conflicts.
- Pasting doesn't report progress; a large folder copy blocks the paste promise until it's done.
- Errors part-way through a multi-entry paste leave the entries before it pasted.
