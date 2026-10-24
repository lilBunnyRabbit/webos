import { random, TARGET_STRIDE, tone_of, type Mask, type ToneRule } from "./targets";

const LIT = 128;

function lit_at(mask: Mask, x: number, y: number): boolean {
  const px = Math.floor(x * mask.width);
  const py = Math.floor(y * mask.height);
  if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) return false;
  return mask.alpha[py * mask.width + px] >= LIT;
}

function grid_points(mask: Mask, cells: number, next: () => number): number[] {
  const step_x = 1 / cells;
  const step_y = step_x * (mask.width / mask.height);
  const rows = Math.ceil(1 / step_y);
  const points: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < cells; column++) {
      const x = (column + 0.5 + (next() - 0.5) * 0.7) * step_x;
      const y = (row + 0.5 + (next() - 0.5) * 0.7) * step_y;
      if (lit_at(mask, x, y)) points.push(x, y);
    }
  }
  return points;
}

/**
 * `count` targets spread evenly over the mask: a jittered grid whose cell is sized so about `count` cells land inside
 * the shape, then thinned evenly to exactly `count`. White noise clumps into film grain; this reads as one even stipple
 * with a clean edge. Points are ordered left to right (with a little lean) so a morph sweeps instead of scrambling.
 */
export function even_targets(mask: Mask, count: number, options: { seed: number; rule: ToneRule }): Float32Array {
  const next = random(options.seed);
  const out = new Float32Array(count * TARGET_STRIDE);
  let lit = 0;
  for (let index = 0; index < mask.alpha.length; index++) if (mask.alpha[index] >= LIT) lit++;
  if (lit === 0 || count === 0) {
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      out.set([0.5 + Math.cos(angle) * 0.34, 0.5 + Math.sin(angle) * 0.34, 0], i * TARGET_STRIDE);
    }
    return out;
  }

  // Area share of the shape decides the first guess; a couple of refinements land at or just above `count`.
  let cells = Math.max(2, Math.round(Math.sqrt((count * mask.width * mask.width) / lit)));
  let points = grid_points(mask, cells, next);
  for (let attempt = 0; attempt < 6 && points.length / 2 < count; attempt++) {
    cells = Math.ceil(cells * Math.sqrt((count * 1.04) / Math.max(1, points.length / 2)));
    points = grid_points(mask, cells, next);
  }

  // A few surplus cells are dropped at random rather than every nth, which would leave diagonal lines of gaps.
  const found = points.length / 2;
  const indices = Array.from({ length: found }, (_, i) => i);
  for (let i = found - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = Array.from({ length: count }, (_, i) => (i < found ? indices[i] : indices[Math.floor(next() * found)]));

  const order = picked
    .map((index) => ({ x: points[index * 2], y: points[index * 2 + 1] }))
    .sort((a, b) => a.x * 0.85 + a.y * 0.15 - (b.x * 0.85 + b.y * 0.15));
  order.forEach((point, i) => {
    out[i * TARGET_STRIDE] = point.x;
    out[i * TARGET_STRIDE + 1] = point.y;
    out[i * TARGET_STRIDE + 2] = tone_of(options.rule, point.x, point.y, next());
  });
  return out;
}
