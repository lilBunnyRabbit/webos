import { hash } from "./seed";

export const RoundKind = { LEVEL: "level", RANDOM: "random", DAILY: "daily" } as const;
export type RoundKind = (typeof RoundKind)[keyof typeof RoundKind];

export interface RoundRef {
  kind: RoundKind;
  level?: number;
  /** Random and daily rounds. */
  seed?: number;
  day?: string;
}

/** A generated layout that passes its proof, and the par the autopilot set. */
export interface Chart {
  attempt: number;
  par: number | null;
}

export const CHART_ATTEMPTS = 16;

export function par_of(seconds: number): number {
  return Math.ceil(seconds * 1.4 + 8) * 1000;
}

/** Generated rounds try layouts from the seed until one is proven; a fixed level is proven by the tests. */
export function chart(ref: RoundRef, prove: (attempt: number) => number | null): Chart {
  const tries = ref.kind === RoundKind.LEVEL ? 1 : CHART_ATTEMPTS;
  for (let attempt = 0; attempt < tries; attempt++) {
    const time = prove(attempt);
    if (time !== null) return { attempt, par: par_of(time) };
  }
  return { attempt: 0, par: null };
}

/** Everyone gets the same daily: the day's seed picks the vehicle too. */
export function daily_pick<T>(seed: number, choices: readonly T[]): T {
  return choices[hash(seed, 7) % choices.length];
}

export function round_key(ref: RoundRef, vehicle: string, level_key: string): string {
  if (ref.kind === RoundKind.LEVEL) return level_key;
  if (ref.kind === RoundKind.DAILY) return `daily-${ref.day}`;
  return `random-${vehicle}`;
}
