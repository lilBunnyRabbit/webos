import { HATCHBACK, rig_ends, type VehicleSpec } from "../../core/vehicle";
import { assemble, BARRIER, CHUNK, ChunkKind, Side, type Plan, type World } from "../../core/lot";
import type { Scenario } from "./kinds";
import { build_lot } from "./lots";

export * from "./kinds";
export * from "../../core/lot";
export { hash } from "../../core/seed";

const MID = CHUNK / 2;

export function scenario_world(
  seed: number,
  scenario: Scenario,
  difficulty: number,
  spec: VehicleSpec = HATCHBACK
): World {
  const plan: Plan = (cx, cy) => {
    if (cx !== 0) return null;
    if (cy === 0) return { kind: ChunkKind.LOT, entry: Side.SOUTH, build: (rng) => build_lot(scenario, difficulty, false, rng, spec) };
    if (cy === 1) return { kind: ChunkKind.ROAD };
    return null;
  };
  // A long rig waits further up the road, so its tail clears the barrier where the road ends.
  const tail = -rig_ends(spec).rear;
  const world = assemble(
    seed,
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    plan,
    { x: MID + 2, y: Math.min(CHUNK + 26, CHUNK * 2 - BARRIER - 1 - tail), heading: -Math.PI / 2 }
  );
  const own = world.chunks[0].start;
  return own ? { ...world, start: own } : world;
}
