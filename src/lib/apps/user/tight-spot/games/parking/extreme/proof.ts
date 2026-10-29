import { collide, obstacles } from "../../../core/obstacles";
import { drive, plan, type Move } from "../../../core/planner";
import { support } from "../../../core/support";
import { VEHICLES, type Placement } from "../../../core/vehicle";
import { parked_in } from "../game";
import { parked_poses } from "../poses";
import { course_world, type Course } from "./courses";

const MARGIN = 0.05;
const PIECE = 0.15;

export interface Proof {
  moves: Move[];
  reversals: number;
}

/**
 * From the start as the round places the car to the first pose judged parked, every tyre kept 5 cm inside the ground,
 * then driven again in 15 cm pieces with the real bodies and no margin: no contact, no tyre off, parked.
 */
export function prove(course: Course, max_expansions = 400_000): Proof | null {
  const spec = VEHICLES[course.vehicle];
  const world = course_world(course);
  const near = obstacles(world);
  const ground = world.ground;
  const bay = world.bays[0];
  const start: Placement = { x: world.start.x, y: world.start.y, heading: world.start.heading };
  const goals = parked_poses(bay, near, MARGIN, spec).filter((pose) => support(pose, spec, ground, MARGIN).length === 0);
  for (const goal of goals.slice(0, 3)) {
    const found = plan(start, goal, near, {
      spec,
      ground,
      max_expansions,
      steering: [-1, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1],
      switch_cost: 6,
      arrive: (at) => parked_in(at, bay, spec),
    });
    if (!found) continue;
    let at = start;
    for (const move of found.moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, spec);
        if (collide(at, near, spec) || support(at, spec, ground).length > 0) throw new Error(`${course.id}: the found path leaves the ground or touches something`);
      }
    }
    if (!parked_in(at, bay, spec)) throw new Error(`${course.id}: the found path doesn't park`);
    return { moves: found.moves, reversals: found.reversals };
  }
  return null;
}
