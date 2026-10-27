export const FAST_WPM = 600;
export const FAST_WORDS = 300;

export interface Tally {
  words: number;
  fast: number;
  fast_best: number;
}

export const EMPTY_TALLY: Tally = { words: 0, fast: 0, fast_best: 0 };

export function tally(state: Tally, from: number, to: number, wpm: number): Tally {
  const read = to - from;
  if (read <= 0) return state;
  const fast = wpm >= FAST_WPM ? state.fast + read : 0;
  return { words: state.words + read, fast, fast_best: Math.max(state.fast_best, fast) };
}
