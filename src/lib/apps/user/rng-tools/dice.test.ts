import { describe, expect, test } from "vitest";
import { format_terms, parse_dice, roll_terms, type Term } from "./dice";

function terms_of(notation: string): Term[] {
  const result = parse_dice(notation);
  if (!result.ok) throw new Error(result.error);
  return result.terms;
}

describe("parse_dice", () => {
  test("reads NdM plus a modifier", () => {
    expect(terms_of("3d6+2")).toEqual([
      { kind: "dice", sign: 1, count: 3, sides: 6 },
      { kind: "constant", sign: 1, value: 2 },
    ]);
  });

  test("defaults the count to one and reads d% as d100", () => {
    expect(terms_of("d20")).toEqual([{ kind: "dice", sign: 1, count: 1, sides: 20 }]);
    expect(terms_of("d%")).toEqual([{ kind: "dice", sign: 1, count: 1, sides: 100 }]);
  });

  test("ignores case and spaces, and handles subtraction and several dice", () => {
    expect(terms_of(" 2D8 + 1d4 - 1 ")).toEqual([
      { kind: "dice", sign: 1, count: 2, sides: 8 },
      { kind: "dice", sign: 1, count: 1, sides: 4 },
      { kind: "constant", sign: -1, value: 1 },
    ]);
  });

  test.each([
    ["", "Type dice"],
    ["abc", "Can't read"],
    ["3d", "Can't read"],
    ["3d6++2", "Can't read"],
    ["0d6", "at least one die"],
    ["2d1", "sides"],
    ["1d1001", "sides"],
    ["101d6", "at most 100 dice"],
    ["60d6+60d6", "at most 100 dice"],
    ["5", "at least one die"],
  ])("rejects %j", (notation, message) => {
    const result = parse_dice(notation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe("roll_terms", () => {
  test("rolls each die within its sides and sums with the modifiers", () => {
    for (let i = 0; i < 200; i++) {
      const roll = roll_terms(terms_of("3d6-2"));
      const dice = roll.terms[0].rolls;
      expect(dice).toHaveLength(3);
      for (const value of dice) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
      }
      expect(roll.total).toBe(dice.reduce((sum, value) => sum + value, 0) - 2);
      expect(roll.total).toBeGreaterThanOrEqual(1);
      expect(roll.total).toBeLessThanOrEqual(16);
    }
  });

  test("uses the source for each die", () => {
    const draws = [0, 5, 1];
    let index = 0;
    const roll = roll_terms(terms_of("3d6"), () => draws[index++]);
    expect(roll.terms[0].rolls).toEqual([1, 6, 2]);
    expect(roll.total).toBe(9);
  });
});

test("format_terms spells parsed notation canonically", () => {
  expect(format_terms(terms_of("d20 -1"))).toBe("1d20 - 1");
  expect(format_terms(terms_of("-2+3d6"))).toBe("-2 + 3d6");
});
