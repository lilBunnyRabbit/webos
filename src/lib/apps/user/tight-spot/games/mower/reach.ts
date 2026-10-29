import { overlaps } from "../../core/collision";
import { bounds_of, bounds_overlap, type Pose } from "../../core/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { drive, inflate, type Move } from "../../core/planner";
import { bodies, DriveKind, type VehicleSpec } from "../../core/vehicle";
import { each_cell, Ground, type Grid } from "./coverage";
import { deck_corners, type Deck } from "./deck";
import type { Garden } from "./garden";

const MARGIN = 0.05;
const STEP = 0.4;
const HEADINGS = 24;
const TURN = (Math.PI * 2) / HEADINGS;

export interface Reach {
  poses: Pose[];
  coverable: number;
}

function key(pose: Pose): number {
  const ix = Math.round(pose.x / STEP) + 1024;
  const iy = Math.round(pose.y / STEP) + 1024;
  const turn = ((Math.round(pose.heading / TURN) % HEADINGS) + HEADINGS) % HEADINGS;
  return (ix * 2048 + iy) * HEADINGS + turn;
}

/**
 * The planner's lattice flooded from the start: straight steps both ways and pivots of one heading bin, the body grown
 * by the planner's margin, solids and flower beds both in the way. The lawn under the deck at every pose it reached is
 * what can be mown (a step is shorter than the deck, a pivot's swing shorter than its width, so the footprints join),
 * so the coverable lawn is never more than a driver can reach without the flowers. A skid steer's pivot makes the
 * coarse lattice enough; any other drive would need the planner's arcs.
 */
export function flood(garden: Garden, grid: Grid, spec: VehicleSpec, deck: Deck): Reach {
  if (spec.drive.kind !== DriveKind.SKID) throw new Error("The coverable lawn is flooded for skid steers only");
  const near = obstacles(garden);
  const body = inflate(spec, MARGIN);
  const beds = garden.beds.map((shape) => ({ shape, box: bounds_of(shape) }));
  const blocked = (pose: Pose) => {
    if (collide(pose, near, body)) return true;
    const [shape] = bodies(pose, body);
    const box = bounds_of(shape);
    return beds.some((bed) => bounds_overlap(box, bed.box) && overlaps(shape, bed.shape));
  };
  const pivot = (TURN * spec.drive.track) / 2;
  // A pivot's far corners swing further than a trunk is wide, so it's checked halfway too.
  const moves: Move[][] = [
    [{ steer: 0, distance: STEP }],
    [{ steer: 0, distance: -STEP }],
    [{ steer: 1, distance: pivot / 2 }, { steer: 1, distance: pivot / 2 }],
    [{ steer: -1, distance: pivot / 2 }, { steer: -1, distance: pivot / 2 }],
  ];
  const mark = (pose: Pose) =>
    each_cell(grid, deck_corners(pose, deck), (i) => {
      if (grid.ground[i] === Ground.LAWN) grid.coverable[i] = 1;
    });

  const start = garden.start;
  const poses: Pose[] = [start];
  const seen = new Set<number>([key(start)]);
  if (blocked(start)) return { poses, coverable: 0 };
  mark(start);
  for (let at = 0; at < poses.length; at++) {
    const from = poses[at];
    for (const pieces of moves) {
      let pose: Pose = from;
      for (const piece of pieces) pose = drive(pose, piece, spec);
      const id = key(pose);
      if (seen.has(id)) continue;
      if (pieces.length > 1 && blocked(drive(from, pieces[0], spec))) continue;
      if (blocked(pose)) continue;
      seen.add(id);
      poses.push(pose);
      mark(pose);
    }
  }
  let coverable = 0;
  for (let i = 0; i < grid.coverable.length; i++) coverable += grid.coverable[i];
  return { poses, coverable };
}
