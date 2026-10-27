import { components } from "../birdseye/blob";
import { CELL_SIZE, DETECT, GRID, type DetectConfig } from "./settings";

export const BACKGROUND_ALPHA = 0.05;
/** More of the watched picture than this changing at once is light or exposure, not something moving. */
export const LIGHTS_SHARE = 0.6;
/** Frames the background learns from before anything counts. */
export const WARMUP_FRAMES = 10;

export interface Detection {
  /** Share of the watched pixels that changed, 0–1: the live meter. */
  level: number;
  motion: boolean;
  /** The picture changed nearly everywhere: ignored. */
  lights: boolean;
  /** Zone cells the moving blobs touch. */
  cells: number[];
}

const QUIET: Detection = { level: 0, motion: false, lights: false, cells: [] };

/**
 * Running-average background subtraction on a small grey picture. Each frame is compared with the background, the
 * changed watched pixels are grouped into blobs, and motion is a blob at least `min_area` big. The background keeps
 * learning every frame, so a parked car or a moved chair fades into it within seconds.
 */
export class MotionDetector {
  private background: Float32Array | null = null;
  private readonly mask = new Float32Array(DETECT.WIDTH * DETECT.HEIGHT);
  private frames = 0;

  constructor(private config: DetectConfig) {}

  configure(config: DetectConfig): void {
    this.config = config;
  }

  reset(): void {
    this.background = null;
    this.frames = 0;
  }

  step(gray: Float32Array): Detection {
    if (gray.length !== this.mask.length) throw new Error(`Expected ${DETECT.WIDTH}×${DETECT.HEIGHT} grey`);
    const background = this.background;
    if (!background) {
      this.background = Float32Array.from(gray);
      this.frames = 1;
      return QUIET;
    }
    const { threshold, min_area, mask: watched } = this.config;
    let changed = 0;
    let changed_watched = 0;
    let watched_total = 0;
    for (let i = 0; i < gray.length; i++) {
      const moved = Math.abs(gray[i] - background[i]) > threshold;
      if (moved) changed++;
      const on = watched[i] === 1;
      if (on) watched_total++;
      this.mask[i] = moved && on ? 1 : 0;
      if (moved && on) changed_watched++;
      background[i] += BACKGROUND_ALPHA * (gray[i] - background[i]);
    }
    this.frames++;
    const level = watched_total === 0 ? 0 : changed_watched / watched_total;
    if (this.frames <= WARMUP_FRAMES) return { ...QUIET, level };
    if (changed / gray.length > LIGHTS_SHARE) return { level, motion: false, lights: true, cells: [] };

    const blobs = components(this.mask, DETECT.WIDTH, DETECT.HEIGHT).filter((blob) => blob.area >= min_area);
    if (blobs.length === 0) return { level, motion: false, lights: false, cells: [] };
    const cells = new Set<number>();
    for (const blob of blobs) {
      for (let row = Math.floor(blob.top / CELL_SIZE); row <= Math.floor((blob.bottom - 1) / CELL_SIZE); row++)
        for (let column = Math.floor(blob.left / CELL_SIZE); column <= Math.floor((blob.right - 1) / CELL_SIZE); column++)
          cells.add(row * GRID.COLUMNS + column);
    }
    return { level, motion: true, lights: false, cells: [...cells].sort((a, b) => a - b) };
  }
}
