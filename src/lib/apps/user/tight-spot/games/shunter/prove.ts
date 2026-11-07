import { describe, expect, test } from "vitest";
import { drive, type Move } from "../../core/planner";
import { couple, create_car, drop, Gear, type Placement, type Unhooked, type VehicleSpec } from "../../core/vehicle";
import { contact, create_game, placed_in, SPEC, type GameState } from "./game";
import { level_round } from "./levels";
import { par_of, plan_job, type JobPlan } from "./plan";

const PIECE = 0.15;
// The last move backs under the hinge: in pieces fine enough not to step over the latch's few centimetres.
const LATCH_PIECE = 0.02;

export interface Proof {
  plan: JobPlan | null;
  fault: string | null;
}

/**
 * Plans the job from the real start, then drives every leg again in 15 cm pieces with the real bodies, no margin and
 * the round's rules: no contact on the way, the task's chain latching only at the end of the leg under it (a round
 * latches it the moment the coupler reaches it backing up), every link inside and straight in its target at the drop.
 * Test-only, like the other games' proofs.
 */
export function prove(state: GameState): Proof {
  const found = plan_job(state);
  if (!found) return { plan: null, fault: "no plan" };
  const { yard } = state;
  let stands: (Unhooked | null)[] = [...state.stands];
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  let spec: VehicleSpec = SPEC;
  for (let i = 0; i < yard.tasks.length; i++) {
    const task = yard.tasks[i];
    const stand = stands[task.unit]!;
    const under = found.legs[i * 2].moves;
    let latched = false;
    for (let m = 0; m < under.length && !latched; m++) {
      const move = under[m];
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / (m === under.length - 1 ? LATCH_PIECE : PIECE)));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, spec);
        const coupled = move.distance < 0 ? couple(create_car(at, Gear.REVERSE, spec), spec, stand) : null;
        if (coupled) {
          if (m < under.length - 1) return { plan: found, fault: `task ${i + 1}: latched before the end of the leg under it` };
          at = { x: coupled.car.x, y: coupled.car.y, heading: coupled.car.heading, trailers: coupled.car.trailers };
          spec = coupled.spec;
          latched = true;
          break;
        }
        if (contact(yard, stands, at, spec)) return { plan: found, fault: `task ${i + 1}: touched on the way under it` };
      }
    }
    if (!latched) return { plan: found, fault: `task ${i + 1}: never latched` };
    stands = stands.map((each, k) => (k === task.unit ? null : each));
    if (!run(found.legs[i * 2 + 1].moves)) return { plan: found, fault: `task ${i + 1}: touched towing it` };
    if (!placed_in(at, spec, task.to)) return { plan: found, fault: `task ${i + 1}: not in ${task.to.name}` };
    const dropped = drop({ ...create_car(at, Gear.PARK, spec), trailers: at.trailers }, spec)!;
    stands = stands.map((each, k) => (k === task.unit ? dropped.unit : each));
    at = { x: at.x, y: at.y, heading: at.heading };
    spec = SPEC;
  }
  return { plan: found, fault: null };

  function run(moves: readonly Move[]): boolean {
    for (const move of moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, spec);
        if (contact(yard, stands, at, spec)) return false;
      }
    }
    return true;
  }
}

export function prove_levels(from: number, to: number) {
  describe("every yard level can be done from the shunter's start", () => {
    for (let level = from; level <= to; level++) {
      // Up to 15 s for a four-trailer level here; CI runs two to three times slower.
      test(`level ${level}`, { timeout: 120_000 }, () => {
        const state = create_game(level_round(level));
        const proof = prove(state);
        expect(proof.fault, `level ${level}`).toBeNull();
        const par = par_of(proof.plan!, state.yard.tasks.length);
        expect(par.ms).toBeGreaterThan(30_000);
        expect(par.ms % 5000).toBe(0);
      });
    }
  });
}
