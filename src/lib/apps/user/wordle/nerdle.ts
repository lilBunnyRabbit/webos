import { pick, random_int, type Rng } from "$lib/core/utils/random";

export const NERDLE_LENGTH = 8;
export const NERDLE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "+", "-", "*", "/", "="] as const;
const OPERATORS = ["+", "-", "*", "/"] as const;
type Operator = (typeof OPERATORS)[number];

interface Fraction {
  n: number;
  d: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

function fraction(n: number, d: number): Fraction {
  const sign = d < 0 ? -1 : 1;
  const divisor = gcd(n, d) || 1;
  return { n: (sign * n) / divisor, d: (sign * d) / divisor };
}

function apply(a: Fraction, operator: Operator, b: Fraction): Fraction | null {
  switch (operator) {
    case "+":
      return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-":
      return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*":
      return fraction(a.n * b.n, a.d * b.d);
    case "/":
      return b.n === 0 ? null : fraction(a.n * b.d, a.d * b.n);
  }
}

const is_operator = (char: string): char is Operator => (OPERATORS as readonly string[]).includes(char);

// Exact fractions, so 7/2*2 is 7 and never 6.999…; numbers have no sign and no leading zero, like Nerdle's.
export function evaluate(expression: string): Fraction | null {
  const tokens = expression.match(/\d+|[+\-*/]|./g) ?? [];
  if (tokens.length % 2 === 0) return null;
  const terms: { operator: "+" | "-"; value: Fraction }[] = [];
  let current: Fraction | null = null;
  let pending: "+" | "-" = "+";
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (i % 2 === 0) {
      if (!/^\d+$/.test(token) || (token.length > 1 && token[0] === "0")) return null;
      const value = fraction(Number(token), 1);
      const operator = tokens[i - 1];
      if (current && (operator === "*" || operator === "/")) current = apply(current, operator, value);
      else current = value;
      if (!current) return null;
    } else {
      if (!is_operator(token)) return null;
      if (token === "+" || token === "-") {
        terms.push({ operator: pending, value: current! });
        pending = token;
        current = null;
      }
    }
  }
  terms.push({ operator: pending, value: current! });
  return terms.reduce<Fraction>((sum, term) => apply(sum, term.operator, term.value)!, fraction(0, 1));
}

export function equation_error(guess: string): string | null {
  if (guess.length !== NERDLE_LENGTH) return "Not enough characters";
  const sides = guess.split("=");
  if (sides.length !== 2) return "Use exactly one =";
  const [left, right] = sides.map(evaluate);
  if (!left || !right) return "That isn't a valid equation";
  if (left.n !== right.n || left.d !== right.d) return "The two sides aren't equal";
  return null;
}

export function generate_equation(rng: Rng): string {
  for (;;) {
    const operators = Array.from({ length: rng() < 0.55 ? 1 : 2 }, () => pick(OPERATORS, rng));
    const numbers = Array.from({ length: operators.length + 1 }, () => {
      const digits = random_int(1, operators.length === 1 ? 3 : 2, rng);
      return random_int(digits === 1 ? 1 : 10 ** (digits - 1), 10 ** digits - 1, rng);
    });
    const left = numbers.reduce(
      (text, number, i) => (i === 0 ? String(number) : `${text}${operators[i - 1]}${number}`),
      ""
    );
    const value = evaluate(left);
    if (!value || value.d !== 1 || value.n < 0) continue;
    const equation = `${left}=${value.n}`;
    if (equation.length === NERDLE_LENGTH) return equation;
  }
}
