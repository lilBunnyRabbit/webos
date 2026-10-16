import { z } from "zod";
import { BRAND_DARK, find_saved, THEME_PRESETS, type SavedTheme, type Theme, type ThemeToken } from "$lib/core/api/services/settings";

export const THEME_FILE_EXTENSION = ".webos-theme";
export const THEME_FILE_FORMAT = "webos-theme";
export const THEME_FILE_VERSION = 1;

const TOKENS = Object.keys(BRAND_DARK) as ThemeToken[];

const theme_file_schema = z.object({
  format: z.literal(THEME_FILE_FORMAT),
  version: z.number(),
  name: z.string().trim().min(1),
  theme: z.record(z.string(), z.unknown()),
});

export type ThemeFileResult = { ok: true; theme: SavedTheme } | { ok: false; error: string };

export function serialize_theme_file(entry: SavedTheme): string {
  const theme = Object.fromEntries(TOKENS.map((token) => [token, entry.theme[token]]));
  return JSON.stringify({ format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, name: entry.name, theme }, null, 2);
}

/** Every token must be present and pass `is_colour` (in the browser, `CSS.supports("color", value)`). */
export function parse_theme_file(raw: string, is_colour: (value: string) => boolean): ThemeFileResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The file isn't a WebOS theme." };
  }
  const result = theme_file_schema.safeParse(data);
  if (!result.success) return { ok: false, error: "The file isn't a WebOS theme." };
  const { version, name, theme } = result.data;
  if (version !== THEME_FILE_VERSION) return { ok: false, error: "The theme was made by a newer version of WebOS." };

  const missing = TOKENS.filter((token) => typeof theme[token] !== "string");
  if (missing.length > 0) return { ok: false, error: `The theme is missing ${missing.join(", ")}.` };
  const invalid = TOKENS.filter((token) => !is_colour(theme[token] as string));
  if (invalid.length > 0) return { ok: false, error: `Not a colour: ${invalid.map((token) => `${token} (${theme[token]})`).join(", ")}.` };

  return { ok: true, theme: { name, theme: Object.fromEntries(TOKENS.map((token) => [token, theme[token]])) as Theme } };
}

/** `name`, or `name (2)`, `name (3)`… when a saved theme or a preset already has it (case ignored). */
export function free_theme_name(saved: SavedTheme[], name: string): string {
  const taken = (candidate: string) =>
    find_saved(saved, candidate) !== undefined || THEME_PRESETS.some((preset) => preset.name.toLowerCase() === candidate.trim().toLowerCase());
  const base = name.trim();
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export function theme_file_name(name: string): string {
  return `${name.trim().replace(/[/\\]/g, "-")}${THEME_FILE_EXTENSION}`;
}
