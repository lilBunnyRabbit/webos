import { describe, expect, it } from "vitest";
import { Mark } from "./feedback";
import {
  DEFAULT_VARIANT,
  max_rows,
  Mode,
  new_game,
  NO_WORDS,
  play,
  record_game,
  record_run,
  replay,
  Status,
  type Game,
  type Variant,
} from "./game";
import type { Words } from "./words";

const answers = ["crane", "slump", "pride", "ghost", "lemon", "fjord", "quick", "brave", "dwell", "mirth"];
const extra = ["adieu", "tares", "zzzzz", "audio", "roate"];
const words: Words = { answers, allowed: new Set([...answers, ...extra]) };

const variant = (patch: Partial<Variant>): Variant => ({ ...DEFAULT_VARIANT, ...patch });

function must_play(game: Game, guess: string): Game {
  const result = play(game, guess, words);
  if (!result.ok) throw new Error(result.error);
  return result.game;
}

describe("classic", () => {
  it("picks the same answer for the same seed", () => {
    const a = new_game(variant({}), 12, words);
    const b = new_game(variant({}), 12, words);
    expect(a.boards[0].answer).toBe(b.boards[0].answer);
    expect(answers).toContain(a.boards[0].answer);
  });

  it("wins on the answer and loses after six misses", () => {
    const game = new_game(variant({}), 3, words);
    const answer = game.boards[0].answer!;
    expect(must_play(game, answer).status).toBe(Status.WON);

    const miss = answers.find((word) => word !== answer)!;
    let lost = game;
    for (let i = 0; i < 6; i++) lost = must_play(lost, miss);
    expect(lost.status).toBe(Status.LOST);
    expect(play(lost, answer, words).ok).toBe(false);
  });

  it("rejects short and unknown words", () => {
    const game = new_game(variant({}), 3, words);
    expect(play(game, "cran", words)).toEqual({ ok: false, error: "Not enough letters" });
    expect(play(game, "qqqqq", words)).toEqual({ ok: false, error: "Not in word list" });
  });

  it("enforces hard mode", () => {
    let game = new_game(variant({ hard: true }), 0, words);
    game = { ...game, boards: [{ answer: "crane", rows: [], solved: false }] };
    game = must_play(game, "brave");
    expect(play(game, "slump", words)).toEqual({ ok: false, error: "2nd letter must be R" });
  });
});

describe("multi", () => {
  it("plays one guess on every board and allows five more rows than boards", () => {
    const quordle = variant({ mode: Mode.MULTI, boards: 4 });
    const game = new_game(quordle, 9, words);
    expect(game.boards).toHaveLength(4);
    expect(new Set(game.boards.map((board) => board.answer)).size).toBe(4);
    expect(max_rows(quordle)).toBe(9);

    const first = game.boards[0].answer!;
    const after = must_play(game, first);
    expect(after.boards[0].solved).toBe(true);
    expect(after.boards.every((board) => board.rows.length === 1)).toBe(true);

    const next = must_play(after, game.boards[1].answer!);
    expect(next.boards[0].rows).toHaveLength(1);
    expect(next.boards[1].rows).toHaveLength(2);
  });

  it("is won when every board is solved", () => {
    let game = new_game(variant({ mode: Mode.MULTI, boards: 2 }), 5, words);
    for (const board of game.boards) game = must_play(game, board.answer!);
    expect(game.status).toBe(Status.WON);
  });

  it("ignores hard mode", () => {
    let game = new_game(variant({ mode: Mode.MULTI, boards: 2, hard: true }), 5, words);
    game = must_play(game, "zzzzz");
    expect(play(game, "adieu", words).ok).toBe(true);
  });
});

describe("absurdle", () => {
  it("narrows the words and wins once only the guess is left", () => {
    let game = new_game(variant({ mode: Mode.ABSURDLE }), 0, words);
    expect(game.candidates).toEqual(answers);
    expect(max_rows(game.variant)).toBeNull();
    for (let i = 0; i < 20 && game.status === Status.PLAYING; i++) {
      game = must_play(game, game.candidates[0]);
    }
    expect(game.status).toBe(Status.WON);
    expect(game.boards[0].answer).toBe(game.guesses.at(-1));
  });
});

describe("survival", () => {
  it("moves to a new word with the solved one as its first row", () => {
    const game = new_game(variant({ mode: Mode.SURVIVAL }), 4, words);
    const first = game.boards[0].answer!;
    const next = must_play(game, first);
    expect(next.status).toBe(Status.PLAYING);
    expect(next.round).toBe(1);
    expect(next.boards[0].answer).not.toBe(first);
    expect(next.boards[0].rows).toHaveLength(1);
    expect(next.boards[0].rows[0].guess).toBe(first);
  });

  it("ends the run when a word isn't found, counting the carried row", () => {
    let game = must_play(
      new_game(variant({ mode: Mode.SURVIVAL }), 4, words),
      new_game(variant({ mode: Mode.SURVIVAL }), 4, words).boards[0].answer!
    );
    const miss = answers.find((word) => word !== game.boards[0].answer)!;
    for (let i = 0; i < 5; i++) game = must_play(game, miss);
    expect(game.status).toBe(Status.LOST);
    expect(game.round).toBe(1);
  });
});

describe("nerdle", () => {
  it("takes true equations only", () => {
    const game = new_game(variant({ mode: Mode.NERDLE }), 1, NO_WORDS);
    expect(game.boards[0].answer).toHaveLength(8);
    expect(play(game, "12+35=48", NO_WORDS)).toEqual({ ok: false, error: "The two sides aren't equal" });
    const result = play(game, "12+35=47", NO_WORDS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.boards[0].rows[0].marks).toHaveLength(8);
  });

  it("wins on the generated equation", () => {
    const game = new_game(variant({ mode: Mode.NERDLE }), 1, NO_WORDS);
    const result = play(game, game.boards[0].answer!, NO_WORDS);
    expect(result.ok && result.game.status).toBe(Status.WON);
    if (result.ok) expect(result.game.boards[0].rows[0].marks.every((mark) => mark === Mark.CORRECT)).toBe(true);
  });
});

describe("replay", () => {
  it("rebuilds a game from its seed and guesses", () => {
    const survival = variant({ mode: Mode.SURVIVAL });
    const game = new_game(survival, 8, words);
    const played = must_play(must_play(game, game.boards[0].answer!), "adieu");
    expect(replay(survival, 8, played.guesses, words)).toEqual(played);
  });

  it("gives up on a guess the lists no longer allow", () => {
    expect(replay(variant({}), 8, ["qqqqq"], words)).toBeNull();
  });
});

describe("stats", () => {
  it("counts wins, streaks and the guess distribution", () => {
    let stats = record_game({}, "classic-5", true, 3);
    stats = record_game(stats, "classic-5", true, 3);
    expect(stats["classic-5"]).toEqual({ played: 2, won: 2, streak: 2, best_streak: 2, distribution: [0, 0, 2] });
    stats = record_game(stats, "classic-5", false, 6);
    expect(stats["classic-5"]).toMatchObject({ played: 3, won: 2, streak: 0, best_streak: 2 });
  });

  it("counts survival runs by words solved", () => {
    const stats = record_run(record_run({}, "survival-5", 4), "survival-5", 2);
    expect(stats["survival-5"]).toEqual({
      played: 2,
      won: 6,
      streak: 2,
      best_streak: 4,
      distribution: [0, 0, 1, 0, 1],
    });
  });
});
