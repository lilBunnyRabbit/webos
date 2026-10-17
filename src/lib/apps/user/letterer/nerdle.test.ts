import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import { equation_error, evaluate, generate_equation, NERDLE_LENGTH } from "./nerdle";

describe("evaluate", () => {
  it("follows standard precedence", () => {
    expect(evaluate("2+3*4")).toEqual({ n: 14, d: 1 });
    expect(evaluate("20-6/3")).toEqual({ n: 18, d: 1 });
    expect(evaluate("8-2-3")).toEqual({ n: 3, d: 1 });
    expect(evaluate("12/4/3")).toEqual({ n: 1, d: 1 });
  });

  it("keeps exact fractions", () => {
    expect(evaluate("7/2*2")).toEqual({ n: 7, d: 1 });
    expect(evaluate("1/3")).toEqual({ n: 1, d: 3 });
  });

  it("rejects what doesn't parse", () => {
    expect(evaluate("")).toBeNull();
    expect(evaluate("+5")).toBeNull();
    expect(evaluate("5+")).toBeNull();
    expect(evaluate("5++5")).toBeNull();
    expect(evaluate("05+1")).toBeNull();
    expect(evaluate("4/0")).toBeNull();
  });
});

describe("equation_error", () => {
  it("accepts a true equation", () => {
    expect(equation_error("12+35=47")).toBeNull();
    expect(equation_error("3*4-2=10")).toBeNull();
    expect(equation_error("2*3=12/2")).toBeNull();
  });

  it("says why a guess can't be played", () => {
    expect(equation_error("12+35=4")).toBe("Not enough characters");
    expect(equation_error("12+35+47")).toBe("Use exactly one =");
    expect(equation_error("1=2=3=45")).toBe("Use exactly one =");
    expect(equation_error("12+35=48")).toBe("The two sides aren't equal");
    expect(equation_error("12++5=17")).toBe("That isn't a valid equation");
    expect(equation_error("=1234567")).toBe("That isn't a valid equation");
  });
});

describe("generate_equation", () => {
  it("makes 8-character true equations with a whole result", () => {
    const rng = create_rng(42);
    for (let i = 0; i < 200; i++) {
      const equation = generate_equation(rng);
      expect(equation).toHaveLength(NERDLE_LENGTH);
      expect(equation_error(equation)).toBeNull();
      expect(equation.split("=")[1]).toMatch(/^(0|[1-9]\d*)$/);
    }
  });

  it("is the same for the same seed", () => {
    expect(generate_equation(create_rng(7))).toBe(generate_equation(create_rng(7)));
  });
});
