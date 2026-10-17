import { convert, find_unit } from "$lib/apps/user/unit-converter/convert";
import { Quantity } from "$lib/apps/user/unit-converter/units";
import { UnitSystem } from "./constants";
import { steps, type Amount, type Ingredient, type Recipe } from "./cooklang";

type Measure = typeof Quantity.MASS | typeof Quantity.VOLUME;

interface KnownUnit {
  measure: Measure;
  id: string;
  /** Written amount × multiplier = amount in `id`, for units the converter doesn't list (dl, cl). */
  multiplier: number;
  system: typeof UnitSystem.METRIC | typeof UnitSystem.IMPERIAL;
}

const known = (measure: Measure, id: string, system: KnownUnit["system"], multiplier = 1): KnownUnit => ({ measure, id, system, multiplier });

const ALIASES: Record<string, KnownUnit> = {};
function alias(unit: KnownUnit, ...names: string[]) {
  for (const name of names) ALIASES[name] = unit;
}

alias(known(Quantity.MASS, "mg", UnitSystem.METRIC), "mg", "milligram", "milligrams");
alias(known(Quantity.MASS, "g", UnitSystem.METRIC), "g", "gr", "gram", "grams", "gramme", "grammes");
alias(known(Quantity.MASS, "kg", UnitSystem.METRIC), "kg", "kilogram", "kilograms", "kilo", "kilos");
alias(known(Quantity.MASS, "oz", UnitSystem.IMPERIAL), "oz", "ounce", "ounces");
alias(known(Quantity.MASS, "lb", UnitSystem.IMPERIAL), "lb", "lbs", "pound", "pounds");
alias(known(Quantity.VOLUME, "ml", UnitSystem.METRIC), "ml", "millilitre", "millilitres", "milliliter", "milliliters");
alias(known(Quantity.VOLUME, "ml", UnitSystem.METRIC, 10), "cl", "centilitre", "centilitres", "centiliter", "centiliters");
alias(known(Quantity.VOLUME, "ml", UnitSystem.METRIC, 100), "dl", "decilitre", "decilitres", "deciliter", "deciliters");
alias(known(Quantity.VOLUME, "l", UnitSystem.METRIC), "l", "litre", "litres", "liter", "liters");
alias(known(Quantity.VOLUME, "tsp_us", UnitSystem.IMPERIAL), "tsp", "tsps", "teaspoon", "teaspoons");
alias(known(Quantity.VOLUME, "tbsp_us", UnitSystem.IMPERIAL), "tbsp", "tbsps", "tbs", "tablespoon", "tablespoons");
alias(known(Quantity.VOLUME, "floz_us", UnitSystem.IMPERIAL), "fl oz", "floz", "fluid ounce", "fluid ounces");
alias(known(Quantity.VOLUME, "cup_us", UnitSystem.IMPERIAL), "cup", "cups", "c");
alias(known(Quantity.VOLUME, "pt_us", UnitSystem.IMPERIAL), "pt", "pint", "pints");
alias(known(Quantity.VOLUME, "qt_us", UnitSystem.IMPERIAL), "qt", "quart", "quarts");
alias(known(Quantity.VOLUME, "gal_us", UnitSystem.IMPERIAL), "gal", "gallon", "gallons");

// Metric kitchens measure with spoons too; 5 ml of baking powder reads worse than 1 tsp.
const SPOONS = new Set(["tsp_us", "tbsp_us"]);

export function known_unit(unit: string): KnownUnit | null {
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  return ALIASES[key] ?? (unit === "T" ? ALIASES.tbsp : null) ?? null;
}

interface Target {
  id: string;
  label: string;
  from: number;
}

// Largest first, so 1500 g reads as 1.5 kg and 2 tbsp stays tbsp.
const TARGETS: Record<KnownUnit["system"], Record<Measure, Target[]>> = {
  metric: {
    mass: [
      { id: "kg", label: "kg", from: 1 },
      { id: "g", label: "g", from: 0 },
    ],
    volume: [
      { id: "l", label: "l", from: 1 },
      { id: "ml", label: "ml", from: 0 },
    ],
  },
  imperial: {
    mass: [
      { id: "lb", label: "lb", from: 1 },
      { id: "oz", label: "oz", from: 0 },
    ],
    volume: [
      { id: "cup_us", label: "cup", from: 0.25 },
      { id: "tbsp_us", label: "tbsp", from: 1 },
      { id: "tsp_us", label: "tsp", from: 0 },
    ],
  },
};

export function convert_amount(amount: Amount, system: UnitSystem): Amount {
  if (system === UnitSystem.WRITTEN || amount.value === null) return amount;
  const source = known_unit(amount.unit);
  if (!source || source.system === system) return amount;
  if (system === UnitSystem.METRIC && SPOONS.has(source.id)) return amount;
  const from = find_unit(source.measure, source.id)!;
  for (const target of TARGETS[system][source.measure]) {
    const value = convert(amount.value * source.multiplier, from, find_unit(source.measure, target.id)!);
    if (value >= target.from) return { ...amount, value, text: format_quantity(value, target.label), unit: target.label };
  }
  return amount;
}

export function scale_amount(amount: Amount, factor: number): Amount {
  if (amount.fixed || amount.value === null || factor === 1) return amount;
  const value = amount.value * factor;
  return { ...amount, value, text: format_quantity(value, amount.unit) };
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "1/8"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
];

/** Metric amounts read as decimals (12.5 g); counts and cups read as kitchen fractions (1 1/2 cup). */
export function format_quantity(value: number, unit: string): string {
  const metric = known_unit(unit)?.system === UnitSystem.METRIC;
  if (metric || value >= 10) {
    const digits = value >= 100 ? 0 : value >= 10 ? (metric ? 0 : 1) : value >= 1 ? 1 : 2;
    return String(Number(value.toFixed(digits)));
  }
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest < 0.02) return String(whole);
  if (rest > 0.98) return String(whole + 1);
  const fraction = FRACTIONS.find(([part]) => Math.abs(part - rest) < 0.02);
  if (fraction) return whole > 0 ? `${whole} ${fraction[1]}` : fraction[1];
  return String(Number(value.toFixed(value >= 1 ? 1 : 2)));
}

export function format_amount(amount: Amount | null): string {
  if (!amount) return "";
  return [amount.text, amount.unit].filter((part) => part !== "").join(" ");
}

export function adjust(amount: Amount | null, factor: number, system: UnitSystem): Amount | null {
  return amount && convert_amount(scale_amount(amount, factor), system);
}

export interface ListedIngredient {
  name: string;
  optional: boolean;
  amounts: Amount[];
  notes: string[];
  reference: string | null;
}

/** Same name and unit add up; a different unit or a quantity in words stays its own amount. */
export function ingredient_list(recipe: Recipe, factor = 1, system: UnitSystem = UnitSystem.WRITTEN): ListedIngredient[] {
  const list: ListedIngredient[] = [];
  const by_key = new Map<string, ListedIngredient>();
  const items = steps(recipe).flatMap((step) => step.items.filter((item): item is Ingredient => item.kind === "ingredient"));
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.optional}`;
    let entry = by_key.get(key);
    if (!entry) {
      entry = { name: item.name, optional: item.optional, amounts: [], notes: [], reference: item.reference };
      by_key.set(key, entry);
      list.push(entry);
    }
    if (item.note && !entry.notes.includes(item.note)) entry.notes.push(item.note);
    const amount = adjust(item.amount, factor, system);
    if (!amount) continue;
    const same = entry.amounts.find(
      (other) => other.value !== null && amount.value !== null && other.unit.toLowerCase() === amount.unit.toLowerCase() && other.fixed === amount.fixed
    );
    if (same && same.value !== null && amount.value !== null) {
      same.value += amount.value;
      same.text = format_quantity(same.value, same.unit);
    } else {
      entry.amounts.push({ ...amount });
    }
  }
  return list;
}

export function format_amounts(amounts: Amount[]): string {
  return amounts.map(format_amount).join(" + ");
}

const TIME_UNITS: [RegExp, number][] = [
  [/^(s|sec|secs|second|seconds)$/, 1000],
  [/^(m|min|mins|minute|minutes)$/, 60_000],
  [/^(h|hr|hrs|hour|hours)$/, 3_600_000],
  [/^(d|day|days)$/, 86_400_000],
];

/** A timer's length; minutes when the unit is missing or unknown, since that's what recipes count in. */
export function timer_ms(amount: Amount | null): number | null {
  if (!amount) return null;
  const range = /^(\d+(?:[.,]\d+)?)\s*-\s*\d/.exec(amount.text);
  const value = amount.value ?? (range ? Number(range[1].replace(",", ".")) : null);
  if (value === null || value <= 0) return null;
  const unit = amount.unit.trim().toLowerCase();
  const scale = TIME_UNITS.find(([pattern]) => pattern.test(unit))?.[1] ?? 60_000;
  return Math.round(value * scale);
}
