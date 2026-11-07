import { z } from "zod";

export const MAX_STARS = 3;

// Keyed by level number, or by id on a track of named levels (Extreme's courses).
export const levels_schema = z.record(z.string(), z.number().int().min(1).max(MAX_STARS));
export type LevelStars = z.infer<typeof levels_schema>;

export interface StarRun {
  stars: number;
  ms: number;
}

export function better(a: StarRun | undefined, b: StarRun): boolean {
  if (!a) return true;
  return b.stars !== a.stars ? b.stars > a.stars : b.ms < a.ms;
}

export function open_through(finished: Iterable<number>, count: number): number {
  let highest = 1;
  for (const level of finished) {
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(count, highest);
}

export function unlocked(levels: Readonly<Record<string, number>>, count: number): number {
  return open_through(Object.keys(levels).map(Number), count);
}

export function with_stars(levels: LevelStars, level: number | string, stars: number): LevelStars {
  return { ...levels, [level]: Math.max(levels[level] ?? 0, stars) };
}

export function levels_done(levels: Readonly<Record<string, number>>): number {
  return Object.keys(levels).length;
}

export interface Progress {
  stars: number;
  total: number;
}

// Stars a ladder reshuffle left on a level past the end don't count.
export function track_progress(levels: Readonly<Record<string, number>>, count: number): Progress {
  let stars = 0;
  for (const [key, got] of Object.entries(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1 && level <= count) stars += Math.min(MAX_STARS, got);
  }
  return { stars, total: count * MAX_STARS };
}

export function add_progress(...parts: Progress[]): Progress {
  return parts.reduce((sum, part) => ({ stars: sum.stars + part.stars, total: sum.total + part.total }), { stars: 0, total: 0 });
}

export function star_label(name: string, stars: number): string {
  return `${name}${stars ? ` ${"★".repeat(stars)}` : ""}`;
}

export interface Recorded<R> {
  bests: Record<string, R>;
  improved: boolean;
  first: boolean;
}

/** Without `merge` an unimproved run leaves `bests` as it was; `merge` keeps what only ever rises (precision, coverage) from either run. */
export function keep_best<R>(
  bests: Record<string, R>,
  key: string,
  result: R,
  is_better: (a: R | undefined, b: R) => boolean,
  merge?: (kept: R, old: R | undefined, result: R) => R
): Recorded<R> {
  const old = bests[key];
  const improved = is_better(old, result);
  const first = old === undefined;
  if (!merge) return { bests: improved ? { ...bests, [key]: result } : bests, improved, first };
  const kept = improved ? result : old!;
  return { bests: { ...bests, [key]: merge(kept, old, result) }, improved, first };
}

export function keep_precision<R extends { precision?: number }>(kept: R, old: R | undefined, result: R): R {
  const run = { ...kept };
  delete run.precision;
  const top = Math.max(old?.precision ?? -1, result.precision ?? -1);
  return top >= 0 ? { ...run, precision: top } : run;
}
