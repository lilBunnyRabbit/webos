import { wave_sample } from "./spectrum";
import { clamp, resolve_token } from "$lib/core/utils";

export interface Palette {
  primary: string;
  /** Primary at low opacity: the brand allows a gradient within one colour, never between two. */
  primary_faint: string;
  foreground: string;
}

export interface Surface {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  palette: Palette;
}

export function read_palette(probe: HTMLElement): Palette {
  const resolve = (value: string) => resolve_token(probe, value);
  const palette = {
    primary: resolve("var(--primary)"),
    primary_faint: resolve("color-mix(in oklab, var(--primary) 40%, transparent)"),
    foreground: resolve("var(--foreground)"),
  };
  return palette;
}

export function bar_count(css_width: number): number {
  return clamp(Math.floor(css_width / 10), 16, 96);
}

export function draw_bars({ ctx, width, height, dpr, palette }: Surface, levels: Float32Array): void {
  ctx.clearRect(0, 0, width, height);
  const count = levels.length;
  if (!count) return;
  const slot = width / count;
  const gap = slot > 6 * dpr ? 2 * dpr : 1 * dpr;
  const bar = Math.max(1, slot - gap);
  const floor = height - 4 * dpr;
  const gradient = ctx.createLinearGradient(0, floor, 0, 0);
  gradient.addColorStop(0, palette.primary_faint);
  gradient.addColorStop(1, palette.primary);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const h = Math.max(2 * dpr, levels[i] * floor * 0.94);
    ctx.roundRect(i * slot + gap / 2, floor - h, bar, h, [
      Math.min(bar / 2, 3 * dpr),
      Math.min(bar / 2, 3 * dpr),
      0,
      0,
    ]);
  }
  ctx.fill();
}

export function draw_wave({ ctx, width, height, dpr, palette }: Surface, samples: Uint8Array, gain: number): void {
  ctx.clearRect(0, 0, width, height);
  const middle = height / 2;
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = palette.foreground;
  ctx.fillRect(0, middle - dpr / 2, width, dpr);
  ctx.globalAlpha = 1;
  if (!samples.length) return;
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = "round";
  ctx.beginPath();
  const step = width / (samples.length - 1);
  for (let i = 0; i < samples.length; i++) {
    const y = middle - clamp(wave_sample(samples[i]) * gain, -1, 1) * middle * 0.9;
    if (i) ctx.lineTo(i * step, y);
    else ctx.moveTo(0, y);
  }
  ctx.stroke();
}

// Half the circle is the spectrum, mirrored, so low notes meet at the bottom and highs at the top without a seam.
export function draw_radial({ ctx, width, height, dpr, palette }: Surface, levels: Float32Array): void {
  ctx.clearRect(0, 0, width, height);
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size * 0.22;
  const reach = size * 0.26;
  const count = levels.length;

  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = palette.foreground;
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 4 * dpr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!count) return;

  const spokes = count * 2;
  const gradient = ctx.createRadialGradient(cx, cy, radius, cx, cy, radius + reach);
  gradient.addColorStop(0, palette.primary_faint);
  gradient.addColorStop(1, palette.primary);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(dpr, ((Math.PI * 2 * radius) / spokes) * 0.6);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < spokes; i++) {
    const level = levels[i < count ? i : spokes - 1 - i];
    const angle = Math.PI / 2 + (i / spokes) * Math.PI * 2;
    const length = Math.max(2 * dpr, level * reach);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.moveTo(cx + cos * radius, cy + sin * radius);
    ctx.lineTo(cx + cos * (radius + length), cy + sin * (radius + length));
  }
  ctx.stroke();
}
