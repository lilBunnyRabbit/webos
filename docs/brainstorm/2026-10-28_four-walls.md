# Four Walls
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
LaxDOTexe: "Tetris game that is not just down but also up, down, left and right. you choose which way the blocks start moving and the \"floor\" is all the walls of the square." Then, on how the direction is picked: "lets say it goes counter clockwise so down then left then up then right and after 10 blocks it reverses it", and "either the blocks decide at random which way they go (could be its own game mode tetris has many) or it cycles round left/right so its at least somewhat predictable."

Today: Blocks (`src/lib/apps/user/blocks/`) is a falling-block game on a 10×20 board with SRS rotation and kicks, a 7-bag queue, Marathon and Sprint, a seeded daily with a Game Hub rank and a `blocks daily [day]` command (`shell.ts`, `commands.ts`).

## Decisions
- **New app** `four-walls`, "Four Walls", category Games. Authors: LaxDOTexe, owner.
- **Board:** a square. Pieces spawn in the centre and travel toward one wall. Size is found by playing: the builder tries 12, 14 and 16 and keeps the one that plays best as a named constant.
- **Zones and clears:** the square is split into four triangular zones by its diagonals; each zone's floor is its wall. A line is a full row of a zone parallel to its wall (shorter toward the centre). A cleared line collapses its zone toward its wall. Game over when a new piece can't fit at the centre. Rejected: full board rows and columns (a row must cross the spawn, clears get rare and the board clogs), rings (very hard to fill, unlike the original).
- **Direction is the game's, shown in the queue.** Two modes:
  - Cycle: down, left, up, right (counter-clockwise), reversing every 10 pieces.
  - Random: each piece gets a random direction.
  Rejected: player chooses (the owner and requester settled on the game deciding), changing direction mid-flight.
- **Shared piece logic:** a `refactor:` commit first moves the tetromino shapes, kicks, the 7-bag queue and the piece colour tokens from Blocks into `$kit/games/tetromino.ts`; Blocks imports them, its tests unchanged. Rejected: a copy in the new app (two SRS tables drift).
- **Saved and shell:** best score and lines per mode in app storage (`app.four-walls.best`), `track_play` for Game Hub, a few achievements, and a seeded daily like Blocks: a `daily` prop, a Game Hub rank, `four-walls daily [day]`. The daily plays Random with a seeded RNG, so pieces and directions are the same for everyone.
- **Controls (design call):** the two arrows across the piece's direction steer it, its own arrow soft-drops, Space hard-drops, Z/X rotate, C holds. Phone: Blocks' on-screen pad, the steer buttons relabelled for the direction, plus swipes.

## Key takeaways
- Same pieces, new gravity: the novelty is four floors and a direction the player has to plan around.

## Action items
- [x] ADR-084, one app-builder agent: the kit refactor commit first, then the app; `docs/apps/four-walls.md` for zones, clears and the direction cycle.

## Next session topics
- A mode where the player picks the direction (the original ask).
- Board size and speed tuning after play.
