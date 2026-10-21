# Hutches

Id `hutches` · Source: `src/lib/apps/user/hutches/` · [Daily puzzles brainstorm](../brainstorm/2026-10-21_daily-puzzles.md), [ADR-035](../adrs/035-app-platform-wave-2.md)

## What it does

A LinkedIn-Queens-style logic puzzle with rabbits. An N×N board (7 to 10) is split into N meadows; the player places N rabbits so that every row, column and meadow holds exactly one and no two rabbits touch, diagonals included. Every puzzle is generated, has exactly one answer, and is solvable by deduction alone. There's a daily at 8×8 for Game Hub, free play at any size, a timer, undo, and a Hint that shows the next step logic proves.

## How it works

### Generator (`puzzle.ts:350`)

1. **Rabbits first** (`place_rabbits`, `puzzle.ts:234`): a random permutation, one column per row, built by backtracking with a shuffled column order and no two neighbouring rows in columns less than two apart. That's the answer.
2. **Meadows grown around them** (`grow_meadows`, `puzzle.ts:265`): each rabbit seeds a meadow; a random cell from the shared frontier joins the meadow it touches until the board is full. Meadows with more edge grow faster, which gives the mix of small and large meadows the deductions need. A meadow left with only its rabbit is a given, so `widen` (`puzzle.ts:288`) gives it a neighbouring cell.
3. **Reshape until unique and logical** (up to 60 steps, `RESHAPES`):
   - `solutions(size, regions, 2)` (`puzzle.ts:75`) is a row-by-row backtracking solver with bitmasks for used columns and meadows that stops at two answers.
   - Two answers: pick the other answer's rabbit cells that aren't rabbits of the real answer, and move one into a neighbouring meadow (`reshape`, `puzzle.ts:327`). The other answer now has two rabbits in that meadow and none in the old one, so it's dead; the real answer is untouched because the moved cell isn't one of its rabbits. The old meadow must stay connected and keep at least 2 cells.
   - One answer: run the deduction rules from an empty board (`solve_by_logic`, `puzzle.ts:220`). If they place every rabbit, done. If they stall, move one of the cells they couldn't decide (never a rabbit of the answer) and loop: the new shape may bring a second answer back, which the next step cuts again.
   - A layout that can't be reshaped (no cell may move) or doesn't settle in 60 steps is dropped for fresh rabbits.

Why this shape: cutting the other answer directly makes uniqueness converge instead of rerolling whole layouts, and moving stalled cells makes "the rules alone solve it" a property of every puzzle rather than a filter. Meadow growth matters: a version that grew every meadow at the same pace produced even sizes with many answers, and needed 1,427 layouts for 30 10×10 puzzles (3.5% reached one answer); frontier growth (uneven meadows) needed 855 for 50, at about a quarter of the time.

Measured on the dev Mac (Vitest, Node), 50 seeds a size:

| Size | Average | Worst |
|------|---------|-------|
| 7×7 | 1.1 ms | 8 ms |
| 8×8 | 1.7 ms | 11 ms |
| 9×9 | 8.9 ms | 93 ms |
| 10×10 | 46 ms | 186 ms |

Generation runs on the main thread when a puzzle starts; 10×10's worst case is a short stall on New puzzle.

### Deduction rules (`next_deduction`, `puzzle.ts:202`)

State is one `Cell` per square: unknown, empty, rabbit. `settle` first rules out everything a placed rabbit covers (its row, column, meadow and the eight around it); that's too obvious to count as a step. Then, simplest first so a hint teaches the step a person spots next:

| Rule | What it proves |
|------|----------------|
| `only` | A row, column or meadow with one unknown cell left: that cell is a rabbit |
| `locked`, k = 1 | A unit whose candidates all lie in one unit of another kind (a meadow inside row 3, row 5 inside one meadow, a row inside one column): the rest of that other unit is empty |
| `blocks` | A cell whose rabbit would rule out every candidate of some other unit is empty |
| `locked`, k ≥ 2 | k units of one kind whose candidates fit inside k units of another kind (two meadows inside rows 4 and 5): the rest of those k units is empty |

`locked` covers the six ordered pairs of row, column and meadow. For each pair it builds, per subset of open units, the bitmask of lines their candidates touch with one table pass (`lines[s] = lines[s without its lowest bit] | mask[lowest]`), so all 2^10 subsets cost about a thousand ORs.

### Hint (`game.ts:170`)

1. A wrong mark first (a rabbit not in the answer becomes a cross, a cross on an answer cell becomes a rabbit), since everything after it builds on it.
2. Otherwise the player's marks become the state (rabbits, crosses as empty), `settle` runs, and `next_deduction` gives one step. The hint applies every cell that step decides, outlines the unit it's about, and the status line says why ("Every place left for the outlined meadow is in row 8, so the rest of row 8 stays empty."). The explanation clears after 8 s or on the next move.
3. If nothing is provable (not expected: every puzzle is solvable by the rules from empty, and the player's correct marks only add knowledge), it places one rabbit of the answer.

Hints are counted; best times count only solves without hints.

### Input and feedback

- Tap or click cycles blank → × → rabbit → blank (`cycle`). Right-click toggles a rabbit. Dragging lays × on blank cells, or erases × when it starts on one; `line_cells` fills the cells a fast drag skips. The drag ends on `lostpointercapture`.
- Keys: arrows move, Space or Enter cycles, X crosses, R places a rabbit, Backspace clears, H hint, A auto-cross, Mod+Z / Mod+Shift+Z undo and redo (`$kit/utils/history`), F2 new puzzle.
- Auto-cross (off by default) draws faint × on every blank cell a rabbit rules out. They're derived from the rabbits, never stored, so removing a rabbit removes its crosses.
- Rabbits that share a row, column or meadow, or touch, get an `error` ring. A row, column or meadow with no rabbit and every cell crossed (auto-crosses count) is hatched in `error`.
- Meadows are told apart three ways: thick borders from `region_edges` (`$kit/games`), a theme-token tint (info, warning, secondary, success, cottontail, tertiary, accent, primary, foreground, then error only for the tenth meadow so it isn't mistaken for a mistake on smaller boards), and a pattern per meadow (dots, stripes at four angles, grid, crosshatch, large dots, checker), so colour alone never carries the rule.
- A fresh puzzle opens behind a Start overlay, and the timer runs from Start. New puzzle starts the next one right away.

## Data

| Key | What |
|-----|------|
| `app.hutches.game` | Free-play game in progress: `{ size, seed, marks, hints, elapsed }`. The puzzle is its seed |
| `app.hutches.daily` | Daily in progress: `{ day, game }` |
| `app.hutches.stats` | Per size `{ solved, best }` |
| `app.hutches.size` | Last size |
| `app.hutches.auto-cross` | Auto-cross switch |

A solved daily calls `PlayTracker.daily(day, ms)`; the manifest leaves `daily_rank` at its default, time ascending. Props: `daily` (`YYYY-MM-DD`), the Game Hub contract. The daily seed is `daily_seed(day, "hutches")`, size 8×8. No shell commands beyond `games daily`.

## Dependencies & licences

None beyond the repo's own: `zod`, `phosphor-svelte` (the rabbit and × glyphs).

## Limits

- Difficulty isn't rated or tuned. Most puzzles open with a 2-cell meadow, which makes the first steps easy; nothing ramps difficulty by size or weekday.
- In Brand Dark several tokens sit near the same green hue (primary, success, tertiary), so two meadows can share a similar tint; the pattern and borders still separate them. Light theme tints are unmeasured for contrast.
- Generation at 10×10 is synchronous; no worker.

## Decisions

- [Daily puzzles brainstorm, 2026-10-21](../brainstorm/2026-10-21_daily-puzzles.md): one app per puzzle, rabbit names, generated with one answer, region borders as a small kit helper.
- [ADR-035](../adrs/035-app-platform-wave-2.md): `daily` prop, `track_play`, Game Hub.
