import { hash } from "$kit/games/play2d/seed";
import { par_of, prove } from "./autopilot";
import { boat_coefficients, BoatId, SPECS } from "./boats";
import { LEVELS, random_scene } from "./levels";
import type { Scene } from "./world";

export const RoundKind = { LEVEL: "level", RANDOM: "random", DAILY: "daily" } as const;
export type RoundKind = (typeof RoundKind)[keyof typeof RoundKind];

export interface RoundRef {
  kind: RoundKind;
  boat: BoatId;
  /** A fixed level's id. */
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
  const spec = SPECS[ref.boat];
  if (ref.kind === RoundKind.LEVEL) return LEVELS.find((level) => level.id === ref.level)!.build(spec);
  return random_scene(spec, ref.seed ?? 0, attempt);
}

/** Generated rounds try layouts from the seed until one is proven; a fixed level is proven by the tests. */
export function chart(ref: RoundRef): Chart {
  const c = boat_coefficients(ref.boat);
  const tries = ref.kind === RoundKind.LEVEL ? 1 : ATTEMPTS;
  for (let attempt = 0; attempt < tries; attempt++) {
    const proof = prove(scene_of(ref, attempt), c);
    if (proof.ok) return { attempt, par: par_of(proof.time!) };
  }
  return { attempt: 0, par: null };
}

/** Everyone gets the same daily: the day's seed picks the boat too. */
export function daily_ref(day: string, seed: number): RoundRef {
  return { kind: RoundKind.DAILY, boat: hash(seed, 7) % 2 === 0 ? BoatId.RIB : BoatId.YACHT, seed, day };
}

export function round_key(ref: RoundRef): string {
  if (ref.kind === RoundKind.LEVEL) return `level-${ref.level}-${ref.boat}`;
  if (ref.kind === RoundKind.DAILY) return `daily-${ref.day}`;
  return `random-${ref.boat}`;
}

export function round_title(ref: RoundRef): string {
  if (ref.kind === RoundKind.LEVEL) {
    const level = LEVELS.find((each) => each.id === ref.level)!;
    return `${level.id}. ${level.name}`;
  }
  if (ref.kind === RoundKind.DAILY) return `Daily · ${ref.day}`;
  return "Random berth";
}

export function round_brief(ref: RoundRef, scene: Scene): string {
  if (ref.kind === RoundKind.LEVEL) return LEVELS.find((each) => each.id === ref.level)!.brief;
  return scene.berth?.kind === "box" ? "A box berth somewhere in the marina. Bow in, and stop before the pontoon." : "A space on the pontoon. Come alongside and stop.";
}
