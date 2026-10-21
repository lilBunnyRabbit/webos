import { shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";
import type { Stroke } from "./ink";
import { WORDS, type Word } from "./words";

export const ROUND_WORDS = 6;
export const WORD_MS = 20_000;
export const IDLE_MS = 700;
export const MAX_GUESSES = 3;

export const GuessesSchema = z.object({ guesses: z.array(z.enum(WORDS)).max(MAX_GUESSES) });
export type Guesses = z.infer<typeof GuessesSchema>;

export const Status = {
  READY: "ready",
  PROMPT: "prompt",
  DRAWING: "drawing",
  /** Time ran out with a guess still out: it counts if it comes back right. */
  WAITING: "waiting",
  OVER: "over",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Outcome = {
  RECOGNISED: "recognised",
  MISSED: "missed",
  SKIPPED: "skipped",
} as const;
export type Outcome = (typeof Outcome)[keyof typeof Outcome];

export interface WordResult {
  word: Word;
  outcome: Outcome;
  /** Time on the clock when the winning snapshot was sent; `null` unless recognised. */
  ms: number | null;
  strokes: Stroke[];
  guesses: Word[];
}

export interface Score {
  recognised: number;
  ms: number;
}

export const ScoreSchema = z.object({ recognised: z.number().int().min(0), ms: z.number().min(0) });

export function pick_words(rng: Rng, count = ROUND_WORDS): Word[] {
  return shuffle([...WORDS], rng).slice(0, count);
}

export function is_hit(guesses: readonly Word[], target: Word): boolean {
  return guesses.includes(target);
}

export function score_of(results: readonly WordResult[]): Score {
  let recognised = 0;
  let ms = 0;
  for (const result of results) {
    if (result.outcome !== Outcome.RECOGNISED) continue;
    recognised++;
    ms += result.ms ?? 0;
  }
  return { recognised, ms };
}

export function is_better(score: Score, best: Score | null): boolean {
  if (!best) return true;
  if (score.recognised !== best.recognised) return score.recognised > best.recognised;
  return score.ms < best.ms;
}

export function describe_guesses(guesses: readonly Word[]): string {
  if (guesses.length === 0) return "No idea yet.";
  const [first, ...rest] = guesses;
  return rest.length ? `I see ${first}, or ${rest.join(", or ")}.` : `I see ${first}.`;
}
