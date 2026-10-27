import type { WebmChunk } from "$kit/utils/video/webm";

export const CLIP = {
  /** The ring keeps at least this much: pre-roll plus one keyframe interval (2 s). */
  KEEP_US: 7_000_000,
  PRE_US: 5_000_000,
  POST_US: 5_000_000,
  /** A longer motion is cut into clips this long; the next one starts with its own pre-roll. */
  MAX_US: 120_000_000,
  /** Detection frames in a row that must see motion: one noisy frame doesn't start a clip. */
  CONFIRM: 2,
} as const;

export interface MotionStep {
  /** The frame's timestamp, µs, on the chunks' clock. */
  time: number;
  /** Wall clock, ms. */
  wall: number;
  motion: boolean;
  level: number;
  cells: number[];
}

export interface FinishedClip {
  /** Rebased: the first chunk, a keyframe, is at 0. */
  chunks: WebmChunk[];
  duration_ms: number;
  /** Wall-clock ms of the first and last frame that saw motion. */
  at: number;
  end: number;
  peak: number;
  cells: number[];
}

interface Recording {
  chunks: WebmChunk[];
  first: number;
  at: number;
  end: number;
  last_motion: number;
  peak: number;
  cells: Set<number>;
}

/**
 * Pre-roll ring and clip cutting, with no WebCodecs in it. Encoded chunks stream in through `chunk()`; detection
 * through `step()`, which returns a clip once its motion has been over for `POST_US`.
 */
export class ClipRecorder {
  private ring: WebmChunk[] = [];
  private recording: Recording | null = null;
  private streak = 0;

  get active(): boolean {
    return this.recording !== null;
  }

  chunk(chunk: WebmChunk): void {
    this.ring.push(chunk);
    const recording = this.recording;
    // A clip has to open on a keyframe to play.
    if (recording && (recording.chunks.length > 0 || chunk.key)) recording.chunks.push(chunk);
    this.prune(chunk.timestamp);
  }

  step(step: MotionStep): FinishedClip | null {
    this.streak = step.motion ? this.streak + 1 : 0;
    const recording = this.recording;
    if (!recording) {
      if (this.streak >= CLIP.CONFIRM) this.begin(step);
      return null;
    }
    if (step.motion) {
      recording.last_motion = step.time;
      recording.end = step.wall;
      recording.peak = Math.max(recording.peak, step.level);
      for (const cell of step.cells) recording.cells.add(cell);
    }
    const over = !step.motion && step.time - recording.last_motion >= CLIP.POST_US;
    if (over || step.time - recording.first >= CLIP.MAX_US) return this.finish();
    return null;
  }

  /** Cuts the clip in progress now (Stop while recording). `null` when nothing is recording. */
  finish(): FinishedClip | null {
    const recording = this.recording;
    this.recording = null;
    this.streak = 0;
    if (!recording || recording.chunks.length === 0) return null;
    const base = recording.chunks[0].timestamp;
    const chunks = recording.chunks.map((chunk) => ({ ...chunk, timestamp: chunk.timestamp - base }));
    const last = chunks[chunks.length - 1].timestamp;
    return {
      chunks,
      duration_ms: Math.round(last / 1000) + 1,
      at: recording.at,
      end: recording.end,
      peak: recording.peak,
      cells: [...recording.cells].sort((a, b) => a - b),
    };
  }

  private begin(step: MotionStep): void {
    const start = this.pre_roll_start(step.time - CLIP.PRE_US);
    const chunks = start === -1 ? [] : this.ring.slice(start);
    this.recording = {
      chunks,
      first: chunks[0]?.timestamp ?? step.time,
      at: step.wall,
      end: step.wall,
      last_motion: step.time,
      peak: step.level,
      cells: new Set(step.cells),
    };
  }

  /** The newest video keyframe at or before `target`, else the oldest one there is. */
  private pre_roll_start(target: number): number {
    let found = -1;
    for (let i = 0; i < this.ring.length; i++) {
      if (!this.ring[i].key) continue;
      if (found === -1 || this.ring[i].timestamp <= target) found = i;
      if (this.ring[i].timestamp > target) break;
    }
    return found;
  }

  private prune(newest: number): void {
    let cut = 0;
    for (let i = 1; i < this.ring.length; i++) {
      if (this.ring[i].key && this.ring[i].timestamp <= newest - CLIP.KEEP_US) cut = i;
      if (this.ring[i].timestamp > newest - CLIP.KEEP_US) break;
    }
    if (cut > 0) this.ring = this.ring.slice(cut);
  }
}
