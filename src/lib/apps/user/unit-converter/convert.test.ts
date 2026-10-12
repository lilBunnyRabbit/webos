import { describe, expect, test } from "vitest";
import {
  convert,
  find_unit,
  format_number,
  group_units,
  parse_number,
  resolve_pair,
  saved_state_schema,
  search_other_quantities,
  unit_matches,
} from "./convert";
import { QUANTITIES, Quantity, TABLES, type Unit } from "./units";

function unit(quantity: Quantity, id: string): Unit {
  const found = find_unit(quantity, id);
  if (!found) throw new Error(`No unit ${quantity}/${id}`);
  return found;
}

function shown(value: number, quantity: Quantity, from: string, to: string): string {
  return format_number(convert(value, unit(quantity, from), unit(quantity, to)));
}

describe("temperature", () => {
  test.each([
    [0, "c", "f", "32"],
    [100, "c", "f", "212"],
    [-40, "c", "f", "-40"],
    [98.6, "f", "c", "37"],
    [0, "k", "c", "-273.15"],
    [0, "c", "k", "273.15"],
    [32, "f", "k", "273.15"],
    [0, "r", "f", "-459.67"],
    [491.67, "r", "c", "0"],
  ])("%d %s is %s %s", (value, from, to, expected) => {
    expect(shown(value, Quantity.TEMPERATURE, from, to)).toBe(expected);
  });
});

describe("data size", () => {
  test("SI and binary prefixes differ", () => {
    expect(shown(1, Quantity.DATA, "kb", "byte")).toBe("1000");
    expect(shown(1, Quantity.DATA, "kib", "byte")).toBe("1024");
    expect(shown(1, Quantity.DATA, "gib", "byte")).toBe("1073741824");
  });

  test("a 1 TB drive is about 931 GiB", () => {
    expect(shown(1, Quantity.DATA, "tb", "gib")).toBe("931.322574615");
  });

  test("bits are an eighth of a byte", () => {
    expect(shown(1, Quantity.DATA, "byte", "bit")).toBe("8");
    expect(shown(100, Quantity.DATA, "mbit", "mb")).toBe("12.5");
  });

  test("every data unit names its base in the note or is a base unit", () => {
    for (const each of TABLES.data.units) {
      expect(each.group).toBeDefined();
      if (each.group !== "Base") expect(each.note).toMatch(/^10(00|24)/);
    }
  });
});

describe("exact definitions", () => {
  test.each([
    [Quantity.LENGTH, 1, "in", "cm", "2.54"],
    [Quantity.LENGTH, 1, "mi", "km", "1.609344"],
    [Quantity.MASS, 1, "lb", "kg", "0.45359237"],
    [Quantity.MASS, 1, "st", "lb", "14"],
    [Quantity.VOLUME, 1, "gal_us", "l", "3.785411784"],
    [Quantity.VOLUME, 1, "gal_uk", "l", "4.54609"],
    [Quantity.AREA, 1, "ha", "m2", "10000"],
    [Quantity.SPEED, 100, "kmh", "ms", "27.7777777778"],
    [Quantity.SPEED, 60, "mph", "kmh", "96.56064"],
    [Quantity.TIME, 1, "d", "s", "86400"],
    [Quantity.PRESSURE, 1, "atm", "torr", "760"],
    [Quantity.PRESSURE, 1, "psi", "pa", "6894.75729317"],
    [Quantity.ENERGY, 1, "kcal", "kj", "4.184"],
    [Quantity.ENERGY, 1, "kwh", "j", "3600000"],
    [Quantity.ANGLE, 180, "deg", "rad", "3.14159265359"],
    [Quantity.ANGLE, 1, "turn", "grad", "400"],
  ])("%s: %d %s is %s %s", (quantity, value, from, to, expected) => {
    expect(shown(value, quantity, from, to)).toBe(expected);
  });
});

describe("round trips", () => {
  const samples = [0, 1, -12.5, 0.001, 123456.789, 1e-9, 7e15];

  const linear = QUANTITIES.filter((quantity) => quantity !== Quantity.TEMPERATURE);

  test.each(linear)("%s: every unit pair returns the original value", (quantity) => {
    const units = TABLES[quantity].units;
    for (const from of units) {
      for (const to of units) {
        for (const value of samples) {
          const back = convert(convert(value, from, to), to, from);
          expect(format_number(back)).toBe(format_number(value));
        }
      }
    }
  });

  test("temperature: every unit pair returns the original value", () => {
    const units = TABLES.temperature.units;
    for (const from of units) {
      for (const to of units) {
        for (const value of [0, 1, -12.5, 37.5, -40, 123456.789, 7e15]) {
          const back = convert(convert(value, from, to), to, from);
          expect(format_number(back)).toBe(format_number(value));
        }
      }
    }
  });

  test("temperature: values near absolute zero keep nanokelvin precision through an offset scale", () => {
    const rankine = find_unit(Quantity.TEMPERATURE, "r")!;
    const celsius = find_unit(Quantity.TEMPERATURE, "c")!;
    for (const value of [0.001, 1e-9]) {
      const back = convert(convert(value, rankine, celsius), celsius, rankine);
      expect(Math.abs(back - value)).toBeLessThan(1e-9);
    }
  });
});

describe("tables", () => {
  test.each(QUANTITIES)("%s: ids are unique and defaults exist", (quantity) => {
    const table = TABLES[quantity];
    const ids = table.units.map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(table.from);
    expect(ids).toContain(table.to);
    expect(table.id).toBe(quantity);
  });
});

describe("parse_number", () => {
  test.each([
    ["42", 42],
    ["  -3.5 ", -3.5],
    [".5", 0.5],
    ["1e3", 1000],
    ["1.5E-3", 0.0015],
    ["1 000 000", 1_000_000],
    ["1_000", 1000],
    ["2,5", 2.5],
    ["+7", 7],
  ])("%j is %d", (text, expected) => {
    expect(parse_number(text)).toBe(expected);
  });

  test.each(["", "   ", "abc", "1.2.3", "1,000,000", "1e", "--1", "Infinity", "1e999"])("%j is rejected", (text) => {
    expect(parse_number(text)).toBeNull();
  });
});

describe("format_number", () => {
  test("drops float noise", () => {
    expect(format_number(0.1 + 0.2)).toBe("0.3");
  });

  test("keeps plain notation in the everyday range", () => {
    expect(format_number(1234.5)).toBe("1234.5");
    expect(format_number(0.000123)).toBe("0.000123");
    expect(format_number(999_999_999_999)).toBe("999999999999");
  });

  test("switches to scientific for extremes", () => {
    expect(format_number(9_460_730_472_580_800)).toBe("9.46073047258e15");
    expect(format_number(1.602176634e-19)).toBe("1.602176634e-19");
    expect(format_number(-2.5e-7)).toBe("-2.5e-7");
  });

  test("rounds to significant digits", () => {
    expect(format_number(2 / 3)).toBe("0.666666666667");
    expect(format_number(2 / 3, 4)).toBe("0.6667");
  });

  test("zero and non-finite", () => {
    expect(format_number(-0)).toBe("0");
    expect(format_number(1e-30 - 1e-30)).toBe("0");
    expect(format_number(Number.NaN)).toBe("");
    expect(format_number(Number.POSITIVE_INFINITY)).toBe("");
  });

  test("output parses back to the same value", () => {
    for (const value of [1.602176634e-19, 9.46073047258e15, -42.125, 0.000001, 123456789012]) {
      expect(parse_number(format_number(value))).toBe(Number(value.toPrecision(12)));
    }
  });
});

describe("search", () => {
  test("matches name, symbol, group and note, case-insensitively", () => {
    const kib = unit(Quantity.DATA, "kib");
    expect(unit_matches(kib, "kibi")).toBe(true);
    expect(unit_matches(kib, "KiB")).toBe(true);
    expect(unit_matches(kib, "binary")).toBe(true);
    expect(unit_matches(kib, "1024")).toBe(true);
    expect(unit_matches(kib, "mega")).toBe(false);
    expect(unit_matches(kib, "  ")).toBe(true);
  });

  test("finds units in other quantities", () => {
    const matches = search_other_quantities(Quantity.LENGTH, "gallon");
    expect(matches.map((match) => match.quantity)).toEqual([Quantity.VOLUME]);
    expect(matches[0].units.map((each) => each.id)).toEqual(["gal_us", "gal_uk"]);
  });

  test("skips the current quantity and empty queries", () => {
    expect(search_other_quantities(Quantity.VOLUME, "gallon")).toEqual([]);
    expect(search_other_quantities(Quantity.VOLUME, " ")).toEqual([]);
  });
});

describe("group_units", () => {
  test("splits data units into base, SI and binary blocks", () => {
    const groups = group_units(TABLES.data.units);
    expect(groups.map((group) => group.label)).toEqual(["Base", "Decimal (SI, 1000)", "Binary (IEC, 1024)"]);
  });

  test("ungrouped quantities form one block", () => {
    const groups = group_units(TABLES.length.units);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
  });
});

describe("saved state", () => {
  test("resolve_pair uses saved ids when they exist", () => {
    const pair = resolve_pair(Quantity.LENGTH, { from: "km", to: "mi" });
    expect([pair.from.id, pair.to.id]).toEqual(["km", "mi"]);
  });

  test("resolve_pair falls back to defaults per side", () => {
    const pair = resolve_pair(Quantity.LENGTH, { from: "gone", to: "mi" });
    expect([pair.from.id, pair.to.id]).toEqual(["m", "mi"]);
    const fresh = resolve_pair(Quantity.MASS, undefined);
    expect([fresh.from.id, fresh.to.id]).toEqual(["kg", "lb"]);
  });

  test("schema rejects unknown quantities", () => {
    expect(saved_state_schema.safeParse({ quantity: "currency", units: {} }).success).toBe(false);
    expect(saved_state_schema.safeParse({ quantity: "mass", units: { mass: { from: "g", to: "oz" } } }).success).toBe(
      true
    );
  });
});
