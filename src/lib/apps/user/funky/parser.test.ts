import { describe, expect, test } from "vitest";
import { parse, parse_expression } from "./parser";
import { line_col } from "./diagnostics";

const errors = (source: string) => parse(source).diagnostics.map((diagnostic) => diagnostic.message);
const text = (source: string, span: { from: number; to: number } | undefined) => (span ? source.slice(span.from, span.to) : null);

describe("parse", () => {
  test("reads every kind of declaration", () => {
    const { program, diagnostics } = parse("const A = 1\nfn f(x, y) = x + y\nvar v = f(A, 2)\noutput o = v");
    expect(diagnostics).toEqual([]);
    expect(program.decls.map((decl) => decl.kind)).toEqual(["const", "fn", "var", "output"]);
  });

  test("spans run from start to end", () => {
    const source = "var total = clamp(Pitch, -1, 1)";
    const decl = parse(source).program.decls[0];
    expect(text(source, decl.span)).toBe(source);
    expect(text(source, decl.name_span)).toBe("total");
    if (decl.kind !== "var" || decl.expr.kind !== "call") throw new Error("expected a call");
    expect(text(source, decl.expr.span)).toBe("clamp(Pitch, -1, 1)");
    expect(text(source, decl.expr.args[1].span)).toBe("-1");
  });

  test("a minus before a number is a negative literal", () => {
    const expr = parse_expression("Pitch - -3").expr;
    expect(expr).toMatchObject({ kind: "binary", op: "-", right: { kind: "number", value: -3 } });
  });

  test("single = is equality, as raw Funky Trees writes it", () => {
    expect(parse_expression("Roll = 0").expr).toMatchObject({ kind: "binary", op: "==" });
  });
});

describe("error recovery", () => {
  test("reports one error per broken declaration and keeps going", () => {
    const source = "var a = (1 +\nvar b = 2\nvar c = 3 *\noutput d = b";
    const { program, diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(2);
    expect(program.decls.map((decl) => decl.name)).toEqual(["b", "d"]);
    expect(line_col(source, diagnostics[0].span!.from).line).toBe(2);
    expect(line_col(source, diagnostics[1].span!.from).line).toBe(4);
  });

  test("lexer errors don't stop parsing", () => {
    const messages = errors('var a = 1 # 2\nvar b = "open\nvar c = @next x');
    expect(messages.some((message) => message.includes('Unexpected character "#"'))).toBe(true);
    expect(messages.some((message) => message.includes("Unterminated string"))).toBe(true);
    expect(messages.some((message) => message.includes("@next"))).toBe(true);
  });

  test("an unclosed call names the function", () => {
    expect(errors("var a = clamp(Pitch, 0, 1")[0]).toContain("to close the call to clamp");
  });

  test("a keyword where a name belongs says so", () => {
    expect(errors("var fn = 1")[0]).toContain('"fn" is a keyword');
  });

  test("junk after an expression is flagged where it starts", () => {
    const source = "var a = 1 2";
    const [diagnostic] = parse(source).diagnostics;
    expect(text(source, diagnostic.span)).toBe("2");
  });

  test("a stray token at the top level is skipped", () => {
    const { program, diagnostics } = parse(") var a = 1");
    expect(diagnostics).toHaveLength(1);
    expect(program.decls).toHaveLength(1);
  });

  test("unterminated block comment", () => {
    expect(errors("var a = 1 /* never closed")[0]).toBe("Unterminated block comment");
  });

  test("malformed exponent", () => {
    expect(errors("var a = 1e")[0]).toContain("exponent");
  });

  test("parse_expression reports trailing tokens", () => {
    const result = parse_expression("(Pitch) Roll");
    expect(result.diagnostics[0].message).toContain('"Roll"');
  });
});
