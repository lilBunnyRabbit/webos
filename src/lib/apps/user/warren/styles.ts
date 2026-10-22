import { BUILTIN_FONTS } from "$lib/core/api/services/settings/fonts";
import { is_hex } from "./colour";
import { ALIGNS, type Align } from "./model";
import { BASE_PT, HEADING_PT, LINE_HEIGHT, PARAGRAPH_AFTER_PT } from "./page";

export const StyleId = { NORMAL: "normal", TITLE: "title", H1: "h1", H2: "h2", H3: "h3", QUOTE: "quote" } as const;
export type StyleId = (typeof StyleId)[keyof typeof StyleId];
export const STYLE_IDS = Object.values(StyleId);

export const STYLE_NAMES: Record<StyleId, string> = { normal: "Normal", title: "Title", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3", quote: "Quote" };

export const INTER = "inter";

export interface StyleSpec {
  size: number;
  bold: boolean;
  italic: boolean;
  before: number;
  after: number;
  line: number;
  color: string | null;
  align: Align | null;
  font: string | null;
}

export type DocStyles = Record<StyleId, StyleSpec>;
export type StyleOverrides = Partial<Record<StyleId, Partial<StyleSpec>>>;

const spec = (fields: Partial<StyleSpec>): StyleSpec => ({
  size: BASE_PT,
  bold: false,
  italic: false,
  before: 0,
  after: PARAGRAPH_AFTER_PT,
  line: LINE_HEIGHT,
  color: null,
  align: null,
  font: null,
  ...fields,
});

const heading = (level: 1 | 2 | 3) => spec({ size: HEADING_PT[level], bold: true, before: Math.round(HEADING_PT[level] * 8) / 10, line: 1.2 });

export const DEFAULT_STYLES: DocStyles = {
  normal: spec({}),
  title: spec({ size: 28, bold: true, after: 10, line: 1.15 }),
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  quote: spec({ italic: true, before: 6, after: 6 }),
};

export const STYLE_LIMITS = { size: { min: 6, max: 96 }, spacing: { min: 0, max: 96 }, line: { min: 0.8, max: 3 } } as const;
export const LINE_HEIGHTS = [1, 1.15, 1.2, 1.4, 1.5, 2] as const;

export function is_style_font(value: unknown): value is string {
  return value === INTER || (typeof value === "string" && Object.hasOwn(BUILTIN_FONTS, value));
}

const clamp = (value: number, limit: { min: number; max: number }, step = 10) => Math.min(limit.max, Math.max(limit.min, Math.round(value * step) / step));

export function clean_spec(fields: Partial<Record<keyof StyleSpec, unknown>>): Partial<StyleSpec> {
  const clean: Partial<StyleSpec> = {};
  const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  if (number(fields.size)) clean.size = clamp(fields.size, STYLE_LIMITS.size);
  if (typeof fields.bold === "boolean") clean.bold = fields.bold;
  if (typeof fields.italic === "boolean") clean.italic = fields.italic;
  if (number(fields.before)) clean.before = clamp(fields.before, STYLE_LIMITS.spacing);
  if (number(fields.after)) clean.after = clamp(fields.after, STYLE_LIMITS.spacing);
  if (number(fields.line)) clean.line = clamp(fields.line, STYLE_LIMITS.line, 100);
  if (fields.color === null) clean.color = null;
  else if (is_hex(fields.color)) clean.color = fields.color.toLowerCase();
  if (fields.align === null) clean.align = null;
  else if (ALIGNS.includes(fields.align as Align)) clean.align = fields.align as Align;
  if (fields.font === null || is_style_font(fields.font)) clean.font = fields.font;
  return clean;
}

export function resolve_styles(overrides: StyleOverrides | undefined): DocStyles {
  const styles = { ...DEFAULT_STYLES };
  for (const id of STYLE_IDS) if (overrides?.[id]) styles[id] = { ...DEFAULT_STYLES[id], ...clean_spec(overrides[id]) };
  return styles;
}

// Only the fields that differ are stored, so a template made today follows better defaults later.
export function style_overrides(styles: DocStyles): StyleOverrides | undefined {
  const overrides: StyleOverrides = {};
  for (const id of STYLE_IDS) {
    const keys = (Object.keys(DEFAULT_STYLES[id]) as (keyof StyleSpec)[]).filter((key) => styles[id][key] !== DEFAULT_STYLES[id][key]);
    if (keys.length) overrides[id] = Object.fromEntries(keys.map((key) => [key, styles[id][key]]));
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

export function heading_style(level: 1 | 2 | 3): StyleId {
  return level === 1 ? StyleId.H1 : level === 2 ? StyleId.H2 : StyleId.H3;
}

export function style_fonts(styles: DocStyles): string[] {
  return [...new Set(STYLE_IDS.map((id) => styles[id].font).filter((font): font is string => !!font && font !== INTER))];
}
