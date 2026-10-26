# ClipboardService

Key `clipboard` · Depends on: `files` · ADR: [ADR-025](../../adrs/025-menus-sheets-clipboard.md) · Source: `src/lib/core/api/services/clipboard/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Copy, cut and paste for files and folders across File Explorer windows and the desktop, plus text to the system clipboard. Files never leave WebOS: the browser clipboard can't carry OPFS entries.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `content` | `FilesClipboard \| null` | `$state`: `{ kind: "files", mode: "copy" \| "cut", paths: string[] }` (absolute paths). In memory only |
| `copy_files` | `(paths: string[]) => void` | Replaces the content. Empty `paths` clears it. Also writes the paths, newline-separated, to the system clipboard (ADR-076) |
| `cut_files` | `(paths: string[]) => void` | Same, in `cut` mode. Callers dim cut entries |
| `is_cut` | `(path: string) => boolean` | Reactive; File Explorer rows and desktop icons use it to dim |
| `clear` | `() => void` | |
| `paste_files` | `(target: string, on_conflict: (name) => Promise<ConflictChoice>) => Promise<string[]>` | `files.copy_paths` or `files.move_paths` with the clipboard's paths and `on_conflict`. Returns the new paths. Clears the clipboard after a cut |
| `copy_text` | `(text: string) => Promise<void>` | `navigator.clipboard.writeText`; rejects if the browser refuses |

`ConflictChoice` = `"replace" | "keep_both" | "skip"`, defined in `files/type.ts` and re-exported here.

## Behaviour & invariants

`paste_files` delegates to [FilesService](files.md) `copy_paths` / `move_paths` (ADR-005 revision), which apply these rules per entry:

1. A folder pasted into itself or a descendant throws `Can't put "x" into itself` (before anything is written).
2. Cut and paste back into the same folder: a no-op, the path is returned unchanged.
3. Copy into the same folder: always keeps both (`x (1).txt`) without asking, because "Replace" would delete the source.
4. Otherwise, if the name exists in the target, `on_conflict(name)` decides: `skip` drops it, `replace` deletes the existing entry (recursively) first, `keep_both` lets the copy or move auto-rename.
5. Files: `files.copy_file` / `files.move_file` (native move). Folders: `files.copy_directory` / `files.move_directory` (recursive). All bump revisions.

The caller shows the conflict question: File Explorer as a window sheet (`ConflictDialog`, `dismissible: false`, Keep both focused), the desktop as a system dialog.

### The system clipboard (ADR-076)

Copy and cut write the paths as text to the system clipboard, fire and forget (a refusal is a `console.warn`), replacing whatever was there, as a real OS does. That text is how a paste in an app or the picker tells the two clipboards apart: text equal to `content.paths.join("\n")` means the WebOS copy is the newest thing copied, anything else means the system clipboard is newer. The logic lives in `core/components/clipboard/` ([files: clipboard view](files.md#clipboard-view-adr-076)); `clear()` leaves the system clipboard alone.

## Lifecycle

No `init` or `destroy`.

## Persistence

None. A reload empties the clipboard, as on a real OS.

## Shell

Contributes `copy` (text, or piped files onto the file clipboard), `paste` and `clip ls` (`clipboard/shell.ts`). `clip ls` lists the clipboard newest first: the system clipboard's item as a `clip` value (`name`, `type`, `size`; text shows its first line) when the browser lets it be read and it isn't WebOS's own paths, then the WebOS copy as `file` values, so `clip ls | open` opens them. Its body imports `core/components/clipboard/paste.ts` on first run. See [shell](shell.md#contributions).

## Known gaps

- Multi-select copies and cuts many paths, but conflicts are asked one name at a time: no "apply to all".
- Pasting doesn't report progress; a large folder copy blocks the paste promise until it's done.
- Errors part-way through a multi-entry paste leave the entries before it pasted.
