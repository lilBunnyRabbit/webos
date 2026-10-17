export interface Size {
  width: number;
  height: number;
}

const ROOT = /<svg\b[^>]*>/i;
const PROLOG = /<\?xml[^>]*\?>|<!DOCTYPE[^>]*>/gi;
const GENERIC_FONTS = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
]);

export function is_svg(file: { name: string; type: string }): boolean {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

function root_tag(text: string): string | null {
  return ROOT.exec(text)?.[0] ?? null;
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(tag)?.[2] ?? null;
}

function without(tag: string, names: string[]): string {
  return names.reduce((result, name) => result.replace(new RegExp(`\\s${name}\\s*=\\s*(["']).*?\\1`, "gi"), ""), tag);
}

// `em`, `%` and friends depend on a context an icon doesn't have.
function length(value: string | null): number | null {
  const match = value?.trim().match(/^(\d*\.?\d+)(px)?$/i);
  const number = match ? Number(match[1]) : NaN;
  return number > 0 ? number : null;
}

function view_box(tag: string): Size | null {
  const parts = attribute(tag, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (!parts || parts.length !== 4 || !(parts[2] > 0) || !(parts[3] > 0)) return null;
  return { width: parts[2], height: parts[3] };
}

export function svg_size(text: string): Size | null {
  const tag = root_tag(text);
  if (!tag) return null;
  const box = view_box(tag);
  const width = length(attribute(tag, "width"));
  const height = length(attribute(tag, "height"));
  if (width && height) return { width, height };
  if (!box) return null;
  if (width) return { width, height: (width * box.height) / box.width };
  if (height) return { width: (height * box.width) / box.height, height };
  return box;
}

// Without a `viewBox` a new size would crop instead of scale, so one is added.
function with_root(text: string, attributes: Record<string, string | number>): string {
  const tag = root_tag(text);
  if (!tag) return text;
  const size = svg_size(text);
  const extra = view_box(tag) || !size ? {} : { viewBox: `0 0 ${size.width} ${size.height}` };
  const all = { ...extra, ...attributes };
  const kept = without(tag, Object.keys(all));
  const added = Object.entries(all)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
  return text.replace(tag, kept.replace(/^<svg\b/i, `<svg${added}`));
}

export function sized_svg(text: string, side: number): string {
  const size = svg_size(text) ?? { width: side, height: side };
  const scale = side / Math.max(size.width, size.height);
  return with_root(text, { width: Math.round(size.width * scale), height: Math.round(size.height * scale) });
}

// A nested `<svg>` keeps its own `viewBox` and centres itself in the box, so any aspect ratio fits.
export function framed_svg(text: string, { background, padding }: { background: string | null; padding: number }): string {
  if (!background && padding === 0) return text;
  const inner = with_root(text.replace(PROLOG, "").trim(), {
    x: padding,
    y: padding,
    width: 100 - padding * 2,
    height: 100 - padding * 2,
  });
  const fill = background ? `<rect width="100" height="100" fill="${background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${fill}${inner}</svg>`;
}

const is_local = (reference: string) => /^(#|data:)/i.test(reference.trim()) || reference.trim() === "";

export function svg_warnings(text: string): string[] {
  const warnings: string[] = [];
  const external = new Set<string>();
  for (const match of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) if (!is_local(match[2])) external.add(match[2]);
  for (const match of text.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) if (!is_local(match[2])) external.add(match[2]);
  for (const reference of external) warnings.push(`Links to ${reference}: an icon can't load other files, so it's left out.`);

  if (/@import\b/i.test(text)) warnings.push("Imports a stylesheet: an icon can't load it, so its styles are left out.");
  if (/@font-face\b/i.test(text)) warnings.push("Loads a web font: an icon can't, so its text falls back to another font.");

  if (/<text\b/i.test(text)) {
    const families = new Set<string>();
    const values = [
      ...Array.from(text.matchAll(/font-family\s*=\s*(["'])(.*?)\1/gi), (match) => match[2]),
      ...Array.from(text.matchAll(/font-family\s*:\s*([^;}"<]+)/gi), (match) => match[1]),
    ];
    for (const value of values) {
      const first = value.split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (first && !GENERIC_FONTS.has(first.toLowerCase())) families.add(first);
    }
    for (const family of families) warnings.push(`Uses the font ${family}: its text only looks right where it's installed. Convert text to paths.`);
  }
  return warnings;
}
