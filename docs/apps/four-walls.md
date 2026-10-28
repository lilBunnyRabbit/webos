# Four Walls

Falling blocks on a square where every wall is a floor. Pieces enter in the middle and travel toward the wall the game picks for them. Decided in [ADR-084](../adrs/084-four-walls.md) and its [brainstorm](../brainstorm/2026-10-28_four-walls.md). Idea from LaxDOTexe.

Code: `src/lib/apps/user/four-walls/`. `game.ts` is the whole rule set as pure functions over an immutable `GameState` (Blocks' pattern), `draw.ts` paints it on a canvas from theme tokens, `four-walls.app.svelte` runs the loop and the input. The pieces, SRS kicks, 7-bag and piece colours come from `$kit/games/tetromino`, shared with Blocks.

## Board and zones

`BOARD_SIZE` is 14 (see [Board size](#board-size)). The two diagonals cut the square into four triangular zones, one per wall; a zone's floor is its wall.

With an even size the diagonals run through cells, so every diagonal cell is given to one zone. They go round like a pinwheel: the bottom-right half of the diagonals belongs to the bottom wall, bottom-left to the left, top-left to the top, top-right to the right. That keeps the four zones identical under a quarter turn:

- a zone has `size / 2` lines, parallel to its wall;
- line `d` (depth `d` from the wall) holds `size - 1 - 2d` cells: 13, 11, … 3, 1 on a 14 board;
- the zones partition the board exactly;
- the one-cell inner lines (the middle 2 × 2) don't count as lines (see [Spawn and game over](#spawn-and-game-over)), so `rows` holds `size / 2 - 1` lines per zone.

`zones(size)` builds the bottom zone in the bottom wall's frame (row `size - 1 - d`, columns `d + 1` to `size - 1 - d`) and turns it into each wall's frame with `to_board`, so the other three can't drift from it. It returns `zone_of` (cell → wall) and `rows` (wall → lines as board indices, wall first), cached per size.

## Frames

Each piece moves in its own frame: the board turned so its wall is at the bottom. `Active.x/y` and the rotation are in that frame, so gravity is always `y + 1`, the SRS kicks apply unchanged, and the ghost is the same `drop_distance` as Blocks. `to_board(size, direction, x, y)` maps a frame cell to the board (down: as is; left: a quarter turn clockwise; up: a half turn; right: a quarter turn back). `to_frame(direction, dx, dy)` maps a board step (an arrow, a finger's travel) into the frame: `y = 1` is toward the wall, `x = ±1` is steering. `screen_rotation` is what a frame rotation looks like on the board, used by the Next preview.

## Spawn and game over

A piece enters in rotation 0 of its frame inside the centre 4 × 2 lying across its way: columns `size/2 - 2 … size/2 + 1`, rows `size/2 - 1 … size/2` of the frame (`spawn_point`; I sits on the back row, O in the middle two columns). The game ends only when the cells it enters on are taken (blocked spawn, as decided).

The middle 2 × 2 is the four zones' one-cell inner lines. Those never count as lines: `zones` leaves them out of `rows`, so they never clear and never move in a collapse. Counted, a piece stuck at the centre would clear up to four "lines" for free (a headless run tripled lines per game this way) and the secret achievement would come for nothing. A piece that locks on the middle stays there, and since every spawn crosses the middle, the next blocked spawn usually ends the game soon after. So a line is 3 to `size - 1` cells.

## Lines and collapse

After a lock, `full_lines` checks every line of every zone; a piece can complete lines in two zones at once (a corner). Every full line flashes for `CLEAR_MS`, then `collapse` takes them out zone by zone: each remaining line moves toward the wall by the number of cleared lines below it, keeping its cells' position along the wall (an inner line is shorter by two per step and centred on the same axis, so it lands one cell in from each end of the longer line). The innermost lines empty. Cells of other zones never move.

## Directions

The game picks each piece's wall when the piece is dealt, and the Next column shows it as an arrow beside the piece (drawn in the rotation it will enter with).

- **Cycle**: down, left, up, right, one step per piece; every `CYCLE_RUN` (10) pieces the order turns round (`cycle_direction(i)`: pieces 0–9 go down, left, up, right, down, left, up, right, down, left; piece 10 steps back to down, then right, up, left …).
- **Random**: each piece gets a random wall.
- **Daily**: Random from `daily_seed(day, "four-walls")`, so every player gets the same pieces and walls.

`fill_turns` deals whole 7-bags and gives each piece its wall as it's dealt, using only the game's RNG, so a seeded game deals the same turns whatever the player does. Hold keeps the turn's wall: the held piece comes back on the wall of the piece it swaps with.

## Controls

Arrows are board directions; what an arrow does depends on the piece in play:

| Arrow | Does |
|-------|------|
| The two across its way | Steer (held: Blocks' DAS 160 ms, ARR 45 ms) |
| Its own | Soft drop (+1 a row) |
| The opposite one | Rotate clockwise, like Up in Blocks |

Space hard-drops (+2 a row), X / Z rotate, C or Shift holds, P or Escape pauses, Enter starts or plays again. A held arrow keeps its meaning per frame: if the next piece goes another way, a held steer arrow steers it when it's across, and a held soft-drop stops when the piece doesn't go that way.

Touch: the Blocks pad (hold, rotate both ways, drop; then steer, soft drop, steer). Its arrows and the drop icon turn with the piece in play, and the two steer buttons always sit in screen order (left or up first). On the board, a finger's travel is read in the piece's frame: one cell across steers, one cell along soft-drops, a quick flick of two cells along hard-drops, a tap rotates.

## Scoring, levels, speed

Blocks' model: 100 / 300 / 500 / 800 × level for 1–4 lines from one piece, and since a piece can fill lines in two zones, each line past four adds 400 × level. Soft drop +1 a row, hard drop +2. Level is `1 + lines / 10`, up to 20, with Blocks' gravity curve and lock delay (500 ms, 15 move resets).

## Board size

Tried 12, 14 and 16 headless (a greedy one-piece bot on the pure rules, tuned by random search over hole, depth, bumpiness and line weights; 40 seeded games per size and mode) and in the browser on a 390 px phone:

| Size | Pieces per game | Lines per game | Lines per piece | Phone cell |
|------|-----------------|----------------|-----------------|------------|
| 12 | 32.5 | 7.2 | 0.22 | 20 px |
| 14 | 44 | 7.5 | 0.17 | 18 px |
| 16 | 57 | 7.3 | 0.13 | 17 px |

12 is cramped: the zones are six lines deep with two taken by the spawn, games end in about 30 pieces. 16 lasts longest but its 15-cell lines clear rarely, so a game is long stretches without a clear, and the cells get small on a phone. 14 sits between: a few more lines per piece than 16, a third more room than 12. Measured 2026-10-28 on the build's rules; unmeasured with real players.

Layout: in a wide box Hold and Next stand beside the board; in a tall one (phones, narrow windows, `@container (orientation: portrait)`) they sit in a row above it with two Next pieces, so the board takes the full width (about 26 px cells on a 390 px phone instead of 18). The ready screen is a `BoardOverlay` naming the mode.

## Data

- `app.four-walls.best` (`storage.persisted`, zod `best_schema`): `{ cycle: { score, lines }, random: { score, lines } }`, each the best of its mode; the daily counts as Random. Reset in the Best sheet.
- `app.four-walls.mode`: the last picked mode, like Blocks.
- Play time through `track_play`; a finished daily goes to Game Hub with `play.daily(day, ms, score)`, ranked by score (`daily_rank: DailyRank.SCORE_DESC`), so the best score of the day stays.
- `daily` prop (`YYYY-MM-DD`), and `four-walls daily [day]` in the shell (`today`, `yesterday`, `-N` or a date, through `parse_day`).

## Achievements

| Id | Title | When |
|----|-------|------|
| `four-lines` | Four at once | One piece clears four or more lines |
| `every-wall` | All four walls | Lines cleared against every wall in one game (`walls` bit mask) |
| `level-10` | Picking up speed | Level 10 (progress: the game's level) |
| `lines-50` | Half a hundred | 50 lines in one game (progress: the game's lines) |
| `daily` | Daily walls | A daily game finished |
| `two-walls` (secret) | Corner shot | One piece clears lines in two zones |

## Limits

- Games are short: the bot's average is about 44 pieces at 14. Speed and size tuning after real play is a next-session topic in the brainstorm.
- The player can't choose the direction yet (deferred mode).
