import { Boundary, type ReaderToken } from "./tokens";

export const MIN_WPM = 50;
export const MAX_WPM = 1500;
export const MAX_PAUSE_MS = 2000;

// Pauses are absolute: a beat after a sentence feels the same length at any speed.
const BOUNDARY_WEIGHT: Record<Boundary, number> = {
  [Boundary.SENTENCE]: 1,
  [Boundary.ELLIPSIS]: 1,
  [Boundary.DASH]: 0.5,
  [Boundary.COMMA]: 0.4,
  [Boundary.NONE]: 0,
};
const PARAGRAPH_WEIGHT = 1.5;
const LONG_WORD_LETTERS = 8;

export interface Timeline {
  starts: number[];
  total_ms: number;
}

export function word_ms(wpm: number): number {
  return 60000 / Math.max(1, wpm);
}

export function hold_ms(token: ReaderToken, wpm: number, pause_ms: number, last = false): number {
  const base = word_ms(wpm);
  const stretch = Math.min(1, Math.max(0, (token.letters - LONG_WORD_LETTERS) / LONG_WORD_LETTERS));
  if (last) return base * (1 + stretch);

  const weight = Math.max(BOUNDARY_WEIGHT[token.boundary], token.paragraph ? PARAGRAPH_WEIGHT : 0);
  return base * (1 + stretch) + Math.max(0, pause_ms) * weight;
}

export function build_timeline(tokens: ReaderToken[], wpm: number, pause_ms: number): Timeline {
  const starts = new Array<number>(tokens.length);
  let total_ms = 0;
  tokens.forEach((token, index) => {
    starts[index] = total_ms;
    total_ms += hold_ms(token, wpm, pause_ms, index === tokens.length - 1);
  });
  return { starts, total_ms };
}

export function index_for_elapsed(timeline: Timeline, elapsed: number): number {
  const { starts } = timeline;
  if (starts.length === 0 || elapsed <= 0) return 0;
  if (elapsed >= timeline.total_ms) return starts.length - 1;

  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= elapsed) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function elapsed_for_index(timeline: Timeline, index: number): number {
  if (timeline.starts.length === 0) return 0;
  return timeline.starts[Math.max(0, Math.min(timeline.starts.length - 1, index))];
}

export function format_duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
