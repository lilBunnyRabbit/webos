import type { Size } from "$kit/utils/video/plan";

/** Frames are compared at this width, or the video's own when it's narrower. */
export const SKIP_WIDTH = 160;

/** Grey levels a pixel has to move by to count as changed: above encoder noise, below a thin stroke shrunk to the compare width. */
export const SKIP_STEP = 8;

export const SKIP_SENSITIVITY = { MIN: 0, MAX: 100, DEFAULT: 50 } as const;

/** Share of changed pixels at sensitivity 0 and 100; the slider moves between them on a log scale. */
const SHARE = { LOW: 0.01, HIGH: 0.00007 } as const;

export function skip_size(source: Size): Size {
  const width = Math.max(1, Math.min(SKIP_WIDTH, Math.round(source.width)));
  return { width, height: Math.max(1, Math.round((width * source.height) / source.width)) };
}

/** The share of changed pixels a frame needs to be kept. */
export function skip_threshold(sensitivity: number): number {
  const t = Math.min(SKIP_SENSITIVITY.MAX, Math.max(SKIP_SENSITIVITY.MIN, sensitivity)) / SKIP_SENSITIVITY.MAX;
  return SHARE.LOW * (SHARE.HIGH / SHARE.LOW) ** t;
}

/** Rec. 601 luma from RGBA, one byte per pixel. */
export function to_grey(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const grey = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; j < grey.length; i += 4, j++) grey[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return grey;
}

export function changed_share(a: Uint8Array, b: Uint8Array, step = SKIP_STEP): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > step) changed++;
  return changed / a.length;
}

/**
 * Keeps a frame when it differs enough from the last kept one. Comparing with the last kept frame, not the previous
 * one, lets a slow fade or scroll add up until it counts, while a blinking cursor never gets past its own few pixels.
 */
export class PauseFilter {
  private kept: Uint8Array | null = null;

  constructor(private readonly threshold: number) {}

  /** Takes ownership of `grey`. The first frame is always kept. */
  keep(grey: Uint8Array): boolean {
    if (this.kept && changed_share(this.kept, grey) < this.threshold) return false;
    this.kept = grey;
    return true;
  }
}

/**
 * Stamps kept frames on the output's timeline. Each kept frame lasts as long as it did in the source, up to the next
 * frame, so the start of a still stretch shows for one normal frame time and the rest of the stretch is gone. With
 * every frame kept, a frame's time is its source time minus `start`.
 */
export class OutputClock {
  private out = 0;
  private open: number | null;

  constructor(start: number) {
    this.open = start;
  }

  /** The kept frame's output time, or `null` for a skipped one. */
  place(time: number, keep: boolean): number | null {
    this.close(time);
    if (!keep) return null;
    this.open = time;
    return this.out;
  }

  /** The output's length, given the source time where it ends. */
  end(time: number): number {
    this.close(time);
    return this.out;
  }

  private close(time: number) {
    if (this.open === null) return;
    this.out += Math.max(0, time - this.open);
    this.open = null;
  }
}
