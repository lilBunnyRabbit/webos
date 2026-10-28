# ADR-084: Four Walls
**Date:** 2026-10-28
**Status:** Implemented

## Context
LaxDOTexe asked for a falling-block game where every wall of a square is a floor ([brainstorm](../brainstorm/2026-10-28_four-walls.md)). Blocks already holds the tetromino shapes, SRS kicks and the 7-bag queue.

## Decision
- New user app `four-walls` on a square board; pieces spawn at the centre and travel toward a wall.
- The diagonals split the board into four zones whose floors are their walls. A full zone row parallel to its wall clears, and the zone collapses toward that wall. A blocked spawn ends the game.
- The game picks each piece's direction and shows it in the queue: Cycle (down, left, up, right, reversing every 10 pieces) or Random. The daily is Random with a seeded RNG.
- Tetromino shapes, kicks, the 7-bag queue and piece colour tokens move to `$kit/games/tetromino.ts` in their own `refactor:` commit; Blocks and Four Walls import them.
- Best per mode in app storage `app.four-walls.best`, `track_play`, achievements, a `daily` prop, Game Hub rank, `four-walls daily [day]`.

## Alternatives Considered
- A Blocks mode: a second board model inside Blocks' `game.ts`, and its daily and stats muddled.
- Full-board row and column clears; ring clears.
- Player-chosen direction: deferred as a later mode.

## Consequences
- `$kit/games` gains a tetromino module, stable like the rest of the kit.
- Board size is a tuned constant, not a decision.

## Revision 2026-10-28 (build)

Decided within scope while building ([page](../apps/four-walls.md)):

- **Diagonal cells** go round like a pinwheel (bottom-right half to the bottom wall, bottom-left to the left, top-left to the top, top-right to the right), so the four zones are identical under a quarter turn and a zone's lines hold `size - 1`, `size - 3`, … 1 cells (lines changed to corner to corner, see the owner report revision below).
- **Spawn** is the centre 4 × 2 lying across the piece's way, in rotation 0 of the piece's own frame.
- **The middle 2 × 2 never makes a line.** Those four cells are the zones' one-cell inner lines; counted, a piece stuck at the centre cleared up to four of them for free. They never clear and never move in a collapse, and the blocked spawn stays the only way to lose (an earlier build also ended the game on any lock over the middle; replaced after review, since only the blocked spawn was decided). A headless bot plays about 7 to 8 lines per game at 14 with this rule; also counting the 3-cell lines out halved that, so only the 1-cell ones are left out.
- **Board size** 14, from headless play and browser rounds at 12, 14 and 16.
- The opposite arrow rotates (Blocks' Up); hold keeps the turn's wall; past four lines from one piece each line adds 400 × level; the daily ranks by score in Game Hub.

## Revision 2026-10-28 (owner report)

The owner filled a row along the bottom wall and the block in the bottom-left corner stayed: with the pinwheel split that corner belonged to the left wall's line, not the bottom's. Lines now run corner to corner: line `d` is every cell `d` from its wall between the two diagonals, both diagonal cells included (`size - 2d` cells: 14, 12, … 4 on a 14 board). Diagonal cells sit in two lines and clear with either. The pinwheel stays for ownership only: on a collapse a zone moves the cells it owns, so a diagonal cell moves with its owner. The middle 2 × 2 (the two-cell inner lines) still never clears. A headless bot clears about 2.5 lines per game with this rule instead of 7 to 8.
