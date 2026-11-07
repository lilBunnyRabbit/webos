import { chart as chart_rounds, daily_pick, round_key as key_of, RoundKind, type Chart, type RoundRef as BaseRef } from "$kit/games/play2d/rounds";
import { prove } from "./autopilot";
import { boat_coefficients, BoatId, SPECS } from "./boats";
import { LEVELS, random_scene } from "./levels";
import type { Scene } from "./world";

export { RoundKind, type Chart };

export interface RoundRef extends BaseRef {
  boat: BoatId;
}

export function scene_of(ref: RoundRef, attempt = 0): Scene {
  const spec = SPECS[ref.boat];
  if (ref.kind === RoundKind.LEVEL) return LEVELS.find((level) => level.id === ref.level)!.build(spec);
  return random_scene(spec, ref.seed ?? 0, attempt);
}

export function chart(ref: RoundRef): Chart {
  const c = boat_coefficients(ref.boat);
  return chart_rounds(ref, (attempt) => {
    const proof = prove(scene_of(ref, attempt), c);
    return proof.ok ? proof.time! : null;
  });
}

export function daily_ref(day: string, seed: number): RoundRef {
  return { kind: RoundKind.DAILY, boat: daily_pick(seed, [BoatId.RIB, BoatId.YACHT]), seed, day };
}

export function round_key(ref: RoundRef): string {
  return key_of(ref, ref.boat, `level-${ref.level}-${ref.boat}`);
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
