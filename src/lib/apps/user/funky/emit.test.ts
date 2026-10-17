import { describe, expect, test } from "vitest";
import { same_expr } from "./ast";
import { debug_expression, format_dsl, format_number, print_ft, variables_xml } from "./emit";
import { parse_expression } from "./parser";

const expr = (source: string) => {
  const result = parse_expression(source);
  if (!result.expr || result.diagnostics.length) throw new Error(`${source}: ${result.diagnostics[0]?.message}`);
  return result.expr;
};

const SAMPLES = [
  "Pitch - -3",
  "-(-3)",
  "-(3)",
  "-Pitch * 2",
  "a - (b - c)",
  "(a - b) - c",
  "a / (b * c)",
  "a ? b : c ? d : e",
  "(a ? b : c) ? d : e",
  "a ? (b ? c : d) : e",
  "!(a & b) | c",
  "!a & !(b | c)",
  "clamp01(Roll = 0) * 1000000",
  "smooth(Altitude, clamp01(Pitch == 0) * 1000000)",
  'ammo("Boom 50") > 0',
  "@prev x + 1",
  "-x % 3 <= 2 != (1 >= y)",
  "PID(0, -wrap, 0.02, 0, 0.01)",
  "0.000001 * 1234567.5",
];

describe("round trip", () => {
  test.each(SAMPLES.filter((source) => !source.includes("@prev")))("parse(print_ft(x)) ≡ x for %s", (source) => {
    const original = expr(source);
    expect(same_expr(expr(print_ft(original)), original)).toBe(true);
  });

  test.each(SAMPLES)("parse(format_dsl(x)) ≡ x for %s", (source) => {
    const original = expr(source);
    expect(same_expr(expr(format_dsl(original)), original)).toBe(true);
  });
});

describe("print_ft", () => {
  test("brackets a negative literal used as an operand", () => {
    expect(print_ft(expr("Pitch - -3"))).toBe("Pitch-(-3)");
    expect(print_ft(expr("-3 * Pitch"))).toBe("(-3)*Pitch");
  });

  test("keeps a negative literal bare as an argument", () => {
    expect(print_ft(expr("clamp(x, -1, 1)"))).toBe("clamp(x,-1,1)");
  });

  test("writes equality as a single =", () => {
    expect(print_ft(expr("Roll == 0"))).toBe("Roll=0");
    expect(print_ft(expr("Roll != 0"))).toBe("Roll!=0");
  });

  test("@prev reads the bare name", () => {
    expect(print_ft(expr("@prev state"))).toBe("state");
  });
});

describe("format_number", () => {
  test("never scientific", () => {
    expect(format_number(1e6)).toBe("1000000");
    expect(format_number(1e21)).toBe("1000000000000000000000");
    expect(format_number(1e-7)).toBe("0.0000001");
    expect(format_number(-0)).toBe("0");
    expect(format_number(0.1 + 0.2)).toBe("0.30000000000000004");
  });
});

describe("xml", () => {
  test("matches the setter format of a real save", () => {
    expect(variables_xml([{ name: "AoA", ft: "abs(AoA)>110?1:0" }])).toBe(
      '<Variables>\n  <Setter variable="AoA" function="abs(AoA)&gt;110?1:0" priority="0" />\n</Variables>'
    );
    expect(variables_xml([])).toBe("<Variables />");
  });

  test("escapes &, <, > and quotes", () => {
    expect(variables_xml([{ name: "a", ft: '(IAS<70)&(x>0)|ammo("B")' }])).toContain('function="(IAS&lt;70)&amp;(x&gt;0)|ammo(&quot;B&quot;)"');
  });
});

describe("debug_expression", () => {
  test("quotes inside become ##", () => {
    expect(debug_expression('ammo("Boom 50")')).toBe('DebugExpression "ammo(##Boom 50##)"');
  });
});
