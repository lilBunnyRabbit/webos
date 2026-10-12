import { z } from "zod";

export const CalcError = {
  SYNTAX: "syntax",
  DIVIDE_BY_ZERO: "divide_by_zero",
  OUT_OF_RANGE: "out_of_range",
} as const;
export type CalcError = (typeof CalcError)[keyof typeof CalcError];

export const CALC_ERROR_LABELS: Record<CalcError, string> = {
  syntax: "Incomplete expression",
  divide_by_zero: "Can't divide by zero",
  out_of_range: "Number too large",
};

export type CalcResult = { ok: true; value: number } | { ok: false; error: CalcError };

type Operator = "+" | "-" | "*" | "/";

type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: Operator }
  | { kind: "percent" }
  | { kind: "open" }
  | { kind: "close" };

class EvalError extends Error {
  constructor(readonly code: CalcError) {
    super(code);
  }
}

const OPERATOR_ALIASES: Record<string, Operator> = {
  "+": "+",
  "-": "-",
  "−": "-",
  "*": "*",
  "×": "*",
  x: "*",
  "/": "/",
  "÷": "/",
};

// Exponent form only ever comes from a formatted result (`1e+21`) carried into the next expression.
const NUMBER = /^(\d*\.?\d*)(e[+-]?\d+)?/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === " ") {
      i++;
    } else if (/[\d.]/.test(char)) {
      const text = NUMBER.exec(source.slice(i))?.[0] ?? "";
      if (text === "" || text === "." || source[i + text.length] === ".") throw new EvalError(CalcError.SYNTAX);
      tokens.push({ kind: "number", value: Number(text) });
      i += text.length;
    } else if (char in OPERATOR_ALIASES) {
      tokens.push({ kind: "operator", value: OPERATOR_ALIASES[char] });
      i++;
    } else if (char === "%") {
      tokens.push({ kind: "percent" });
      i++;
    } else if (char === "(") {
      tokens.push({ kind: "open" });
      i++;
    } else if (char === ")") {
      tokens.push({ kind: "close" });
      i++;
    } else {
      throw new EvalError(CalcError.SYNTAX);
    }
  }
  return tokens;
}

interface Operand {
  value: number;
  /** A bare `n%`, which `+` and `-` read as a share of their left side (`200 + 10%` is 220). */
  percent: boolean;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const result = this.expression().value;
    if (this.position < this.tokens.length) throw new EvalError(CalcError.SYNTAX);
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private expression(): Operand {
    let left = this.term();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "operator" || (token.value !== "+" && token.value !== "-")) return left;
      this.position++;
      const right = this.term();
      const amount = right.percent ? left.value * right.value : right.value;
      left = { value: token.value === "+" ? left.value + amount : left.value - amount, percent: false };
    }
  }

  private term(): Operand {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "operator" && (token.value === "*" || token.value === "/")) {
        this.position++;
        const right = this.unary().value;
        if (token.value === "/" && right === 0) throw new EvalError(CalcError.DIVIDE_BY_ZERO);
        left = { value: token.value === "*" ? left.value * right : left.value / right, percent: false };
      } else if (token?.kind === "open") {
        left = { value: left.value * this.unary().value, percent: false };
      } else {
        return left;
      }
    }
  }

  private unary(): Operand {
    const token = this.peek();
    if (token?.kind === "operator" && (token.value === "-" || token.value === "+")) {
      this.position++;
      const operand = this.unary();
      return token.value === "-" ? { value: -operand.value, percent: operand.percent } : operand;
    }
    return this.postfix();
  }

  private postfix(): Operand {
    let operand: Operand = { value: this.primary(), percent: false };
    while (this.peek()?.kind === "percent") {
      this.position++;
      operand = { value: operand.value / 100, percent: true };
    }
    return operand;
  }

  private primary(): number {
    const token = this.peek();
    if (token?.kind === "number") {
      this.position++;
      return token.value;
    }
    if (token?.kind === "open") {
      this.position++;
      const inner = this.expression().value;
      if (this.peek()?.kind !== "close") throw new EvalError(CalcError.SYNTAX);
      this.position++;
      return inner;
    }
    throw new EvalError(CalcError.SYNTAX);
  }
}

export function evaluate(source: string): CalcResult {
  try {
    const tokens = tokenize(source);
    if (tokens.length === 0) return { ok: false, error: CalcError.SYNTAX };
    const value = new Parser(tokens).parse();
    if (!Number.isFinite(value)) return { ok: false, error: CalcError.OUT_OF_RANGE };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof EvalError) return { ok: false, error: error.code };
    throw error;
  }
}

export function complete(source: string): string {
  let result = source.replace(/[+\-*/(.]+$/, "");
  const open = count(result, "(") - count(result, ")");
  if (open > 0) result += ")".repeat(open);
  return result;
}

/** `null` while there's nothing worth showing: empty, a lone number, or an expression that can't finish yet. */
export function preview(source: string): CalcResult | null {
  const completed = complete(source);
  if (!/[+\-*/%(]/.test(completed.replace(/^-/, "").replace(/e[+-]/, ""))) return null;
  const result = evaluate(completed);
  if (!result.ok && result.error === CalcError.SYNTAX) return null;
  return result;
}

const SIGNIFICANT_DIGITS = 12;

export function format_number(value: number): string {
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS));
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e15 || magnitude < 1e-9) {
    const [mantissa, exponent] = rounded.toExponential(SIGNIFICANT_DIGITS - 1).split("e");
    return `${mantissa.replace(/\.?0+$/, "")}e${exponent}`;
  }
  return String(rounded);
}

export function format_result(result: CalcResult): string {
  return result.ok ? format_number(result.value) : CALC_ERROR_LABELS[result.error];
}

const DISPLAY_SYMBOLS: Record<Operator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export function display_expression(source: string): string {
  let output = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      const symbol = source[i - 1] === "e" ? char : DISPLAY_SYMBOLS[char];
      output += is_unary_at(source, i) ? symbol : ` ${symbol} `;
    } else {
      output += char;
    }
  }
  return output;
}

function is_unary_at(source: string, index: number): boolean {
  if (index === 0) return true;
  return /[+\-*/(e]/.test(source[index - 1]);
}

function count(source: string, char: string): number {
  return source.split(char).length - 1;
}

export const Key = {
  CLEAR: "clear",
  BACKSPACE: "backspace",
  EQUALS: "equals",
  NEGATE: "negate",
  PERCENT: "%",
  DECIMAL: ".",
  OPEN: "(",
  CLOSE: ")",
  ADD: "+",
  SUBTRACT: "-",
  MULTIPLY: "*",
  DIVIDE: "/",
} as const;
export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type Key = (typeof Key)[keyof typeof Key] | Digit;

export interface CalcState {
  expression: string;
  /** Right after `=`: the next digit starts a new expression, an operator carries the result on. */
  evaluated: boolean;
}

export const EMPTY_STATE: CalcState = { expression: "", evaluated: false };

const BINARY = new Set(["+", "-", "*", "/"]);

/**
 * Keeps the expression something the parser can finish: no doubled binary operators, one decimal point per number, no
 * `)` without a matching `(`. `=` is left to the caller, which owns the result and the history.
 */
export function press(state: CalcState, key: Key): CalcState {
  const source = state.evaluated && /^[\d.]$/.test(key) ? "" : state.expression;
  const last = source.at(-1) ?? "";
  const next = (expression: string): CalcState => ({ expression, evaluated: false });

  switch (key) {
    case Key.CLEAR:
      return EMPTY_STATE;
    case Key.BACKSPACE:
      return next(state.evaluated ? "" : source.slice(0, -1));
    case Key.EQUALS:
      return state;
    case Key.NEGATE:
      return next(negate(source));
    case Key.DECIMAL:
      if (/\.\d*$/.test(source) || /e[+-]?\d*$/.test(source)) return state;
      if (/\d$/.test(last)) return next(source + ".");
      return next(source + (last === ")" || last === "%" ? "*0." : "0."));
    case Key.PERCENT:
      return /[\d)%]/.test(last) ? next(source + "%") : state;
    case Key.OPEN:
      return next(source + (/[\d).%]/.test(last) ? "*(" : "("));
    case Key.CLOSE: {
      const open = count(source, "(") - count(source, ")");
      return open > 0 && /[\d).%]/.test(last) ? next(source + ")") : state;
    }
    case Key.ADD:
    case Key.SUBTRACT:
    case Key.MULTIPLY:
    case Key.DIVIDE:
      return next(append_operator(source, key));
    default:
      if (/(^|[^\d.e])0$/.test(source)) return next(source.slice(0, -1) + key);
      return next(source + (last === ")" || last === "%" ? "*" : "") + key);
  }
}

function append_operator(source: string, operator: string): string {
  const last = source.at(-1) ?? "";
  if (source === "" || last === "(") return operator === "-" ? source + "-" : source;
  if (BINARY.has(last) && source.at(-2) !== "e") {
    const before = source.at(-2) ?? "";
    if (is_unary_at(source, source.length - 1)) {
      return before === "" || before === "(" ? source : source.slice(0, -2) + operator;
    }
    if (operator === "-" && (last === "*" || last === "/")) return source + "-";
    return source.slice(0, -1) + operator;
  }
  if (last === "e" || BINARY.has(last)) return source;
  return source + operator;
}

function negate(source: string): string {
  const match = /(\d*\.?\d+\.?|\d+\.)(e[+-]?\d+)?%*$|\)%*$/.exec(source);
  if (!match) return source + "-";
  let start = match.index;
  if (match[0].startsWith(")")) {
    let depth = 0;
    for (let i = match.index; i >= 0; i--) {
      if (source[i] === ")") depth++;
      else if (source[i] === "(" && --depth === 0) {
        start = i;
        break;
      }
    }
  }
  if (source[start - 1] === "-" && is_unary_at(source, start - 1)) {
    return source.slice(0, start - 1) + source.slice(start);
  }
  return source.slice(0, start) + "-" + source.slice(start);
}

export interface HistoryEntry {
  expression: string;
  result: string;
}

export const HISTORY_LIMIT = 50;

export const history_schema = z.array(z.object({ expression: z.string(), result: z.string() }));

export function add_to_history(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const newest = history[0];
  if (newest && newest.expression === entry.expression && newest.result === entry.result) return history;
  return [entry, ...history].slice(0, HISTORY_LIMIT);
}

export function key_from_keyboard(key: string): Key | null {
  if (/^\d$/.test(key)) return key as Digit;
  switch (key) {
    case ".":
    case ",":
      return Key.DECIMAL;
    case "+":
      return Key.ADD;
    case "-":
      return Key.SUBTRACT;
    case "*":
    case "x":
    case "X":
      return Key.MULTIPLY;
    case "/":
      return Key.DIVIDE;
    case "%":
      return Key.PERCENT;
    case "(":
      return Key.OPEN;
    case ")":
      return Key.CLOSE;
    case "Enter":
    case "=":
      return Key.EQUALS;
    case "Backspace":
      return Key.BACKSPACE;
    case "Escape":
    case "Delete":
      return Key.CLEAR;
    default:
      return null;
  }
}
