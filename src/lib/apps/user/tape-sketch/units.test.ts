import { describe, expect, test } from "vitest";
import { Unit } from "./model";
import { format_area, format_length, from_mm, input_for, parse_input, to_mm, type_key } from "./units";

describe("units", () => {
  test("converts to and from mm", () => {
    expect(to_mm(245, Unit.CM)).toBe(2450);
    expect(to_mm(2.45, Unit.M)).toBe(2450);
    expect(to_mm(10, Unit.IN)).toBe(254);
    expect(from_mm(2450, Unit.M)).toBe(2.45);
  });

  test("formats lengths without trailing zeros", () => {
    expect(format_length(2450, Unit.CM)).toBe("245 cm");
    expect(format_length(2455, Unit.CM)).toBe("245.5 cm");
    expect(format_length(2450, Unit.M)).toBe("2.45 m");
    expect(format_length(1000, Unit.M)).toBe("1 m");
    expect(format_length(254, Unit.IN)).toBe("10 in");
    expect(format_length(120, Unit.MM)).toBe("120 mm");
    expect(format_length(null, Unit.CM)).toBe("?");
  });

  test("formats areas in a size that reads", () => {
    expect(format_area(12_100_000, Unit.CM)).toBe("12.1 m²");
    expect(format_area(50_000, Unit.MM)).toBe("500 cm²");
    expect(format_area(92_903.04 * 2, Unit.IN)).toBe("2 ft²");
    expect(format_area(645.16 * 12, Unit.IN)).toBe("12 in²");
  });

  test("numpad keys build a number", () => {
    let text = "";
    for (const key of ["0", "2", ".", "5", ".", "back", "7"]) text = type_key(text, key);
    expect(text).toBe("2.7");
    expect(type_key("", ".")).toBe("0.");
    expect(type_key("123456789", "1")).toBe("123456789");
  });

  test("parses typed text in the sketch's unit", () => {
    expect(parse_input("245", Unit.CM)).toBe(2450);
    expect(parse_input("2.45", Unit.M)).toBe(2450);
    expect(parse_input("0", Unit.CM)).toBeNull();
    expect(parse_input("", Unit.CM)).toBeNull();
    expect(parse_input("0.", Unit.CM)).toBeNull();
    expect(input_for(2450, Unit.M)).toBe("2.45");
    expect(input_for(null, Unit.M)).toBe("");
  });
});
