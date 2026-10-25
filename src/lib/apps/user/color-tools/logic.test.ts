import { describe, expect, test } from "vitest";
import { to_hex } from "./color";
import { CONTRAST_LEVELS, format_ratio, passes } from "./contrast";
import { harmonies, HueSpace, steps_between } from "./harmony";
import { channels_of, convert, format_color, model_by_id, MODELS, parse_css, with_alpha, with_channel } from "./models";
import { add_color, create_palette, file_name_for, MAX_COLORS, parse_palette, remove_color, rename_color, serialize_palette } from "./palette";
import { clamp_point, fit_size, pixel_at, read_rgba } from "./sample";
import { Deficiency, severity_name, simulate } from "./vision";

describe("models", () => {
  test("all 70 models, every one reachable or out of range", () => {
    expect(MODELS).toHaveLength(70);
    const color = parse_css("oklch(0.7 0.15 30)")!;
    for (const model of MODELS) {
      const converted = convert(color, model);
      if (converted) expect(parse_css(format_color(converted))).not.toBeNull();
    }
  });

  test("parse_css reads any syntax, and nothing else", () => {
    expect(parse_css("#4f46e5")?.model).toBe("srgb8");
    expect(parse_css("hsv(30 50% 80%)")?.model).toBe("hsv");
    expect(parse_css(" oklch(70% 0.15 30) ")?.model).toBe("oklch");
    expect(parse_css("")).toBeNull();
    expect(parse_css("bluish")).toBeNull();
  });

  test("format_color rounds numbers only", () => {
    expect(format_color(parse_css("oklch(0.123456789 0.1 30.000001)")!)).toBe("oklch(0.1235 0.1 30)");
    expect(format_color(parse_css("#ED7665")!)).toBe("#ed7665");
    expect(format_color(parse_css("color(xyz-d65 0.5 1e-17 -0.00001)")!)).toBe("color(xyz-d65 0.5 0 0)");
  });

  test("channels and edits keep the model", () => {
    const oklch = model_by_id("oklch")!;
    expect(channels_of(oklch)).toEqual([
      { name: "l", min: 0, max: 1, hue: false },
      { name: "c", min: 0, max: 0.4, hue: false },
      { name: "h", min: 0, max: 360, hue: true },
    ]);
    const color = parse_css("oklch(0.5 0.1 40)")!;
    expect(with_channel(color, oklch, 2, 200).toString()).toBe("oklch(0.5 0.1 200)");
    expect(with_alpha(color, oklch, 0.5).alpha).toBe(0.5);
    expect(color.toString()).toBe("oklch(0.5 0.1 40)");
  });
});

describe("contrast levels", () => {
  test("thresholds and the unrounded comparison", () => {
    const aa = CONTRAST_LEVELS.find((level) => level.id === "aa")!;
    expect(passes(4.5, aa)).toBe(true);
    expect(passes(4.499, aa)).toBe(false);
    expect(format_ratio(4.499)).toBe("4.49:1");
    expect(format_ratio(21)).toBe("21.00:1");
  });
});

describe("harmonies", () => {
  test("each scheme starts with the colour and turns its hue", () => {
    const groups = harmonies(parse_css("oklch(0.7 0.15 30)")!, HueSpace.OKLCH);
    const by_id = Object.fromEntries(groups.map((group) => [group.id, group.colors.map((color) => color.toString())]));
    expect(by_id.complement).toEqual(["oklch(0.7 0.15 30)", "oklch(0.7 0.15 210)"]);
    expect(by_id.triadic).toEqual(["oklch(0.7 0.15 30)", "oklch(0.7 0.15 150)", "oklch(0.7 0.15 270)"]);
    expect(by_id.square).toHaveLength(4);
    expect(by_id.ramp).toHaveLength(9);
  });

  test("the source colour isn't changed by building schemes", () => {
    const color = parse_css("hsl(30 50% 50%)")!;
    harmonies(color, HueSpace.HSL);
    expect(color.toString()).toBe("hsl(30 50% 50%)");
  });

  test("steps include both ends and clamp the count", () => {
    const steps = steps_between(parse_css("#000000")!, parse_css("#ffffff")!, 5, HueSpace.OKLCH);
    expect(steps.map(to_hex)[0]).toBe("#000000");
    expect(steps.map(to_hex)[4]).toBe("#ffffff");
    expect(steps_between(parse_css("#000")!, parse_css("#fff")!, 99, HueSpace.HSL)).toHaveLength(12);
  });
});

describe("vision", () => {
  test("severity 0 is the colour itself, greys stay grey", () => {
    const red = parse_css("#ff0000")!;
    expect(to_hex(simulate(red, Deficiency.PROTAN, 0))).toBe("#ff0000");
    expect(to_hex(simulate(red, Deficiency.PROTAN, 1))).not.toBe("#ff0000");
    expect(to_hex(simulate(parse_css("#808080")!, Deficiency.TRITAN, 1))).toBe("#808080");
    expect(red.toString()).toBe("#ff0000");
  });

  test("names", () => {
    expect(severity_name(Deficiency.DEUTAN, 1)).toBe("Deutanopia");
    expect(severity_name(Deficiency.DEUTAN, 0.5)).toBe("Deutanomaly");
    expect(severity_name(Deficiency.TRITAN, 0)).toBe("Normal vision");
  });
});

describe("palette format", () => {
  test("round trip", () => {
    const palette = create_palette("  Sea  ", [{ name: "deep", css: "oklch(0.4 0.1 220)" }]);
    expect(palette).toEqual({ version: 1, name: "Sea", colors: [{ name: "deep", css: "oklch(0.4 0.1 220)" }] });
    expect(parse_palette(serialize_palette(palette))).toEqual(palette);
  });

  test("rejects other versions, bad JSON and colours the package can't read", () => {
    expect(parse_palette("{")).toBeNull();
    expect(parse_palette(JSON.stringify({ version: 2, name: "x", colors: [] }))).toBeNull();
    expect(parse_palette(JSON.stringify({ version: 1, name: "x", colors: [{ name: "a", css: "bluish" }] }))).toBeNull();
  });

  test("edits", () => {
    let palette = create_palette("P");
    palette = add_color(palette, { name: " a ", css: "#000" });
    palette = add_color(palette, { name: "b", css: "#fff" });
    expect(palette.colors.map((color) => color.name)).toEqual(["a", "b"]);
    expect(rename_color(palette, 1, "white").colors[1].name).toBe("white");
    expect(remove_color(palette, 0).colors).toEqual([{ name: "b", css: "#fff" }]);
    const full = create_palette("F", Array.from({ length: MAX_COLORS }, () => ({ name: "", css: "#000" })));
    expect(add_color(full, { name: "", css: "#fff" })).toBe(full);
  });

  test("file names", () => {
    expect(file_name_for("Sea / sky")).toBe("Sea sky.palette");
    expect(file_name_for("  ")).toBe("Palette.palette");
  });
});

describe("sampling", () => {
  test("fit_size caps the long side", () => {
    expect(fit_size({ width: 4000, height: 3000 })).toEqual({ width: 2048, height: 1536 });
    expect(fit_size({ width: 10, height: 20 })).toEqual({ width: 10, height: 20 });
  });

  test("a point in the shown box maps to the picture's pixel, clamped", () => {
    expect(pixel_at({ x: 50, y: 25 }, { width: 100, height: 50 }, { width: 200, height: 100 })).toEqual({ x: 100, y: 50 });
    expect(pixel_at({ x: 100, y: 50 }, { width: 100, height: 50 }, { width: 200, height: 100 })).toEqual({ x: 199, y: 99 });
    expect(clamp_point({ x: -3, y: 4.6 }, { width: 10, height: 10 })).toEqual({ x: 0, y: 5 });
  });

  test("read_rgba", () => {
    const data = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(read_rgba(data, 2, { x: 1, y: 0 })).toEqual({ r: 5, g: 6, b: 7, a: 8 });
  });
});
