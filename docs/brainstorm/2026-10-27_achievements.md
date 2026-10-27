# Achievements
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
The App Store redesign ([brainstorm](2026-10-27_app-store-design.md)) gave every app page a **Goals** checklist derived from active time (opened once, an hour, 5 days, 10 hours, 30 days; `milestones()` in `services/apps/active-time.ts`) and put an "Achievements API" on the roadmap: apps declare achievements and report them, stored per app, toast on unlock, shown in the App Store. Today the games keep their own stats (Minesweeper and Sudoku best times, Snake high scores, Solitaire wins, Hop solves) in `app.{id}.*` localStorage or `/var/lib/apps/{id}/`, and nothing above the app sees them.

## Topics discussed

### Where it lives
- **Options:** a helper in the games kit writing a file per game; a section of AppsService; a new kernel service.
- **Decided: a new kernel service, `achievements` (AchievementsService)**, depending on `files`, `notifications`, `apps`. The kit helper can't toast with the OS's voice or answer the Store and shell for apps that aren't running; AppsService already owns a lot and achievements are their own domain with their own inspector and shell command.
- API: `achieve(app_id, id)`, `progress(app_id, id, n)` (n cumulative toward the definition's `goal`, merged by max) and a reactive `list(app_id?)` of `{ def, unlocked_at, progress }`.
- Apps don't pass their id: `get_app_context().achievements.achieve(id)` / `.progress(id, n)` are bound to the app. `AppContext` gains `achievements`, built where the window, mobile window and solo window build the rest of the context.

### Declaring them
- **Decided: inline data in the manifest,** `define_app({ achievements: [{ id, title, text, goal?, secret? }] })`. Plain data in `index.ts`, no chunk import: the list is small and the manifest is the app's contract.
- The catalogue build extracts them: `catalogue.json` apps carry only a count (`achievements: 12`), and the definitions go to a side file, `store/achievements.json` (`{ [app_id]: Achievement[] }`), fetched the first time the Store or Game Hub needs definitions of an app whose manifest isn't loaded. The definitions count toward the app's hash (ADR-077), so changing them is a new app version.
- Dev server and tests have no catalogue: definitions come from the manifests directly.

### Shape
- **Decided: achieve + progress + secret.** A secret achievement shows "Secret" until unlocked. No tiers, no points: they add a scoring model nobody asked for.

### Storage and two windows
- **Decided:** `/var/lib/apps/{id}/achievements.json`, `{ version: 1, unlocked: { [id]: epoch_ms }, progress: { [id]: number } }`. Every change re-reads the file and merges (union of unlocked, earliest time; max of progress) before writing, so two tabs or windows never lose one.
- The toast fires only on the in-memory transition after that merge: an achievement another tab already unlocked merges in silently, so two windows never toast twice.
- **Uninstall with data keeps the file:** everything else in `/var/lib/apps/{id}/` goes, `achievements.json` stays. Achievements are a record of what you did, not app data to reset.
- Backed up with `/var/lib` (ADR-037), no change there.
- Solo links (ADR-047) unlock normally; nothing is swapped.

### Toast
- **Decided:** on unlock, a notification with the app's icon, titled "Achievement: {title}", the text as the message.

### The existing Goals
- **Decided: they become built-in OS achievements every app gets** (opened or played once, an hour, 5 days, 10 hours, 30 days). Still derived from usage, never stored, listed in the same Achievements section, and **no unlock toast** for them (they'd fire for every app on the first boot after the update).
- **Backfill: none.** Every app starts from zero; past best times don't unlock anything retroactively.

### UI
- **App Store app page:** the Goals section becomes **Achievements · 3 of 12** (built-in plus declared), progress bars for goals, locked ones greyed, secret ones as "Secret" until unlocked. Store cards may show the count.
- **Game Hub:** a new **Achievements** tab listing every game's achievements. Consumer only.
- Desktop and phone alike.

### Shell
- **Decided:** `achievements [app]` yields `achievement` values with columns app, title, unlocked, progress, so `achievements | where unlocked == true` works; clicking one opens the app's Store page. Uses the existing `app` completer.

### First adopters
- **Decided: every game that keeps stats:** Minesweeper, Sudoku, Hop, Snake, 2048, Solitaire, Doodlehop. Three to six each, a mix of one-off, progress with a goal, and a secret where it fits, wired at the game's own end-of-game events.

### Sweep: the other apps (decided, second session)
- **Scope:** every remaining game and puzzle, plus user apps with a natural finish line. Pure tools (Diff, Hex Viewer, Unit Converter and the like) keep only the five built-ins. System apps are skipped: built-ins only.
- **Games and puzzles:** Sokoban, Nonogram, Kakuro, Futoshiki, Nurikabe, Hutches, Plots, Sun and Moon, Tunnels, Word Search, Blocks, Lunar Lander, Maze, Jigsaw, Tic-Tac-Toe, Color Games, Color Recall, Crack the Code, Hex Guess, Odd One Out, Gradient Sort, Checkout Challenge, Alibi, Unsaid. Three to six each, as for the first adopters.
- **Apps with a finish line:** Pomodoro, Tea Timer, Speed Reader, Kanban, Doc Scan, Motion Watch, Recorder, Paint, Hopsprite, Font Maker, Warren, Tape Sketch, Brackets, Shopping List. Two to four each, earned by doing the app's own thing (a session finished, a page scanned, a list completed), never by opening it or counting clicks.
- Five builders by group so files don't collide; each group gets a review before the push.

## Key takeaways
- One service owns achievements; apps only report, the OS stores, toasts and shows.
- Definitions are manifest data; the catalogue carries a count and a side file the definitions.
- Merge on every write: no lost unlocks, no double toasts.
- Achievements outlive an uninstall.

## Action items
- [x] ADR-078
- [x] AchievementsService: persistence, merge, toast, built-ins, inspector, `achievements` command
- [x] `define_app({ achievements })`, catalogue count and `store/achievements.json`
- [x] `get_app_context().achievements`
- [x] App Store section and card count, Game Hub tab
- [x] Uninstall with data keeps `achievements.json`
- [x] Minesweeper, Sudoku, Hop, Snake, 2048, Solitaire, Doodlehop
- [x] Docs: system reference, per-app pages, ROADMAP, changelog

- [ ] Sweep: games and puzzles (two groups), apps with a finish line (two groups), Shopping List with its scan option
  - [x] AI games and creative apps: Alibi, Unsaid, Paint, Hopsprite, Font Maker, Warren, Tape Sketch, Brackets

## Next session topics
- Cross-tab live refresh beyond re-reading when a tab becomes visible.
