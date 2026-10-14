# ADR-035: App Platform for the Second App Wave

**Date:** 2026-10-14
**Status:** Implemented

> **Revision 2026-10-15: `live_file` and `confirm_discard` in core** (owner, [brainstorm](../brainstorm/2026-10-15_code-quality-pass.md))
> - `live_file(path, initial, schema)` moves from Kanban to `$lib/core/contexts/app/live-file.svelte.ts`. Shell code reads and edits an app file through it: it takes the shared `json_file` cell, waits for `ready`, refuses an invalid file with a `ShellError`, and releases the cell after `LINGER_MS` so the save effect lands first. Calendar no longer imports Kanban; Time Since and Game Hub commands use it too.
> - `confirm_discard(win, name)` in `$lib/core/contexts/app` is the one "Discard changes to …?" sheet document apps show before New or Open.

## Context

The [2026-10-14 app triage](../brainstorm/2026-10-14_app-triage.md) picked the next apps: Work Hours, Pomodoro, Clock, Time Since, Kanban, Calendar, Game Hub (with a daily puzzle), Solitaire, Nonogram colour and editor, Image Editor, Recorder, Soundboard, Archive, Diff and Markdown → PDF. They share needs the core doesn't meet:

- **Pausing.** Five apps watch `document.hidden` and `is_minimized` by hand, each differently; Sudoku doesn't, so its timer runs while minimized.
- **App data.** `storage` is localStorage: small, invisible, shared with every site on the origin. There's no place for an app's larger data (ADR-003's AppDataHandle was parked).
- **Background alerts.** Toasts only show inside the page.
- **Printing.** `window.print()` prints the whole OS.
- **Games.** `format_time` is copied into 8 games; each builds its own timer; nothing records play time for a hub.

## Decision

### 1. `WindowHandle.is_visible`

`true` while the window isn't minimized and the tab isn't hidden. `WindowsService.page_hidden` (both implementations) tracks `document.hidden` with one `visibilitychange` listener. Apps derive their loops from it: `const running = $derived(playing && win.is_visible)`.

### 2. App data: `/var/lib/apps/{app-id}/` and `storage.file()`

An app's own data lives in `/var/lib/apps/{app-id}/`, next to OS service state (ADR-021) and out of the user's way. Documents the user names still go in `/home`.

```ts
const board = storage.file("board.json", EMPTY_BOARD, BoardSchema);
board.ready;  // false until the first read
board.value;  // reactive; deep changes save
```

- A reactive JSON-file cell (`json_file(path, initial, schema)` in `$lib/core/contexts/app`), one per path, shared by every window and retained per component like `persisted()`.
- Reads once, then re-reads whenever the folder's revision changes (another window, Text Editor, a delete), unless the text matches the last write.
- Writes go through `LatestWriter` (serialized, newest wins), pretty-printed. Nothing is written before `ready` or while the value equals what was read.
- A missing file gives `initial`; an invalid one gives `initial` and `error`, and the file is kept until the next change overwrites it.
- `json_file` also works outside an app (a widget, Calendar reading Kanban's board, the game kit) with an explicit `release()`.

### 3. `NotifyOptions.system`

`notify(app_id, { system: true, … })` also shows a browser `Notification` while the tab is hidden. Permission is asked on the first such call (`notifications.request_system()` lets an app ask from a button first). Clicking it focuses the tab. Hidden tabs throttle timers, so alerts can be up to about a minute late; apps compute from wall-clock time.

### 4. `print_html(html, { title })`

`$lib/core/utils/print.ts`: writes the HTML into a hidden `sandbox="allow-same-origin allow-modals"` iframe (scripts never run), prints it, removes it after `afterprint`. Only the document prints. "Save as PDF" in the print dialog is the PDF path; no PDF library for now.

### 5. Game kit: `$lib/core/games/`

- `format_time(ms, { tenths? })`: `m:ss`, `h:mm:ss` past an hour.
- `Stopwatch`: a rune class taking `() => boolean` (usually `() => win.is_visible`). `start()`, `pause()`, `reset(ms = 0)`, `elapsed` (ticks while running and visible), `running`. Time while not visible doesn't count.
- `track_play(app_id, visible)`: counts visible time while the component lives and adds it to **`/var/lib/games/plays.json`** (`{ version, games: { [id]: { ms, sessions, last } }, daily: { [date]: { [id]: { ms } } } }`) through `json_file`.
- `record_daily(app_id, date, ms)`: a solved daily puzzle. Daily seeds are `daily_seed(date, app_id)`; games that support it take a `seed` prop.

### Also decided

- Clock and Pomodoro are two apps; Voice, Screen and Camera are one Recorder app.
- Archive uses `CompressionStream` and a hand-written ZIP container with a progress toast. Tasks (ADR-013) stays parked; Archive moves onto it when it's built.
- Diff uses `@codemirror/merge`.
- Calendar reads Work Hours' and Kanban's files, so their schemas are exported from those apps.
- Each app agent proposes shell commands; none ship until the owner approves.

## Alternatives Considered

- **`use_page_visible()` util** instead of a handle getter: apps would still combine it with `is_minimized` and forget.
- **`/home/AppData/{id}`**: clutters the user's home; **`/home/.local`**: Explorer doesn't hide dotfiles.
- **A path helper only**: every app would rewrite load, revision watch and newest-wins save.
- **Apps calling `Notification`** directly: inconsistent permission prompts.
- **pdf-lib / pdf.js now**: deferred until PDF Tools is grilled.
- **Kit without play time**: Game Hub would be a launcher only.
- **TasksService now**: a new service with no other consumer yet.

## Consequences

- `WindowHandle`, `StorageHandle`, `NotifyOptions` and `WindowsService` grow; system docs update with them.
- `/var/lib/apps/` and `/var/lib/games/` are new persistence locations (persistence.md).
- Existing games migrate to the kit; Sudoku stops counting minimized time.
- Calendar couples to two apps' file formats.
