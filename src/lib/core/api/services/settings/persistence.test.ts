import { describe, expect, test } from "vitest";
import { DEFAULT_WALLPAPER, SETTINGS_VERSION, WALLPAPER_DIRECTORY, parse_settings, parse_wallpaper } from "./persistence";

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

describe("taskbar size and auto-hide", () => {
  test("keep valid values", () => {
    const settings = parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { position: "left", size: "large", auto_hide: true } }));
    expect(settings?.taskbar).toMatchObject({ position: "left", size: "large", auto_hide: true });
  });

  test("a save from before they existed, or unknown values, load as medium and always shown", () => {
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { position: "top" } }))?.taskbar).toMatchObject({ size: "medium", auto_hide: false });
    expect(parse_settings(JSON.stringify({ version: SETTINGS_VERSION, taskbar: { size: "huge", auto_hide: "yes" } }))?.taskbar).toMatchObject({ size: "medium", auto_hide: false });
  });
});
