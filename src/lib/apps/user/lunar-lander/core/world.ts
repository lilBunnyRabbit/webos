import { inside_convex } from "$kit/games/play2d/collision";
import type { Vec } from "$kit/games/play2d/geometry";

export interface Pad {
  x0: number;
  x1: number;
  y: number;
}

/** The ground as a polyline, flat pads let into it, and rock above it (cave roofs, overhangs) as convex shapes. */
export interface Terrain {
  ground: readonly [number, number][];
  pads: readonly Pad[];
  rocks: readonly (readonly Vec[])[];
  x0: number;
  x1: number;
}

export interface Weather {
  wind: number;
  gust: number;
  seed: number;
}

export const CALM: Weather = { wind: 0, gust: 0, seed: 0 };

export type Feature = (x: number) => number;

const SAMPLE = 4;
const PAD_SHOULDER = 3;

function smooth(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

export function hill(x: number, width: number, height: number): Feature {
  return (at) => {
    const t = Math.abs(at - x) / (width / 2);
    return t >= 1 ? 0 : (height * (1 + Math.cos(Math.PI * t))) / 2;
  };
}

/** Flat at `height` from `x0` to `x1`, with sides `shoulder` metres wide. */
export function mesa(x0: number, x1: number, height: number, shoulder: number): Feature {
  return (at) => height * (at < x0 ? smooth(1 - (x0 - at) / shoulder) : at > x1 ? smooth(1 - (at - x1) / shoulder) : 1);
}

/** A crater `width` rim to rim: its rim raises the ground, its bowl cuts `depth` below the plain. */
export function crater(x: number, width: number, depth: number, rim: number): { rim: Feature; bowl: Feature } {
  const t = (at: number) => Math.abs(at - x) / (width / 2);
  return {
    rim: (at) => rim * smooth(1 - Math.abs(t(at) - 1) / 0.5),
    bowl: (at) => (t(at) >= 1 ? 0 : -depth * (1 - smooth((t(at) - 0.35) / 0.65))),
  };
}

export function canyon(x0: number, x1: number, depth: number, wall: number): Feature {
  return (at) => -depth * (at < x0 ? smooth(1 - (x0 - at) / wall) : at > x1 ? smooth(1 - (at - x1) / wall) : 1);
}

interface TerrainParts {
  x0: number;
  x1: number;
  base?: number;
  features?: Feature[];
  /** Cuts (crater bowls, canyons) take the ground down from what the features raise; the deepest wins. */
  cuts?: Feature[];
  pads: { x: number; width: number; y?: number }[];
  rocks?: Vec[][];
}

/** Samples the features every few metres, walls at both ends, then lets the pads in flat. A pad without a height sits on the ground there. */
export function terrain(parts: TerrainParts): Terrain {
  const base = parts.base ?? 0;
  const raise = parts.features ?? [];
  const cuts = parts.cuts ?? [];
  const height = (x: number) => {
    const up = base + Math.max(0, ...raise.map((f) => f(x)));
    const down = Math.min(0, ...cuts.map((f) => f(x)));
    return up + down;
  };
  const pads: Pad[] = parts.pads.map((p) => ({ x0: p.x - p.width / 2, x1: p.x + p.width / 2, y: p.y ?? Math.round(height(p.x) * 10) / 10 }));
  const shaped = (x: number) => {
    for (const pad of pads) {
      if (x >= pad.x0 && x <= pad.x1) return pad.y;
      if (x > pad.x0 - PAD_SHOULDER && x < pad.x0) return pad.y + (height(x) - pad.y) * smooth((pad.x0 - x) / PAD_SHOULDER);
      if (x < pad.x1 + PAD_SHOULDER && x > pad.x1) return pad.y + (height(x) - pad.y) * smooth((x - pad.x1) / PAD_SHOULDER);
    }
    return height(x);
  };
  const xs = new Set<number>();
  for (let x = parts.x0; x <= parts.x1; x += SAMPLE) xs.add(x);
  for (const pad of pads) for (const x of [pad.x0 - PAD_SHOULDER, pad.x0, pad.x1, pad.x1 + PAD_SHOULDER]) xs.add(x);
  const ground: [number, number][] = [...xs].sort((a, b) => a - b).map((x) => [x, Math.round(shaped(x) * 100) / 100]);
  const wall = Math.max(...ground.map(([, y]) => y)) + 600;
  ground.unshift([parts.x0 - 60, wall], [parts.x0 - 20, wall * 0.6]);
  ground.push([parts.x1 + 20, wall * 0.6], [parts.x1 + 60, wall]);
  return { ground, pads, rocks: parts.rocks ?? [], x0: parts.x0, x1: parts.x1 };
}

export function ground_at(t: Terrain, x: number): number {
  const g = t.ground;
  if (x <= g[0][0]) return g[0][1];
  if (x >= g[g.length - 1][0]) return g[g.length - 1][1];
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [xa, ya] = g[lo];
  const [xb, yb] = g[hi];
  return ya + ((yb - ya) * (x - xa)) / (xb - xa);
}

export function highest_between(t: Terrain, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let top = Math.max(ground_at(t, lo), ground_at(t, hi));
  for (const [x, y] of t.ground) if (x > lo && x < hi) top = Math.max(top, y);
  return top;
}

export function in_rock(t: Terrain, p: Vec): boolean {
  return t.rocks.some((rock) => inside_convex(p, rock));
}

export function pad_under(t: Terrain, xs: readonly number[]): number {
  return t.pads.findIndex((pad) => xs.every((x) => x >= pad.x0 && x <= pad.x1));
}

/** Wind along +x: a steady part and gusts from two sines in time and one along the ground, from the seed. */
export function wind_at(w: Weather, x: number, time: number): number {
  if (w.gust === 0) return w.wind;
  const a = ((w.seed % 97) / 97) * Math.PI * 2;
  const b = ((w.seed % 89) / 89) * Math.PI * 2;
  const gust = 0.6 * Math.sin(time * 0.53 + a) + 0.4 * Math.sin(time * 1.37 + b + x * 0.011);
  return w.wind + w.gust * gust;
}
