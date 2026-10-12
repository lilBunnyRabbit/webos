import { describe, expect, test } from "vitest";
import {
  AMBIGUOUS,
  CHARACTERS,
  CHARACTER_SETS,
  entropy_bits,
  generate_password,
  check_password,
  type CharacterSet,
  type PasswordRequest,
} from "./password";

function settings_with(sets: CharacterSet[], overrides: Partial<PasswordRequest> = {}): PasswordRequest {
  const flags = Object.fromEntries(CHARACTER_SETS.map((set) => [set, sets.includes(set)])) as Record<CharacterSet, boolean>;
  return { length: 20, exclude_ambiguous: false, sets: flags, ...overrides };
}

describe("generate_password", () => {
  test("has the requested length", () => {
    expect(generate_password(settings_with(["lower"], { length: 37 }))).toHaveLength(37);
  });

  test.each([[["lower"]], [["digits"]], [["upper", "symbols"]], [["lower", "upper", "digits", "symbols"]]] as CharacterSet[][][])(
    "uses only and every chosen set: %j",
    (sets) => {
      const allowed = sets.map((set) => CHARACTERS[set]).join("");
      for (let i = 0; i < 100; i++) {
        const password = generate_password(settings_with(sets, { length: 8 }));
        for (const char of password) expect(allowed).toContain(char);
        for (const set of sets) expect([...password].some((char) => CHARACTERS[set].includes(char))).toBe(true);
      }
    }
  );

  test("leaves out ambiguous characters when asked", () => {
    const settings = settings_with([...CHARACTER_SETS], { length: 128, exclude_ambiguous: true });
    for (let i = 0; i < 20; i++) {
      for (const char of generate_password(settings)) expect(AMBIGUOUS).not.toContain(char);
    }
  });

  test("refuses invalid settings", () => {
    expect(() => generate_password(settings_with([]))).toThrow(RangeError);
    expect(() => generate_password(settings_with(["lower"], { length: 3 }))).toThrow(RangeError);
  });
});

describe("check_password", () => {
  test("needs a set and a length in range", () => {
    expect(check_password(settings_with([])).ok).toBe(false);
    expect(check_password(settings_with(["lower"], { length: 129 })).ok).toBe(false);
    expect(check_password({ ...settings_with(["lower"]), length: null }).ok).toBe(false);
    expect(check_password(settings_with(["lower"], { length: 4 }))).toEqual({ ok: true, value: settings_with(["lower"], { length: 4 }) });
  });
});

describe("entropy_bits", () => {
  test("is length times log2 of the pool", () => {
    expect(entropy_bits(settings_with(["digits"], { length: 10 }))).toBeCloseTo(10 * Math.log2(10));
    expect(entropy_bits(settings_with(["lower", "upper"], { length: 8 }))).toBeCloseTo(8 * Math.log2(52));
  });

  test("shrinks when ambiguous characters are excluded", () => {
    const full = entropy_bits(settings_with(["lower", "upper", "digits"]));
    const reduced = entropy_bits(settings_with(["lower", "upper", "digits"], { exclude_ambiguous: true }));
    expect(reduced).toBeLessThan(full);
  });
});
