import type { BinaryOp, Expr } from "./ast";

/** The game's number token is `[0-9.]+`: no exponent, so 1e6 has to be written out. */
export function format_number(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  let text = String(value);
  if (/e/i.test(text)) {
    text = Math.abs(value) >= 1 ? BigInt(Math.round(value)).toString() : value.toFixed(20);
  }
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

const needs_brackets = (expr: Expr) => expr.kind === "binary" || expr.kind === "unary" || expr.kind === "ternary" || (expr.kind === "number" && expr.value < 0);

/** Every compound operand is bracketed, so the game's precedence never decides the meaning. */
function operand(expr: Expr): string {
  return needs_brackets(expr) ? `(${print_ft(expr)})` : print_ft(expr);
}

const FT_OPERATOR: Partial<Record<BinaryOp, string>> = { "==": "=" };

/** Raw Funky Trees, as pasted into a setter or a part field. Equality is `=`: the game has no `==` token. */
export function print_ft(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return format_number(expr.value);
    case "bool":
      return String(expr.value);
    case "string":
      return `"${expr.value}"`;
    case "ident":
    case "prev":
      return expr.name;
    case "unary":
      return expr.op === "-" && expr.arg.kind === "number" ? `-(${print_ft(expr.arg)})` : `${expr.op}${operand(expr.arg)}`;
    case "binary":
      return `${operand(expr.left)}${FT_OPERATOR[expr.op] ?? expr.op}${operand(expr.right)}`;
    case "ternary":
      return `${operand(expr.cond)}?${operand(expr.then)}:${operand(expr.otherwise)}`;
    case "call":
      return `${expr.callee}(${expr.args.map(print_ft).join(",")})`;
  }
}

const PRECEDENCE: Record<BinaryOp, number> = {
  "|": 1,
  "&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};
const UNARY = 7;
const TERNARY = 0;

function level(expr: Expr): number {
  if (expr.kind === "ternary") return TERNARY;
  if (expr.kind === "binary") return PRECEDENCE[expr.op];
  if (expr.kind === "unary" || (expr.kind === "number" && expr.value < 0)) return UNARY;
  return 8;
}

function wrap(expr: Expr, min: number): string {
  const text = format_dsl(expr);
  return level(expr) < min ? `(${text})` : text;
}

export function format_dsl(expr: Expr): string {
  switch (expr.kind) {
    case "number":
      return format_number(expr.value);
    case "prev":
      return `@prev ${expr.name}`;
    case "unary":
      return expr.op === "-" && expr.arg.kind === "number" ? `-(${format_dsl(expr.arg)})` : `${expr.op}${wrap(expr.arg, UNARY + 1)}`;
    case "binary": {
      const own = PRECEDENCE[expr.op];
      if (expr.op === "&" || expr.op === "|") {
        const chained = expr.left.kind === "binary" && expr.left.op === expr.op;
        return `${chained ? format_dsl(expr.left) : wrap(expr.left, PRECEDENCE["+"])} ${expr.op} ${wrap(expr.right, PRECEDENCE["+"])}`;
      }
      return `${wrap(expr.left, own)} ${expr.op} ${wrap(expr.right, own + 1)}`;
    }
    case "ternary":
      return `${wrap(expr.cond, TERNARY + 1)} ? ${wrap(expr.then, TERNARY + 1)} : ${format_dsl(expr.otherwise)}`;
    case "call":
      return `${expr.callee}(${expr.args.map(format_dsl).join(", ")})`;
    default:
      return print_ft(expr);
  }
}

export function escape_xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface Setter {
  name: string;
  ft: string;
}

/** The shape of a real SimplePlanes save (`<Setter variable function priority />` inside `<Variables>`). */
export function variables_xml(setters: readonly Setter[]): string {
  if (!setters.length) return "<Variables />";
  const rows = setters.map((setter) => `  <Setter variable="${escape_xml(setter.name)}" function="${escape_xml(setter.ft)}" priority="0" />`);
  return ["<Variables>", ...rows, "</Variables>"].join("\n");
}

/** The dev console's `DebugExpression "…"`: quotes inside the expression are written `##`. */
export function debug_expression(ft: string): string {
  return `DebugExpression "${ft.replace(/"/g, "##")}"`;
}
