import { BRAND_DARK, BRAND_LIGHT } from "$lib/core/api/services/settings/themes";
import { load_image } from "$kit/utils/image";
import { Method } from "$lib/core/utils/zip/format";
import { write_zip, type ZipSource } from "$lib/core/utils/zip/write";
import { write_ico } from "./ico";
import {
  APPLE_SIZE,
  CARD_FAMILIES,
  CARD_HEIGHT,
  CARD_WIDTH,
  FAVICON_SIZES,
  PackFile,
  card_title,
  head_html,
  web_manifest,
  wrap_lines,
  type CardOptions,
  type IconOptions,
  type PackOptions,
} from "./pack";
import { framed_svg, is_svg, sized_svg, svg_warnings } from "./svg";

export interface IconSource {
  name: string;
  path: string | null;
  size: number;
  svg: string | null;
  image: HTMLImageElement | ImageBitmap;
  width: number;
  height: number;
  warnings: string[];
}

// An SVG with only a viewBox has no size of its own; this one is big enough that every output scales down.
const SVG_SIDE = 1024;
const MIN_RASTER = 512;
const BLANK_PROBE = 128;

export async function load_icon_source(file: File, path: string | null = null): Promise<IconSource> {
  if (is_svg(file)) {
    const svg = await file.text();
    const url = URL.createObjectURL(new Blob([sized_svg(svg, SVG_SIDE)], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode().catch(() => {
        throw new Error(`${file.name} isn't an SVG this browser can draw`);
      });
      const source = { name: file.name, path, size: file.size, svg, image, width: image.naturalWidth, height: image.naturalHeight };
      return { ...source, warnings: [...svg_warnings(svg), ...blank_warning(source)] };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const { bitmap } = await load_image(file, path);
  const source = { name: file.name, path, size: file.size, svg: null, image: bitmap, width: bitmap.width, height: bitmap.height };
  const small =
    Math.min(bitmap.width, bitmap.height) < MIN_RASTER
      ? [`Only ${bitmap.width} × ${bitmap.height} px: the 512 px icons are scaled up and look soft. Use an SVG or a bigger image.`]
      : [];
  return { ...source, warnings: [...blank_warning(source), ...small] };
}

export function close_source(source: IconSource): void {
  if (source.image instanceof ImageBitmap) source.image.close();
}

function blank_warning(source: Pick<IconSource, "image" | "width" | "height">): string[] {
  const { data } = draw_icon(source, BLANK_PROBE, { fill: null, padding: 0 })
    .getContext("2d")!
    .getImageData(0, 0, BLANK_PROBE, BLANK_PROBE);
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return [];
  return ["Renders blank: nothing visible came out. Give the shapes a fill, and the SVG a viewBox."];
}

export function draw_icon(
  source: Pick<IconSource, "image" | "width" | "height">,
  size: number,
  { fill, padding }: { fill: string | null; padding: number }
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d")!;
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, size, size);
  }
  const inner = size * (1 - (padding / 100) * 2);
  const scale = Math.min(inner / source.width, inner / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, (size - width) / 2, (size - height) / 2, width, height);
  return canvas;
}

export interface RenderedIcons {
  favicons: OffscreenCanvas[];
  apple: OffscreenCanvas;
  icon_192: OffscreenCanvas;
  icon_512: OffscreenCanvas;
  maskable: OffscreenCanvas;
}

export function render_icons(source: IconSource, icon: IconOptions): RenderedIcons {
  const fill = icon.transparent ? null : icon.background;
  const plain = (size: number) => draw_icon(source, size, { fill, padding: icon.padding });
  return {
    favicons: FAVICON_SIZES.map(plain),
    apple: draw_icon(source, APPLE_SIZE, { fill: icon.background, padding: icon.padding }),
    icon_192: plain(192),
    icon_512: plain(512),
    maskable: draw_icon(source, 512, { fill: icon.background, padding: icon.maskable_padding }),
  };
}

function relative_luminance(color: string): number {
  const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3), (channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface CardStyle {
  background: string;
  foreground: string;
  family: string;
}

export function card_style(card: CardOptions, theme_background: string): CardStyle {
  const background = card.background ?? theme_background;
  const foreground = relative_luminance(background) > 0.18 ? BRAND_LIGHT.foreground : BRAND_DARK.foreground;
  return { background, foreground, family: CARD_FAMILIES[card.font] };
}

const TITLE_SIZE = 68;
const SUBTITLE_SIZE = 34;

// Canvas text only draws in a font that's already loaded; the first card would otherwise fall back.
export async function load_card_fonts(): Promise<void> {
  await Promise.all(
    Object.values(CARD_FAMILIES).flatMap((family) => [
      document.fonts.load(`700 ${TITLE_SIZE}px "${family}"`),
      document.fonts.load(`400 ${SUBTITLE_SIZE}px "${family}"`),
    ])
  );
}

export function draw_card(source: IconSource, card: CardOptions, style: CardStyle): OffscreenCanvas {
  const canvas = new OffscreenCanvas(CARD_WIDTH, CARD_HEIGHT);
  const context = canvas.getContext("2d")!;
  context.fillStyle = style.background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const margin = 88;
  const icon = 300;
  context.drawImage(draw_icon(source, icon, { fill: null, padding: 0 }), margin, (CARD_HEIGHT - icon) / 2);

  const left = margin + icon + 72;
  const width = CARD_WIDTH - left - margin;
  context.fillStyle = style.foreground;
  context.textBaseline = "top";
  context.font = `700 ${TITLE_SIZE}px "${style.family}"`;
  const title = wrap_lines(card_title(card, source.name), width, 2, (text) => context.measureText(text).width);
  context.font = `400 ${SUBTITLE_SIZE}px "${style.family}"`;
  const subtitle = wrap_lines(card.subtitle, width, 3, (text) => context.measureText(text).width);

  const title_line = TITLE_SIZE * 1.15;
  const subtitle_line = SUBTITLE_SIZE * 1.35;
  const gap = subtitle.length ? 28 : 0;
  let y = (CARD_HEIGHT - (title.length * title_line + gap + subtitle.length * subtitle_line)) / 2;

  context.font = `700 ${TITLE_SIZE}px "${style.family}"`;
  for (const line of title) {
    context.fillText(line, left, y);
    y += title_line;
  }
  y += gap;
  context.font = `400 ${SUBTITLE_SIZE}px "${style.family}"`;
  context.globalAlpha = 0.72;
  for (const line of subtitle) {
    context.fillText(line, left, y);
    y += subtitle_line;
  }
  return canvas;
}

const png = (canvas: OffscreenCanvas) => canvas.convertToBlob({ type: "image/png" });

export async function build_pack(source: IconSource, options: PackOptions, style: CardStyle): Promise<Blob> {
  const icons = render_icons(source, options.icon);
  const favicons = await Promise.all(
    FAVICON_SIZES.map(async (size, index) => ({ size, png: new Uint8Array(await (await png(icons.favicons[index])).arrayBuffer()) }))
  );
  const info = {
    name: card_title(options.card, source.name),
    description: options.card.subtitle.trim(),
    color: options.icon.background,
    svg: source.svg !== null,
  };
  const text = (content: string, type: string) => new Blob([content], { type });
  const files: [string, Blob | Promise<Blob>][] = [
    [PackFile.ICO, new Blob([write_ico(favicons)], { type: "image/x-icon" })],
    [PackFile.APPLE, png(icons.apple)],
    [PackFile.ICON_192, png(icons.icon_192)],
    [PackFile.ICON_512, png(icons.icon_512)],
    [PackFile.MASKABLE, png(icons.maskable)],
    [PackFile.CARD, png(draw_card(source, options.card, style))],
    [PackFile.MANIFEST, text(web_manifest(info), "application/manifest+json")],
    [PackFile.HEAD, text(head_html(info), "text/html")],
  ];
  if (source.svg !== null) {
    const background = options.icon.transparent ? null : options.icon.background;
    files.splice(1, 0, [PackFile.SVG, text(framed_svg(source.svg, { background, padding: options.icon.padding }), "image/svg+xml")]);
  }
  const modified = new Date();
  const sources: ZipSource[] = await Promise.all(files.map(async ([name, data]) => ({ name, data: await data, modified })));
  return write_zip(sources, { method: Method.DEFLATE });
}
