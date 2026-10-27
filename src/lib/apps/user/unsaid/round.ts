import type { AiMessage } from "$lib/core/api/services/ai/type";
import { create_rng, shuffle } from "$lib/core/utils/random";
import { z } from "zod";
import type { Card } from "./card";
import { guess_key, is_hit } from "./words";

export const ROUND_CARDS = 5;
export const PASS_COST = 3;
export const MAX_CLUE = 160;

export const GuessesSchema = z.object({ guesses: z.array(z.string().min(1).max(30)).min(1).max(3) });

export const CardStatus = { PLAYING: "playing", GUESSED: "guessed", PASSED: "passed" } as const;
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];

export interface Clue {
  text: string;
  guesses: string[];
}

export interface CardPlay {
  card: Card;
  clues: Clue[];
  status: CardStatus;
}

export interface Round {
  seed: number;
  cards: CardPlay[];
  /** The card being played; `cards.length` once the round is over. */
  index: number;
}

/** The same seed deals the same cards for as long as the deck is unchanged. */
export function deal(seed: number, deck: readonly Card[]): Round {
  const cards = shuffle([...deck], create_rng(seed)).slice(0, ROUND_CARDS);
  return { seed, cards: cards.map((card) => ({ card, clues: [], status: CardStatus.PLAYING })), index: 0 };
}

export function current(round: Round): CardPlay | null {
  return round.cards[round.index] ?? null;
}

export function is_over(round: Round): boolean {
  return round.index >= round.cards.length;
}

export function wrong_guesses(play: CardPlay): string[] {
  const seen = new Map<string, string>();
  for (const clue of play.clues) {
    for (const guess of clue.guesses) {
      const key = guess_key(guess);
      if (key && !seen.has(key) && !is_hit(guess, play.card.word)) seen.set(key, guess.trim());
    }
  }
  return [...seen.values()];
}

/**
 * What the model is sent for the next guess: every clue so far and the guesses already ruled out. Never the word or its
 * banned list, so it can't be told the answer by accident.
 */
export function guess_messages(clues: readonly string[], wrong: readonly string[]): AiMessage[] {
  const lines = ["Clues so far:", ...clues.map((clue, index) => `${index + 1}. ${clue}`)];
  if (wrong.length) lines.push("", `Wrong guesses so far (never guess these again): ${wrong.join(", ")}`);
  lines.push("", "Guess the word.");
  return [
    {
      role: "system",
      content:
        "You are playing Taboo. The other player describes one secret word with clues and never says it. Guess the word: give up to three different single-word guesses, most likely first. Never repeat a wrong guess.",
    },
    { role: "user", content: lines.join("\n") },
  ];
}

function replace(round: Round, play: CardPlay): Round {
  return { ...round, cards: round.cards.map((each, index) => (index === round.index ? play : each)) };
}

export function give_clue(round: Round, text: string, guesses: readonly string[]): Round {
  const play = current(round);
  if (!play || play.status !== CardStatus.PLAYING) return round;
  const hit = guesses.some((guess) => is_hit(guess, play.card.word));
  return replace(round, {
    ...play,
    clues: [...play.clues, { text, guesses: [...guesses] }],
    status: hit ? CardStatus.GUESSED : CardStatus.PLAYING,
  });
}

export function pass(round: Round): Round {
  const play = current(round);
  if (!play || play.status !== CardStatus.PLAYING) return round;
  return replace(round, { ...play, status: CardStatus.PASSED });
}

export function next_card(round: Round): Round {
  const play = current(round);
  if (!play || play.status === CardStatus.PLAYING) return round;
  return { ...round, index: round.index + 1 };
}

export function card_score(play: CardPlay): number {
  return play.clues.length + (play.status === CardStatus.PASSED ? PASS_COST : 0);
}

export function round_score(round: Round): number {
  return round.cards.reduce((sum, play) => sum + card_score(play), 0);
}

export interface RoundTally {
  guessed: number;
  passed: number;
  /** Cards guessed from their first clue. */
  first_clue: number;
}

export function tally(round: Round): RoundTally {
  const guessed = round.cards.filter((play) => play.status === CardStatus.GUESSED);
  return {
    guessed: guessed.length,
    passed: round.cards.filter((play) => play.status === CardStatus.PASSED).length,
    first_clue: guessed.filter((play) => play.clues.length === 1).length,
  };
}

export function better_best(best: number | null, score: number): number {
  return best === null ? score : Math.min(best, score);
}
