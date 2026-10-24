import { random, type Mask } from "../particles/targets";

export interface Dot {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  /** 0–1, left to right, so a settle sweeps the way the logo's morph does. */
  delay: number;
}

export interface DotGrid {
  columns: number;
  rows: number;
  dots: Dot[];
}

// The same mask the particle logo morphs into, so a tile's glyph and the logo's are one figure.
export function glyph_dots(mask: Mask, columns: number, threshold = 0.3, seed = 1): DotGrid {
  const rows = Math.max(1, Math.round((columns * mask.height) / mask.width));
  const next = random(seed);
  const dots: Dot[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * mask.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * mask.height) / rows));
    for (let column = 0; column < columns; column++) {
      const x0 = Math.floor((column * mask.width) / columns);
      const x1 = Math.max(x0 + 1, Math.floor(((column + 1) * mask.width) / columns));
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += mask.alpha[y * mask.width + x];
      const coverage = sum / ((y1 - y0) * (x1 - x0) * 255);
      if (coverage < threshold) continue;
      const angle = next() * Math.PI * 2;
      const reach = 1.5 + next() * 2.5;
      dots.push({
        x: column + 0.5,
        y: row + 0.5,
        r: 0.3 + 0.14 * Math.min(1, coverage),
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach,
        delay: (column + row * 0.35) / (columns + rows * 0.35),
      });
    }
  }
  return { columns, rows, dots };
}
