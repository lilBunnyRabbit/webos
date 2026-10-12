import { describe, expect, it } from "vitest";
import {
  add_to_history,
  CalcError,
  complete,
  display_expression,
  EMPTY_STATE,
  evaluate,
  format_number,
  format_result,
  HISTORY_LIMIT,
  Key,
  key_from_keyboard,
  press,
  preview,
  type CalcState,
} from "./calculator";

function value_of(source: string): number {
  const result = evaluate(source);
  if (!result.ok) throw new Error(`${source}: ${result.error}`);
  return result.value;
}

function type(keys: Key[], from: CalcState = EMPTY_STATE): string {
  return keys.reduce(press, from).expression;
}

describe("evaluate", () => {
  it("respects precedence", () => {
    expect(value_of("2+3*4")).toBe(14);
    expect(value_of("10-4/2")).toBe(8);
    expect(value_of("(2+3)*4")).toBe(20);
    expect(value_of("2*(3+(4-1))")).toBe(12);
  });

  it("is left-associative", () => {
    expect(value_of("10-3-2")).toBe(5);
    expect(value_of("100/10/5")).toBe(2);
  });

  it("handles unary minus and plus", () => {
    expect(value_of("-5+3")).toBe(-2);
    expect(value_of("2*-3")).toBe(-6);
    expect(value_of("--4")).toBe(4);
    expect(value_of("-(2+3)")).toBe(-5);
    expect(value_of("+7")).toBe(7);
  });

  it("reads percent as a share of the left side for + and -", () => {
    expect(value_of("50%")).toBe(0.5);
    expect(value_of("200+10%")).toBe(220);
    expect(value_of("200-25%")).toBe(150);
    expect(value_of("200*10%")).toBe(20);
    expect(value_of("50/10%")).toBe(500);
  });

  it("multiplies implicitly before a bracket", () => {
    expect(value_of("2(3+1)")).toBe(8);
    expect(value_of("(1+1)(2+2)")).toBe(8);
  });

  it("accepts display symbols", () => {
    expect(value_of("6 × 7 − 2 ÷ 2")).toBe(41);
  });

  it("reports divide by zero", () => {
    expect(evaluate("5/0")).toEqual({ ok: false, error: CalcError.DIVIDE_BY_ZERO });
    expect(evaluate("1/(2-2)")).toEqual({ ok: false, error: CalcError.DIVIDE_BY_ZERO });
  });

  it("reports overflow", () => {
    expect(evaluate("1e+300*1e+300")).toEqual({ ok: false, error: CalcError.OUT_OF_RANGE });
  });

  it("rejects malformed input", () => {
    for (const source of ["", "2+", "(1+2", "1+2)", "1..2", "1.2.3", "*3", "abc", "."]) {
      expect(evaluate(source), source).toEqual({ ok: false, error: CalcError.SYNTAX });
    }
  });

  it("reads a carried exponent result", () => {
    expect(value_of("1e+21*2")).toBe(2e21);
    expect(value_of("1.5e-10+0")).toBe(1.5e-10);
  });
});

describe("format_number", () => {
  it("hides binary rounding noise", () => {
    expect(format_result(evaluate("0.1+0.2"))).toBe("0.3");
    expect(format_result(evaluate("1-0.9"))).toBe("0.1");
    expect(format_result(evaluate("1/3"))).toBe("0.333333333333");
  });

  it("formats zero, negatives and integers plainly", () => {
    expect(format_number(-0)).toBe("0");
    expect(format_number(-12.5)).toBe("-12.5");
    expect(format_number(123456789)).toBe("123456789");
  });

  it("uses exponent form at the extremes", () => {
    expect(format_number(1e21)).toBe("1e+21");
    expect(format_number(1.5e-12)).toBe("1.5e-12");
  });

  it("labels errors", () => {
    expect(format_result(evaluate("1/0"))).toBe("Can't divide by zero");
  });
});

describe("preview", () => {
  it("finishes an incomplete expression", () => {
    expect(complete("2*(3+")).toBe("2*(3)");
    expect(preview("2*(3+4")).toEqual({ ok: true, value: 14 });
    expect(preview("5*2+")).toEqual({ ok: true, value: 10 });
  });

  it("stays quiet for nothing worth showing", () => {
    expect(preview("")).toBeNull();
    expect(preview("42")).toBeNull();
    expect(preview("-42")).toBeNull();
    expect(preview("5+")).toBeNull();
  });

  it("shows divide by zero as it happens", () => {
    expect(preview("8/0")).toEqual({ ok: false, error: CalcError.DIVIDE_BY_ZERO });
  });
});

describe("display_expression", () => {
  it("spaces binary operators and keeps unary minus attached", () => {
    expect(display_expression("2*-3+4/2")).toBe("2 × −3 + 4 ÷ 2");
    expect(display_expression("-(1-2)")).toBe("−(1 − 2)");
    expect(display_expression("1e+21*2")).toBe("1e+21 × 2");
  });
});

describe("press", () => {
  it("builds numbers and replaces a leading zero", () => {
    expect(type(["0", "5"])).toBe("5");
    expect(type(["1", "+", "0", "7"])).toBe("1+7");
    expect(type(["1", "0", "0"])).toBe("100");
  });

  it("allows one decimal point per number", () => {
    expect(type([".", "5"])).toBe("0.5");
    expect(type(["1", ".", "2", "."])).toBe("1.2");
    expect(type(["1", ".", "2", "+", "."])).toBe("1.2+0.");
  });

  it("replaces a repeated operator but keeps a unary minus after × and ÷", () => {
    expect(type(["5", "+", "*"])).toBe("5*");
    expect(type(["5", "*", "-"])).toBe("5*-");
    expect(type(["5", "*", "-", "+"])).toBe("5+");
    expect(type(["+"])).toBe("");
    expect(type(["-", "3"])).toBe("-3");
  });

  it("balances brackets and multiplies implicitly", () => {
    expect(type([")"])).toBe("");
    expect(type(["2", "(", "3", ")"])).toBe("2*(3)");
    expect(type(["(", "3", ")", "4"])).toBe("(3)*4");
  });

  it("only puts percent after a number or bracket", () => {
    expect(type(["%"])).toBe("");
    expect(type(["5", "0", "%"])).toBe("50%");
  });

  it("negates the number being typed", () => {
    expect(type(["5", Key.NEGATE])).toBe("-5");
    expect(type(["5", Key.NEGATE, Key.NEGATE])).toBe("5");
    expect(type(["3", "+", "4", Key.NEGATE])).toBe("3+-4");
    expect(type(["3", "*", "4", Key.NEGATE])).toBe("3*-4");
    expect(type(["(", "1", "+", "2", ")", Key.NEGATE])).toBe("-(1+2)");
    expect(type([Key.NEGATE])).toBe("-");
  });

  it("starts fresh after = on a digit but carries on with an operator", () => {
    const evaluated: CalcState = { expression: "12", evaluated: true };
    expect(press(evaluated, "3").expression).toBe("3");
    expect(press(evaluated, ".").expression).toBe("0.");
    expect(press(evaluated, Key.ADD).expression).toBe("12+");
    expect(press(evaluated, Key.BACKSPACE).expression).toBe("");
  });

  it("edits and clears", () => {
    expect(type(["1", "2", Key.BACKSPACE])).toBe("1");
    expect(type(["1", "+", "2", Key.CLEAR])).toBe("");
  });
});

describe("key_from_keyboard", () => {
  it("maps the keys the calculator uses", () => {
    expect(key_from_keyboard("7")).toBe("7");
    expect(key_from_keyboard("Enter")).toBe(Key.EQUALS);
    expect(key_from_keyboard("Escape")).toBe(Key.CLEAR);
    expect(key_from_keyboard(",")).toBe(Key.DECIMAL);
    expect(key_from_keyboard("x")).toBe(Key.MULTIPLY);
    expect(key_from_keyboard("a")).toBeNull();
  });
});

describe("add_to_history", () => {
  it("prepends, skips a repeat of the newest, and caps", () => {
    const entry = { expression: "1+1", result: "2" };
    expect(add_to_history([], entry)).toEqual([entry]);
    expect(add_to_history([entry], entry)).toEqual([entry]);

    const full = Array.from({ length: HISTORY_LIMIT }, (_, i) => ({ expression: `${i}`, result: `${i}` }));
    const next = add_to_history(full, entry);
    expect(next).toHaveLength(HISTORY_LIMIT);
    expect(next[0]).toEqual(entry);
  });
});
