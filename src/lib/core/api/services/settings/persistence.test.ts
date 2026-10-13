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
