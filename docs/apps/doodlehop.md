# Doodlehop

Id `doodlehop` · Source: `src/lib/apps/user/doodlehop/` · [ADR-061](../adrs/061-ai-games.md) · [brainstorm](../brainstorm/2026-10-21_ai-games.md)

## What it does

Quick, Draw! on the device: a round deals six words, you get 20 seconds to draw each, and Chrome's built-in model (Gemini Nano, through AiService) guesses while you draw. A right guess moves you on. The round ends with a grid of your drawings, each with the model's last guess and a Save as PNG.

Flow: Start → word card ("Draw anchor", Go) → draw (Undo, Clear, Skip) → recognised, time up or skipped → next card → after six, "Round over" over the recap grid.

The window is wrapped in the kit's `AiGate` with `prompt-image`: on phones, other browsers or Chrome without the model it shows the requirements instead of the game.

## How it works

### Drawing

`sketch-pad.svelte` is a raster `<canvas>` sized to its element times `devicePixelRatio`. Strokes are kept as points in **board units** (a 1000 × 1000 square, `ink.ts:9`), not pixels, so a resized window redraws the same drawing at the new size with the same relative line width (12 units, `ink.ts:10`).

- Pointer capture on `pointerdown`; `getCoalescedEvents()` on every move (`sketch-pad.svelte:85`), so a fast flick keeps all its samples; `touch-action: none` on the canvas.
- Each new sample paints one round-capped segment straight onto the canvas; a full redraw only happens when the stroke list, size or theme changes.
- A stroke ends on `lostpointercapture` (`sketch-pad.svelte:95`), never `pointerup`, so a pointer that leaves the window or is cancelled still ends it.
- Undo and Clear go through `$kit/utils/history` over the stroke list. Clear pushes an empty list, so Undo brings the drawing back.
- On screen the ink is the theme's `foreground` on `background-darker`; the model never sees those colours.

### When a guess is asked

`GuessQueue` (`guess-queue.ts:9`) is plain TS with fake-timer tests:

| Event | What it does |
|-------|--------------|
| Pen down | Holds any pending timer |
| Stroke ends (`changed`) | Restarts a 700 ms idle timer (`IDLE_MS`) |
| Undo or Clear (`replaced`) | Aborts the question out (it's about ink that's gone) and restarts the timer |
| Timer fires | Sends, unless a question is already out or nothing changed since the last one |
| Answer comes back | If the drawing changed meanwhile and the pen is up, sends again at once: the strokes made while it was out go into that one snapshot |

So at most one `extract()` call is in flight per window, and the model is never asked twice about the same drawing.

### Snapshot

`snapshot_frame` (`ink.ts:52`) and `render_snapshot` (`snapshot.ts:41`):

1. Bounding box of all points plus half the line width.
2. A margin of 10 % of its longest side (at least one line width).
3. Scale so the longest side lands in 384–512 px (`GUESS_SIZE`): a small doodle is blown up to 384, a big one shrunk to 512, anything between kept 1:1.
4. Line width scaled with it, clamped to 0.6–2.5 % of the output side, so a blown-up doodle keeps a pen line rather than a marker one.
5. Black lines on a white fill in an `OffscreenCanvas`, `convertToBlob` as PNG.

Black on white whatever the theme: that's what sketch datasets look like, and a dark-theme snapshot would hand the model a negative.

### The call

```ts
ai.extract(
  [
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: [{ type: "text", value: "What is this drawing?" }, { type: "image", value: png }] },
  ],
  z.object({ guesses: z.array(z.enum(WORDS)).max(3) }),
  { signal }
);
```

- The target word is never sent. The enum is the whole word list (`words.ts`, 184 hand-picked concrete nouns), so the model can only answer with a word the game knows, and no alias table is needed.
- `extract()` opens a fresh `prompt-image` session per call with `expectedInputs` and `responseConstraint`, and destroys it after, so guessing never evicts another window's kept chat (ADR-061).
- Matching is in code: a hit is the target anywhere in the up to three guesses (`is_hit`, `game.ts:51`). The live line under the board reads the guesses out ("I see cat, or dog.").
- A rejected call (no model, the browser refusing the picture, a schema mismatch) shows under the board and as one error toast per distinct message per round. There is no fallback to `prompt()`.

### Clock and scoring

- The 20 s clock is a `Stopwatch` (`$kit/games`): it only runs while the window is visible.
- Time up with a question out: the word waits ("Time's up. Waiting for the last guess…") and the answer still counts, at the time its snapshot was taken (`time_up`, `doodle-game.svelte:140`). A stroke still in its 700 ms idle when time runs out is not sent.
- Score = words recognised; ties go to the smaller sum of recognition times (time on the clock when the winning snapshot was sent), `score_of` and `is_better` in `game.ts`.

### Recap and saving

Each word keeps its strokes and the last guesses. The recap draws them with the same pad (read-only). Save renders the strokes again at 1024 px (`SAVE_SIZE`), black on white, and goes through the window's save picker as `{word}.png`, starting in `~/Pictures` when that folder exists, else `~/` (`save`, `doodle-game.svelte:203`).

## Data

| What | Where |
|------|-------|
| Best round `{ recognised, ms }` | `app.doodlehop.best` (app storage) |
| Play time | `/var/lib/games/plays.json` through `track_play` |
| Saved drawings | Wherever the user picks, PNG |

No props, no shell commands, no daily. Drawings aren't kept after the window closes unless saved.

## Dependencies & licences

None beyond the repo's. The word list is our own pick of concrete nouns (some overlap with Quick, Draw!'s category names, names only).

## Limits

- **Image plus `responseConstraint` is unverified on a machine with the model.** Built and checked against a stubbed `LanguageModel`; the real Chrome Prompt API with pictures and a schema has not been run.
- Latency per guess is unmeasured: every guess creates and destroys a session.
- The first guess on a machine with `download` availability starts the model download inside a 20 s word; the gate's notice says so, but the clock keeps running.
- A 184-word enum makes a large JSON Schema in every call; its token cost is unmeasured.

## Decisions

- [ADR-061](../adrs/061-ai-games.md): code owns the rules, the kit gate, `extract()` with pictures, phones, no dailies, no shell.
- [Brainstorm 2026-10-21](../brainstorm/2026-10-21_ai-games.md), sections Doodlehop, Image call, Phones, AI availability gate, Dailies, Shell, Names.
