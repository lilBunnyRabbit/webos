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

- **Diagonal cells** go round like a pinwheel (bottom-right half to the bottom wall, bottom-left to the left, top-left to the top, top-right to the right), so the four zones are identical under a quarter turn and a zone's lines hold `size - 1`, `size - 3`, … 1 cells.
- **Spawn** is the centre 4 × 2 lying across the piece's way, in rotation 0 of the piece's own frame.
- **Lock out** joins the blocked spawn as a way to lose: a piece that locks on the middle 2 × 2 ends the game. Those four cells are the zones' one-cell inner lines; without the rule a piece stuck at the centre cleared up to four of them for free.
- **Board size** 14, from headless play and browser rounds at 12, 14 and 16.
- The opposite arrow rotates (Blocks' Up); hold keeps the turn's wall; past four lines from one piece each line adds 400 × level; the daily ranks by score in Game Hub.
