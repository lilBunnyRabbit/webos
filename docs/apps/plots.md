# Plots

Id `plots` · Source: `src/lib/apps/user/plots/` · [Daily puzzles brainstorm](../brainstorm/2026-10-21_daily-puzzles.md), [ADR-035](../adrs/035-app-platform-wave-2.md)

## What it does

A LinkedIn-Patches-style logic puzzle (a Shikaku variant) set in a garden. An N×N board (6 to 9) holds clues; the player splits the whole board into rectangular plots so that every plot holds exactly one clue. A clue's number is its plot's area; its icon says the plot is a square, tall (taller than wide) or wide (wider than tall). A clue may have only a number (any shape) or only an icon (any size), never neither. Every puzzle is generated, has exactly one answer and is solvable by two deduction rules alone. There's a 7×7 daily for Game Hub, free play at every size, a timer, undo and redo, and a Hint that places the next plot logic proves.

Rules as LinkedIn describes them: [Social Media Today on the launch](https://www.socialmediatoday.com/news/linkedin-adds-seventh-in-app-puzzle-game/815147/) (based on Shikaku, designed by Thomas Snyder) and [a rules guide](https://axeetech.com/puzzles/how-to-play-linkedin-patches/) (square, tall, wide and any-shape badges; clues without a number). LinkedIn shows an explicit "any" badge; Plots shows a bare number instead, since a clue with no icon reads as "no shape rule".

## How it works

### Generator (`generate`, `puzzle.ts:290`)

1. **Partition** (`partition`, `puzzle.ts:166`): a greedy fill in reading order. The first open cell is the top-left corner of the next plot. Every rectangle that fits there (open cells only, area 2 to `max_area`, about 1.5 rows: 9 at 6×6, 14 at 9×9) is an option. A target area is drawn uniform over 2…max, the options within one cell of the nearest area to it are the pool, and one-cell-wide strips longer than 3 get a third of the weight, so the board mixes small and large blocks. A cell boxed in so only 1×1 fits fails the layout, and the generator draws again.
2. **Clues**: one random cell per plot carries its full area and its true shape. Clues are sorted into reading order of their cells, and `solution[i]` is the plot of `clues[i]`. A full set is checked with `solves_by_logic`; one that fails is redrawn.
3. **Thinning**: each clue offers two steps, drop the number (keep the icon) or drop the icon (keep the number), never both. All steps are shuffled and tried once; a step stays only if `solves_by_logic` still places every plot from an empty board. Caps keep the puzzle mostly numbers: at most 35% of clues lose their number and 60% their icon. The 7×7 daily ends up with about 9 clues, 2.7 of them icon-only and 5 number-only.

Why thin by the rules rather than by the solver: requiring "logic alone solves it" guarantees Hint always has a next step from any right partial board, and it also proves the answer unique (below). An earlier version thinned while `count_solutions` stayed at 1; it removed about 40% of numbers and 58% of icons, and the result needed search.

Measured on the dev Mac (Bun), 100 seeds a size:

| Size | Average | Worst |
|------|---------|-------|
| 6×6 | 1.6 ms | 6 ms |
| 7×7 | 3.4 ms | 11 ms |
| 8×8 | 12 ms | 36 ms |
| 9×9 | 24 ms | 58 ms |

Generation runs on the main thread when a puzzle starts.

### Exact-cover solver (`solve`, `puzzle.ts:100`)

`candidates` (`puzzle.ts:74`) lists, for every clue, each rectangle on the board that contains its cell, no other clue's cell, and matches its area and shape. Covering every cell exactly once with candidates is then the whole puzzle: a candidate covers its own clue's cell, so two plots for one clue would overlap, and a clue left without a plot leaves its cell open.

The search is DLX's column rule on plain arrays: branch on the open cell with the fewest live candidates. `blocked[k]` counts the covered cells candidate k touches, and `live[cell]` the unblocked candidates over a cell; `cover` and `uncover` keep both, so a cell that drops to zero ends the branch at once. It stops at `limit` answers (2 for `count_solutions`). Tests use it to check that every generated puzzle has one answer; the generator itself relies on the rules.

### Deduction rules (`plot_options`, `puzzle.ts:229`; `next_step`, `puzzle.ts:259`)

Given the plots already placed (right ones), each open clue starts with its candidates over open cells. Two eliminations run to a fixpoint:

| Elimination | What it removes |
|-------------|-----------------|
| Room | A candidate that overlaps every remaining option of another clue: that clue would have nowhere to go |
| Reach | A cell only one clue's candidates still reach belongs to that clue, so its candidates that miss the cell go |

`next_step` then picks a clue left with one option, preferring one that had only one before any elimination (`ONLY_FIT`, "Only one plot fits the clue at row 3, column 5.") over one that needed the eliminations (`ONLY_ROOM`). Both rules are sound, so if repeated steps place every clue and the plots cover the board, no other answer exists: `solves_by_logic` (`puzzle.ts:270`) is a uniqueness proof.

### Hint (`hint`, `game.ts:104`)

1. A wrong plot first (one not in the answer): it's taken away, its cells flash in `error`.
2. Otherwise the plots that match the answer become `placed`, and `next_step` gives the next plot, which is placed with its reason in the status line for 8 s. Plots it overlaps can't exist at this point, since every wrong plot was removed first.
3. If the rules stall (not expected, see above), one plot of the answer is placed.

Hints are counted; best times count only solves without hints.

### Input and feedback

- **Drag** from any cell to the opposite corner: a `primary` outline shows the rectangle and the status line its size ("3×2 · 6 cells"), with what's wrong with it if anything ("more than one clue"); it turns `error` then. On release it's placed. A new plot replaces every plot it overlaps, so plots never stack; the ones it would replace fade while dragging. The drag ends on `lostpointercapture`; the board is `touch-none`, so a finger drag never scrolls.
- **Tap or click** a plot without moving removes it; right-click removes it too.
- **Keyboard**: arrows move, Space or Enter marks a corner, arrows stretch the outline from it, Space or Enter again places the plot (on the same cell it cancels), Escape cancels, Backspace or Delete removes the plot under the cursor. H hint, Mod+Z / Mod+Shift+Z undo and redo (`$kit/utils/history`), F2 new puzzle.
- **Drawing**: plot borders come from `region_edges` (`$kit/games`) over the cell → plot map (empty cells share region -1 and get no thick border between them). Each plot is tinted by its one clue's index (info, warning, secondary, success, cottontail, tertiary, accent, primary, then around again), so a plot keeps its colour when redrawn; adjacent plots may share a tint and the borders separate them.
- **Rules feedback** follows the genre: a plot that breaks a rule (no clue, two clues, wrong area, wrong shape) gets `error` borders, a light `error` hatch and an `error` clue; the status line names the first problem. A clue whose plot is fine dims. Nothing says whether a legal plot is the right one except Hint.
- **Shape glyphs** are drawn outlines with clear proportions (1:1, about 1.8:1 and 1:1.8), not phosphor icons: Phosphor's `Rectangle` is nearly square at clue size, so wide and square read alike. With a number the glyph is a badge in the top-right corner; alone it sits in the middle.
- A fresh puzzle opens behind a Start overlay, and the timer runs from Start. New puzzle starts the next one right away.

## Data

| Key | What |
|-----|------|
| `app.plots.game` | Free-play game in progress: `{ size, seed, plots, hints, elapsed }`, each plot `[row, col, width, height]`. The puzzle is its seed |
| `app.plots.daily` | Daily in progress: `{ day, game }` |
| `app.plots.stats` | Per size `{ solved, best }` |
| `app.plots.size` | Last size |
| `/var/lib/apps/plots/achievements.json` | Achievements, written by the OS ([achievements](../system/services/achievements.md)) |

A solved daily calls `PlayTracker.daily(day, ms)`; the manifest leaves `daily_rank` at its default, time ascending. Props: `daily` (`YYYY-MM-DD`), the Game Hub contract. The daily seed is `daily_seed(day, "plots")`, size 7×7. No shell commands beyond `games daily`.

**Achievements** (ADR-078), reported from `finish()` after the stats are recorded: `first-solve` (any solve), `daily` (a daily), `big` (9×9 without a hint), `solves-25` (progress: the solves of every size added up), secret `quick` (6×6 in under 30 s without a hint).

## Dependencies & licences

None beyond the repo's own: `zod`, `phosphor-svelte` (toolbar icons).

## Limits

- Difficulty isn't rated or tuned; nothing ramps by weekday.
- Plots are 2 cells or more; a 1×1 plot never appears, and the player can't draw one (a tap removes instead).
- Light theme tints are unmeasured for contrast; clue text stays `foreground` on a 30–36% tint.
- Generation is synchronous; no worker.

## Decisions

- [Daily puzzles brainstorm, 2026-10-21](../brainstorm/2026-10-21_daily-puzzles.md): one app per puzzle, rabbit names (Patches → Plots), generated with one answer, region borders as a small kit helper.
- [ADR-035](../adrs/035-app-platform-wave-2.md): `daily` prop, `track_play`, Game Hub.
- [ADR-078](../adrs/078-achievements.md): achievements.
- Built here, within the brainstorm's scope: a new plot replaces the plots it overlaps (LinkedIn's behaviour) instead of stacking; overlap shows as a preview while dragging, not as a lasting conflict. Clues are thinned until the deduction rules, not just the solver, still solve the puzzle.
