import { describe, expect, test } from "vitest";
import { collide, obstacles } from "../../core/obstacles";
import { drive, plan, type Move } from "../../core/planner";
import { SolidKind, type Solid } from "../../core/scene";
import { body_centre, headings, hitch_angles, jackknifed, nose, pose_from_centre, rig_ends, type Placement, type Vehicle, type VehicleSpec } from "../../core/vehicle";
import { angle_between, type Vec } from "../../core/geometry";
import { rig_width, StepKind, type Step } from "./course";
import { cone_shape, course_round, create_game, in_box, spec_of, step_done, touched, type GameState } from "./game";

const PIECE = 0.15;

export interface Proof {
  legs: Move[][];
  fault: string | null;
}

function along(step: Step, at: Placement, spec: VehicleSpec): number {
  const { a, normal } = step.gate!;
  const tip = nose(at, spec);
  return (tip.x - a.x) * normal.x + (tip.y - a.y) * normal.y;
}

function within(step: Step, at: Placement, spec: VehicleSpec, from: number, to: number): boolean {
  const past = along(step, at, spec);
  return past > from && past < to && between(step, at, spec);
}

function between(step: Step, at: Placement, spec: VehicleSpec): boolean {
  const { a, b } = step.gate!;
  const tip = nose(at, spec);
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const t = ((tip.x - a.x) * ux + (tip.y - a.y) * uy) / (ux * ux + uy * uy);
  return t > 0 && t < 1;
}

// Where the search heads: the nose `past` the gate's line (before it when negative), in the gate's middle or, at a
// cone, clear of it on its side.
function goal(step: Step, spec: VehicleSpec, past: number): Placement {
  if (step.box) {
    const xs = step.box.map((p) => p.x);
    const ys = step.box.map((p) => p.y);
    return pose_from_centre({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, heading: Math.PI }, spec);
  }
  const { a, b, normal } = step.gate!;
  const side = Math.sign(b.y - a.y);
  const mid = step.kind === StepKind.SLALOM ? { x: a.x, y: a.y + side * (rig_width(spec) / 2 + 0.8) } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const heading = step.kind === StepKind.REVERSE ? Math.atan2(-normal.y, -normal.x) : Math.atan2(normal.y, normal.x);
  const front = rig_ends(spec).front;
  const tip = { x: mid.x + normal.x * past, y: mid.y + normal.y * past };
  return { x: tip.x - Math.cos(heading) * front, y: tip.y - Math.sin(heading) * front, heading };
}

/**
 * Plans the course step by step from the real start with every cone as a solid and the bodies grown 5 cm, then drives
 * each leg again in 15 cm pieces with the real bodies and no margin, judged as a run is: every step done in order,
 * no cone touched, nothing hit. Test-only.
 */
export function prove(state: GameState, limit = 120_000): Proof {
  const spec = spec_of(state.round);
  const { course } = state;
  const cones: Solid[] = course.cones.map((at) => ({ kind: SolidKind.POST, shape: cone_shape(at) }));
  const near = obstacles({ solids: [...course.solids, ...cones] });
  const fence = obstacles(course);
  const rails = (step: Step): Solid[] => {
    const { a, b } = step.gate!;
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    const u = { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
    const [top, bottom] = step.kind === StepKind.GATE ? [course.bounds.y0, course.middle] : [course.middle, course.bounds.y1];
    const far = (at: Vec, sign: number) => {
      const edge = (u.y * sign > 0 ? bottom : top) - at.y;
      const t = Math.abs(u.y) < 1e-9 ? 0 : edge / u.y;
      return { x: at.x + u.x * t, y: at.y + u.y * t };
    };
    const rail = (from: Vec, to: Vec): Solid => {
      const n = { x: -u.y * 0.05, y: u.x * 0.05 };
      return { kind: SolidKind.WALL, shape: [{ x: from.x + n.x, y: from.y + n.y }, { x: to.x + n.x, y: to.y + n.y }, { x: to.x - n.x, y: to.y - n.y }, { x: from.x - n.x, y: from.y - n.y }] };
    };
    const back = rail(far(a, -1), a);
    if (step.kind === StepKind.SLALOM) return [back];
    return [back, rail(b, far(b, 1))];
  };
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading, trailers: state.car.trailers, steer: 0 };
  const legs: Move[][] = [];
  // Towed links straighten behind a rig going forward; a search that may also reverse them costs seconds a leg.
  const forward_only = spec.hitches.length > 0;
  const straight = (pose: Placement) => Math.abs(pose.steer ?? 0) < 0.3 && hitch_angles(pose).every((angle) => Math.abs(angle) < 0.3);
  const drive_leg = (found: Move[], step: Step, done: boolean): string | boolean => {
    for (const move of found) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        const next = drive(at, { ...move, distance: move.distance / pieces }, spec);
        if (jackknifed(next, spec)) return "jackknifed";
        if (collide(next, fence, spec)) return "hit the fence";
        if (touched(state.cones, next, spec).length > 0) return "knocked a cone";
        if (!done && step.kind !== StepKind.STOP && step_done(step, at, next, move.distance, spec)) done = true;
        at = next;
      }
    }
    return done;
  };
  for (let i = 0; i < course.steps.length; i++) {
    const step = course.steps[i];
    const backing = step.kind === StepKind.REVERSE;
    const lane = (pose: Placement) => (nose(pose, spec).y < course.middle) === (step.kind === StepKind.GATE);
    const facing = (pose: Placement) => !step.gate || angle_between(pose.heading, Math.atan2(step.gate.normal.y, step.gate.normal.x)) < Math.PI / 2;
    const fenced = step.box ? near : obstacles({ solids: [...course.solids, ...cones, ...rails(step)] });
    const free = forward_only ? [1] : [1, -1];
    const stages: { arrive: (pose: Placement) => boolean; directions: number[]; past: number; to?: Placement }[] = [];
    if (step.box) stages.push({ arrive: (pose) => in_box(pose, step.box!, spec), directions: free, past: 0 });
    else if (backing) stages.push({ arrive: (pose) => lane(pose) && !facing(pose) && within(step, pose, spec, 0.05, 0.8), directions: [-1], past: 0.4 });
    else if (step.kind === StepKind.GATE) {
      // Square enough to carry on: crossing steeply, a rig that only goes forward can end up facing the fence.
      const square = (pose: Placement) => headings(pose, spec).every((heading) => angle_between(heading, 0) < 0.6);
      stages.push({ arrive: (pose) => lane(pose) && square(pose) && straight(pose) && within(step, pose, spec, 0.05, 0.8), directions: free, past: 0.4 });
    }
    else {
      // Up to the cone lined up on its side first, then past it: in one search a cone's line could be reached by
      // turning round short of it, which isn't passing it.
      const room = rig_width(spec) / 2 + 0.3;
      const side = Math.sign(step.gate!.b.y - step.gate!.a.y);
      const off = (at: Vec) => (at.y - step.gate!.a.y) * side;
      const lined = (pose: Placement) =>
        angle_between(pose.heading, Math.PI) < 0.25 && straight(pose) && off(body_centre(pose, spec)) > room && off(nose(pose, spec)) > room;
      if (course.steps[i - 1]?.kind === StepKind.GATE) {
        // Aimed at the cone, the search floods the lane before it turns round, so the U-turn is a leg of its own.
        const turned = (pose: Placement) =>
          angle_between(pose.heading, Math.PI) < 0.5 && along(step, pose, spec) < -4 && body_centre(pose, spec).y > course.middle + rig_width(spec) / 2;
        const half = course.turn.y - course.start.y;
        const apex = (pose: Placement) => {
          const centre = body_centre(pose, spec);
          return angle_between(pose.heading, Math.PI / 2) < 0.5 && Math.abs(centre.y - course.turn.y) < half / 2 && centre.x > course.turn.x - half;
        };
        stages.push({ arrive: apex, directions: free, past: 0, to: pose_from_centre({ ...course.turn, heading: Math.PI / 2 }, spec) });
        const round = pose_from_centre({ x: course.turn.x - half, y: course.turn.y + half, heading: Math.PI }, spec);
        stages.push({ arrive: turned, directions: free, past: 0, to: round });
      }
      stages.push({ arrive: (pose) => lane(pose) && lined(pose) && within(step, pose, spec, -4, -1), directions: free, past: -2.5 });
      stages.push({ arrive: (pose) => lane(pose) && facing(pose) && within(step, pose, spec, 0.05, 0.8), directions: [1], past: 0.4 });
    }
    let done = false;
    for (const stage of stages) {
      const found = plan(at, stage.to ?? goal(step, spec, stage.past), fenced, { spec, arrive: stage.arrive, directions: stage.directions, max_expansions: limit });
      if (!found) return { legs, fault: `step ${i + 1} (${step.kind}): no path${stages.length > 1 ? ` (leg ${stages.indexOf(stage) + 1})` : ""}` };
      legs.push(found.moves);
      const result = drive_leg(found.moves, step, done);
      if (typeof result === "string") return { legs, fault: `step ${i + 1}: ${result}` };
      done = result;
    }
    if (step.kind === StepKind.STOP) done = step_done(step, at, at, 0, spec);
    if (!done) return { legs, fault: `step ${i + 1} (${step.kind}): not done` };
  }
  return { legs, fault: null };
}

/** A few vehicle and course pairs, split over files so they run side by side. */
export function prove_courses(pairs: readonly [Vehicle, number][]) {
  describe("a rodeo course can be driven clean, gate to gate", () => {
    for (const [vehicle, course] of pairs) {
      // Up to a few seconds each here; CI runs two to three times slower.
      test(`${vehicle} on course ${course}`, { timeout: 60_000 }, () => {
        expect(prove(create_game(course_round(vehicle, course))).fault).toBeNull();
      });
    }
  });
}
