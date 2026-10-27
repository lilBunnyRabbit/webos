# Sun & Moon
Id `sun-and-moon` · Source: `src/lib/apps/user/sun-and-moon/` · [Daily puzzles brainstorm](../brainstorm/2026-10-21_daily-puzzles.md), [ADR-035](../adrs/035-app-platform-wave-2.md) (games kit, plays), [Game app pattern](../design/patterns.md#game-app)

## What it does

A daily logic puzzle in the style of LinkedIn's Tango (the genre is Takuzu or Binairo, with signs). Fill a 6×6 or 8×8 grid with suns and moons:

- every row and column holds as many suns as moons;
- never three of the same next to each other in a row or column;
- `=` between two cells means they match, `×` means they differ.

A tap cycles a cell empty → sun → moon → empty. Broken rules light up as you go, Hint places the next forced cell and says which rule forces it, and every puzzle has exactly one answer that logic alone reaches. The daily is a 6×6 from `daily_seed(day, "sun-and-moon")`, ranked by time in Game Hub.

## How it works

### Model

`puzzle.ts`. A cell is a `Mark` (`EMPTY` 0, `SUN` 1, `MOON` 2), which doubles as a bit mask: a cell's candidates are `SUN | MOON` until something decides it. Signs are an `Edge` (`NONE`, `SAME`, `DIFF`) on the same across/down edge indexing as Futoshiki, through `across_cells` / `down_cells` in `$kit/games/grid` (across `r * (size - 1) + c`, down `r * size + c`). `lines_of(clues)` (`puzzle.ts:37`) turns the board into its rows and columns, each with its cells and the signs inside it.

### Solver: line patterns

`line_patterns(size)` (`puzzle.ts:61`) lists every way to fill one line on its own: half suns, no three alike. There are 14 for a line of 6 and 34 for a line of 8, cached per size.

`line_union` (`puzzle.ts:87`) keeps the patterns that agree with the line's current candidates and with the signs inside the line, and ORs them: a cell left with one bit is decided. `propagate` (`puzzle.ts:111`) runs that over every row and column until nothing changes. A sign across a row is inside that row, so it's applied there, and the row's narrowing feeds the columns on the next pass. No line with any pattern left is a contradiction.

Why patterns rather than a list of hand-written rules: they cover every within-line deduction at once (pairs, gaps, counts, a `×` pair counting as one of each, longer chains), and a line is at most 34 patterns, so a pass is cheap. It's the same idea as Nonogram line solving.

- `logic_solves(clues)`: propagation alone decides every cell.
- `count_solutions(clues, limit = 2)` (`puzzle.ts:139`): propagation, then a branch on the first open cell, stopping at `limit`. Used by the tests.

### Generator

`generate(size, seed)` (`puzzle.ts:280`), seeded by `create_rng`:

1. `full_grid` backtracks a valid full grid, cell by cell, in random order (`puzzle.ts:245`).
2. About a third of the edges (`SIGN_SHARE`, 0.35) get their true sign, and every cell starts as a given.
3. Givens are taken away in shuffled order, keeping a removal only while `logic_solves` still holds, until one given per row's worth is left (`size` givens).
4. Then signs, the same way, down to the minimum.

Logic never rules out a mark that could be right, so a puzzle it finishes has exactly one solution; the tests also check `count_solutions` is 1.

The order matters. Mixing givens and signs in one shuffle left 6–10 givens and often no signs at all; removing givens without a floor left 1–3 givens with signs carrying the whole puzzle. Givens first down to `size`, then signs, plays like the genre. Measured over 30 seeds on an M-series Mac: 6×6 gives 6 givens and 3–7 signs in about 1.6 ms; 8×8 gives 8 givens and 7–15 signs in about 4.6 ms.

### Hint

`hint(game)` (`game.ts:120`): the first wrong mark if there is one ("This one was wrong"), otherwise `next_step(clues, entries)` (`puzzle.ts:227`). It tries five rules on the board as it is, simplest first, and returns the lowest cell index the first rule with a result gives:

| Rule | What it sees | Status line |
|------|--------------|-------------|
| `sign` | A filled cell next to an empty one across `=` or `×` | "The × sign makes it differ from its neighbour: a moon" |
| `pair` | Two alike side by side: both ends are the other mark | "Two suns side by side: a third would make three in a row" |
| `gap` | Two alike with one empty between: the middle is the other | "A sun on both sides: another would make three in a row" |
| `count` | A line already holding half of one mark | "Row 2 already has its 3 suns" |
| `line` | The line-pattern union above, on one line | "Every way to finish row 4 puts a moon here" |

The reason shows in the status line for six seconds (`Flash` from `$kit/utils/flash.svelte`) or until the next move. With correct entries one of these always fires: the board is then between the givens and the solution, and propagation from any such state finishes the grid. A step-by-step solve with `next_step` over generated puzzles uses all five rules.

### Feedback

`conflicts(game)` (`game.ts:40`) marks cells in a line with more than half of one mark, every run of three alike, and both sides of a broken sign. Signs show open, met (dimmed) or broken (`error`). A full board with no conflict is the solution, since there is only one. Nothing says whether a legal mark is right except Hint.

## Data

| What | Where | Format |
|------|-------|--------|
| Game in progress | `app.sun-and-moon.game` | `{ size, seed, values, hints, elapsed }`: the puzzle is its seed, so only the marks are saved |
| Daily in progress | `app.sun-and-moon.daily` | `{ day, game }`, apart from the regular game |
| Last size | `app.sun-and-moon.size` | `"6"` or `"8"` |
| Stats | `app.sun-and-moon.stats` | Per size `{ solved, best }`; best only counts solves without hints |
| Daily results, play time | `/var/lib/games/plays.json` | Games kit (`track_play`), ranked by time |
| Achievements | `/var/lib/apps/sun-and-moon/achievements.json` | Written by the OS ([achievements](../system/services/achievements.md)) |

Props: `daily` (`YYYY-MM-DD`) opens that day's puzzle; Game Hub's Today tab passes it.

Undo and redo are `$kit/utils/history` over the marks, up to 200 steps, per window and not saved.

**Achievements** (ADR-078), reported from `finish()` after the stats are recorded: `first-solve` (any solve), `daily` (a daily), `big` (8×8 without a hint), `solves-25` (progress: the solves of both sizes added up), secret `quick` (6×6 in under 45 s without a hint).

## Dependencies & licences

None beyond the repo. Icons are Phosphor `Sun` and `Moon` (duotone), sun in `primary`, moon in `secondary`.

## Limits

- No uniqueness rule across rows (Binairo's "no two rows alike"): this is Tango's rule set. It's a candidate mode in the brainstorm's next topics.
- Difficulty isn't graded. In a hint-by-hint solve over 30 seeds, `line` was about one step in seven on 8×8 against one in nine on 6×6.
- Timings above were measured once in Vitest, not profiled.

## Decisions

- [Daily puzzles, LinkedIn style](../brainstorm/2026-10-21_daily-puzzles.md): one app per puzzle, the name, 6×6 daily, edge-sign helpers shared with Futoshiki through `$kit/games/grid`.
- [ADR-078](../adrs/078-achievements.md): achievements.
