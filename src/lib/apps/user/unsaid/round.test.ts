import { describe, expect, test } from "vitest";
import { Category, type Card } from "./card";
import { CARDS } from "./cards";
import {
  better_best,
  CardStatus,
  current,
  deal,
  give_clue,
  guess_messages,
  GuessesSchema,
  is_over,
  next_card,
  pass,
  round_score,
  ROUND_CARDS,
  tally,
  wrong_guesses,
} from "./round";
import { stem, tokens, violations } from "./words";

const DECK: Card[] = ["horse", "moon", "pizza", "chess", "pilot", "lamp", "frog"].map((word) => ({
  word,
  banned: ["one", "two", "three", "four", "five"],
  category: Category.ANIMALS,
}));

describe("deal", () => {
  test("a seed always deals the same five cards", () => {
    const first = deal(42, DECK);
    expect(first.cards).toHaveLength(ROUND_CARDS);
    expect(deal(42, DECK).cards.map((play) => play.card.word)).toEqual(first.cards.map((play) => play.card.word));
    expect(new Set(first.cards.map((play) => play.card.word)).size).toBe(ROUND_CARDS);
  });

  test("different seeds deal different rounds", () => {
    const words = (seed: number) =>
      deal(seed, CARDS)
        .cards.map((play) => play.card.word)
        .join();
    expect(new Set([1, 2, 3, 4, 5].map(words)).size).toBe(5);
  });
});

describe("a round", () => {
  test("a hit on the second clue costs two, a pass three plus its clues", () => {
    let round = deal(7, DECK);
    const word = current(round)!.card.word;
    round = give_clue(round, "first", ["wrong"]);
    expect(current(round)!.status).toBe(CardStatus.PLAYING);
    round = give_clue(round, "second", ["nope", `The ${word}`]);
    expect(current(round)!.status).toBe(CardStatus.GUESSED);
    expect(give_clue(round, "late", ["x"])).toBe(round);
    round = next_card(round);

    round = give_clue(round, "only", ["miss"]);
    round = next_card(pass(round));
    expect(round.index).toBe(2);
    expect(round_score(round)).toBe(2 + 1 + 3);
  });

  test("a card still in play doesn't advance", () => {
    const round = deal(7, DECK);
    expect(next_card(round)).toBe(round);
  });

  test("ends after the fifth card", () => {
    let round = deal(3, DECK);
    for (let index = 0; index < ROUND_CARDS; index++) round = next_card(pass(round));
    expect(is_over(round)).toBe(true);
    expect(current(round)).toBeNull();
    expect(round_score(round)).toBe(ROUND_CARDS * 3);
  });
});

describe("tally", () => {
  test("counts guessed, passed and first-clue cards", () => {
    let round = deal(7, DECK);
    round = next_card(give_clue(round, "one", [current(round)!.card.word]));
    round = give_clue(round, "miss", ["nope"]);
    round = next_card(give_clue(round, "hit", [current(round)!.card.word]));
    round = next_card(pass(round));
    round = next_card(pass(give_clue(round, "miss", ["nope"])));
    round = next_card(give_clue(round, "one", [current(round)!.card.word]));
    expect(tally(round)).toEqual({ guessed: 3, passed: 2, first_clue: 2 });
  });

  test("a clean round has every card from its first clue", () => {
    let round = deal(3, DECK);
    for (let index = 0; index < ROUND_CARDS; index++) round = next_card(give_clue(round, "clue", [current(round)!.card.word]));
    expect(tally(round)).toEqual({ guessed: ROUND_CARDS, passed: 0, first_clue: ROUND_CARDS });
  });
});

describe("wrong_guesses", () => {
  test("once each, without hits, articles and case folded", () => {
    let round = deal(1, DECK);
    const word = current(round)!.card.word;
    round = give_clue(round, "a", ["Cat", "dog"]);
    round = give_clue(round, "b", ["the cat", "bird", word]);
    expect(wrong_guesses(current(round)!)).toEqual(["Cat", "dog", "bird"]);
  });
});

describe("guess_messages", () => {
  test("carries every clue and the wrong guesses, never the word or its banned list", () => {
    const messages = guess_messages(["It neighs", "You ride it"], ["cow", "dog"]);
    const text = messages.map((message) => message.content).join("\n");
    expect(messages[0].role).toBe("system");
    expect(messages.at(-1)!.role).toBe("user");
    expect(text).toContain("1. It neighs\n2. You ride it");
    expect(text).toContain("cow, dog");
    expect(text).not.toMatch(/horse|saddle/i);
  });

  test("no wrong-guess line before the first miss", () => {
    expect(String(guess_messages(["x"], [])[1].content)).not.toContain("Wrong guesses");
  });
});

describe("GuessesSchema", () => {
  test("one to three short guesses", () => {
    expect(GuessesSchema.safeParse({ guesses: ["horse"] }).success).toBe(true);
    expect(GuessesSchema.safeParse({ guesses: [] }).success).toBe(false);
    expect(GuessesSchema.safeParse({ guesses: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(GuessesSchema.safeParse({ guesses: ["x".repeat(31)] }).success).toBe(false);
  });
});

test("better_best keeps the lowest", () => {
  expect(better_best(null, 9)).toBe(9);
  expect(better_best(7, 9)).toBe(7);
  expect(better_best(7, 5)).toBe(5);
});

describe("the deck", () => {
  test("about 150 cards across six categories", () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(140);
    expect(new Set(CARDS.map((card) => card.category))).toEqual(new Set(Object.values(Category)));
  });

  test("every word is unique and one plain word", () => {
    const words = CARDS.map((card) => card.word);
    expect(new Set(words).size).toBe(words.length);
    for (const word of words) expect(word, word).toMatch(/^[a-z]+$/);
  });

  test("five distinct one-word banned words per card, none the word itself", () => {
    const wrong: string[] = [];
    for (const card of CARDS) {
      if (new Set(card.banned).size !== 5 || card.banned.length !== 5) wrong.push(card.word);
      for (const banned of card.banned) {
        if (tokens(banned).length !== 1 || stem(banned) === stem(card.word)) wrong.push(`${card.word}: ${banned}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("every card's word is caught by its own check", () => {
    for (const card of CARDS) expect(violations(`a ${card.word}`, card.word, card.banned), card.word).toHaveLength(1);
  });
});
