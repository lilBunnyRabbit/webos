import { create_rng } from "$lib/core/utils/random";

/** A column of rising air (or sinking, with a negative strength), metres and m/s, centred on `x` along the world. */
export interface Thermal {
  x: number;
  radius: number;
  strength: number;
  top: number;
}

export interface Weather {
  /** Wind along +x (blowing toward +x) at 100 m, m/s; it eases off toward the ground. */
  wind: number;
  /** Gusts' size, m/s, blowing only between `gust_from` and `gust_to` when given (on final). */
  gust: number;
  gust_from: number | null;
  gust_to: number | null;
  /** Below `below` metres the wind turns to `wind` over the 40 m above it: windshear on final. */
  shear: { below: number; wind: number } | null;
  thermals: Thermal[];
  seed: number;
}

export const CALM_WEATHER: Weather = { wind: 0, gust: 0, gust_from: null, gust_to: null, shear: null, thermals: [], seed: 0 };

const SHEAR_BAND = 40;
/** A thermal comes up out of the ground: no lift right at it, full strength from this height. */
const THERMAL_FOOT = 60;

/** The wind's share at a height, a log profile: a third at a metre, two thirds at 10 m, all of it at 100 m. */
export function wind_share(agl: number): number {
  return Math.max(0.3, Math.min(1.1, Math.log(Math.max(agl, 0.5) / 0.1) / Math.log(1000)));
}

function wrapped(dx: number, wrap: number): number {
  return dx - wrap * Math.round(dx / wrap);
}

export function thermal_lift(t: Thermal, dx: number, agl: number): number {
  const foot = Math.min(1, Math.max(0, agl) / THERMAL_FOOT);
  const head = Math.min(1, Math.max(0, (t.top - agl) / (t.top * 0.15)));
  const fade = foot * head;
  if (t.strength < 0) return t.strength * Math.exp(-((dx / t.radius) ** 2)) * fade;
  const ring = Math.exp(-(((Math.abs(dx) - 1.6 * t.radius) / (0.6 * t.radius)) ** 2));
  return t.strength * (Math.exp(-((dx / t.radius) ** 2)) - 0.25 * ring) * fade;
}

/** The air at `x` (in the weather's own frame, which repeats every `wrap` metres), `agl` up, at `time`. */
export function air_at(w: Weather, x: number, agl: number, time: number, wrap: number): { wind: number; updraft: number } {
  let wind = w.wind;
  if (w.shear && agl < w.shear.below) {
    const share = Math.min(1, (w.shear.below - agl) / SHEAR_BAND);
    wind += (w.shear.wind - w.wind) * share;
  }
  wind *= wind_share(agl);
  let updraft = 0;
  const local = x - wrap * Math.floor(x / wrap);
  const gusting = w.gust > 0 && (w.gust_from === null || w.gust_to === null || (local >= w.gust_from && local <= w.gust_to));
  if (gusting) {
    const phase = (w.seed % 1000) / 159;
    wind += w.gust * (0.6 * Math.sin(1.3 * time + phase) + 0.4 * Math.sin(2.9 * time + 0.004 * x + phase * 2));
    updraft += 0.3 * w.gust * Math.sin(2.1 * time + phase * 3);
  }
  for (const t of w.thermals) updraft += thermal_lift(t, wrapped(x - t.x, wrap), agl);
  return { wind, updraft };
}

/** The hub's weather: a light breeze, small gusts and thermals every kilometre or so, so the glider can soar. */
export function gentle_weather(seed: number, wrap: number, keep_clear: { x0: number; x1: number }): Weather {
  const rng = create_rng(seed);
  const thermals: Thermal[] = [];
  for (let x = keep_clear.x1 + 400 + rng() * 400; x < wrap + keep_clear.x0 - 300; x += 700 + rng() * 700) {
    thermals.push({ x, radius: 140 + rng() * 120, strength: 1.6 + rng() * 1.6, top: 650 + rng() * 400 });
  }
  const wind = (rng() * 2 - 1) * 4;
  return { wind, gust: 0.8, gust_from: null, gust_to: null, shear: null, thermals, seed };
}
