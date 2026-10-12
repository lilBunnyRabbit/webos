import { Boundary, count_sentences, type ReaderToken } from "./tokens";

export const MIN_WPM = 50;
export const MAX_WPM = 1200;
export const MAX_PAUSE_MS = 3000;

/** Absolute pauses: a beat after a sentence feels the same at any speed, so it isn't a multiple of the word time. */
export interface PauseSettings {
  sentence_ms: number;
  ellipsis_ms: number;
  comma_ms: number;
  dash_ms: number;
}

export const DEFAULT_PAUSES: PauseSettings = { sentence_ms: 700, ellipsis_ms: 900, comma_ms: 250, dash_ms: 150 };
export const NO_PAUSES: PauseSettings = { sentence_ms: 0, ellipsis_ms: 0, comma_ms: 0, dash_ms: 0 };

export interface TimelineSegment {
  start_ms: number;
  hold_ms: number;
  base_ms: number;
  pause_ms: number;
}

export interface Timeline {
  segments: TimelineSegment[];
  total_ms: number;
}

/** Where playback is: a word, and how far through its hold (0–1), so a rebuilt timeline keeps the reader's place. */
export interface Position {
  index: number;
  progress: number;
}

export function word_ms(wpm: number): number {
  return 60000 / Math.max(1, wpm);
}

export function build_timeline(tokens: readonly ReaderToken[], wpm: number, pauses: PauseSettings): Timeline {
  const base_ms = word_ms(wpm);
  const sentence_ms = count_sentences(tokens) > 1 ? pauses.sentence_ms : 0;
  const pause_for: Record<Boundary, number> = {
    [Boundary.SENTENCE]: sentence_ms,
    [Boundary.ELLIPSIS]: pauses.ellipsis_ms,
    [Boundary.COMMA]: pauses.comma_ms,
    [Boundary.DASH]: pauses.dash_ms,
    [Boundary.NONE]: 0,
  };

  let total_ms = 0;
  const segments = tokens.map((token, index) => {
    const pause_ms = index === tokens.length - 1 ? 0 : Math.max(0, pause_for[token.boundary]);
    const segment = { start_ms: total_ms, hold_ms: base_ms + pause_ms, base_ms, pause_ms };
    total_ms += segment.hold_ms;
    return segment;
  });
  return { segments, total_ms };
}

export function index_for_elapsed(timeline: Timeline, elapsed: number): number {
  const { segments } = timeline;
  if (segments.length === 0 || elapsed <= 0) return 0;
  if (elapsed >= timeline.total_ms) return segments.length - 1;

  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (segments[middle].start_ms <= elapsed) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function elapsed_for_index(timeline: Timeline, index: number): number {
  const { segments } = timeline;
  if (segments.length === 0) return 0;
  return segments[Math.max(0, Math.min(segments.length - 1, index))].start_ms;
}

export function position_at(timeline: Timeline, elapsed: number): Position {
  const index = index_for_elapsed(timeline, elapsed);
  const segment = timeline.segments[index];
  if (!segment) return { index: 0, progress: 0 };
  const progress = (elapsed - segment.start_ms) / segment.hold_ms;
  return { index, progress: Math.min(1, Math.max(0, progress)) };
}

export function elapsed_at(timeline: Timeline, { index, progress }: Position): number {
  const segment = timeline.segments[Math.max(0, Math.min(timeline.segments.length - 1, index))];
  return segment ? segment.start_ms + segment.hold_ms * Math.min(1, Math.max(0, progress)) : 0;
}

export function format_duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
