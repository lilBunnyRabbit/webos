export const FAST_WPM = 600;
export const FAST_WORDS = 300;

export interface Tally {
  words: number;
  fast: number;
  fast_best: number;
  run_from: number;
  at: number;
}

export const EMPTY_TALLY: Tally = { words: 0, fast: 0, fast_best: 0, run_from: -1, at: -1 };

export function tally(state: Tally, from: number, to: number, wpm: number): Tally {
  const read = to - from;
  if (read <= 0) return state;
  const fast = wpm >= FAST_WPM ? state.fast + read : 0;
  const run_from = from === state.at ? state.run_from : from;
  return { words: state.words + read, fast, fast_best: Math.max(state.fast_best, fast), run_from, at: to };
}

// The stretch survives a report, so pausing midway still counts as reading it through.
export function reported(state: Tally): Tally {
  return { ...EMPTY_TALLY, run_from: state.run_from, at: state.at };
}

export function read_through(state: Tally, length: number): boolean {
  return length > 0 && state.run_from === 0 && state.at >= length;
}
