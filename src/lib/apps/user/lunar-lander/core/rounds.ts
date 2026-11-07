import { chart as chart_rounds, daily_pick, round_key as key_of, RoundKind, type Chart, type RoundRef as BaseRef } from "$kit/games/play2d/rounds";
import { hash } from "$kit/games/play2d/seed";
import { fly } from "./autopilot";
import { BODIES, BODY_IDS, type BodyId } from "./bodies";
import type { Scene } from "./mission";
import { mission_of, random_scene } from "./missions";
import { SHIP_IDS, ship_coefficients, type ShipId } from "./ships";

export { RoundKind, type Chart };

export interface RoundRef extends BaseRef {
  ship: ShipId;
  body: BodyId;
}

export function mission_ref(n: number): RoundRef {
  const mission = mission_of(n);
  return { kind: RoundKind.LEVEL, level: n, ship: mission.ship, body: mission.body };
}

export function scene_of(ref: RoundRef, attempt = 0): Scene {
  if (ref.kind === RoundKind.LEVEL) return mission_of(ref.level!).build();
  return random_scene(ref.ship, ref.body, ref.seed ?? 0, attempt).scene;
}

export function chart(ref: RoundRef): Chart {
  const c = ship_coefficients(ref.ship);
  return chart_rounds(ref, (attempt) => {
    const proof = fly(scene_of(ref, attempt), c);
    return proof.ok ? proof.time! : null;
  });
}

/** The day's seed picks the ship and the body too. */
export function daily_ref(day: string, seed: number): RoundRef {
  return { kind: RoundKind.DAILY, ship: daily_pick(seed, SHIP_IDS), body: BODY_IDS[hash(seed, 9) % BODY_IDS.length], seed, day };
}

export function round_key(ref: RoundRef): string {
  return key_of(ref, `${ref.ship}-${ref.body}`, `level-${ref.level}`);
}

export function round_title(ref: RoundRef): string {
  if (ref.kind === RoundKind.LEVEL) return `${ref.level}. ${mission_of(ref.level!).name}`;
  if (ref.kind === RoundKind.DAILY) return `Daily · ${ref.day}`;
  return "Random mission";
}

export function round_brief(ref: RoundRef, attempt = 0): string {
  if (ref.kind === RoundKind.LEVEL) return mission_of(ref.level!).brief;
  return `${random_scene(ref.ship, ref.body, ref.seed ?? 0, attempt).brief} ${BODIES[ref.body].name}.`;
}
