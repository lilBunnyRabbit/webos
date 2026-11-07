import { chart as chart_rounds, daily_pick, round_key as key_of, RoundKind, type Chart, type RoundRef as BaseRef } from "$kit/games/play2d/rounds";
import { fly } from "./autopilot";
import { level_of, random_scene } from "./levels";
import { PLANE_IDS, plane_coefficients, type PlaneId } from "./planes";
import type { Scene } from "./round";

export { RoundKind, type Chart };

export interface RoundRef extends BaseRef {
  plane: PlaneId;
}

export function scene_of(ref: RoundRef, attempt = 0): Scene {
  if (ref.kind === RoundKind.LEVEL) return level_of(ref.plane, ref.level!).build();
  return random_scene(ref.plane, ref.seed ?? 0, attempt).scene;
}

export function chart(ref: RoundRef): Chart {
  const c = plane_coefficients(ref.plane);
  return chart_rounds(ref, (attempt) => {
    const proof = fly(scene_of(ref, attempt), c);
    return proof.ok ? proof.time! : null;
  });
}

export function daily_ref(day: string, seed: number): RoundRef {
  return { kind: RoundKind.DAILY, plane: daily_pick(seed, PLANE_IDS), seed, day };
}

export function round_key(ref: RoundRef): string {
  return key_of(ref, ref.plane, `level-${ref.plane}-${ref.level}`);
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
