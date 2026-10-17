import type { Config, PluginConfig } from "svgo/browser";

export interface OptimizeOptions {
  precision: number;
  multipass: boolean;
  keep_ids: boolean;
  merge_paths: boolean;
  strip_size: boolean;
  strip_title: boolean;
  pretty: boolean;
}

export const DEFAULT_OPTIONS: OptimizeOptions = {
  precision: 3,
  multipass: true,
  keep_ids: false,
  merge_paths: true,
  strip_size: false,
  strip_title: false,
  pretty: false,
};

export const MIN_PRECISION = 0;
export const MAX_PRECISION = 8;

let svgo: Promise<typeof import("svgo/browser")> | null = null;

export function load_svgo(): Promise<typeof import("svgo/browser")> {
  return (svgo ??= import("svgo/browser"));
}

export function svgo_config(options: OptimizeOptions): Config {
  const overrides: Record<string, false> = {};
  if (options.keep_ids) overrides.cleanupIds = false;
  if (!options.merge_paths) overrides.mergePaths = false;
  const plugins: PluginConfig[] = [{ name: "preset-default", params: { overrides } }];
  if (options.strip_size) plugins.push("removeDimensions");
  if (options.strip_title) plugins.push("removeTitle");
  return {
    multipass: options.multipass,
    floatPrecision: options.precision,
    plugins,
    js2svg: options.pretty ? { pretty: true, indent: 2 } : undefined,
  };
}

/** Throws with SVGO's parser message when the text isn't well-formed SVG. */
export async function optimize_svg(text: string, options: OptimizeOptions): Promise<string> {
  const { optimize } = await load_svgo();
  return optimize(text, svgo_config(options)).data;
}

export const byte_size = (text: string) => new TextEncoder().encode(text).length;

export interface SvgSize {
  width: number;
  height: number;
}

const DEFAULT_SIZE: SvgSize = { width: 300, height: 150 };

function root_tag(text: string): string | null {
  return /<svg\b[^>]*>/i.exec(text)?.[0] ?? null;
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;
}

/** Absolute lengths only: `100%` or `em` sizes depend on where the SVG sits, so the viewBox decides instead. */
function length(value: string | null): number | null {
  const match = value === null ? null : /^\s*([\d.]+)\s*(px)?\s*$/.exec(value);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The size a browser gives the SVG as an image: width and height, else the viewBox, else 300 × 150. */
export function svg_size(text: string): SvgSize {
  const tag = root_tag(text);
  if (!tag) return DEFAULT_SIZE;
  const width = length(attribute(tag, "width"));
  const height = length(attribute(tag, "height"));
  const box = attribute(tag, "viewBox")?.trim().split(/[\s,]+/).map(Number);
  const ratio = box && box.length === 4 && box[2] > 0 && box[3] > 0 ? box[2] / box[3] : null;
  if (width && height) return { width, height };
  if (width && ratio) return { width, height: width / ratio };
  if (height && ratio) return { width: height * ratio, height };
  if (box && ratio) return { width: box[2], height: box[3] };
  return DEFAULT_SIZE;
}

export function png_size(svg: SvgSize, size: number): SvgSize {
  const scale = size / Math.max(svg.width, svg.height);
  return { width: Math.max(1, Math.round(svg.width * scale)), height: Math.max(1, Math.round(svg.height * scale)) };
}

export const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const;

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export const optimized_name = (name: string) => `${stem(name).replace(/\.min$/i, "")}.min.svg`;
export const png_name = (name: string, size: number) => `${stem(name)}-${size}.png`;

/** `arrow-left.svg` → `ArrowLeft`; a name that starts with a digit gets `Svg` in front, since components can't. */
export function component_name(name: string): string {
  const words = stem(name).replace(/\.min$/i, "").split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("") || "Icon";
  return /^\d/.test(pascal) ? `Svg${pascal}` : pascal;
}

export const is_svg_name = (name: string) => /\.svg$/i.test(name);
