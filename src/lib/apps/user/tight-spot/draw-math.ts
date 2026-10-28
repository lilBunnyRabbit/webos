import type { Polygon, Vec } from "./geometry";

export interface Tone {
  colour: string;
  l: number;
}

export function darkest(tones: Tone[]): Tone {
  return tones.reduce((best, tone) => (tone.l < best.l ? tone : best));
}

export function lightest(tones: Tone[]): Tone {
  return tones.reduce((best, tone) => (tone.l > best.l ? tone : best));
}

export function against(surface: number, dark: Tone, light: Tone): Tone {
  return Math.abs(surface - dark.l) >= Math.abs(light.l - surface) ? dark : light;
}

// Seen from above it's the top of the tyre, which moves the way the car does: stripes run forward in D, back in R.
export function tread(roll: number, pitch: number, length: number): number[] {
  const phase = ((roll % pitch) + pitch) % pitch;
  const stripes: number[] = [];
  for (let x = -length / 2 - pitch + phase; x < length / 2 + pitch; x += pitch) stripes.push(x);
  return stripes;
}

// Dashes restart at every segment; phasing each by where it starts along its line keeps one pattern across chunks.
export function dash_phase(a: Vec, b: Vec, period: number): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return 0;
  const along = (a.x * (b.x - a.x) + a.y * (b.y - a.y)) / length;
  return ((along % period) + period) % period;
}

export function signed_area(shape: Polygon): number {
  let sum = 0;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

// Pieces drawn as one path fill as one shape, without seams, only when they wind the same way (nonzero rule).
export function wound(shape: Polygon): Polygon {
  return signed_area(shape) < 0 ? [...shape].reverse() : shape;
}
