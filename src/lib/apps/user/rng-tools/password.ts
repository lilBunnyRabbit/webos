import { z } from "zod";
import { crypto_source, random_int, shuffle, type Checked, type RandomSource } from "./random";

export const CharacterSet = { LOWER: "lower", UPPER: "upper", DIGITS: "digits", SYMBOLS: "symbols" } as const;
export type CharacterSet = (typeof CharacterSet)[keyof typeof CharacterSet];

export const CHARACTER_SETS: readonly CharacterSet[] = Object.values(CharacterSet);

export const CHARACTERS: Record<CharacterSet, string> = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>/?~|",
};

export const AMBIGUOUS = "Il1|O0o";

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;

export interface PasswordRequest {
  length: number;
  sets: Record<CharacterSet, boolean>;
  exclude_ambiguous: boolean;
}

export interface PasswordSettings extends Omit<PasswordRequest, "length"> {
  length: number | null;
}

type CharacterChoice = Pick<PasswordRequest, "sets" | "exclude_ambiguous">;

export const DEFAULT_PASSWORD_SETTINGS: PasswordSettings = {
  length: 20,
  sets: { lower: true, upper: true, digits: true, symbols: false },
  exclude_ambiguous: false,
};

export const password_settings_schema = z.object({
  length: z.number().int().nullable(),
  sets: z.object({ lower: z.boolean(), upper: z.boolean(), digits: z.boolean(), symbols: z.boolean() }),
  exclude_ambiguous: z.boolean(),
});

export function chosen_sets(settings: CharacterChoice): CharacterSet[] {
  return CHARACTER_SETS.filter((set) => settings.sets[set]);
}

export function set_characters(set: CharacterSet, exclude_ambiguous: boolean): string {
  const characters = CHARACTERS[set];
  return exclude_ambiguous ? [...characters].filter((char) => !AMBIGUOUS.includes(char)).join("") : characters;
}

export function pool_of(settings: CharacterChoice): string {
  return chosen_sets(settings)
    .map((set) => set_characters(set, settings.exclude_ambiguous))
    .join("");
}

export function check_password(settings: PasswordSettings): Checked<PasswordRequest> {
  const { length } = settings;
  if (chosen_sets(settings).length === 0) return { ok: false, error: "Choose at least one kind of character." };
  if (length === null || !Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return { ok: false, error: `Length must be between ${MIN_LENGTH} and ${MAX_LENGTH}.` };
  }
  return { ok: true, value: { ...settings, length } };
}

// Each chosen set is guaranteed a character, then the whole is shuffled so those don't sit at the front.
export function generate_password(settings: PasswordRequest, source: RandomSource = crypto_source): string {
  const checked = check_password(settings);
  if (!checked.ok) throw new RangeError(checked.error);

  const pick = (characters: string) => characters[random_int(0, characters.length - 1, source)];
  const pool = pool_of(settings);
  const required = chosen_sets(settings).map((set) => pick(set_characters(set, settings.exclude_ambiguous)));
  const rest = Array.from({ length: settings.length - required.length }, () => pick(pool));
  return shuffle([...required, ...rest], source).join("");
}

// Ignores the one-per-set guarantee, which costs a fraction of a bit.
export function entropy_bits(settings: PasswordRequest): number {
  const pool = pool_of(settings).length;
  return pool < 2 ? 0 : settings.length * Math.log2(pool);
}

export const Strength = { WEAK: "weak", FAIR: "fair", STRONG: "strong", VERY_STRONG: "very-strong" } as const;
export type Strength = (typeof Strength)[keyof typeof Strength];

export function strength_of(bits: number): Strength {
  if (bits < 50) return Strength.WEAK;
  if (bits < 70) return Strength.FAIR;
  if (bits < 100) return Strength.STRONG;
  return Strength.VERY_STRONG;
}
