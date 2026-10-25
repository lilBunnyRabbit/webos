import type { Color, ColorModel } from "@lilbunnyrabbit/chromatics";
import { models, parse } from "@lilbunnyrabbit/chromatics/all";
import { Oklch } from "@lilbunnyrabbit/chromatics/oklch";

export type { ColorModel };

export const MODELS: readonly ColorModel[] = models;

export const DEFAULT_MODEL = Oklch.id;

export interface ChannelInfo {
  name: string;
  min: number;
  max: number;
  hue: boolean;
}

export function parse_css(input: string): Color | null {
  const text = input.trim();
  if (!text) return null;
  try {
    return parse(text);
  } catch {
    return null;
  }
}

export function model_by_id(id: string): ColorModel | null {
  return MODELS.find((model) => model.id === id) ?? null;
}

export function channels_of(model: ColorModel): ChannelInfo[] {
  return Object.entries(model.channels).map(([name, channel]) => ({
    name,
    min: channel.range[0],
    max: channel.range[1],
    hue: channel.hue === true,
  }));
}

/** `null` where the conversion leaves the number range (about 0.4% of sRGB has no `Ryb`). */
export function convert(color: Color, model: ColorModel): Color | null {
  try {
    return color.to(model);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/** A copy of `color` in its own model with one channel replaced. Channels are the constructor's arguments, in order. */
export function with_channel(color: Color, model: ColorModel, index: number, value: number): Color {
  const coords = [...color.coords];
  coords[index] = value;
  return new model(...coords, color.alpha);
}

export function with_alpha(color: Color, model: ColorModel, alpha: number): Color {
  return new model(...color.coords, alpha);
}

function round(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * The model's own string with every number rounded, for reading and copying. It still parses: only digits change.
 * `toString()` is exact and can run to 17 digits.
 */
export function format_color(color: Color, decimals = 4): string {
  const text = color.toString();
  const open = text.indexOf("(");
  if (open < 0) return text;
  return text.slice(0, open + 1) + text.slice(open + 1).replace(NUMBER, (match) => round(Number(match), decimals));
}
