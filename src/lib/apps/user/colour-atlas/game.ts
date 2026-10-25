import { daily_seed } from "$kit/games/time";
import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";
import { delta_e2000, from_hex, oklch, rgb8, to_display_srgb, to_hex, type Color } from "../color-tools/color";
import { channels_of, convert, model_by_id, MODELS, route, type ChannelInfo, type ColorModel } from "../color-tools/models";
import { atlas_entry, Tier, TIER_NAMES, type AtlasEntry } from "./atlas";
import { APP_ID, APP_NAME } from "./names";

export type { ChannelInfo, ColorModel };

export const ROUNDS = 5;
export const ROUND_MAX = 100;
export const COLLECT_DELTA = 5;
const POINTS_PER_DELTA = 8;

const { FAMILIAR: F, PERCEPTUAL: P, EXOTIC: E } = Tier;
export const RUN_TIERS: readonly Tier[] = [F, P, F, P, E];

export type Pool = string;
export const MIXED = "mixed";

export type Seed = string | number;

export interface AtlasModel extends AtlasEntry {
  model: ColorModel;
}

export interface Round {
  model: AtlasModel;
  target: string;
  start: number[];
}

export const ATLAS_MODELS: readonly AtlasModel[] = MODELS.flatMap((model) => {
  const entry = atlas_entry(model.id);
  return entry ? [{ ...entry, model }] : [];
});

/** Quantized models round every step, so they never get a round; they still have a dex page. */
export function is_playable(item: AtlasModel): boolean {
  return !item.model.terminal;
}

export const PLAYABLE: readonly AtlasModel[] = ATLAS_MODELS.filter(is_playable);

export function atlas_model(id: string): AtlasModel | null {
  return ATLAS_MODELS.find((item) => item.id === id) ?? null;
}

export function route_to_srgb(item: AtlasModel): AtlasModel[] {
  return route(item.model, model_by_id("srgb")!).map((model) => atlas_model(model.id)!);
}

export function is_pool(pool: string): boolean {
  if (pool === MIXED || (Object.values(Tier) as string[]).includes(pool)) return true;
  const item = atlas_model(pool);
  return item !== null && is_playable(item);
}

export function pool_label(pool: Pool): string {
  if (pool === MIXED) return "Mixed";
  if (pool in TIER_NAMES) return TIER_NAMES[pool as Tier];
  return atlas_model(pool)?.name ?? pool;
}

const EXTENT_STEPS = 8;
// Past this, a reference range is a format's ceiling, not where colours live: scene-linear ACES runs to 65504 while sRGB stays under 1.
const OVERSIZED = 20;
const extents = new Map<string, [number, number][]>();

function srgb_extent(model: ColorModel): [number, number][] {
  const known = extents.get(model.id);
  if (known) return known;
  const count = Object.keys(model.channels).length;
  const extent = Array.from({ length: count }, (): [number, number] => [Infinity, -Infinity]);
  const step = 255 / EXTENT_STEPS;
  for (let r = 0; r <= EXTENT_STEPS; r++)
    for (let g = 0; g <= EXTENT_STEPS; g++)
      for (let b = 0; b <= EXTENT_STEPS; b++) {
        const color = convert(rgb8(Math.round(r * step), Math.round(g * step), Math.round(b * step)), model);
        color?.coords.forEach((value, index) => {
          extent[index][0] = Math.min(extent[index][0], value);
          extent[index][1] = Math.max(extent[index][1], value);
        });
      }
  extents.set(model.id, extent);
  return extent;
}

export function play_channels(model: ColorModel): ChannelInfo[] {
  const extent = srgb_extent(model);
  return channels_of(model).map((channel, index) => {
    if (channel.hue) return channel;
    const [low, high] = extent[index];
    const span = high - low;
    if (!(span > 0) || channel.max - channel.min <= span * OVERSIZED) return channel;
    const pad = span * 0.05;
    return { ...channel, min: Math.max(channel.min, low - pad), max: Math.min(channel.max, high + pad) };
  });
}

function fits(color: Color, channels: readonly ChannelInfo[]): boolean {
  return channels.every((channel, index) => {
    const value = color.coords[index];
    return channel.hue || (value >= channel.min - 1e-9 && value <= channel.max + 1e-9);
  });
}

function random_hex(rng: Rng): string {
  return to_hex(oklch(0.35 + rng() * 0.55, 0.03 + rng() * 0.17, rng() * 360));
}

const MAX_DRAWS = 400;

/**
 * A gamut-mapped sRGB target the model's sliders can reach. Redrawn while the conversion throws (part of sRGB has no
 * `Ryb`) or lands outside a slider's range (vivid colours sit past HPLuv's `p` 1 and below SMPTE C's 0).
 */
export function draw_target(model: ColorModel, rng: Rng): string {
  const channels = play_channels(model);
  for (let attempt = 0; attempt < MAX_DRAWS; attempt++) {
    const hex = random_hex(rng);
    const color = convert(from_hex(hex)!, model);
    if (color && fits(color, channels)) return hex;
  }
  return "#808080";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function draw_start(model: ColorModel, rng: Rng): number[] {
  const channels = play_channels(model);
  const color = convert(from_hex(random_hex(rng))!, model);
  return channels.map((channel, index) => {
    const value = color?.coords[index];
    return value === undefined || !Number.isFinite(value) ? (channel.min + channel.max) / 2 : clamp(value, channel.min, channel.max);
  });
}

function pool_models(pool: Pool, rng: Rng): AtlasModel[] {
  const single = atlas_model(pool);
  if (single && is_playable(single)) return Array.from({ length: ROUNDS }, () => single);
  if (pool in TIER_NAMES) return shuffle(PLAYABLE.filter((item) => item.tier === pool), rng).slice(0, ROUNDS);
  const by_tier = new Map(Object.values(Tier).map((tier) => [tier, shuffle(PLAYABLE.filter((item) => item.tier === tier), rng)]));
  return RUN_TIERS.map((tier) => by_tier.get(tier)!.shift()!);
}

export function draw_run(seed: number, pool: Pool): Round[] {
  const rng = create_rng(seed);
  return pool_models(pool, rng).map((model) => ({ model, target: draw_target(model.model, rng), start: draw_start(model.model, rng) }));
}

export function resolve_seed(seed: Seed): number {
  return typeof seed === "string" ? daily_seed(seed, APP_ID) : seed >>> 0;
}

export function guess_color(model: ColorModel, coords: readonly number[]): Color {
  return new model(...coords, 1);
}

export function guess_hex(model: ColorModel, coords: readonly number[]): string | null {
  try {
    return to_hex(guess_color(model, coords));
  } catch {
    return null;
  }
}

/** ΔE2000 between the target and the guess as the screen shows it, so a guess past sRGB isn't scored on colour nobody saw. */
export function round_delta(target: string, model: ColorModel, coords: readonly number[]): number {
  try {
    return delta_e2000(target, to_display_srgb(guess_color(model, coords)));
  } catch {
    return 100;
  }
}

export function round_score(delta: number): number {
  return Math.round(Math.max(0, ROUND_MAX - POINTS_PER_DELTA * delta) * 10) / 10;
}

export function total_score(scores: readonly number[]): number {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) * 10) / 10;
}

export function target_coords(target: string, model: ColorModel): number[] | null {
  return convert(from_hex(target)!, model)?.coords.slice() ?? null;
}

export function channel_track(model: ColorModel, coords: readonly number[], index: number, channel: ChannelInfo): string {
  const count = channel.hue ? 13 : 9;
  const stops = Array.from({ length: count }, (_, at) => {
    const values = [...coords];
    values[index] = channel.min + ((channel.max - channel.min) * at) / (count - 1);
    return guess_hex(model, values) ?? "transparent";
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export function format_value(value: number): string {
  const rounded = Number(value.toFixed(Math.abs(value) >= 100 ? 1 : 3));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function slider_step(channel: ChannelInfo): number {
  return (channel.max - channel.min) / 1000;
}

export const dex_schema = z.record(z.string(), z.number().nonnegative());
export type Dex = z.infer<typeof dex_schema>;

export function record_dex(dex: Dex, id: string, delta: number): Dex {
  if (!(delta < COLLECT_DELTA)) return dex;
  const best = dex[id];
  if (best !== undefined && best <= delta) return dex;
  return { ...dex, [id]: Math.round(delta * 100) / 100 };
}

export const run_state_schema = z.object({
  guesses: z.array(z.array(z.number()).max(4)).max(ROUNDS),
  ms: z.number().nonnegative(),
});
export type RunState = z.infer<typeof run_state_schema>;

const FIRST_DAY = Date.UTC(2026, 9, 24);

export function puzzle_number(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, date) - FIRST_DAY) / 86_400_000);
}

export function band(score: number): string {
  if (score >= 90) return "🟩";
  if (score >= 70) return "🟨";
  if (score >= 40) return "🟧";
  return "🟥";
}

export function format_score(score: number): string {
  return String(Math.round(score * 10) / 10);
}

export function share_head(seed: Seed, pool: Pool): string {
  if (typeof seed === "string") return `${APP_NAME} #${puzzle_number(seed)}`;
  return `${APP_NAME} · Practice · ${pool_label(pool)}`;
}

export function challenge_props(seed: Seed, pool: Pool): Record<string, string | number> {
  return typeof seed === "string" || pool === MIXED ? { seed } : { seed, pool };
}

export function share_text(head: string, scores: readonly number[], link: string): string {
  return [`${head}  ${format_score(total_score(scores))}/${ROUNDS * ROUND_MAX}`, scores.map(band).join(""), link].join("\n");
}
