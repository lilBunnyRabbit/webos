import { daily_seed } from "$lib/core/games/time";
import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";

export const Length = { L3: "3", L4: "4", L5: "5", L6: "6", L7: "7" } as const;
export type Length = (typeof Length)[keyof typeof Length];
export const LENGTHS: readonly Length[] = Object.values(Length);
export const length_schema = z.enum(Length);

export const Status = { PLAYING: "playing", CRACKED: "cracked", DECLASSIFIED: "declassified" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Guess {
  digits: readonly number[];
  /** Digits in their right place. Misplaced ones earn nothing. */
  matches: number;
}

export interface Game {
  length: Length;
  seed: number;
  secret: readonly number[];
  case_number: string;
  guesses: readonly Guess[];
  status: Status;
}

const CASE_LETTERS = "ABCDEFGHJKLMNPRSTVWXYZ";

export function generate_secret(length: number, rng: Rng): number[] {
  return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rng).slice(0, length);
}

export function evaluate_guess(guess: readonly number[], secret: readonly number[]): number {
  return secret.reduce((matches, digit, index) => matches + Number(guess[index] === digit), 0);
}

export function case_number(rng: Rng): string {
  const letter = () => CASE_LETTERS[Math.floor(rng() * CASE_LETTERS.length)];
  return `${letter()}${letter()}-${1000 + Math.floor(rng() * 9000)}`;
}

/** The case is its seed: the code and the case number both come from it. */
export function new_game(length: Length, seed: number): Game {
  const rng = create_rng(seed);
  const secret = generate_secret(Number(length), rng);
  return { length, seed, secret, case_number: case_number(rng), guesses: [], status: Status.PLAYING };
}

export const DAILY_LENGTH = Length.L4;

export function daily_game(day: string): Game {
  return new_game(DAILY_LENGTH, daily_seed(day, "crack-the-code"));
}

export function guess(game: Game, digits: readonly number[]): Game {
  if (game.status !== Status.PLAYING || digits.length !== game.secret.length) return game;
  const matches = evaluate_guess(digits, game.secret);
  return {
    ...game,
    guesses: [...game.guesses, { digits: [...digits], matches }],
    status: matches === game.secret.length ? Status.CRACKED : Status.PLAYING,
  };
}

export function declassify(game: Game): Game {
  return game.status === Status.PLAYING ? { ...game, status: Status.DECLASSIFIED } : game;
}

export function best_matches(game: Game): number {
  return game.guesses.reduce((best, entry) => Math.max(best, entry.matches), 0);
}

export interface LengthRecord {
  solved: number;
  best: number | null;
  best_ms: number | null;
}
export type Stats = Record<Length, LengthRecord>;

const record_schema = z.object({
  solved: z.number().int().nonnegative(),
  best: z.number().int().positive().nullable(),
  best_ms: z.number().nonnegative().nullable(),
});
export const stats_schema = z.object({
  "3": record_schema,
  "4": record_schema,
  "5": record_schema,
  "6": record_schema,
  "7": record_schema,
});

export function empty_stats(): Stats {
  return Object.fromEntries(LENGTHS.map((length) => [length, { solved: 0, best: null, best_ms: null }])) as Stats;
}

export function record(stats: Stats, length: Length, guesses: number, ms: number): Stats {
  const current = stats[length];
  return {
    ...stats,
    [length]: {
      solved: current.solved + 1,
      best: current.best === null ? guesses : Math.min(current.best, guesses),
      best_ms: current.best_ms === null ? ms : Math.min(current.best_ms, ms),
    },
  };
}

/** Only the guesses: the code replays from the seed. */
export const saved_schema = z.object({
  length: length_schema,
  seed: z.number().int().nonnegative(),
  guesses: z.array(z.array(z.number().int().min(0).max(9))),
  declassified: z.boolean(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, elapsed: number): Saved {
  return {
    length: game.length,
    seed: game.seed,
    guesses: game.guesses.map((entry) => [...entry.digits]),
    declassified: game.status === Status.DECLASSIFIED,
    elapsed,
  };
}

export function restore(saved: Saved): Game | null {
  let game = new_game(saved.length, saved.seed);
  for (const digits of saved.guesses) {
    if (digits.length !== game.secret.length || game.status !== Status.PLAYING) return null;
    game = guess(game, digits);
  }
  return saved.declassified ? declassify(game) : game;
}

/** A daily case in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
