# App candidates: what to build, when, and what to drop

**Date:** 2026-10-12
**Participants:** Owner, Claude

## Context

The owner wants to pick a batch of apps and hand each one to its own agent. This report starts from three sources: `~/Downloads/webos-candidates.md` (a scan of the lilBunnyRabbit GitHub repos), ADR-009 (the app catalogue) and the ROADMAP's P3 section. For each app it records what the app is, whether it makes sense in WebOS, which core feature it waits on, and its limits.

**The candidates file is stale.** It describes WebOS as "React 19 + TanStack Query + zustand + Radix". WebOS is Svelte 5. So every React repo is a rewrite, not a "port directly". It also lists the static-utils tools as candidates, but all seven already shipped (2026-10-11).

**What WebOS already gives an app, with no new core work:**
- a window and the UI kit
- `storage` (localStorage scoped to the app, with zod)
- the full FilesService (OPFS), and `pick_file` / `pick_save` / `pick_directory` / `confirm` / `prompt` sheets
- notifications, including progress toasts
- `associations` and `tools`, so files open in the app
- `on_back` on mobile

## Core gates

These are the "build X first" features. Each one unlocks a group of apps.

| # | Gate | State | Unlocks | Without it |
|---|------|-------|---------|------------|
| G1 | **App tags + search update** (manifest field) | Not built. `categories` exists (`"system" \| "user" \| custom-*`), but only the Kernel inspector reads it. The start menu is one flat A–Z grid. Search covers name, id and keywords only. | Game Hub, a grouped start menu and drawer, and every new app's tag | New apps ship untagged and need a second pass |
| G2 | **Close guard** (unsaved changes) | Not built. Brainstorm 2026-10-11 lists it as next topic. | Text Editor, Image Editor, Paint, Notes editing, Markdown→PDF | Closing a window drops work silently. The workaround is autosave. |
| G3 | **App data location** (AppDataHandle, parked) | `storage` covers small JSON. Documents can be real files in `/home`. | Game saves bigger than localStorage, a Speed Reader library, Work Hours history | Most apps don't need it. One decision covers all: "documents are files in `/home/...`, settings and stats go in `storage`". |
| G4 | **Tasks + Workers** (ADR-013, parked until its first consumer) | Parked | Compression/ZIP, Video Tools, GIF encoder | Long CPU work blocks the UI. One of these apps *is* the first consumer, so that app isn't isolated. |
| G5 | **Dependency approvals** | Owner only | Markdown parser (Markdown Viewer, Notes, MD→PDF), CodeMirror (Text Editor, JSON), culori (Color Tools), mediabunny (Speed Reader export, Video Tools), ffmpeg.wasm | The app ships its no-dependency subset |
| G6 | **Window kinds** (always-on-top, frameless, widgets) | No concept exists | Sticky Notes, desktop widgets (weather, monitor) | Not buildable |
| G7 | **Shell** (ADR-007, on hold) | On hold | Terminal | — |
| G8 | **Web app wrapper** (new idea, not in any ADR) | — | Your live sites (series-tracker, logo-proof, chromatics, petrace, time-since) as windows without a rewrite | See the note under Skip |

**G8 note:** every `lilbunnyrabbit.github.io/*` project page shares **one origin** with WebOS. If one of those sites is iframed with same-origin access, it gets read and write access to WebOS's OPFS and localStorage. If it's sandboxed without `allow-same-origin`, it loses its own storage. This is cheap to build, but it's a real security and architecture question, not a free win.

## Build now (no gate, no dependency)

Each one sits in its own folder, uses only `storage` and OPFS, and is safe for a parallel agent.

| App | Source | What | Why add | Limitation |
|-----|--------|------|---------|------------|
| **Calculator** | ROADMAP system app | Basic and keyboard-driven, with history | Expected desktop app. Small release between blocks. | None |
| **Minesweeper** | ADR-009 AI list | Classic, 3 difficulties, best times | The most "desktop OS" game there is. Small. | None |
| **2048** | ADR-009 AI list | Slide and merge | Tiny. Exercises keyboard and swipe on mobile. | Low novelty |
| **Snake** | ADR-009 AI list | Canvas, high score | Exercises the rAF loop under window focus and pause | The loop must pause on minimize and blur. A hidden tab is throttled anyway. |
| **Solitaire (Klondike)** | ADR-009 AI list | Drag cards | Showcase. Exercises pointer drag inside a window. | Medium size. Use pointer drag, not native DnD (native DnD carries file paths). |
| **Nonogram** | ADR-009 "Priority" | B/W puzzles, packs, hints, timer | Flagged as the flagship game | v1 without the editor and colour mode. Puzzle packs are hand data. An editor plus a `.nonogram` file association is a good later OS fit. |
| **Maze** | maze-generator (2020, React) + ADR-009 | Generate and solve, several algorithms, animated | Learning value (algorithms), visual | The old repo is tiny. Rewrite from scratch. |
| **RNG Tools** | rng repo (empty template) + ADR-009 | Dice, coin, range, shuffle, password | Trivial, useful | Nothing to port: the repo has no code |
| **Time Since** | time-since (Svelte, 2026) | Count-up timers with reset history | Small, recent and already Svelte 5, so the logic carries over almost directly | It also lives as its own PWA. Duplicating data across both is fine. |
| **Pomodoro** | ADR-009 AI list | Work and break timer, daily stats | Exercises notifications and the tray badge | A hidden tab throttles timers. Use wall-clock time, not tick counting. Alerts appear only while WebOS is open. |
| **Dev Tools** (Base64, hashes, URL encode, regex tester, UUID) | ADR-009 AI list | One app with tabs | Small, real daily use, `crypto.subtle` | Keep it one app, not five |
| **Unit Converter** | ADR-009 AI list | Length, mass, temperature, and so on | Tiny | No currency: that needs an API |
| **Habit Tracker** | ADR-009 AI list | Contribution-graph check-ins, streaks | Small, data in `storage` | Overlaps Time Since a little |
| **Kanban** | ADR-009 AI list | Boards, cards, drag | Exercises drag within a window | One board per file (`.kanban` JSON in `/home`), so it's a document app. That leans on G2. |
| **Work Hours** | work-hours (React, 2023) | Time in and out, monthly view | Owner's own tool | Rewrite. The PDF report needs G5 or `window.print()`. |
| **Speed Reader** | speed-reader (React, 3.5k lines) + ADR-009 | RSVP reader. Opens `.txt` and `.md` via `tools`. | Owner's live project. Good use of file associations. | Rewrite from React. Video export needs mediabunny (G5), so v1 is reading only. |
| **Music Visualizer** | ADR-009 AI list | Web Audio analyser on an audio file | Showcase, no dependency, `tools: ["audio/*"]` | Overlaps Media Preview's audio player |
| **Paint** | ADR-009 AI list | Brush, shapes, fill, save PNG via `pick_save` | Nostalgic canvas showcase | Unsaved work is lost on close without G2 |

## Build after a gate

| App | Gate | What | Why / limitation |
|-----|------|------|------------------|
| **Game Hub** | G1 | A launcher filtered to the games tag, with play time and recents | With tags it's mostly a view. Play time needs a record of window open and close per app. That's new state, so it's a decision. |
| **Text Editor** | G2, G5 (optional CodeMirror) | Edit and save text files | The ROADMAP says "Text Editor first". It decides **viewer vs editor**: does it replace Text Viewer, or sit in `tools`? Both claim `text/*`, and that's a design call. A `<textarea>` v1 needs no dependency. |
| **Markdown Viewer** | G5 (parser) | Rendered `.md` | `.md` already goes to Text Viewer. The more specific `.md` match would win the default. The parser choice is the real decision. |
| **Quick Notes** | G3, G5 | Chronological notes, tags, search | The name "quno" now means your Go CLI, so this needs a new name. Notes as `.md` files in `/home/Notes` is the OS-native answer. |
| **Markdown → PDF** | Markdown Viewer, G5 | Preview, then print to PDF | `window.print()` with print CSS avoids a PDF dependency |
| **Image Editor** | G2 | Resize, rotate, filters (canvas `filter`) | Overlaps Image Crop. Could merge the image tools instead. |
| **Color Tools** | G5 (culori) | Picker (EyeDropper API), contrast, palettes, colour blindness | Chromatics is 77k lines of SvelteKit and too big to port. Build small and reuse the chromatics core logic by copying it. |
| **Compression / ZIP** | G4 | Zip or unzip folders, plus an "educational" DEFLATE/Huffman view | `CompressionStream` is native, so no dependency. This is the natural **first Tasks consumer** (parked brainstorm). Not isolated: it builds the service. |
| **Video Tools** | G4, G5 | Trim, merge, extract audio | **ffmpeg.wasm multithread needs COOP/COEP headers, and GitHub Pages can't set them.** WebCodecs plus mediabunny (already in speed-reader) avoids that. |
| **GIF encoder** | G4, G5 | Video or frames to GIF | web-gif's wasm module is from 2023. The `ImageDecoder` route only decodes. |
| **Petrace** | — (big port) | Camera tracing overlay | Makes sense on the **mobile shell** only. A desktop webcam over paper is pointless. Porting 14k lines is heavy. G8 would be the cheap path. |
| **Sticky Notes** | G6 | Always-on-top mini windows | Needs a window flag that doesn't exist |
| **Chess** | — (size) | Local play and simple AI | Big. Later showcase. |
| **Kakuro / Nurikabe / Futoshiki / Word Search** | — (size) | Logic puzzles | Generating puzzles with a unique solution is the hard part. Do them after Nonogram proves the puzzle-app shape. |
| **Terminal** | G7 | — | On hold by owner |

## Skip

| Candidate | Why not |
|-----------|---------|
| series-tracker | 27k lines, live PWA, TMDB key. A rewrite duplicates a working app. G8 only. |
| logo-proof | 10k lines vanilla, live site, niche. G8 only. |
| aurora | Personal story site, not an app |
| chromatics (full) | Too big. See Color Tools. |
| jsbook | CRA + Monaco + TensorFlow.js, heavy, 2022 |
| lexinotes | Lexical dependency, 2022. Quick Notes covers it. |
| lilutils, lilColor, lilTheme, react-playground | Old or superseded. Mine for parts only. |
| lilBot-soundboard | Fun, but the sound assets bloat the PWA precache. Maybe as user-loaded sounds from OPFS later. |
| e-loterija, discord-webhook-generator, origami-maker, three.js-testing, advent-of-code | Toys or empty. No OS value. |
| P2P File Transfer, Chat | Need a signaling server, and the rule is no backend. Manual SDP exchange by QR is possible but clunky: an experiment, not an app. |
| Weather, News | External APIs and keys, and widgets don't exist (G6) |
| Clipboard Manager | The browser can't read system clipboard history. It could only show WebOS's own. |
| Bookmarks Manager | There's no API to import browser bookmarks. Low value. |
| System Monitor widget | Activity Monitor covers it |
| agtc, quno CLI, chrome-safe-inset, Rust/Electron repos, backend apps | Native or server-bound (the candidates file agrees) |
| **Packages:** event-emitter, service-observer, statefulia, lilstate, optional | Runes already cover observing and stores. The owner rejected an event bus (WindowHandle has no `on()`). `utils` is already a dependency, and `task-manager` waits on G4. |
| `example` app | Scaffold leftover in the start menu. Delete it, or hide it behind dev mode. |

## Is it isolated work?

**Mostly yes, by construction.** An app is one folder (`src/lib/apps/user/{id}/`), and glob discovery registers it, so there's no shared registry edit. User apps are excluded from `docs/system`.

These shared touchpoints collide if agents edit them in parallel:

| Touchpoint | Rule for agents |
|------------|-----------------|
| `changelog.ts` and `package.json` version | **Agents don't touch them.** One release commit after merge. |
| `docs/ROADMAP.md` | Agents don't touch it. I tick it at merge. |
| `package.json` dependencies and `bun.lock` | No new dependencies. Anything that needs G5 waits. |
| UI kit (`$lib/core/components/ui`) | Read-only. If an app needs a new kit part, the agent reports it instead of adding it (two apps adding one = conflict, plus a design-docs duty). |
| `associations` | New apps use `tools`, never `associations`, unless decided. Two apps claiming one type change the default for everyone. |
| Tags (G1) | Land G1 **before** the batch so each agent sets its tag. Otherwise every app gets a second commit. |
| System apps (Calculator) | Also need a `docs/system` page and an index line in `docs/system/README.md`. The index line merges trivially. |
| Browser verification | There's one Chrome tab, so agents can't share it. Agents verify with `bun run check` and unit tests for pure logic (game rules, generators). I run the browser pass after merge. |

**Mechanics:** one agent per app with `isolation: "worktree"` (its own branch), on Opus, with the decision-gate section in the prompt. I merge one at a time, run `bun run check` and `bun run test`, then write one release commit with the changelog.

**Not isolated:** Game Hub (needs G1, maybe play-time state), Compression (builds Tasks), Text Editor and Markdown Viewer (Text Viewer defaults), anything behind G2, G5 or G6.

## Decisions

### Tags and search (G1)

Today: `categories: ("system" | "user" | custom-*)[]`, read only by the Kernel inspector's count. The start menu and drawer are one A–Z grid; `search_apps` is an unranked substring match on name, id and keywords.

| Question | Decision | Rejected |
|----------|----------|----------|
| Tag shape | **One `category` per app** from a closed const object (Productivity, Media, Utilities, Developer, Games). **`system` is derived from the folder** at discovery (`./system/*`), not declared. `categories` is removed | A: closed multi `categories` with "system" as a value (an app shows in two sections); C: free `tags: string[]` (typos split groups, nothing to group by) |
| Launcher | **Sections when the query is empty** (Productivity … Games, then System), one flat ranked list while typing. Same in the mobile drawer | Filter chips; both |
| Search | **Ranked substring**: name prefix, then a word in the name starting with the query, then name contains, then id/keywords, then description/category. Ties A–Z. Pure function, unit-tested | Subsequence fuzzy (noisy on short queries); unranked with more fields |

Against the pick, recorded: one kind per app means Settings is "System", not also "Utilities". A system app still declares a `category`; it only feeds search.

- [x] Tags and search shape (G1)
- [ ] Which apps go into batch 1: owner

### Batch 1 (owner's pick)

Calculator (system), Minesweeper, 2048, Snake, Maze, RNG Tools, Dev Tools, Unit Converter, Speed Reader (reading only, no video export), Music Visualizer, Paint (no close guard yet). One agent per app in its own worktree, under the rules in "Is it isolated work?".

### Shared origin

Every `lilbunnyrabbit.github.io/*` site is one origin. OPFS, localStorage, IndexedDB, Cache Storage and quota are per origin, never per path, so moving data to OPFS doesn't isolate WebOS. Any sibling app can read it, `localStorage.clear()` it or share its eviction.

| Option | Verdict |
|--------|---------|
| Custom subdomain (CNAME) | Rejected for now. Real isolation, but needs a domain and a one-time data move from the old origin |
| Separate GitHub org `<name>.github.io` | Rejected for now. Same move, new name |
| Namespace inside the origin (`/webos/` OPFS root, key prefix) | Rejected: prevents collisions, not isolation |
| **Leave it** | **Chosen.** Every site on the origin is the owner's own code. Revisit if something actually collides, or before G8 (iframing sibling sites) |

### Batch 1 result

All 11 merged on 2026-10-12, each touching only its own folder (Calculator also its system docs page). `bun run check` 0 errors, tests green. None has been run in a browser yet.

Open questions the agents raised, for the owner:
- In-app keys: Paint registers with ShortcutsService per window (shows in Mod+/); Snake, 2048, Maze, Calculator, Speed Reader handle keys on their root element like Tic-Tac-Toe. Pick one convention.
- Shared vs per-window app state: `persisted()` syncs every window (RNG Tools, Paint settings); `get`/`set` seeds new windows only (Dev Tools, Unit Converter). 2048's saved game is last-write-wins across windows.
- Kit gaps worked around locally: Slider (4 apps use bare range inputs), Textarea (Dev Tools, RNG Tools, Speed Reader), colour well, anchored popover (Paint), `Input` invalid state, `Select` option groups, `Segmented` change callback.
- Core gaps: close guard and `set_title` (Paint), `write_image(path, canvas)` in `utils/image.ts` (Paint copied the format map), a neutral home for `has_files`/`parent_folder`.
- Music Visualizer uses the browser's fullscreen on its canvas; OS-level fullscreen would be a WindowHandle change.
- Paint: white default canvas, black/white swatches treated as content not chrome; undo keeps full snapshots (50 / 256 MB).
- Dev Tools regex runs on the main thread: catastrophic backtracking freezes the tab (worker + timeout fixes it).

## Next session topics

- Close guard (G2), before any editor app
- Text Viewer vs Text Editor, and the Markdown parser
- G8 web app wrapper: same-origin risk
