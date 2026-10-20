import type { Position } from "$lib/core/utils/type";

export const BIRD_FPS = 30;

export const BirdShape = { SILHOUETTE: "silhouette", SPREAD: "spread", BELLY: "belly" } as const;
export type BirdShape = (typeof BirdShape)[keyof typeof BirdShape];

export interface BirdScene {
  width: number;
  height: number;
  seconds: number;
  trees: number;
  box: { x: number; y: number; width: number; height: number };
  at: (time: number) => Position;
  shape: (time: number) => BirdShape;
}

interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  color: readonly [number, number, number];
}

const DARK = [25, 25, 35] as const;
const WHITE = [236, 236, 230] as const;
const ORDER = [BirdShape.SILHOUETTE, BirdShape.SPREAD, BirdShape.BELLY] as const;

export function bird_scene(width = 480, height = 270, seconds = 6): BirdScene {
  const at = (time: number) => ({
    x: 40 + 70 * time,
    y: height * 0.42 + 45 * Math.sin(1.9 * time) + 14 * Math.sin(5 * time),
  });
  const start = at(0);
  return {
    width,
    height,
    seconds,
    trees: Math.round(width * 0.78),
    box: { x: start.x - 16, y: start.y - 12, width: 32, height: 24 },
    at,
    shape: (time) => ORDER[Math.floor(Math.round(time * BIRD_FPS) / 4) % ORDER.length],
  };
}

function parts(shape: BirdShape): Ellipse[] {
  if (shape === BirdShape.SILHOUETTE)
    return [
      { x: -11, y: 0, rx: 5, ry: 1.6, angle: 0.15, color: DARK },
      { x: -1, y: -3, rx: 9, ry: 2.6, angle: -0.35, color: DARK },
      { x: 0, y: 0, rx: 9, ry: 4, angle: 0, color: DARK },
    ];
  if (shape === BirdShape.SPREAD)
    return [
      { x: -10, y: 0, rx: 4, ry: 1.5, angle: 0, color: DARK },
      { x: 2, y: -10, rx: 12, ry: 2.4, angle: -1.25, color: DARK },
      { x: 2, y: 10, rx: 12, ry: 2.4, angle: 1.25, color: DARK },
      { x: 0, y: 0, rx: 8, ry: 3.5, angle: 0, color: DARK },
    ];
  return [
    { x: -10, y: 0, rx: 4, ry: 1.5, angle: 0, color: DARK },
    { x: 4, y: -9, rx: 11, ry: 2.6, angle: -0.9, color: DARK },
    { x: 4, y: 9, rx: 11, ry: 2.6, angle: 0.9, color: DARK },
    { x: 0, y: 0, rx: 8, ry: 4.2, angle: 0, color: WHITE },
    { x: 7, y: 0, rx: 2.5, ry: 2.5, angle: 0, color: DARK },
  ];
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function sky(y: number, height: number): [number, number, number] {
  const share = y / height;
  return [60 + 80 * share, 120 + 65 * share, 205 + 30 * share];
}

export function bird_frame(scene: BirdScene, time: number): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = scene;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const [r, g, b] = sky(y, height);
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      out[at + 3] = 255;
      const leaf = x >= scene.trees ? hash(x >> 2, y >> 2) * 0.7 + hash(x, y) * 0.3 : -1;
      if (leaf >= 0.12) {
        out[at] = 25 + 70 * leaf;
        out[at + 1] = 70 + 110 * leaf;
        out[at + 2] = 25 + 40 * leaf;
      } else {
        out[at] = r;
        out[at + 1] = g;
        out[at + 2] = b;
      }
    }
  }
  const centre = scene.at(time);
  const bank = 0.3 * Math.sin(3 * time);
  const cos = Math.cos(bank);
  const sin = Math.sin(bank);
  const shapes = parts(scene.shape(time));
  const reach = 26;
  const samples = 3;
  for (let y = Math.max(0, Math.floor(centre.y - reach)); y < Math.min(height, centre.y + reach); y++)
    for (let x = Math.max(0, Math.floor(centre.x - reach)); x < Math.min(width, centre.x + reach); x++) {
      const at = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples - centre.x;
          const py = y + (sy + 0.5) / samples - centre.y;
          const lx = px * cos + py * sin;
          const ly = -px * sin + py * cos;
          let color: readonly number[] = [out[at], out[at + 1], out[at + 2]];
          for (const part of shapes) {
            const c = Math.cos(part.angle);
            const s = Math.sin(part.angle);
            const ex = (lx - part.x) * c + (ly - part.y) * s;
            const ey = -(lx - part.x) * s + (ly - part.y) * c;
            if ((ex / part.rx) ** 2 + (ey / part.ry) ** 2 <= 1) color = part.color;
          }
          r += color[0];
          g += color[1];
          b += color[2];
        }
      const n = samples * samples;
      out[at] = r / n;
      out[at + 1] = g / n;
      out[at + 2] = b / n;
    }
  return out;
}
