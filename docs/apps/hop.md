# Hop

Id `hop` · Source: `src/lib/apps/user/hop/` · [Daily puzzles brainstorm](../brainstorm/2026-10-21_daily-puzzles.md), [ADR-035](../adrs/035-app-platform-wave-2.md)

## What it does

A LinkedIn-Zip-style path puzzle: the rabbit hops one path. An N×N board (6 to 8) has numbered dots 1..k and, on about half the puzzles, short walls between cells. The player draws one continuous path that starts at 1, passes the dots in order, ends at k and fills every cell exactly once, moving up, down, left or right and never across a wall. Every puzzle is generated and has exactly one answer. There's a daily at 7×7 for Game Hub, free play at each size, a timer from a Start overlay, undo and redo, and a Hint.

LinkedIn's Zip has walls on some puzzles and not others; Hop does the same, because walls let a puzzle prove its answer with fewer dots (measured below) and give corridors to reason about.

## How it works

### Random path (`random_path`, `puzzle.ts:158`)

Start from a serpentine (left to right, then right to left, row by row), then make 24 × N² backbite moves. A backbite picks an end of the path and one of its grid neighbours that isn't its own next cell; that neighbour sits somewhere along the path, so joining the end to it makes a loop, and reversing the part of the path between them opens the loop again with a new end. Every move keeps a Hamiltonian path, and enough of them forget the serpentine. Either end may be picked, so both ends wander.

### Walls (`place_walls`, `puzzle.ts:189`)

With probability `WALL_SHARE` (0.5) a puzzle gets N−2 to N+2 walls, picked at random from the edges the answer doesn't use, so the answer never crosses one. Each wall sets a `Side` bit on both cells it separates.

### Counting answers (`solutions`, `puzzle.ts:62`)

A depth-first search from dot 1 that steps to unvisited open neighbours, takes a dot only when it's the next number, and takes the last dot only as the last cell. It stops at `limit` answers or after `budget` search nodes, and says which (`complete`). Pruning, per step from the old head to the new one:

- **Dead ends.** Each cell next to the old head just lost a way in. An unvisited cell needs two ways left (unvisited neighbours plus the new head), the last dot one; fewer and the branch is dead. Only those cells' counts changed, so only they are checked; `free[]` keeps every cell's unvisited-neighbour count up to date as cells are visited and left.
- **Connectivity.** The unvisited cells must stay in one piece: a flood from the new head must reach all of them. A head with fewer than two unvisited neighbours can't split them, so the flood runs only at a fork.
- **Colour.** A path alternates the board's two colours, so the ends' colours are fixed by the size (different on an even board, both the majority colour on an odd one). That's checked once before searching; inside the search it holds by itself, so it prunes nothing per step.

A flood that also stopped at later dots (the next dot must be reachable without passing a later one) pruned more nodes but cost more than it saved, and was dropped.

### Generator (`generate`, `puzzle.ts:235`)

1. A random path is the answer; walls go on.
2. Dots at both ends and every N steps along it.
3. **Cut other answers.** Count to two. If another answer exists, it leaves the real one at step `i` for a cell the real answer reaches at step `m`. Dotting that cell puts it out of order for the other answer, as long as some dot sits between steps `i` and `m` of the real answer; when none does, the cell at step `i` is dotted too (`cut`, `puzzle.ts:219`). If the search ran out of budget without a second answer, the widest gap between dots is halved instead. Repeat until a complete search finds one answer.
4. **Remove dots.** In random order, drop each dot except the ends; keep the drop only when a complete search still finds exactly one answer.

Adding a dot never brings an answer back, so the final set (the last proven set plus dots whose removal failed) is unique.

`BUDGET` (5,000 nodes per search) is what keeps generation fast: a search that would run longer counts as "not proven", so the dot stays. That trades a few more dots for a bounded worst case. Measured on the dev Mac (Vitest, Node), 60 seeds per size:

| Size | Average | Worst | Dots with walls | Dots without |
|------|---------|-------|-----------------|--------------|
| 6×6 | 1.1 ms | 5 ms | 6.3 | 7.5 |
| 7×7 | 6.2 ms | 27 ms | 8.4 | 11.0 |
| 8×8 | 26 ms | 69 ms | 11.4 | 15.2 |

Without the budget 8×8 averaged 480 ms with a 5.8 s worst case; a 10,000 budget gave 14.3 dots at a 136 ms worst case.

### Drawing (`game.ts`, `$kit/games/path`)

The path is an array of cells that always starts on dot 1. `path_step` (kit) cuts back when the cell is already on the path and appends it when `step_rule` allows: a side neighbour, no wall, a dot only if it's the next number, and nothing after the last dot (`refusal`, `game.ts:37`). `draw_to` (`game.ts:56`) walks the head toward the pointer's cell with `grid_walk` both ways round (columns first, rows first) and keeps whichever got further, so a fast drag or a diagonal flick fills the skipped cells. The board is solved when the path holds every cell; the order and end rules make that the answer.

### Hint (`hint`, `game.ts:136`)

1. A wrong step first: the path goes back to where it left the answer and takes the right step there.
2. Otherwise the next step of the answer, then on while `viable_moves` (`game.ts:99`) leaves exactly one move: legal steps from the head that don't strand a cell with too few ways in and out and don't split the unvisited cells. The hint stops where a real choice begins and the status line says how many forced cells it drew.

Hints are counted; best times count only solves without them.

### Input and feedback

- Press on the path (dot 1 at first) or a cell next to its head and drag; drag back over the path to retract; press a cell on the path to cut back to it. A press elsewhere starts nothing. The board is `touch-none`, so drawing never scrolls the page, and the stroke ends on `lostpointercapture`. One stroke is one undo step.
- Keys on the board (`role="application"`): arrows step the head (toward the previous cell steps back), Backspace steps back, H hint, Mod+Z / Mod+Shift+Z undo and redo, F2 new puzzle.
- A refused step says why in the status line ("Reach 3 before 5", "A wall is in the way", "The path ends at 9: back up and fill the rest first").
- The path is a thick round `primary` polyline in an SVG over the cells; cells on it get a `primary/14` tint; dots are `foreground` discs with `background` numbers, ringed in `primary` while the head sits on one; walls are `foreground` bars.

## Data

| Key | What |
|-----|------|
| `app.hop.game` | Free-play game in progress: `{ size, seed, path, hints, elapsed }`. The puzzle is its seed; `restore` replays the path and keeps its legal prefix |
| `app.hop.daily` | Daily in progress: `{ day, game }` |
| `app.hop.stats` | Per size `{ solved, best }` |
| `app.hop.size` | Last size |

A solved daily calls `PlayTracker.daily(day, ms)`; `daily_rank` stays at its default, time ascending. Props: `daily` (`YYYY-MM-DD`), the Game Hub contract. The daily seed is `daily_seed(day, "hop")`, size 7×7. No shell commands beyond `games daily`.

## Dependencies & licences

None beyond the repo's own: `zod`, `phosphor-svelte`.

## Limits

- Difficulty isn't rated. Dot counts vary with the path and the walls; nothing ramps difficulty by size or weekday.
- The budget means a puzzle can keep a dot it didn't strictly need.
- Generation is synchronous on the main thread; 8×8's worst case is under 70 ms.

## Decisions

- [Daily puzzles brainstorm, 2026-10-21](../brainstorm/2026-10-21_daily-puzzles.md): one app per puzzle, rabbit names, generated with one answer, drag-path input as a small kit helper for Hop and the word game.
- [ADR-035](../adrs/035-app-platform-wave-2.md): `daily` prop, `track_play`, Game Hub.
