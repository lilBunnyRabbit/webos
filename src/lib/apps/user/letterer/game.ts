import { daily_seed } from "$kit/games/time";
import { create_rng, pick, shuffle } from "$lib/core/utils/random";
import { z } from "zod";
import { absurdle_step, hard_mode_error, score, solved, type Row } from "./feedback";
import { equation_error, generate_equation, NERDLE_LENGTH } from "./nerdle";
import type { Length, Words } from "./words";

export const Mode = {
  CLASSIC: "classic",
  MULTI: "multi",
  SURVIVAL: "survival",
  ABSURDLE: "absurdle",
  NERDLE: "nerdle",
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const BOARD_COUNTS = [2, 4, 8] as const;
export type BoardCount = (typeof BOARD_COUNTS)[number];

export const Status = { PLAYING: "playing", WON: "won", LOST: "lost" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Variant {
  mode: Mode;
  length: Length;
  boards: BoardCount;
  hard: boolean;
}

export interface Board {
  answer: string | null;
  rows: readonly Row[];
  solved: boolean;
}

export interface Game {
  variant: Variant;
  seed: number;
  boards: readonly Board[];
  /** What the player typed, in order: replayed on the seed, it rebuilds the game. */
  guesses: readonly string[];
  candidates: readonly string[];
  round: number;
  status: Status;
}

export const NO_WORDS: Words = { answers: [], allowed: new Set() };

export const DEFAULT_VARIANT: Variant = { mode: Mode.CLASSIC, length: 5, boards: 4, hard: false };

export function uses_words(variant: Variant): boolean {
  return variant.mode !== Mode.NERDLE;
}

export function word_length(variant: Variant): number {
  return variant.mode === Mode.NERDLE ? NERDLE_LENGTH : variant.length;
}

export function max_rows(variant: Variant): number | null {
  if (variant.mode === Mode.ABSURDLE) return null;
  if (variant.mode === Mode.MULTI) return 5 + variant.boards;
  return 6;
}

// Hints from one board would have to be honoured on boards they say nothing about, so Multi plays without it.
export function hard_allowed(variant: Variant): boolean {
  return variant.mode !== Mode.MULTI;
}

export function survival_answer(words: Words, seed: number, round: number, previous: string | null = null): string {
  const rng = create_rng((seed + Math.imul(round + 1, 0x9e3779b9)) >>> 0);
  for (;;) {
    const answer = pick(words.answers, rng);
    if (answer !== previous || words.answers.length < 2) return answer;
  }
}

const board = (answer: string | null, rows: readonly Row[] = []): Board => ({ answer, rows, solved: false });

export function new_game(variant: Variant, seed: number, words: Words): Game {
  const game: Game = { variant, seed, boards: [], guesses: [], candidates: [], round: 0, status: Status.PLAYING };
  const rng = create_rng(seed);
  switch (variant.mode) {
    case Mode.CLASSIC:
      return { ...game, boards: [board(pick(words.answers, rng))] };
    case Mode.MULTI: {
      const order = shuffle(
        words.answers.map((_, i) => i),
        rng
      );
      return { ...game, boards: order.slice(0, variant.boards).map((i) => board(words.answers[i])) };
    }
    case Mode.SURVIVAL:
      return { ...game, boards: [board(survival_answer(words, seed, 0))] };
    case Mode.ABSURDLE:
      return { ...game, boards: [board(null)], candidates: words.answers };
    case Mode.NERDLE:
      return { ...game, boards: [board(generate_equation(rng))] };
  }
}

export function guess_error(game: Game, guess: string, words: Words): string | null {
  const { variant } = game;
  if (variant.mode === Mode.NERDLE) {
    const error = equation_error(guess);
    if (error) return error;
  } else {
    if (guess.length < variant.length) return "Not enough letters";
    if (!words.allowed.has(guess)) return "Not in word list";
  }
  if (variant.hard && hard_allowed(variant)) return hard_mode_error(guess, game.boards[0].rows);
  return null;
}

export type PlayResult = { ok: true; game: Game } | { ok: false; error: string };

export function play(game: Game, guess: string, words: Words): PlayResult {
  if (game.status !== Status.PLAYING) return { ok: false, error: "This game is over" };
  const error = guess_error(game, guess, words);
  if (error) return { ok: false, error };

  const guesses = [...game.guesses, guess];
  const limit = max_rows(game.variant);

  if (game.variant.mode === Mode.ABSURDLE) {
    const step = absurdle_step(game.candidates, guess);
    const won = solved(step.marks);
    const rows = [...game.boards[0].rows, { guess, marks: step.marks }];
    return {
      ok: true,
      game: {
        ...game,
        guesses,
        candidates: step.candidates,
        boards: [{ answer: won ? guess : step.candidates.length === 1 ? step.candidates[0] : null, rows, solved: won }],
        status: won ? Status.WON : Status.PLAYING,
      },
    };
  }

  const boards = game.boards.map((each) => {
    if (each.solved || each.answer === null) return each;
    const marks = score(guess, each.answer);
    return { ...each, rows: [...each.rows, { guess, marks }], solved: solved(marks) };
  });

  if (game.variant.mode === Mode.SURVIVAL && boards[0].solved) {
    const previous = boards[0].answer!;
    const next = survival_answer(words, game.seed, game.round + 1, previous);
    const carried = { guess: previous, marks: score(previous, next) };
    return { ok: true, game: { ...game, guesses, round: game.round + 1, boards: [board(next, [carried])] } };
  }

  const all_solved = boards.every((each) => each.solved);
  const out_of_rows = limit !== null && boards.some((each) => !each.solved && each.rows.length >= limit);
  const status = all_solved ? Status.WON : out_of_rows ? Status.LOST : Status.PLAYING;
  return { ok: true, game: { ...game, guesses, boards, status } };
}

// `null` when a list update makes a saved guess unplayable.
export function replay(variant: Variant, seed: number, guesses: readonly string[], words: Words): Game | null {
  let game = new_game(variant, seed, words);
  for (const guess of guesses) {
    const result = play(game, guess, words);
    if (!result.ok) return null;
    game = result.game;
  }
  return game;
}

export const DAILY_VARIANT: Omit<Variant, "hard"> = { mode: Mode.CLASSIC, length: 5, boards: 4 };

export function daily_seed_of(day: string): number {
  return daily_seed(day, "letterer");
}

export function variant_key(variant: Variant): string {
  if (variant.mode === Mode.NERDLE) return Mode.NERDLE;
  if (variant.mode === Mode.MULTI) return `multi-${variant.boards}-${variant.length}`;
  return `${variant.mode}-${variant.length}`;
}

const count = z.number().int().nonnegative();
const record_schema = z.object({
  played: count,
  won: count,
  streak: count,
  best_streak: count,
  /** Wins by guesses used (index 0 = one guess); Survival counts runs by words solved instead. */
  distribution: z.array(count),
});
export type StatRecord = z.infer<typeof record_schema>;
export const stats_schema = z.record(z.string(), record_schema);
export type Stats = z.infer<typeof stats_schema>;

export const EMPTY_RECORD: StatRecord = { played: 0, won: 0, streak: 0, best_streak: 0, distribution: [] };

function bump(distribution: readonly number[], index: number): number[] {
  const next = [...distribution];
  while (next.length <= index) next.push(0);
  next[index] += 1;
  return next;
}

export function record_game(stats: Stats, key: string, won: boolean, guesses: number): Stats {
  const current = stats[key] ?? EMPTY_RECORD;
  const streak = won ? current.streak + 1 : 0;
  return {
    ...stats,
    [key]: {
      played: current.played + 1,
      won: current.won + (won ? 1 : 0),
      streak,
      best_streak: Math.max(current.best_streak, streak),
      distribution: won ? bump(current.distribution, guesses - 1) : current.distribution,
    },
  };
}

/** A Survival run: `won` adds up words solved, the streak is the last run's length and the best the longest. */
export function record_run(stats: Stats, key: string, words: number): Stats {
  const current = stats[key] ?? EMPTY_RECORD;
  return {
    ...stats,
    [key]: {
      played: current.played + 1,
      won: current.won + words,
      streak: words,
      best_streak: Math.max(current.best_streak, words),
      distribution: bump(current.distribution, words),
    },
  };
}

export const variant_schema = z.object({
  mode: z.enum(Mode),
  length: z.union([z.literal(5), z.literal(6), z.literal(7)]),
  boards: z.union([z.literal(2), z.literal(4), z.literal(8)]),
  hard: z.boolean(),
});

export const saved_schema = z.object({
  variant: variant_schema,
  seed: z.number().int().nonnegative(),
  guesses: z.array(z.string()),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
