import { z } from "zod";
import { crypto_source, random_int, type RandomSource } from "./random";

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;
const MAX_TERMS = 10;
const MAX_CONSTANT = 1_000_000;

export const DICE_PRESETS = ["d4", "d6", "d8", "d10", "d12", "d20", "d100", "2d6", "3d6", "4d6"] as const;

export interface DiceTerm {
  kind: "dice";
  sign: 1 | -1;
  count: number;
  sides: number;
}

export interface ConstantTerm {
  kind: "constant";
  sign: 1 | -1;
  value: number;
}

export type Term = DiceTerm | ConstantTerm;

export type ParseResult = { ok: true; terms: Term[] } | { ok: false; error: string };

export interface TermRoll {
  term: Term;
  rolls: number[];
  subtotal: number;
}

export interface DiceRoll {
  id: string;
  notation: string;
  terms: TermRoll[];
  total: number;
}

const sign_schema = z.union([z.literal(1), z.literal(-1)]);

export const dice_roll_schema = z.object({
  id: z.string(),
  notation: z.string(),
  terms: z.array(
    z.object({
      term: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("dice"), sign: sign_schema, count: z.number(), sides: z.number() }),
        z.object({ kind: z.literal("constant"), sign: sign_schema, value: z.number() }),
      ]),
      rolls: z.array(z.number()),
      subtotal: z.number(),
    })
  ),
  total: z.number(),
});

const TERM = /^(\d*)d(\d+|%)$|^(\d+)$/;

export function parse_dice(notation: string): ParseResult {
  const compact = notation.toLowerCase().replace(/\s+/g, "");
  if (!compact) return { ok: false, error: "Type dice like 3d6+2." };

  const parts = compact.match(/[+-]?[^+-]+/g);
  if (!parts || parts.join("") !== compact) return { ok: false, error: `Can't read "${notation.trim()}".` };
  if (parts.length > MAX_TERMS) return { ok: false, error: `Use at most ${MAX_TERMS} terms.` };

  const terms: Term[] = [];
  let dice_count = 0;
  for (const part of parts) {
    const sign: 1 | -1 = part.startsWith("-") ? -1 : 1;
    const body = part.replace(/^[+-]/, "");
    const match = TERM.exec(body);
    if (!match) return { ok: false, error: `Can't read "${body}".` };

    if (match[3] !== undefined) {
      const value = Number(match[3]);
      if (value > MAX_CONSTANT) return { ok: false, error: "Numbers above 1,000,000 aren't supported." };
      terms.push({ kind: "constant", sign, value });
      continue;
    }

    const count = match[1] === "" ? 1 : Number(match[1]);
    const sides = match[2] === "%" ? 100 : Number(match[2]);
    if (count < 1) return { ok: false, error: "Roll at least one die." };
    if (sides < 2 || sides > MAX_SIDES) return { ok: false, error: `Dice need 2 to ${MAX_SIDES} sides.` };
    dice_count += count;
    if (dice_count > MAX_DICE) return { ok: false, error: `Roll at most ${MAX_DICE} dice at once.` };
    terms.push({ kind: "dice", sign, count, sides });
  }

  if (!terms.some((term) => term.kind === "dice")) return { ok: false, error: "Add at least one die, like d6." };
  return { ok: true, terms };
}

export function roll_terms(terms: Term[], source: RandomSource = crypto_source): DiceRoll {
  const rolled = terms.map((term): TermRoll => {
    if (term.kind === "constant") return { term, rolls: [], subtotal: term.sign * term.value };
    const rolls = Array.from({ length: term.count }, () => random_int(1, term.sides, source));
    return { term, rolls, subtotal: term.sign * rolls.reduce((sum, value) => sum + value, 0) };
  });
  return {
    id: crypto.randomUUID(),
    notation: format_terms(terms),
    terms: rolled,
    total: rolled.reduce((sum, term) => sum + term.subtotal, 0),
  };
}

export function format_terms(terms: readonly Term[]): string {
  return terms
    .map((term, index) => {
      const body = term.kind === "dice" ? `${term.count}d${term.sides}` : String(term.value);
      if (index === 0) return term.sign < 0 ? `-${body}` : body;
      return `${term.sign < 0 ? "-" : "+"} ${body}`;
    })
    .join(" ");
}
