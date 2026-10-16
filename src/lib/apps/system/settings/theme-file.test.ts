import { describe, expect, test } from "vitest";
import { BRAND_DARK, BRAND_LIGHT, derive_theme } from "$lib/core/api/services/settings";
import { free_theme_name, parse_theme_file, serialize_theme_file, theme_file_name } from "./theme-file";

const any_colour = () => true;
const theme = derive_theme({ background: "oklch(0.2 0.02 250)", foreground: "oklch(0.92 0.01 70)", primary: "oklch(0.75 0.15 250)", secondary: "oklch(0.75 0.15 70)", accent: "oklch(0.75 0.15 160)" });

describe("theme files", () => {
  test("round-trips a theme with all 17 tokens", () => {
    const raw = serialize_theme_file({ name: "Night", theme });
    const data = JSON.parse(raw);
    expect(data).toMatchObject({ format: "webos-theme", version: 1, name: "Night" });
    expect(Object.keys(data.theme)).toHaveLength(17);
    expect(parse_theme_file(raw, any_colour)).toEqual({ ok: true, theme: { name: "Night", theme } });
  });

  test("drops unknown keys", () => {
    const raw = JSON.stringify({ format: "webos-theme", version: 1, name: "Extra", theme: { ...BRAND_DARK, sparkle: "red" } });
    const result = parse_theme_file(raw, any_colour);
    expect(result.ok && result.theme.theme).toEqual(BRAND_DARK);
  });

  test("rejects other JSON, a nameless theme and a newer version", () => {
    expect(parse_theme_file("not json", any_colour)).toMatchObject({ ok: false });
    expect(parse_theme_file(JSON.stringify({ name: "A", theme: BRAND_DARK }), any_colour)).toMatchObject({ ok: false });
    expect(parse_theme_file(JSON.stringify({ format: "webos-theme", version: 1, name: " ", theme: BRAND_DARK }), any_colour)).toMatchObject({ ok: false });
    expect(parse_theme_file(JSON.stringify({ format: "webos-theme", version: 2, name: "A", theme: BRAND_DARK }), any_colour)).toEqual({
      ok: false,
      error: "The theme was made by a newer version of WebOS.",
    });
  });

  test("names missing tokens", () => {
    const { info: _, error: __, ...partial } = BRAND_LIGHT;
    const result = parse_theme_file(JSON.stringify({ format: "webos-theme", version: 1, name: "A", theme: partial }), any_colour);
    expect(result).toEqual({ ok: false, error: "The theme is missing error, info." });
  });

  test("names values that aren't colours", () => {
    const raw = JSON.stringify({ format: "webos-theme", version: 1, name: "A", theme: { ...BRAND_DARK, primary: "banana" } });
    const result = parse_theme_file(raw, (value) => value !== "banana");
    expect(result).toEqual({ ok: false, error: "Not a colour: primary (banana)." });
  });
});

describe("free_theme_name", () => {
  const saved = [
    { name: "Night", theme },
    { name: "Night (2)", theme },
  ];

  test("keeps a free name", () => {
    expect(free_theme_name(saved, " Dusk ")).toBe("Dusk");
  });

  test("counts up past saved names, case ignored", () => {
    expect(free_theme_name(saved, "night")).toBe("night (3)");
  });

  test("a preset's name gets the suffix too", () => {
    expect(free_theme_name([], "Brand Dark")).toBe("Brand Dark (2)");
  });
});

test("theme_file_name turns path separators into dashes", () => {
  expect(theme_file_name("Day/Night")).toBe("Day-Night.webos-theme");
});
