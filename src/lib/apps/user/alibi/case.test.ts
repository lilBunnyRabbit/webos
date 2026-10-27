import { describe, expect, test } from "vitest";
import { answered_in, contradicts, judge, lie_of, new_case, NEUTRAL_BEAT_CARDS, STATEMENTS, status, Status, suspect_prompt, wrong_count } from "./case";
import { TEMPLATES } from "./templates";

const SEEDS = Array.from({ length: 2000 }, (_, index) => index * 7919 + 13);

describe("new_case", () => {
  test("the same seed gives the same case", () => {
    expect(new_case(42)).toEqual(new_case(42));
  });

  test("exactly one statement contradicts exactly one card", () => {
    for (const seed of SEEDS) {
      const game = new_case(seed);
      const pairs = game.statements.flatMap((statement) =>
        game.cards.filter((card) => contradicts(statement, card)).map((card) => [statement.id, card.id])
      );
      expect(pairs, `seed ${seed}`).toHaveLength(1);
    }
  });

  test("six statements, the lie's card, three corroborating cards and a red herring", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const game = new_case(seed);
      expect(game.statements).toHaveLength(STATEMENTS);
      expect(game.cards).toHaveLength(NEUTRAL_BEAT_CARDS + 2);
      expect(new Set(game.cards.map((card) => card.id)).size).toBe(game.cards.length);
      expect(game.cards.filter((card) => card.beat === null)).toHaveLength(1);
      expect(game.statements.filter((statement) => statement.claimed !== statement.truth)).toHaveLength(1);
    }
  });

  test("every template, and every statement of it, gets to be the lie", () => {
    const lies = new Set(SEEDS.map((seed) => new_case(seed)).map((game) => `${game.template}/${lie_of(game).statement.id}`));
    for (const template of TEMPLATES) for (const beat of template.beats) expect(lies).toContain(`${template.id}/${beat.id}`);
  });

  test("no placeholder is left unfilled", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const game = new_case(seed);
      const texts = [
        game.brief,
        game.suspect.role,
        ...game.statements.flatMap((each) => [each.claim, each.claimed]),
        ...game.cards.map((card) => card.text),
      ];
      for (const text of texts) expect(text).not.toMatch(/[{}]/);
    }
  });
});

describe("suspect_prompt", () => {
  test("states the lie as fact and never the truth, the evidence or the word lie", () => {
    for (const seed of SEEDS.slice(0, 500)) {
      const game = new_case(seed);
      const prompt = suspect_prompt(game);
      const { statement, card } = lie_of(game);
      expect(prompt).toContain(statement.claimed);
      expect(prompt).not.toContain(statement.truth);
      for (const each of game.cards) expect(prompt).not.toContain(each.text);
      expect(prompt).not.toContain(card.title);
      expect(prompt.toLowerCase()).not.toMatch(/\blie\b/);
    }
  });
});

describe("judging", () => {
  const game = new_case(7);
  const { statement, card } = lie_of(game);
  const wrong_card = game.cards.find((each) => each.id !== card.id)!;
  const wrong_statement = game.statements.find((each) => each.id !== statement.id)!;

  test("only the lie with its card is right", () => {
    expect(judge(game, { statement: statement.id, card: card.id })).toBe(true);
    expect(judge(game, { statement: statement.id, card: wrong_card.id })).toBe(false);
    expect(judge(game, { statement: wrong_statement.id, card: card.id })).toBe(false);
    expect(judge(game, { statement: "nope", card: card.id })).toBe(false);
  });

  test("two tries, then the case is lost", () => {
    const miss = { statement: wrong_statement.id, card: card.id };
    const hit = { statement: statement.id, card: card.id };
    expect(status(game, [])).toBe(Status.PLAYING);
    expect(status(game, [miss])).toBe(Status.PLAYING);
    expect(status(game, [miss, hit])).toBe(Status.SOLVED);
    expect(status(game, [miss, miss])).toBe(Status.LOST);
    expect(wrong_count(game, [miss, hit])).toBe(1);
  });
});

describe("answered_in", () => {
  test("a question still waiting for its first word doesn't count", () => {
    expect(
      answered_in([
        { role: "user", content: "Where were you?" },
        { role: "assistant", content: "Home." },
        { role: "user", content: "Alone?" },
        { role: "assistant", content: "" },
      ])
    ).toBe(1);
  });

  test("a question stopped partway through its answer counts", () => {
    expect(
      answered_in([
        { role: "user", content: "Where were you?" },
        { role: "assistant", content: "At ho", stopped: true },
      ])
    ).toBe(1);
  });
});
