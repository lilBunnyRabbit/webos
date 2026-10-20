import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import { best_match, downsample, integral, prepare_template, sample_patch, type Gray, type Template } from "./ncc";

export const TRACK = {
  SEARCH: 3,
  BLEND: 0.08,
  /** Below this NCC the frame is lost: the position holds and the template isn't touched. */
  LOST: 0.55,
  WEAK: 0.75,
  /** Bigger boxes track on a scaled-down frame, which caps the NCC cost per frame. */
  WORK_SIDE: 48,
  MIN_SIDE: 8,
  SCALE_STEP: 0.05,
  REFINE: 2,
} as const;

export interface TrackPoint {
  t: number;
  cx: number;
  cy: number;
  scale: number;
  conf: number;
}

export interface TrackerSetup {
  box: Bounds;
  frame: Dimensions;
  follow_size: boolean;
  /** Scale of `box` against the track's first box, so a re-box carries on where the size was. */
  scale?: number;
}

export function work_factor(box: Dimensions): number {
  return Math.min(1, TRACK.WORK_SIDE / Math.max(box.width, box.height, 1));
}

export class Tracker {
  readonly factor: number;
  readonly work: Dimensions;
  private readonly follow_size: boolean;
  private readonly base_scale: number;
  private readonly width: number;
  private readonly height: number;
  private appearance: Gray | null = null;
  private cx: number;
  private cy: number;
  private vx = 0;
  private vy = 0;
  private relative = 1;

  constructor(setup: TrackerSetup) {
    this.factor = work_factor(setup.box);
    this.work = {
      width: Math.max(1, Math.round(setup.frame.width * this.factor)),
      height: Math.max(1, Math.round(setup.frame.height * this.factor)),
    };
    this.width = Math.max(TRACK.MIN_SIDE, Math.round(setup.box.width * this.factor));
    this.height = Math.max(TRACK.MIN_SIDE, Math.round(setup.box.height * this.factor));
    this.cx = (setup.box.x + setup.box.width / 2) * this.factor;
    this.cy = (setup.box.y + setup.box.height / 2) * this.factor;
    this.follow_size = setup.follow_size;
    this.base_scale = setup.scale ?? 1;
  }

  region(): Bounds {
    const width = Math.ceil(this.width * this.relative * TRACK.SEARCH * 1.05) + TRACK.REFINE * 2;
    const height = Math.ceil(this.height * this.relative * TRACK.SEARCH * 1.05) + TRACK.REFINE * 2;
    const x = Math.round(this.cx + this.vx - width / 2);
    const y = Math.round(this.cy + this.vy - height / 2);
    const left = Math.max(0, Math.min(x, this.work.width - width));
    const top = Math.max(0, Math.min(y, this.work.height - height));
    return {
      x: left,
      y: top,
      width: Math.max(1, Math.min(width, this.work.width - left)),
      height: Math.max(1, Math.min(height, this.work.height - top)),
    };
  }

  start(region: Gray, origin: Position): void {
    this.appearance = sample_patch(
      region,
      this.cx - origin.x,
      this.cy - origin.y,
      this.width,
      this.height,
      this.width,
      this.height
    );
  }

  private point(t: number, conf: number): TrackPoint {
    return { t, cx: this.cx / this.factor, cy: this.cy / this.factor, scale: this.base_scale * this.relative, conf };
  }

  first(t: number): TrackPoint {
    return this.point(t, 1);
  }

  private sized(relative: number): Template {
    const appearance = this.appearance!;
    if (relative === 1) return prepare_template(appearance);
    const width = Math.max(TRACK.MIN_SIDE, Math.round(this.width * relative));
    const height = Math.max(TRACK.MIN_SIDE, Math.round(this.height * relative));
    return prepare_template(
      sample_patch(appearance, this.width / 2, this.height / 2, this.width, this.height, width, height)
    );
  }

  step(region: Gray, origin: Position, t: number): TrackPoint {
    if (!this.appearance) throw new Error("Tracker.start must run first");
    const candidates = this.follow_size
      ? [this.relative, this.relative * (1 - TRACK.SCALE_STEP), this.relative * (1 + TRACK.SCALE_STEP)]
      : [this.relative];

    const current = this.sized(this.relative);
    const coarse_image = downsample(region);
    const coarse_template = prepare_template(
      downsample({ width: current.width, height: current.height, data: current.zero_mean })
    );
    const coarse = best_match(coarse_image, integral(coarse_image), coarse_template, 0, 0, Infinity, Infinity);
    const center = coarse
      ? {
          x: (Math.round(coarse.x) + coarse_template.width / 2) * 2,
          y: (Math.round(coarse.y) + coarse_template.height / 2) * 2,
        }
      : { x: this.cx - origin.x, y: this.cy - origin.y };

    const table = integral(region);
    let best: { x: number; y: number; score: number; relative: number } | null = null;
    for (const relative of candidates) {
      const template = relative === this.relative ? current : this.sized(relative);
      const x = center.x - template.width / 2;
      const y = center.y - template.height / 2;
      const match = best_match(
        region,
        table,
        template,
        x - TRACK.REFINE,
        y - TRACK.REFINE,
        x + TRACK.REFINE,
        y + TRACK.REFINE
      );
      if (match && (!best || match.score > best.score))
        best = { x: match.x + template.width / 2, y: match.y + template.height / 2, score: match.score, relative };
    }

    if (!best || best.score < TRACK.LOST) {
      this.vx = 0;
      this.vy = 0;
      return this.point(t, best?.score ?? -1);
    }

    const next_x = origin.x + best.x;
    const next_y = origin.y + best.y;
    this.vx = (this.vx + (next_x - this.cx)) / 2;
    this.vy = (this.vy + (next_y - this.cy)) / 2;
    this.cx = next_x;
    this.cy = next_y;
    this.relative = best.relative;

    if (best.score >= TRACK.WEAK) {
      const seen = sample_patch(
        region,
        best.x,
        best.y,
        this.width * this.relative,
        this.height * this.relative,
        this.width,
        this.height
      );
      const data = this.appearance.data;
      for (let i = 0; i < data.length; i++) data[i] += (seen.data[i] - data[i]) * TRACK.BLEND;
    }
    return this.point(t, best.score);
  }
}
