import { overlaps } from "$kit/games/play2d/collision";
import { bounds_of, bounds_overlap, wrap_angle, type Pose } from "$kit/games/play2d/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { drive, inflate, type Move } from "../../core/planner";
import { bodies, DriveKind, folds, max_steer, travel, type Placement, type VehicleSpec } from "../../core/vehicle";
import { each_cell, Ground, type Grid } from "./coverage";
import { deck_corners, type Deck } from "./deck";
import type { Garden } from "./garden";
import { cutter, type Rig } from "./rig";
import { crosswise } from "./slope";

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

function in_the_way(garden: Garden, body: VehicleSpec, every: boolean) {
  const near = obstacles(garden);
  const beds = garden.beds.map((shape) => ({ shape, box: bounds_of(shape) }));
  return (pose: Placement) => {
    if (collide(pose, near, body)) return true;
    const shapes = bodies(pose, body);
    for (const shape of every ? shapes : shapes.slice(0, 1)) {
      const box = bounds_of(shape);
      if (beds.some((bed) => bounds_overlap(box, bed.box) && overlaps(shape, bed.shape))) return true;
    }
    return crosswise(pose, body, garden);
  };
}

function count(grid: Grid): number {
  let coverable = 0;
  for (let i = 0; i < grid.coverable.length; i++) coverable += grid.coverable[i];
  return coverable;
}

/**
 * The planner's lattice flooded from the start: straight steps both ways and pivots of one heading bin, the body grown
 * by the planner's margin, solids and flower beds both in the way, and a bank crossed only along its fall line. The
 * lawn under the deck at every pose it reached is what can be mown (a step is shorter than the deck, a pivot's swing
 * shorter than its width, so the footprints join), so the coverable lawn is never more than a driver can reach without
 * the flowers. A skid steer's pivot makes the coarse lattice enough; a towed deck has its own (`flood_towed`).
 */
export function flood(garden: Garden, grid: Grid, spec: VehicleSpec, deck: Deck): Reach {
  if (spec.drive.kind !== DriveKind.SKID) throw new Error("The coverable lawn is flooded for skid steers only");
  const body = inflate(spec, MARGIN);
  const blocked = in_the_way(garden, body, false);
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
  return { poses, coverable: count(grid) };
}

const TOWED_STEP = 1.3;
const TOWED_HEADINGS = 16;
const TOWED_TURN = (Math.PI * 2) / TOWED_HEADINGS;
const HITCH_BIN = (25 * Math.PI) / 180;
const MOVE = 1.2;
const PIECE = 0.6;
// Held off the trailer's real limit, so a reach the flood counts never needs a fold a driver can't hold.
const FOLD_SPARE = (10 * Math.PI) / 180;

function towed_key(pose: Placement): number {
  const ix = Math.round(pose.x / TOWED_STEP) + 512;
  const iy = Math.round(pose.y / TOWED_STEP) + 512;
  const turn = ((Math.round(pose.heading / TOWED_TURN) % TOWED_HEADINGS) + TOWED_HEADINGS) % TOWED_HEADINGS;
  const fold = Math.round(wrap_angle(pose.heading - (pose.trailers?.[0]?.heading ?? pose.heading)) / HITCH_BIN) + 8;
  return ((ix * 1024 + iy) * TOWED_HEADINGS + turn) * 17 + fold;
}

/**
 * A towed deck's lattice: the vehicle's Ackermann arcs (straight, half and full lock each way) forward and straight
 * back, 1.2 m each, the trailer's angle integrated along and kept in the state, checked every 0.6 m with every body
 * grown by the margin, the beds, the banks and a fold short of the hitch's limit. States are binned by 1.3 m, 16
 * headings and 25° of hitch angle; the deck is marked where the trailer is at each one reached, a move being shorter
 * than the deck.
 */
export function flood_towed(garden: Garden, grid: Grid, rig: Rig): Reach {
  const spec = rig.spec;
  const body = inflate(spec, MARGIN);
  const in_way = in_the_way(garden, body, true);
  const limits = spec.hitches.map((link) => link.max_angle - FOLD_SPARE);
  const blocked = (pose: Placement) => folds(pose, spec).some((fold, i) => Math.abs(fold) > limits[i]) || in_way(pose);
  const lock = max_steer(spec);
  const moves = [
    { steer: 0, distance: MOVE },
    { steer: lock / 2, distance: MOVE },
    { steer: -lock / 2, distance: MOVE },
    { steer: lock, distance: MOVE },
    { steer: -lock, distance: MOVE },
    { steer: 0, distance: -MOVE },
  ];
  // Many states put the deck in nearly the same place; marking it again would only repeat cells already counted.
  const decks = new Set<number>();
  const mark = (pose: Placement) => {
    const at = cutter(pose, rig);
    const id = key(at);
    if (decks.has(id)) return;
    decks.add(id);
    each_cell(grid, deck_corners(at, rig.deck), (i) => {
      if (grid.ground[i] === Ground.LAWN) grid.coverable[i] = 1;
    });
  };

  const start: Placement = { ...garden.start, trailers: spec.hitches.map(() => ({ heading: garden.start.heading, roll: [0, 0] as [number, number] })) };
  const poses: Placement[] = [start];
  const seen = new Set<number>([towed_key(start)]);
  if (blocked(start)) return { poses, coverable: 0 };
  mark(start);
  const pieces = Math.round(MOVE / PIECE);
  const path: Placement[] = [];
  for (let at = 0; at < poses.length; at++) {
    const from = poses[at];
    next: for (const move of moves) {
      let pose = from;
      for (let p = 0; p < pieces; p++) path[p] = pose = travel(pose, move.steer, move.distance / pieces, spec);
      const id = towed_key(pose);
      if (seen.has(id)) continue;
      for (let p = 0; p < pieces; p++) if (blocked(path[p])) continue next;
      seen.add(id);
      poses.push(pose);
      mark(pose);
    }
  }
  return { poses, coverable: count(grid) };
}
