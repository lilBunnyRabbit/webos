export const Tone = { PRIMARY: 0, SECONDARY: 1, TERTIARY: 2, ACCENT: 3, DUST: 4 } as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export const ToneRule = { DIAGONAL: "diagonal", ANGLE: "angle", ROWS: "rows" } as const;
export type ToneRule = (typeof ToneRule)[keyof typeof ToneRule];

export interface Mask {
  width: number;
  height: number;
  alpha: ArrayLike<number>;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SampleOptions {
  seed: number;
  rule: ToneRule;
  dust: number;
}

export const TARGET_STRIDE = 3;
const DUST_SPREAD = 0.12;

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lit_pixels(mask: Mask, threshold = 128): Uint32Array {
  const found: number[] = [];
  const total = mask.width * mask.height;
  for (let index = 0; index < total; index++) if (mask.alpha[index] >= threshold) found.push(index);
  return Uint32Array.from(found);
}

/** `jitter` (0–1) roughens the band edges so tones dither into each other instead of meeting on a hard line. */
export function tone_of(rule: ToneRule, x: number, y: number, jitter: number): Tone {
  let t: number;
  if (rule === ToneRule.ANGLE) t = (Math.atan2(y - 0.5, x - 0.5) / (2 * Math.PI) + 0.5 + (jitter - 0.5) * 0.04 + 1) % 1;
  else if (rule === ToneRule.ROWS) t = y + (jitter - 0.5) * 0.06;
  else t = x * 0.6 + y * 0.4 + (jitter - 0.5) * 0.16;
  return Math.min(3, Math.max(0, Math.floor(t * 4))) as Tone;
}

/**
 * Picks `count` targets: lit mask pixels for the shape, the rest as dust around it. Shape points are ordered left to right
 * (with a little lean), so particle i lands in roughly the same region of every shape and a morph sweeps instead of
 * scrambling. Dust always takes the last indices, so dust stays dust across shapes. An empty mask falls back to a circle.
 */
export function sample_targets(mask: Mask, count: number, options: SampleOptions): Float32Array {
  const next = random(options.seed);
  const out = new Float32Array(count * TARGET_STRIDE);
  const dust = Math.min(count, Math.round(count * options.dust));
  const shape = count - dust;
  const lit = lit_pixels(mask);

  const xs = new Float32Array(shape);
  const ys = new Float32Array(shape);
  for (let i = 0; i < shape; i++) {
    if (lit.length === 0) {
      const angle = next() * Math.PI * 2;
      const radius = 0.3 + next() * 0.08;
      xs[i] = 0.5 + Math.cos(angle) * radius;
      ys[i] = 0.5 + Math.sin(angle) * radius;
      continue;
    }
    const pixel = lit[Math.floor(next() * lit.length)];
    xs[i] = ((pixel % mask.width) + next()) / mask.width;
    ys[i] = (Math.floor(pixel / mask.width) + next()) / mask.height;
  }

  const order = Array.from({ length: shape }, (_, i) => i).sort(
    (a, b) => xs[a] * 0.85 + ys[a] * 0.15 - (xs[b] * 0.85 + ys[b] * 0.15)
  );
  order.forEach((source, i) => {
    out[i * TARGET_STRIDE] = xs[source];
    out[i * TARGET_STRIDE + 1] = ys[source];
    out[i * TARGET_STRIDE + 2] = tone_of(options.rule, xs[source], ys[source], next());
  });

  for (let i = shape; i < count; i++) {
    out[i * TARGET_STRIDE] = -DUST_SPREAD + next() * (1 + DUST_SPREAD * 2);
    out[i * TARGET_STRIDE + 1] = -DUST_SPREAD + next() * (1 + DUST_SPREAD * 2);
    out[i * TARGET_STRIDE + 2] = Tone.DUST;
  }
  return out;
}

export function contain(width: number, height: number, bounds: Rect, padding = 0): Rect {
  const inset = Math.min(bounds.width, bounds.height) * padding;
  const room = { width: Math.max(0, bounds.width - inset * 2), height: Math.max(0, bounds.height - inset * 2) };
  const scale = Math.min(room.width / width, room.height / height);
  const fitted = { width: width * scale, height: height * scale };
  return {
    x: bounds.x + (bounds.width - fitted.width) / 2,
    y: bounds.y + (bounds.height - fitted.height) / 2,
    ...fitted,
  };
}

export function sample_size(aspect: number, budget = 360 * 300): { width: number; height: number } {
  const safe = Number.isFinite(aspect) && aspect > 0 ? Math.min(8, Math.max(1 / 8, aspect)) : 1;
  const height = Math.max(1, Math.floor(Math.sqrt(budget / safe)));
  return { width: Math.max(1, Math.floor(height * safe)), height };
}

export interface SvgPaths {
  width: number;
  height: number;
  paths: string[];
}

/** Reads the `viewBox` size and every `d` from an SVG's markup, so the logo is drawn from the one component that owns it. */
export function svg_paths(source: string): SvgPaths {
  const view_box =
    /viewBox="([^"]+)"/
      .exec(source)?.[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number) ?? [];
  const paths = [...source.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
  return { width: view_box[2] ?? 0, height: view_box[3] ?? 0, paths };
}
