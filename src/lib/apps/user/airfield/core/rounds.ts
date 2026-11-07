import { hash } from "$kit/games/play2d/seed";
import { fly, par_of } from "./autopilot";
import { level_of, random_scene } from "./levels";
import { PLANE_IDS, plane_coefficients, type PlaneId } from "./planes";
import type { Scene } from "./round";

export const RoundKind = { LEVEL: "level", RANDOM: "random", DAILY: "daily" } as const;
export type RoundKind = (typeof RoundKind)[keyof typeof RoundKind];

export interface RoundRef {
  kind: RoundKind;
  plane: PlaneId;
  /** A fixed level's number in the plane's track. */
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

const ATTEMPTS = 16;

export function scene_of(ref: RoundRef, attempt = 0): Scene {
  if (ref.kind === RoundKind.LEVEL) return level_of(ref.plane, ref.level!).build();
  return random_scene(ref.plane, ref.seed ?? 0, attempt).scene;
}

/** Generated rounds try layouts from the seed until one is proven; a fixed level is proven by the tests. */
export function chart(ref: RoundRef): Chart {
  const c = plane_coefficients(ref.plane);
  const tries = ref.kind === RoundKind.LEVEL ? 1 : ATTEMPTS;
  for (let attempt = 0; attempt < tries; attempt++) {
    const proof = fly(scene_of(ref, attempt), c);
    if (proof.ok) return { attempt, par: par_of(proof.time!) };
  }
  return { attempt: 0, par: null };
}

/** Everyone gets the same daily: the day's seed picks the plane too. */
export function daily_ref(day: string, seed: number): RoundRef {
  return { kind: RoundKind.DAILY, plane: PLANE_IDS[hash(seed, 7) % PLANE_IDS.length], seed, day };
}

export function round_key(ref: RoundRef): string {
  if (ref.kind === RoundKind.LEVEL) return `level-${ref.plane}-${ref.level}`;
  if (ref.kind === RoundKind.DAILY) return `daily-${ref.day}`;
  return `random-${ref.plane}`;
}

export function round_title(ref: RoundRef): string {
  if (ref.kind === RoundKind.LEVEL) return `${ref.level}. ${level_of(ref.plane, ref.level!).name}`;
  if (ref.kind === RoundKind.DAILY) return `Daily · ${ref.day}`;
  return "Random landing";
}

export function round_brief(ref: RoundRef, attempt = 0): string {
  if (ref.kind === RoundKind.LEVEL) return level_of(ref.plane, ref.level!).brief;
  return random_scene(ref.plane, ref.seed ?? 0, attempt).brief;
}
