export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Difference {
  /** Percent of the painted pixels, so a small icon on a big transparent canvas isn't diluted. */
  changed: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

/** Anti-aliased edges shift by a few levels when coordinates are rounded; this much is not a visible change. */
export const TOLERANCE = 24;
const INVISIBLE = 8;
const FADE = 0.25;

export function difference(before: Pixels, after: Pixels, highlight: [number, number, number], tolerance = TOLERANCE): Difference {
  if (before.width !== after.width || before.height !== after.height) throw new Error("Both renders need the same size");
  const a = before.data;
  const b = after.data;
  const pixels = new Uint8ClampedArray(a.length);
  let painted = 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const visible = a[i + 3] >= INVISIBLE || b[i + 3] >= INVISIBLE;
    if (!visible) continue;
    painted++;
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3])
    );
    if (delta > tolerance) {
      changed++;
      pixels.set([...highlight, 255], i);
    } else {
      pixels.set([a[i], a[i + 1], a[i + 2], a[i + 3] * FADE], i);
    }
  }
  return { changed: painted ? Math.round((changed / painted) * 10_000) / 100 : 0, pixels };
}
