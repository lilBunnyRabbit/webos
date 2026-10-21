# Daily puzzles, LinkedIn style
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner: "i love daily puzzles that linkedin has. i want them and i want to explore similar ones to add as well" (screenshot of LinkedIn's Today's puzzles: Zip, Wend, Patches, Mini Sudoku, Tango, Queens, Crossclimb, Pinpoint).

WebOS already has 13 dailies (Sudoku, Futoshiki, Kakuro, Nurikabe, Nonogram, Word Search, Letterer, Minesweeper, Blocks, Solitaire, Sokoban, Color Games, Crack the Code), seeded by `daily_seed(day, app)` (`kit/games/time.ts:20`), with results in `/var/lib/games/plays.json`. Game Hub's Today list, streak and widget already work as LinkedIn's hub (`game-hub/hub.ts:47,100`). Each puzzle has its own generator and a `count_solutions(limit = 2)` uniqueness check; there is no shared logic-grid kit. Sudoku is hard-coded 9×9 (`sudoku/puzzle.ts:32-44`); Futoshiki has a size-generic Latin-square solver (`futoshiki/puzzle.ts:49`).

Rules confirmed from LinkedIn help and press (investigation report): Queens (one per row, column and colour region, no touching), Tango (two symbols, balanced rows and columns, no three in a row, `=`/`×` edges), Patches (Shikaku: rectangles with one clue each, area and shape), Zip (one path through the numbers in order filling every cell), Wend (launched 2026-06-08: connect adjacent letters into hidden words, every letter used once), Mini Sudoku (6×6, 2×3 boxes). Crossclimb and Pinpoint need authored trivia or categories.

## Decisions
- **Packaging: one app per puzzle**, each with a daily; Game Hub's Today is the hub. Rejected: one "Daily Puzzles" app with modes.
- **Names: rabbit-themed** (LinkedIn's names are its brands; Letterer precedent): Queens → **Hutches** (one rabbit per meadow, rabbits can't touch), Tango → **Sun & Moon**, Patches → **Plots**, Zip → **Hop**. The Wend-like game's name is proposed by its builder and confirmed by the owner. Rejected: genre names (Star Battle, Takuzu, Shikaku, Numberlink).
- **First wave:** Hutches, Sun & Moon, Plots, Hop, a 6×6 size in Sudoku, and a theme-less Wend-like word game (split the board into word paths; ENABLE list already in the repo via Letterer; uniqueness proven against the full accept list). Every puzzle generated, never authored, with exactly one solution. Rejected for now: Crossclimb and Pinpoint (authored content).
- **Kit:** small pure pieces added when their second user lands: region borders (Hutches, Plots, Sudoku 6×6), edge signs (Sun & Moon, Futoshiki), drag-path input (Hop, the word game). No generic solver framework. Rejected: a generic constraint-solver harness (each solver is domain-tuned).
- **Not chosen:** share result lines, a weekday difficulty ramp. Shell: nothing beyond `games daily`.

## Action items
- [x] Hutches (built 2026-10-21, [page](../apps/hutches.md))
- [x] Sun & Moon (built 2026-10-21, [page](../apps/sun-and-moon.md))
- [x] Hop (built 2026-10-21, [page](../apps/hop.md))
- [x] The word game, named **Tunnels** by the owner (built 2026-10-21, [page](../apps/tunnels.md))
- [ ] Plots (region kit's second user), Sudoku 6×6

## Next session topics
- Star Battle (2★) as a Hutches mode; Binairo row rule as a Sun & Moon mode.
- Hashi, Tents and Trees, Light Up, Hitori, Calcudoku, Spelling Bee-style, Letter Boxed-style.
- Share lines and a weekday ramp across dailies.
