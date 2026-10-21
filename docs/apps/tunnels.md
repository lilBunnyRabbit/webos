# Tunnels
Id `tunnels` · Source: `src/lib/apps/user/tunnels/` · [brainstorm](../brainstorm/2026-10-21_daily-puzzles.md)

## What it does

A theme-less take on LinkedIn's Wend. A small grid of letters is split, with nothing left over, into 3 to 5 hidden words. Each word is a path of orthogonally neighbouring letters, so it can bend. The player drags through letters to trace a word. A hidden word locks in with its own colour, and anything else shakes and fades. The list shows only each word's length. Hint, Undo, Reset, a timer, best times and a daily (5×5) through the `daily` prop.

Movement is orthogonal only, like Wend: guides and answer sites agree that words are traced horizontally or vertically, never diagonally ([The Word Finder](https://www.thewordfinder.com/blog/?p=1810), [LinkedIn's announcement](https://news.linkedin.com/2026/LinkedIn-AnnouncesWend), [Sportsdunia](https://www.sportsdunia.com/gaming/linkedin-wend-answers-today-19-oct-2026)). Wend boards sometimes have blocked cells; Tunnels boards are always full rectangles.

## How it works

### Sizes

| Size | Board | Words |
|------|-------|-------|
| Small | 4 rows × 5 | 3–4 |
| Medium (daily) | 5 × 5 | 4–5 |
| Large | 6 × 5 | 5 |

Every board is five letters wide, so a phone gets 70 px letters (`puzzle.ts:12`). Words are 5 to 7 letters, because those are the lengths Letterer's lists cover (see **Word data**).

### Generator

`generate(size, seed, dictionary)` (`puzzle.ts:241`) repeats one attempt from a seeded stream until an attempt passes:

1. **Lengths.** `length_sets(cells)` (`puzzle.ts:81`) lists every multiset of 3 to 5 lengths in 5..7 that sums to the board's cell count; one is picked and shuffled.
2. **Carve.** `carve` (`puzzle.ts:128`) splits the board into snake paths of those lengths by backtracking. Each path starts at the free cell with the fewest free neighbours (a corner, a pocket), so the walk never strands a cell, and grows in a random direction order. A finished path is kept only when every free region left has a size that some of the remaining lengths add up to (`regions_fit`, `puzzle.ts:102`). A step budget (4000) turns a hopeless carve into a failed attempt instead of a long search.
3. **Fill.** Each path gets a random common word of its length, no word twice, read along the path or backwards at random.
4. **Prove.** Uniqueness is checked against every word the game accepts, not only the common ones (below). Anything other than exactly one cover throws the board away.

The puzzle is the seed: saves store only the seed and what the player did.

### Uniqueness proof

The player can lock a word only where a hidden word lies, so the board must split into accepted words in exactly one way. Otherwise a player could find a valid split the game refuses.

- `traceable` (`puzzle.ts:173`) walks a trie of the full accept list from every cell along unvisited orthogonal neighbours, up to 7 letters, and records each word of 5 or more letters as a bitmask of its cells. Two spellings over the same cells are one placement, since a split is a set of cell sets.
- `count_covers` (`puzzle.ts:187`) is an exact cover search over those masks: take the lowest uncovered cell, try each placement containing it that doesn't overlap what's used, recurse. It stops at 2.

A board passes when the count is 1. The hidden words are always one cover, so 1 means it's the only one.

Measured in Node under Vitest on the dev machine (60 seeds per size, the real lists): loading and building the trie 32 ms once; a puzzle 0.1 ms median, 5.5 ms worst; 0.07 to 0.13 thrown-away boards per puzzle. A typical medium board holds 7 to 20 traceable word placements. That's why there's no worker: Nonogram's worker pattern exists, but this runs well under a frame on the main thread. `puzzle.test.ts` keeps it under 20 ms per large puzzle.

### Input

`extend(path, cell, cols, blocked)` (`game.ts:32`) is the whole path model:

- the first cell starts a path; found words' cells are blocked;
- a cell already on the path cuts it back to there (drag back to undo letters);
- a cell in the same row or column as the end joins one step at a time while the steps are free, so a fast finger that skips a letter still lands;
- anything else (diagonal, too far, past 7 letters) leaves the path as it is.

The board is one pointer target with capture (`tunnels.app.svelte:271`). While dragging, a cell counts only when the pointer is within 0.42 of a cell of its centre (`locate`, `tunnels.app.svelte:260`), so cutting a corner doesn't catch the neighbour. The drag ends on `lostpointercapture` (`tunnels.app.svelte:298`), which checks the word. Tapping works too: tap letters one by one, tap the last one again to check. Keyboard: arrows move, Space adds the letter, Enter checks, Backspace drops a letter, Escape clears.

`judge` (`game.ts:62`) locks a hidden word when the path covers exactly its cells and spells an accepted word. A real word on the wrong cells says so ("is a word, but not one of these"), a non-word says "isn't a word here", fewer than 5 letters gives the length rule.

The path logic is app-local. Hop, built in parallel, adds a drag-path helper to `$kit/games`; the two may merge into it.

### Hints, undo, reset

`hint` (`game.ts:79`) reveals the next letter of the word hints already started, else the first letter of the first unfound word in list order. Revealed letters get a dashed ring and their position on the board, and show in the word list. The last letter locks the word. Every hint counts; best times only count solves without hints. Undo takes back the last found word, Reset all of them; revealed letters stay (they were paid for).

## Word data

`words.ts` reuses Letterer's lists through `load_words` (`letterer/words.ts`), one lazy chunk per length:

| List | Words | Used for |
|------|-------|----------|
| Letterer answers, 5/6/7 letters | 2000 / 1800 / 1800 | the hidden words |
| Letterer allowed, 5/6/7 letters | answers plus 4923 / 8683 / 11749 more | the accept list: the trie for tracing and the uniqueness proof |

Both come from ENABLE (public domain); the answers are its common words, filtered by frequency for Letterer. Changing either list changes every seed's puzzle, the daily included; a save that no longer fits its puzzle is dropped (`restore`, `game.ts:142`).

## Data

| What | Where |
|------|-------|
| Puzzle in progress | `app.tunnels.game`: size, seed, found tunnel indices in order, revealed letters per tunnel, hints, elapsed ms |
| Daily in progress | `app.tunnels.daily`: `{ day, game }`, kept apart so it never replaces the regular game |
| Size | `app.tunnels.size` |
| Statistics | `app.tunnels.stats`: solved and best (no hints) per size |
| Daily result | `/var/lib/games/plays.json` through `track_play` |

Props: `daily` (`YYYY-MM-DD`), seeded with `daily_seed(day, "tunnels")`. Game Hub lists the daily because the props schema has a `daily` key. No shell commands beyond Game Hub's `games daily`.

## Dependencies & licences

None of its own. Word lists from ENABLE, public domain.

## Limits

- Words are 5 to 7 letters only. Wend uses 3 to 6; shorter or longer words need lists Letterer doesn't have.
- English only.
- The generator isn't tuned for difficulty: any board with one cover passes, so some are easy.
- Timings are from Node, not measured on a phone.

## Decisions

- [Daily puzzles brainstorm](../brainstorm/2026-10-21_daily-puzzles.md): one app per puzzle, rabbit-themed names, generated with a proven single answer against the full accept list.
