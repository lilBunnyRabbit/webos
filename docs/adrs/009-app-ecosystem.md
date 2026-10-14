# ADR-009: App Ecosystem

**Date:** 2026-02-01
**Status:** Accepted

### Revision 2026-10-14: app triage

The owner triaged every remaining candidate ([brainstorm](../brainstorm/2026-10-14_app-triage.md)). That log is now the live list; this catalogue keeps the original feature ideas.

- **Yes:** Markdown → PDF, Work Hours, Pomodoro, Clock, Time Since, Habit Tracker (not now), Kanban (a personal "life" board), Calendar, Game Hub, Solitaire, Nonogram colour mode and editor, Daily puzzle, Image Editor, Voice Recorder, Screen Recorder, Camera, Soundboard, Color Tools (after chromatics is on npm), Archive / Compression, Diff, and a new **PDF Tools** app (merge, split, sign, client-side).
- **Maybe / later:** Spreadsheet, Chess, Sokoban, Blocks, Video Tools, Video → GIF, Hex Viewer, Font Viewer, Web app wrapper.
- **Dropped:** Series Tracker, Weather, News.
- Quick Notes shipped without AppDataHandle: notes are files in `/home/Notes` (ADR-034). P2P Transfer shipped without a signaling server: the offer and answer travel by QR code (ADR-032).

## Context

WebOS needs a rich app ecosystem to demonstrate platform capabilities and provide genuine utility. The legacy React version planned 15+ apps across categories: games, productivity, media, utilities, and developer tools. This ADR catalogues all planned apps so nothing is forgotten during the Svelte migration.

### Related ADRs

- **ADR-001** (App Manifest) — All apps use `define_app()`
- **ADR-003** (App Context) — Apps access system via context
- **ADR-008** (App Props Validation) — Apps with file input use zod schemas

## Decision

### App Categories & Registry

Apps are organized by category. Each app gets an entry in the auto-discovery system under `/src/lib/apps/user/` or `/src/lib/apps/system/`.

---

### System Apps

Already exist or are planned in other ADRs:

| App | Status | Notes |
|-----|--------|-------|
| Settings | Done | Theme, taskbar, desktop config |
| File Explorer | Done | OPFS browsing, upload/download |
| Kernel Info | Done | Service registry viewer |
| Terminal | ADR-007 | Shell commands, cwd, autocomplete |
| Task Manager | ADR-013 | Background task monitoring |

---

### Games

#### Game Hub
Central game launcher and library browser.
- Browse installed games by category/tag
- Track play time per game
- Recently played section
- Game metadata (description, thumbnail, controls)
- Save game management (scoped OPFS storage per game via AppDataHandle)

#### Nonogram (Priority)
Classic logic puzzle — fill cells based on row/column clues.
- Black & white + color modes
- Built-in puzzle packs (multiple difficulties)
- User-created puzzle editor
- Puzzle validation and hint system
- Save/load progress
- Timer and statistics

#### Other Puzzle Games
Each follows the same pattern: generator, multiple difficulties, save/load, timer, stats.
- **Kakuro** — number grid crossword
- **Maze** — generator and solver with multiple algorithms
- **Word Search (Osmosmerka)** — find words in letter grid
- **Nurikabe** — island logic puzzle
- **Futoshiki** — inequality number puzzle

#### Tic-Tac-Toe (Enhanced)
Port from React + enhancements:
- AI difficulty levels (easy, medium, impossible)
- 2-player local mode
- Game statistics and win/loss tracking
- Undo move

---

### Productivity

#### Quick Notes (quno)
Fast, unorganized note-taking.
- Chronological note list with auto-timestamps
- Markdown support (optional toggle)
- Checkbox / task list support
- Tag system for basic organization
- Search across notes
- Export notes as markdown/text
- Stored in OPFS via AppDataHandle (shipped as `.md` files in `/home/Notes`, ADR-034)

#### Speed Reader
RSVP (Rapid Serial Visual Presentation) reader.
- Adjustable WPM (words per minute)
- Text input: paste, upload file, or pick from OPFS
- Reading progress tracking with bookmarks
- Library management (stored in OPFS)
- Reading statistics (WPM over time, books completed)

#### Markdown-to-PDF Converter
- Live side-by-side preview
- Common markdown features (headers, lists, code blocks with syntax highlighting, tables)
- Adjustable PDF settings (page size, margins, font, line height)
- Template system for consistent formatting
- Header/footer customization (page numbers, dates)
- Table of contents generation
- Export to OPFS or download

#### Work Hours Tracker
- Time in / time out entries with descriptions
- Daily notes section
- Monthly calendar view
- Monthly report generation with PDF export
- Data stored in OPFS via AppDataHandle

---

### Media & Entertainment

#### Series Tracker (dropped 2026-10-14)
TV show tracking with external API.
- Search shows via TMDB API (or TVMaze fallback)
- Track watched episodes per show
- Status: watching / completed / dropped / plan to watch
- Episode countdown to next air date
- Show details (cast, synopsis, ratings)
- Personal ratings and notes
- Data cached in OPFS

#### Media Preview (Port from React)
Already partially exists. Enhancements:
- Image viewer (all common formats)
- Video player with full controls
- Audio player with waveform visualization
- PDF viewer
- Opened from File Explorer via file associations

#### Image Editor (Basic)
- Crop, resize, rotate
- Basic filters (brightness, contrast, saturation, blur)
- Format conversion (PNG, JPG, WebP)
- Canvas API based
- Save back to OPFS

#### Video Tools
- Video trimmer (start/end selection)
- Video merger (concatenate clips)
- Audio extraction from video
- Uses ffmpeg.wasm for processing

#### Gifski Wrapper
- Video-to-GIF conversion via WASM
- Quality and frame rate controls
- Resize options
- Preview before conversion
- Progress tracking via Tasks Service

---

### Utilities

#### Color Tools (Chromatics)
Color utility suite.
- Color picker with HEX, RGB, HSL, HSV inputs
- Palette generator (complementary, analogous, triadic, tetradic)
- Contrast checker (WCAG AA/AAA compliance)
- Color blindness simulator (protanopia, deuteranopia, tritanopia)
- Gradient generator
- Color converter between formats
- EyeDropper API integration for native screen picker
- Save/export palettes to OPFS

#### RNG Tools
Random number generation utilities.
- Random number generator (range, count)
- Dice roller (configurable sides and count)
- Coin flip
- List shuffler
- Random password generator (length, character sets)
- Random name/word picker from list

#### Compression Tools
File compression suite.
- DEFLATE algorithm
- LZ77 compression
- Huffman encoding
- Compress/decompress files from OPFS
- Show compression ratio and stats
- WebAssembly (Rust) implementation for performance
- JavaScript fallback for unsupported browsers
- Benchmark comparison tool (JS vs WASM)

#### P2P File Transfer
Peer-to-peer file sharing.
- WebRTC data channels for transfer
- Generate shareable room codes
- QR code for easy mobile sharing
- Progress tracking via Tasks Service
- Multiple simultaneous transfers
- Requires signaling server (minimal WebSocket server) (shipped without one: QR-code signaling, ADR-032)

#### QR Code Scanner
- Camera-based QR/barcode scanning
- Image file scanning (upload or pick from OPFS)
- Copy result to clipboard
- Open URLs directly

#### Calculator
Basic calculator app. Simple, demonstrates app creation pattern.

#### Profiler (Developer Tool)
Port from React version.
- Toggle-able per-window performance overlay
- Render count and render time tracking
- FPS counter
- System overview (open windows, memory, storage usage)
- Svelte-specific: track `$effect` executions, reactive updates

#### Style Guide
Component showcase and design system reference.
- All UI components with variants
- Color palette display
- Typography scale
- Spacing and layout examples

---

### Ports from static-utils

Individual apps ported from the `static-utils` project:
- **Image Combiner** — merge/combine multiple images
- **PDF Generator** — create PDFs from content
- **Video Trimmer/Cropper** — trim and crop video files
- **Video Merger** — concatenate video files
- **File Download Utility** — wget-like download with progress

---

### Future / Low Priority

- **Text Editor** — full-featured editor with syntax highlighting (tests file ops + persistence)
- **Chat App** — WebRTC/WebSocket based messaging
- ~~**Weather Widget**~~ — dropped 2026-10-14
- ~~**News Reader**~~ — dropped 2026-10-14

---

### AI Suggested

Additional app ideas for consideration. Not committed — pick what interests you.

#### Utilities
- **Pomodoro Timer** — Work/break intervals, session history, daily stats. Exercises notifications service.
- **Unit Converter** — Length, weight, temperature, currency (with API). Small scope, immediately useful.
- **Clipboard Manager** — History of copied items, pinned snippets, search. Uses Clipboard API.
- **Regex Tester** — Input pattern + test strings, highlight matches, explain groups.
- **JSON Viewer/Editor** — Tree view, format/minify, path copying, diff two files. Pairs with File Explorer.
- **Base64/Hash Tool** — Encode/decode base64, generate SHA/MD5 hashes, URL encode/decode.

#### Games
- **Minesweeper** — Classic desktop OS game. Small scope, good difficulty scaling.
- **2048** — Slide tiles, merge numbers. Tiny implementation.
- **Snake** — Canvas-based, leaderboard via AppDataHandle. Tests requestAnimationFrame patterns.
- **Solitaire (Klondike)** — Quintessential desktop game. Drag-and-drop exercises window management patterns.
- **Chess** — Local 2-player or vs simple AI. Larger scope but impressive showcase.

#### Productivity
- **Kanban Board** — Columns with draggable cards, labels, due dates. Tests drag-and-drop and OPFS persistence.
- **Habit Tracker** — Daily check-in grid (GitHub contribution graph style), streaks, stats.
- **Bookmarks Manager** — Save/organize URLs with tags, import browser bookmarks.

#### Fun / Showcase
- **Paint** — MS Paint clone with basic drawing tools. Canvas API showcase, nostalgic.
- **Music Visualizer** — Web Audio API analyser node + canvas. Render frequency/waveform bars.
- **System Monitor Widget** — Live frame timing, memory, storage quota. Desktop widget style.
- **Sticky Notes** — Floating always-on-top mini windows on desktop. Tests window flags differently than a full notes app.

---

## Alternatives Considered

1. **Build all apps before launch** — Rejected. Ship incrementally, prioritize based on what exercises the platform best.
2. **External/plugin apps only** — Rejected for now. Built-in apps ensure quality and demonstrate patterns. Plugin system can come later.

## Consequences

### Positive
- Comprehensive app list ensures nothing from legacy vision is lost
- Categories help prioritize development
- Each app exercises different platform features (OPFS, Tasks, WASM, WebRTC, etc.)
- Game Hub + task-manager integration are showcase pieces for portfolio

### Negative
- Large scope — needs strict prioritization to avoid feature creep
- Some apps depend on services not yet built (Tasks, Shell, etc.)

## Implementation Priority

1. **Port from React first:** Media Preview, Tic-Tac-Toe, Profiler
2. **Simple new apps:** Calculator, Text Editor (test platform)
3. **Game Hub + Nonogram** (flagship game feature)
4. **Quick Notes** (tests OPFS persistence patterns)
5. **Color Tools** (self-contained utility)
6. **Everything else** based on interest and service availability
