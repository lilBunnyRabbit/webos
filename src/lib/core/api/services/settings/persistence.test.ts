import { describe, expect, test } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { DEFAULT_WALLPAPER, SETTINGS_VERSION, WALLPAPER_DIRECTORY, parse_appearance, parse_live_options, parse_settings, parse_wallpaper } from "./persistence";
import { DEFAULT_TURRETS_OPTIONS } from "$lib/core/components/desktop/live/turrets/options";

describe("parse_appearance", () => {
  test("keeps valid values", () => {
    expect(parse_appearance({ radius: "sharp", motion: "off", shadow: "strong", text: "l" })).toEqual({ ...DEFAULT_APPEARANCE, radius: "sharp", motion: "off", shadow: "strong", text: "l" });
  });

  test("an unknown value falls back on its own field only", () => {
    expect(parse_appearance({ radius: "huge", motion: "off" })).toEqual({ ...DEFAULT_APPEARANCE, motion: "off" });
    expect(parse_appearance({ radius: "round", motion: 3 })).toEqual({ ...DEFAULT_APPEARANCE, radius: "round" });
    expect(parse_appearance({ shadow: "huge", text: "xl" })).toEqual(DEFAULT_APPEARANCE);
  });

  test("nothing or garbage is the default", () => {
    expect(parse_appearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parse_appearance("round")).toEqual(DEFAULT_APPEARANCE);
  });

  test("keeps a font choice per role, and a broken one falls back on its own", () => {
    const font = { sans: { kind: "builtin", id: "burrow" }, mono: { kind: "file", name: "Hand.ttc" } };
    expect(parse_appearance({ font }).font).toEqual(font);
    expect(parse_appearance({ font: { ...font, mono: { kind: "file", name: "../etc/settings.json" } } }).font).toEqual({ sans: font.sans, mono: { kind: "default" } });
    expect(parse_appearance({ font: { sans: { kind: "builtin", id: "gone" }, mono: font.mono } }).font).toEqual({ sans: { kind: "default" }, mono: font.mono });
    expect(parse_appearance({ font: { sans: { kind: "file", name: "notes.txt" } } }).font).toEqual({ sans: { kind: "default" }, mono: { kind: "default" } });
    expect(parse_appearance({ radius: "round", font: "Burrow" })).toEqual({ ...DEFAULT_APPEARANCE, radius: "round" });
  });

  test("settings saved before appearance existed load with the default", () => {
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION }))!.appearance).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("parse_wallpaper", () => {
  test("keeps a preset", () => {
    expect(parse_wallpaper({ kind: "preset", preset: "tint" })).toEqual({ kind: "preset", preset: "tint" });
  });

  test("keeps an image in the wallpaper folder and repairs out-of-range options", () => {
    const path = `${WALLPAPER_DIRECTORY}/a-beach.jpg`;
    expect(parse_wallpaper({ kind: "image", path, fit: "zoom", dim: 3, blur: 4 })).toEqual({ kind: "image", path, fit: "fill", dim: 0, blur: 4 });
  });

  test("an image outside the wallpaper folder, an unknown preset or nothing is the default", () => {
    expect(parse_wallpaper({ kind: "image", path: "/home/Pictures/beach.jpg", fit: "fill", dim: 0, blur: 0 })).toEqual(DEFAULT_WALLPAPER);
    expect(parse_wallpaper({ kind: "preset", preset: "waves" })).toEqual(DEFAULT_WALLPAPER);
    expect(parse_wallpaper(undefined)).toEqual(DEFAULT_WALLPAPER);
  });
});

test("settings saved before the wallpaper existed load with the default", () => {
  const settings = parse_settings(JSON.stringify({ version: SETTINGS_VERSION, theme: {}, taskbar: { position: "top" } }));
  expect(settings?.wallpaper).toEqual(DEFAULT_WALLPAPER);
  expect(settings?.taskbar.position).toBe("top");
});

describe("saved themes", () => {
  test("keeps named entries, drops nameless and repeated names, merges each theme over the defaults", () => {
    const raw = JSON.stringify({
      version: SETTINGS_VERSION,
      saved_themes: [
        { name: " Sunset ", theme: { primary: "oklch(0.7 0.2 40)" } },
        { name: "", theme: {} },
        { name: "sunset", theme: {} },
        { theme: {} },
        "nope",
      ],
    });
    const saved = parse_settings(raw)!.saved_themes;
    expect(saved.map((entry) => entry.name)).toEqual(["Sunset"]);
    expect(saved[0].theme.primary).toBe("oklch(0.7 0.2 40)");
    expect(saved[0].theme.background).toBeTruthy();
  });

  test("settings saved before saved themes existed have none", () => {
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION }))!.saved_themes).toEqual([]);
  });
});

describe("taskbar size, auto-hide and seconds", () => {
  test("keep valid values", () => {
    const settings = parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { position: "left", size: "large", auto_hide: true, seconds: true } }));
    expect(settings?.taskbar).toMatchObject({ position: "left", size: "large", auto_hide: true, seconds: true });
  });

  test("a save from before they existed, or unknown values, load as medium, always shown, no seconds", () => {
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { position: "top" } }))?.taskbar).toMatchObject({ size: "medium", auto_hide: false, seconds: false });
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { size: "huge", auto_hide: "yes" } }))?.taskbar).toMatchObject({ size: "medium", auto_hide: false });
  });
});

describe("live wallpapers", () => {
  test("a registered id is kept, an unknown one is the grid", () => {
    expect(parse_wallpaper({ kind: "live", id: "turrets" })).toEqual({ kind: "live", id: "turrets" });
    expect(parse_wallpaper({ kind: "live", id: "gone" })).toEqual(DEFAULT_WALLPAPER);
    expect(parse_wallpaper({ kind: "live", id: "toString" })).toEqual(DEFAULT_WALLPAPER);
  });

  test("options keep valid fields, fix broken ones, and drop unknown ids", () => {
    expect(parse_live_options({ turrets: { mode: "follow", pace: "warp", sound: true, volume: 3 }, gone: { a: 1 } })).toEqual({
      turrets: { ...DEFAULT_TURRETS_OPTIONS, mode: "follow", sound: true },
    });
  });

  test("garbage options are the defaults", () => {
    expect(parse_live_options({ turrets: "loud" })).toEqual({ turrets: DEFAULT_TURRETS_OPTIONS });
    expect(parse_live_options(null)).toEqual({});
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION }))!.live_options).toEqual({});
  });
});
