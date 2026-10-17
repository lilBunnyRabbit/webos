import { describe, expect, test } from "vitest";
import { convert_amount, format_amounts, format_quantity, ingredient_list, scale_amount, timer_ms } from "./amounts";
import { UnitSystem } from "./constants";
import { parse_amount, parse_cook } from "./cooklang";

const amount = (raw: string) => parse_amount(raw)!;

describe("format_quantity", () => {
  test("counts and imperial units read as kitchen fractions", () => {
    expect(format_quantity(1.5, "cup")).toBe("1 1/2");
    expect(format_quantity(0.333, "")).toBe("1/3");
    expect(format_quantity(2, "tbsp")).toBe("2");
    expect(format_quantity(0.37, "cup")).toBe("0.37");
  });

  test("metric units read as decimals", () => {
    expect(format_quantity(12.5, "g")).toBe("13");
    expect(format_quantity(1.25, "kg")).toBe("1.3");
    expect(format_quantity(0.5, "l")).toBe("0.5");
  });
});

describe("scale_amount", () => {
  test("scales numbers and leaves fixed and word quantities", () => {
    expect(scale_amount(amount("200%g"), 1.5)).toMatchObject({ value: 300, text: "300" });
    expect(scale_amount(amount("1/2%cup"), 3)).toMatchObject({ value: 1.5, text: "1 1/2" });
    expect(scale_amount(amount("=1%tsp"), 4)).toMatchObject({ value: 1, text: "1" });
    expect(scale_amount(amount("a pinch"), 4)).toMatchObject({ value: null, text: "a pinch" });
  });
});

describe("convert_amount", () => {
  test("imperial to metric picks g or kg, ml or l", () => {
    expect(convert_amount(amount("1%lb"), UnitSystem.METRIC)).toMatchObject({ text: "454", unit: "g" });
    expect(convert_amount(amount("3%lb"), UnitSystem.METRIC)).toMatchObject({ text: "1.4", unit: "kg" });
    expect(convert_amount(amount("1%cup"), UnitSystem.METRIC)).toMatchObject({ text: "237", unit: "ml" });
    expect(convert_amount(amount("5%cups"), UnitSystem.METRIC)).toMatchObject({ text: "1.2", unit: "l" });
  });

  test("metric to imperial picks the largest unit the amount fills", () => {
    expect(convert_amount(amount("500%g"), UnitSystem.IMPERIAL)).toMatchObject({ text: "1.1", unit: "lb" });
    expect(convert_amount(amount("100%g"), UnitSystem.IMPERIAL)).toMatchObject({ text: "3.5", unit: "oz" });
    expect(convert_amount(amount("250%ml"), UnitSystem.IMPERIAL)).toMatchObject({ text: "1.1", unit: "cup" });
    expect(convert_amount(amount("15%ml"), UnitSystem.IMPERIAL)).toMatchObject({ text: "1", unit: "tbsp" });
    expect(convert_amount(amount("1%dl"), UnitSystem.IMPERIAL)).toMatchObject({ text: "0.42", unit: "cup" });
  });

  test("leaves units already in the system, unknown units and words alone", () => {
    expect(convert_amount(amount("2%tbsp"), UnitSystem.IMPERIAL)).toEqual(amount("2%tbsp"));
    expect(convert_amount(amount("2%cloves"), UnitSystem.METRIC)).toEqual(amount("2%cloves"));
    expect(convert_amount(amount("some%g"), UnitSystem.IMPERIAL)).toEqual(amount("some%g"));
  });
});

describe("ingredient_list", () => {
  const recipe = parse_cook(
    "Mix @flour{200%g} and @salt{=1%tsp}.\n\nAdd more @flour{50%g}, @milk{1%cup} and @Milk{2%tbsp}.\n\nSeason with @salt{a pinch}(to taste) and @?chives."
  );

  test("adds up the same name and unit, keeps the rest apart", () => {
    const list = ingredient_list(recipe);
    expect(list.map((entry) => [entry.name, format_amounts(entry.amounts), entry.optional])).toEqual([
      ["flour", "250 g", false],
      ["salt", "1 tsp + a pinch", false],
      ["milk", "1 cup + 2 tbsp", false],
      ["chives", "", true],
    ]);
    expect(list[1].notes).toEqual(["to taste"]);
  });

  test("scales before converting and keeps spoons in metric", () => {
    const list = ingredient_list(recipe, 2, UnitSystem.METRIC);
    expect(format_amounts(list[0].amounts)).toBe("500 g");
    expect(format_amounts(list[1].amounts)).toBe("1 tsp + a pinch");
    expect(format_amounts(list[2].amounts)).toBe("473 ml + 4 tbsp");
  });
});

describe("timer_ms", () => {
  test("reads common time units and defaults to minutes", () => {
    expect(timer_ms(amount("25%minutes"))).toBe(25 * 60_000);
    expect(timer_ms(amount("1.5%h"))).toBe(5_400_000);
    expect(timer_ms(amount("30%sec"))).toBe(30_000);
    expect(timer_ms(amount("10"))).toBe(600_000);
  });

  test("takes the start of a range and refuses words", () => {
    expect(timer_ms(amount("8-10%min"))).toBe(480_000);
    expect(timer_ms(amount("a while%min"))).toBeNull();
    expect(timer_ms(null)).toBeNull();
  });
});
