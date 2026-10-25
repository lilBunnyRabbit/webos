import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { z } from "zod";
import { parse_css } from "./models";

export const EXTENSION = ".palette";
export const PALETTES_DIR = PATHS.documents;
export const PALETTE_VERSION = 1;
export const MAX_NAME = 80;
export const MAX_COLORS = 256;
const MAX_CSS = 200;

export const PaletteColorSchema = z.object({
  name: z.string().max(MAX_NAME),
  css: z
    .string()
    .max(MAX_CSS)
    .refine((css) => parse_css(css) !== null, "Not a colour the package can read"),
});
export type PaletteColor = z.infer<typeof PaletteColorSchema>;

export const PaletteSchema = z.object({
  version: z.literal(PALETTE_VERSION),
  name: z.string().max(MAX_NAME),
  colors: z.array(PaletteColorSchema).max(MAX_COLORS),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const PaletteFileSchema = PaletteSchema.nullable();

export function create_palette(name: string, colors: PaletteColor[] = []): Palette {
  return { version: PALETTE_VERSION, name: clean_name(name) || "Palette", colors: colors.slice(0, MAX_COLORS) };
}

export function clean_name(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export function parse_palette(text: string): Palette | null {
  try {
    const result = PaletteSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serialize_palette(palette: Palette): string {
  return JSON.stringify(palette, null, 2) + "\n";
}

export function is_palette_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function file_name_for(name: string): string {
  const stem = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Palette";
  return `${stem}${EXTENSION}`;
}

export function add_color(palette: Palette, color: PaletteColor): Palette {
  if (palette.colors.length >= MAX_COLORS) return palette;
  return { ...palette, colors: [...palette.colors, { name: clean_name(color.name), css: color.css }] };
}

export function add_colors(palette: Palette, colors: PaletteColor[]): Palette {
  return colors.reduce(add_color, palette);
}

export function remove_color(palette: Palette, index: number): Palette {
  return { ...palette, colors: palette.colors.filter((_, at) => at !== index) };
}

export function rename_color(palette: Palette, index: number, name: string): Palette {
  return { ...palette, colors: palette.colors.map((color, at) => (at === index ? { ...color, name: clean_name(name) } : color)) };
}
