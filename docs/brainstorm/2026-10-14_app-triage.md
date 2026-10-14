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
