import { known_unit } from "./amounts";
import { empty_ingredient, empty_step, normalize_quantity, row_id, type FormIngredient, type RecipeForm } from "./recipe-form";

export interface ParsedLine {
  amount: string;
  unit: string;
  name: string;
}

const KITCHEN_UNITS = [
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "clove",
  "cloves",
  "can",
  "cans",
  "tin",
  "tins",
  "handful",
  "handfuls",
  "slice",
  "slices",
  "stick",
  "sticks",
  "bunch",
  "bunches",
  "sprig",
  "sprigs",
  "piece",
  "pieces",
  "packet",
  "packets",
  "pack",
  "jar",
  "jars",
  "head",
  "heads",
  "drop",
  "drops",
  "sheet",
  "sheets",
];
const WORD_NUMBERS: Record<string, string> = { a: "1", an: "1", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", half: "1/2" };
const BULLET = /^(?:[-*•·▪◦‣⁃▢□☐✓✔]|\[\s?\])\s*/;
const NUMBERED = /^(?:step\s*)?\d+\s*[.):](?!\d)\s*|^step\s*\d+\s*[-–—:]?\s*/i;
const FRACTION_CHARS = "½⅓⅔¼¾⅕⅛⅜⅝⅞";
const QUANTITY = new RegExp(`^(\\d+\\s*[${FRACTION_CHARS}]|(?:\\d+\\s+)?\\d*[.,]?\\d+(?:\\s*/\\s*\\d+)?|[${FRACTION_CHARS}])(?:\\s*(?:-|–|to)\\s*(\\d*[.,]?\\d+(?:\\s*/\\s*\\d+)?|[${FRACTION_CHARS}]))?`, "u");
const AMOUNT_LED = new RegExp(`^(?:\\d|[${FRACTION_CHARS}])`, "u");

const Section = { INTRO: "intro", INGREDIENTS: "ingredients", STEPS: "steps", OTHER: "other" } as const;
type Section = (typeof Section)[keyof typeof Section];

function heading(line: string): Section | null {
  const text = line.replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").trim().toLowerCase();
  if (text.length > 40) return null;
  if (/^ingredients?\b/.test(text)) return Section.INGREDIENTS;
  if (/^(method|instructions?|directions?|steps|preparation|how to make( it)?)\b/.test(text)) return Section.STEPS;
  if (/^(notes?|tips?|nutrition|equipment|storage|serving suggestions?|video|faq)\b/.test(text)) return Section.OTHER;
  return null;
}

function unit_at(rest: string): string | null {
  const word = /^([\p{L}]+\.?(?:\s+oz\b)?)(?![\p{L}])/u.exec(rest);
  if (!word) return null;
  const candidate = word[1].replace(/\.$/, "");
  if (KITCHEN_UNITS.includes(candidate.toLowerCase())) return word[1];
  return known_unit(candidate) ? word[1] : null;
}

export function parse_ingredient_line(raw: string): ParsedLine {
  let line = raw.replace(BULLET, "").replace(/\s+/g, " ").trim();
  let amount = "";
  const word = /^(a|an|one|two|three|four|five|six|half)\s+(?=\S)/i.exec(line);
  const quantity = QUANTITY.exec(line);
  if (quantity) {
    amount = normalize_quantity(quantity[2] ? `${quantity[1]}-${quantity[2]}` : quantity[1]).replace(/\s*-\s*/, "-");
    line = line.slice(quantity[0].length).trim();
  } else if (word && unit_at(line.slice(word[0].length))) {
    amount = WORD_NUMBERS[word[1].toLowerCase()];
    line = line.slice(word[0].length);
  }
  let unit = "";
  const found = unit_at(line);
  if (found) {
    unit = found.replace(/\.$/, "");
    line = line.slice(found.length).trim();
  }
  line = line.replace(/^of\s+/i, "");
  const aside = /^\(([^)]*)\)\s*/.exec(line);
  if (aside) line = `${line.slice(aside[0].length)}${line.includes(",") ? "" : ","} ${aside[1]}`;
  return { amount, unit, name: line.replace(/,\s*$/, "").replace(/\s+,/g, ",").trim() };
}

function servings_in(line: string): string | null {
  const match =
    /\b(?:serves|servings|yield|yields|makes|portions)\s*[:：]?\s*(\d+(?:\s*[-–]\s*\d+)?)/i.exec(line) ?? /\b(\d+(?:\s*[-–]\s*\d+)?)\s+(?:servings|portions|people)\b/i.exec(line);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function looks_like_ingredient(line: string): boolean {
  if (NUMBERED.test(line)) return false;
  return line.length <= 80 && (BULLET.test(line) || AMOUNT_LED.test(line));
}

function clean_step(line: string): string {
  return line.replace(BULLET, "").replace(NUMBERED, "").trim();
}

export interface PastedRecipe {
  title: string;
  servings: string;
  ingredients: ParsedLine[];
  steps: string[];
}

export function parse_pasted(text: string): PastedRecipe {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const result: PastedRecipe = { title: "", servings: "", ingredients: [], steps: [] };
  if (lines.length === 0) return result;
  if (!heading(lines[0])) result.title = lines.shift()!.replace(/^#+\s*/, "");

  const has_headings = lines.some((line) => heading(line) === Section.INGREDIENTS || heading(line) === Section.STEPS);
  let section: Section = Section.INTRO;
  for (const line of lines) {
    const next = heading(line);
    if (next) {
      section = next;
      continue;
    }
    const servings = servings_in(line);
    if (servings && line.length <= 40) {
      result.servings ||= servings;
      continue;
    }
    if (section === Section.OTHER) continue;
    if (section === Section.INTRO && has_headings) continue;
    if (section === Section.INGREDIENTS) {
      if (/[:：]$/.test(line) && !AMOUNT_LED.test(line)) continue;
      result.ingredients.push(parse_ingredient_line(line));
    } else if (section === Section.INTRO && looks_like_ingredient(line)) {
      result.ingredients.push(parse_ingredient_line(line));
    } else {
      const step = clean_step(line);
      if (step !== "") result.steps.push(step);
    }
  }
  return result;
}

export function pasted_form(pasted: PastedRecipe): RecipeForm {
  const ingredients: FormIngredient[] = pasted.ingredients
    .filter((line) => line.name !== "")
    .map((line) => ({ id: row_id(), amount: line.amount, unit: line.unit, name: line.name, fixed: false }));
  return {
    title: pasted.title,
    servings: pasted.servings,
    tags: [],
    source: "",
    ingredients: ingredients.length > 0 ? ingredients : [empty_ingredient()],
    steps: pasted.steps.length > 0 ? pasted.steps.map((text) => ({ id: row_id(), text })) : [empty_step()],
    extra: {},
  };
}
