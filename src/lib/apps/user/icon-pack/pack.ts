import { z } from "zod";
import { escape_html } from "$lib/core/utils";

export const CardFont = { SANS: "sans", MONO: "mono" } as const;
export type CardFont = (typeof CardFont)[keyof typeof CardFont];

export const CARD_FAMILIES: Record<CardFont, string> = { [CardFont.SANS]: "Inter", [CardFont.MONO]: "Hack" };

export interface IconOptions {
  /** `#rrggbb`. Apple touch and maskable icons always use it; the rest only when `transparent` is off. */
  background: string;
  transparent: boolean;
  padding: number;
  maskable_padding: number;
  /** Preview only: no output is rounded. */
  radius: number;
  safe_zone: boolean;
}

export interface CardOptions {
  title: string;
  subtitle: string;
  /** `null` follows the theme's background. */
  background: string | null;
  font: CardFont;
}

export interface PackOptions {
  icon: IconOptions;
  card: CardOptions;
}

const HEX = /^#[0-9a-f]{6}$/i;
export const MAX_PADDING = 40;

export const DEFAULT_PACK: PackOptions = {
  icon: { background: "#ffffff", transparent: true, padding: 0, maskable_padding: 20, radius: 22, safe_zone: true },
  card: { title: "", subtitle: "", background: null, font: CardFont.SANS },
};

const percent = (max: number) => z.number().min(0).max(max);

export const PackSchema: z.ZodType<PackOptions> = z.object({
  icon: z.object({
    background: z.string().regex(HEX),
    transparent: z.boolean(),
    padding: percent(MAX_PADDING),
    maskable_padding: percent(MAX_PADDING),
    radius: percent(50),
    safe_zone: z.boolean(),
  }),
  card: z.object({
    title: z.string(),
    subtitle: z.string(),
    background: z.string().regex(HEX).nullable(),
    font: z.enum([CardFont.SANS, CardFont.MONO]),
  }),
});

export const FAVICON_SIZES = [16, 32, 48] as const;
export const APPLE_SIZE = 180;
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
/** Android crops a maskable icon to a circle at most this share of the side across. */
export const SAFE_ZONE = 0.8;

export const PackFile = {
  ICO: "favicon.ico",
  SVG: "favicon.svg",
  APPLE: "apple-touch-icon.png",
  ICON_192: "icon-192.png",
  ICON_512: "icon-512.png",
  MASKABLE: "maskable-512.png",
  CARD: "og.png",
  MANIFEST: "manifest.webmanifest",
  HEAD: "head.html",
} as const;

export function file_stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function pack_name(source: string): string {
  return `${file_stem(source)}-icons.zip`;
}

export function card_title(card: CardOptions, source: string): string {
  return card.title.trim() || file_stem(source);
}

export function parse_padding(text: string): number | null {
  const match = text.trim().match(/^(\d*\.?\d+)\s*%?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value <= MAX_PADDING ? value : null;
}

export interface PackInfo {
  name: string;
  description: string;
  color: string;
  svg: boolean;
}

export function web_manifest({ name, color, svg }: PackInfo): string {
  const icons = [
    ...(svg ? [{ src: `/${PackFile.SVG}`, sizes: "any", type: "image/svg+xml" }] : []),
    { src: `/${PackFile.ICON_192}`, sizes: "192x192", type: "image/png" },
    { src: `/${PackFile.ICON_512}`, sizes: "512x512", type: "image/png" },
    { src: `/${PackFile.MASKABLE}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
  return `${JSON.stringify(
    { name, short_name: name, icons, theme_color: color, background_color: color, display: "standalone", start_url: "/" },
    null,
    2
  )}\n`;
}

export function head_html({ name, description, color, svg }: PackInfo): string {
  const lines = [
    `<link rel="icon" href="/${PackFile.ICO}" sizes="32x32">`,
    svg ? `<link rel="icon" href="/${PackFile.SVG}" type="image/svg+xml">` : null,
    `<link rel="apple-touch-icon" href="/${PackFile.APPLE}">`,
    `<link rel="manifest" href="/${PackFile.MANIFEST}">`,
    `<meta name="theme-color" content="${color}">`,
    `<meta property="og:title" content="${escape_html(name)}">`,
    description ? `<meta property="og:description" content="${escape_html(description)}">` : null,
    `<meta property="og:image" content="/${PackFile.CARD}">`,
    `<meta property="og:image:width" content="${CARD_WIDTH}">`,
    `<meta property="og:image:height" content="${CARD_HEIGHT}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  return `${lines.filter((line) => line !== null).join("\n")}\n`;
}

export function wrap_lines(text: string, max_width: number, max_lines: number, measure: (text: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let index = 0;
  for (; index < words.length; index++) {
    const next = line ? `${line} ${words[index]}` : words[index];
    if (!line || measure(next) <= max_width) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[index];
    if (lines.length === max_lines) break;
  }
  const cut = index < words.length;
  if (!cut && line) lines.push(line);
  return lines.map((item, at) => fit(item, max_width, measure, cut && at === lines.length - 1));
}

function fit(line: string, max_width: number, measure: (text: string) => number, ellipsis: boolean): string {
  if (!ellipsis && measure(line) <= max_width) return line;
  let text = line;
  while (text.length > 1 && measure(`${text}…`) > max_width) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}
