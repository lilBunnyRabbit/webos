# App triage: which apps WebOS still wants

**Date:** 2026-10-14
**Participants:** Owner, Claude

## Context

Before more core work, the owner wanted the app list settled, so core work is picked by what the wanted apps need rather than by guesswork. Claude listed 33 candidates on a yes/maybe/no triage page, built from ADR-009, the [2026-10-12 candidates log](2026-10-12_app-candidates.md) and the ROADMAP, plus new ideas. The owner answered with comments. This log records the answers and maps each yes app to the core work it waits on.

## Decisions

### Yes

| App | Group | Owner's note | Waits on |
|-----|-------|--------------|----------|
| Markdown → PDF | Productivity | — | Print/PDF path |
| Work Hours Tracker | Productivity | — | App data rule (G3), Print/PDF path for the monthly report |
| Pomodoro | Productivity | — | Background alerts, window lifecycle |
| Clock | Productivity | — | Background alerts (alarms, timers) |
| Time Since | Productivity | — | App data rule; widget is a natural fit |
| Habit Tracker | Productivity | "not now" | App data rule |
| Kanban | Productivity | "more like a life kanban" | App data rule |
| Calendar | Productivity | — | App data rule |
| Game Hub | Games | — | Game kit, play time state |
| Solitaire (Klondike) | Games | — | Game kit |
| Nonogram colour mode | Games | — | Nothing |
| Nonogram editor + `.nonogram` files | Games | — | Nothing (association decision) |
| Daily puzzle | Games | — | Game kit (seeded generators, stats) |
| Image Editor | Media | — | `write_image` in core |
| Voice Recorder | Media | — | Media capture |
| Screen Recorder | Media | — | Media capture (desktop only: no `getDisplayMedia` on phones) |
| Camera | Media | — | Media capture |
| Soundboard | Media | — | Nothing (user-loaded sounds in OPFS, no bundled assets) |
| Color Tools | Utilities | "wait: tightly bound to chromatics, which needs to be on npm first" | Chromatics published as a package |
| Archive / Compression | Utilities | — | Tasks + Workers (G4); it's the first consumer |
| Diff | Utilities | — | Diff algorithm or `@codemirror/merge` (dependency call) |
| PDF Tools (new) | Utilities | "focus also on pdf editing tools: merging, signing, etc., all client-side, like iLovePDF" | PDF library decision, research below |
| Remove the example app | Cleanup | Later: "we can leave the example app for now" | Browser tests in `ui`, `session` and `router` launch `example`: they need another fixture app first |

### Maybe (later)

Spreadsheet, Chess, Sokoban, Blocks, Video Tools, Video → GIF: owner said "later". Hex Viewer, Font Viewer, Web app wrapper (G8): no comment.

### No

Series Tracker, Weather / News. Both need external APIs and keys; Series Tracker is already a live PWA.

### Changes against Claude's leans

- Pomodoro **and** Clock are both yes. Claude leaned toward one Clock app with a Pomodoro tab. Open: two apps, or one.
- Time Since, Kanban, Calendar, Game Hub, Daily puzzle, Nonogram colour, Image Editor, Voice/Screen Recorder, Diff moved from maybe to yes.
- Camera and Soundboard moved from no to yes.
- Color Tools moved from yes to "yes, later": blocked on chromatics as an npm package.
- Kanban is a personal "life" board, not a document per `.kanban` file as the 2026-10-12 log assumed. That changes where its data lives.

## Core work the yes apps need

Grouped by what each unlocks. Order is the owner's call.

| Core work | Unlocks | Today |
|-----------|---------|-------|
| **Game kit** (shared timer, `format_time`, stats storage, seeded RNG) | Game Hub, Solitaire, Daily puzzle, every existing puzzle | `format_time` copied in 8 games (twice in Minesweeper); each game rolls its own timer and stats |
| **Window lifecycle** (pause on minimize or hidden tab) | Pomodoro, Clock, games, recorders | Only Nonogram, Snake, Speed Reader, Music Visualizer and P2P pause. Sudoku's timer runs while minimized (bug) |
| **App data rule (G3)** | Work Hours, Time Since, Habit, Kanban, Calendar, Pomodoro stats | No rule: Quick Notes uses `/home/Notes`, games use `storage`. Calendar raises cross-app data (Work Hours entries, Kanban due dates) |
| **Background alerts** (Notification API and/or `request_attention` / `set_badge`) | Pomodoro, Clock, Time Since | Toasts only, invisible when the tab is in the background |
| **Print/PDF path** | Markdown → PDF, Work Hours report, PDF Tools | `window.print()` prints the whole OS |
| **PDF library** | PDF Tools, maybe Markdown → PDF | None |
| **Tasks + Workers (G4)** | Archive, later Video Tools | Parked until its first consumer: Archive is it |
| **Media capture** (mic, camera, screen; MediaRecorder; permission UX) | Voice, Screen, Camera | QR Reader uses the camera on its own |
| **Kit gaps** | Image Editor (colour well, anchored popover), Diff | Listed in the 2026-10-12 log, still open |

### PDF Tools: client-side research

Nothing decided; this is the starting point for its grill.

| Feature | Client-side path | Hard part |
|---------|------------------|-----------|
| Merge, split, reorder, rotate, delete pages | pdf-lib (copy pages between documents) | Nothing |
| Images → PDF | pdf-lib (embed PNG/JPEG) | Other formats go through canvas first |
| PDF → images, page thumbnails | pdf.js (`pdfjs-dist`) renders to canvas | The current PDF Viewer is the browser's built-in viewer in an iframe: no page access |
| Visual signature (drawn or typed, placed on a page) | Canvas pad + pdf-lib stamps the image | Placing it needs a rendered page (pdf.js) |
| Fill forms | pdf-lib (AcroForm fields) | XFA forms aren't supported |
| Watermark, page numbers | pdf-lib (draw text/images) | Fonts must be embedded |
| Encrypt / unlock | Not in pdf-lib; a maintained fork or qpdf as wasm | Needs checking |
| Compress | Re-encoding images inside the PDF; real compression is qpdf/Ghostscript as wasm (Ghostscript is AGPL) | Heavy wasm, worker territory (G4) |
| Cryptographic signature (PAdES) | WebCrypto plus manual byte-range signing | Certificates; out of scope for v1 |
| OCR | tesseract.js | Large download, worker |
| Edit existing text, true redaction | Not realistic client-side without a heavy engine (MuPDF wasm, AGPL) | Skip |

Likely shape: pdf-lib for writing, pdf.js for rendering. Both are new dependencies, so both are the owner's call. pdf-lib's last release is from 2021; whether to use it or a maintained fork needs checking.

## Key takeaways

- 23 yes (one later), 9 maybe, 2 no. The yes list leans heavily on four core pieces: game kit, app data rule, background alerts and a PDF story.
- PDF is now a theme of its own: Markdown → PDF, the Work Hours report and PDF Tools should share one decision.
- Color Tools has an external blocker: chromatics on npm.

## Action items

- [x] Triage recorded; ADR-009 and ROADMAP updated
- [ ] Owner: pick the order of the core work above
- [ ] Grill: Pomodoro and Clock, one app or two
- [ ] Grill: PDF library (pdf-lib / fork, pdf.js) and the Print/PDF path
- [ ] Remove the example app: left for now by the owner; when it goes, the `ui`, `session` and `router` browser tests move to another fixture app first

## Next session topics

- Order of the core work
- PDF: libraries, print path, PDF Tools scope
- App data rule (G3), including Calendar's cross-app data

## Session 2: core for the yes apps (same day)

The owner asked for the core work first, then one agent per app, each with a desktop and mobile visual pass. Decided with the owner (AskUserQuestion, three rounds):

| Topic | Decision | Rejected |
|-------|----------|----------|
| Pause when not seen | **`WindowHandle.is_visible`**: false when minimized or the tab is hidden. WindowsService tracks the tab's hidden state once. Apps that hand-roll it migrate; Sudoku's timer stops running while minimized | A `use_page_visible()` util; leaving it per app |
| App data location (G3) | **`/var/lib/apps/{app-id}/`**, beside OS service state, out of the user's way. Owner asked for something Windows-AppData-like | `/home/AppData/{id}` (clutters home); `/home/.local/{id}` (Explorer doesn't hide dotfiles) |
| App data API | **`storage.file(name, initial, schema)`**: a reactive JSON-file cell like `persisted()`, shared by the app's windows, reloads when the folder's revision changes, saved newest-wins | A path helper with each app syncing by hand |
| Background alerts | **`NotifyOptions.system: true`**: also a browser Notification while the tab is hidden, permission asked on first use | Apps calling `Notification` themselves; toasts only |
| PDF | **`print_html(html)`** in core prints a hidden iframe, so only the document prints. PDF Tools waits for a dependency decision | pdf-lib + pdf.js now; pdf-lib for everything |
| Game kit | **`$lib/core/games/`**: `format_time`, a `Stopwatch` that pauses on `!is_visible`, play-time records in **`/var/lib/games/plays.json`**. Existing games migrate | Kit without play time; fixing only Sudoku |
| Archive | **Native `CompressionStream`, hand-written ZIP**, a progress toast. Tasks stays parked; roadmap notes Archive needs Tasks later | Building TasksService now |
| Clock / Pomodoro | **Two apps** | Clock with a Pomodoro tab |
| Recorders | **One Recorder app**, sources Mic / Screen / Camera | Three apps |
| Shell | **Agents propose** commands in their report; nothing ships until the owner approves | A fixed small set; launch only |
| Diff | **`@codemirror/merge`** (approved dependency) | Own Myers diff |
| Image Editor | **New editor**; Crop, Split and the other tools stay | Absorbing Crop and Split |
| Daily puzzle | **A Today tab in Game Hub**: seed from the date, games take a `seed` prop, streaks | A separate app |
| Calendar | **Reads Work Hours and Kanban files** besides its own events | Standalone v1 |
| Soundboard | Copies sounds into its own app folder | `/home/Sounds` |

Recorded as [ADR-035](../adrs/035-app-platform-wave-2.md).

Consequence of the Calendar pick: Work Hours' and Kanban's file formats become a contract. Calendar is built after both merge and imports their schemas.

## Wave 2 results

16 agents in worktrees, one per app plus a sweep of the existing games, each with a desktop and mobile visual pass in both themes. All merged on 2026-10-14; `bun run check` 0 errors. Every worktree started behind master and fast-forwarded itself first.

**Core bug found by two agents (Work Hours, Clock):** `json_file` re-read the folder while its own write was still on the way, so a sibling file's write, or the folder being created by the first write, reverted the change. Fixed in core: a re-read waits for `LatestWriter.idle()`. Clock and Work Hours still carry their local workarounds; they can drop them.

**Second core bug (Calendar agent):** a shared cell created during a component's init was linked into that component's effect tree. A change landing during its outro (a closing window) left the cell's root dirty, and it never saved or re-read again, for every holder. Fixed with `detached_root` (created from a microtask), also applied to `persisted()` cells, the Quick Notes and Kanban badges and Pomodoro's timer. Reproduced in a browser test with a component that plays an outro.

### Shell commands proposed (owner to approve; none built)

| App | Proposal |
|-----|----------|
| Game Hub | `games` (columns, click launches), `games daily`, `games stats` |
| Soundboard | `sb`, `sb ls` (pad values, open plays), `sb play <pad>` (needs a headless player), `sb stop`, `sb add <path…>` |
| Pomodoro | `pomo`, `pomo start [task…]`, `pomo pause\|skip\|reset`, `pomo status`, `pomo stats`, `pomo pin` |
| Time Since | `since` (counter values), `since new <name…>`, `since reset\|stop\|start\|rm\|pin <counter>`, a `counter` completer |
| Diff | `diff <left> <right>`, `diff --stat`, "Compare with…" on file values |
| Image Editor | `image edit`, `image convert --format --quality`, `image resize`, `image rotate` |
| Work Hours | `wh in [desc]`, `wh out`, `wh status`, `wh ls [month]`, `wh add`, `wh report [month]`, `wh target` (needs month/day props) |
| Markdown to PDF | `md2pdf <path> [--template] [--size] [--landscape] [--toc]` |
| Solitaire | `solitaire [--draw 1\|3]`, `solitaire daily [day]`, `solitaire stats` |
| Clock | `clock [tab]`, `alarm ls\|add\|on\|off\|rm`, `timer <dur> [label]`, `timer ls\|stop`, `clock pin`, `time [zone]` (zone completer) |
| Nonogram | `nonogram new [--size] [--colour]`, `nonogram daily`, `nonogram edit [path]`, `nonogram check <path>` |
| Kanban | `kanban [card]`, `kanban ls [-b] [--due]` (card values), `kanban add <title> [-c] [-d]`, `kanban mv\|done\|archive`, a `card` completer |
| Recorder | `rec list`, `rec start [--source]` (needs a click; maybe only a `source` prop) |
| Calendar | `cal [day]` (event values), `cal add <title> --day [--at] [--until] [--repeat] [--remind]`, `cal agenda [--days N]`, `cal open [date]` |
| Archive | `zip <paths…> [--to] [--store]`, `unzip <path> [--to]`, `zip list <path>`; Explorer "Compress" and "Extract here" |

### Choices agents made, for review

- Pomodoro keeps its settings in `/var/lib/apps/pomodoro/timer.json` (its widget has no app context) and runs one module-level timer for all windows and the widget.
- Clock and Pomodoro only fire while a window or widget is alive; Clock's widget hosts alarm checks.
- Daily games: "New puzzle" leaves daily mode (Minesweeper replays the daily); daily solves also count in medium stats; Minesweeper's daily board starts opened in the middle.
- Kanban takes `{ board, card }` props (for Calendar); Calendar takes `{ view, day }`.
- Calendar: editing one occurrence edits the series; monthly repeats on the 29th–31st land on the month's last day; all-day reminders count from 09:00.
- Markdown to PDF always prints in Brand Light; Work Hours' report uses plain greys.
- Soundboard keeps playing when hidden; Archive keeps working after its window closes.
- Diff and Markdown to PDF import Text Editor's CodeMirror theme and language loader: the first app-to-app import.
- Pure `.ts` files must import `$lib/core/games/time`, not the `$lib/core/games` barrel (it pulls in the kernel and breaks Node tests).

### Kit and core gaps reported

Colour swatch picker (Soundboard, Nonogram), stat tile (Game Hub), tree list (Archive), `Segmented` disabled / icon-only / controlled modes, `EmptyState` actions wrapping, `format_date` without the year, `NotificationType.SUCCESS`, a shared ticking clock (Time Since, Clock, Pomodoro), core `write_image(path, canvas, { format, quality })` (Paint, Image Editor), `FilesService.ensure_directory(path)`, `print_html` waiting for fonts, a shared CodeMirror module.

### Not verified

- Recorder's real microphone: the agent's sandbox blocked macOS audio, so the mic was simulated.
- MediaRecorder WebM has no duration, so Media Preview shows no length for recordings.

## Game Hub as a default widget (owner, after the push)

The owner pictured Game Hub as a widget, on by default. Decided: seed the widget and keep the app. The widget became a mini launcher (streak, today's puzzles as icon chips, every game as a tile, 4×4; reworked the same day to 4×2: at most three puzzles of the day beside a stats panel (streak, solved today, play time) with an Open hub button). `DEFAULT_WIDGETS` in the desktop service places it on first boot and once on existing desktops, recorded in `/var/lib/desktop/additions.json` so removing it sticks. Rejected: widget only (mobile would lose Game Hub, widgets are desktop only); new devices only.

## Owner's answers to the wave 2 questions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Proposed shell commands | All approved |
| 2 | `sb play` with no window | Yes: a headless player |
| 3 | Shared CodeMirror module | Move into core |
| 4 | Core `write_image` | Yes |
| 5 | Shared ticking clock | Yes, in core |
| 6 | Kit gaps (swatch picker, stat tile, tree list, `Segmented` modes, `format_date` without year, `NotificationType.SUCCESS`) | All |
| 7 | Background scheduler | Roadmap |
| 8 | Archive cancelled extract | Warn and offer to discard, which cleans up the partial files |
| 9 | Soundboard plays when hidden | Fine |
| 10 | Pomodoro settings in its data file | Yes |
| 11 | Kanban `{ board, card }`, Calendar `{ view, day }` props | Yes |
| 12 | Daily puzzle choices | Fine |
| 13 | Calendar choices | Fine for now |
| 14 | Print styling (Brand Light, plain greys) | Good |
| 15 | Explorer Compress / Extract here | Yes |
| 16 | PDF Tools dependencies | Open: asked whether they're needed |
| 17 | Backup system | Roadmap brainstorm (already listed) |
| 18 | Recorder real mic | Probably works |

Also added to the roadmap: Wordle and its variants.

## PDF Tools (owner, 2026-10-15)

- Dependencies approved: `pdf-lib` (write/edit) and `pdfjs-dist` (render pages), lazy-loaded in the app only.
- One app with sections (Merge, Organize, Split, Sign, Images to PDF, Export images, Signatures) and launch props that open a file straight in a section: `{ section, path, paths }`. `tools` for `.pdf`; PDF Viewer keeps owning the type.
- Signing needs a signature generator: like Paint, but it produces a single-colour SVG (strokes become one filled outline path), saved to `/home/Signatures/` and stamped into PDFs as a vector with `drawSvgPath`. No cryptographic signing.
- Search: every query word must match, and long words forgive one typo (owner picked this over keywords only).
- Soundboard: two modes, Restart (default, a pressed pad starts over) and Overlap (today's stacking).
