import { angle_between, centroid, clamp, wrap_angle, type Vec } from "../../core/geometry";
import { drive, type Move } from "../../core/planner";
import {
  jackknifed,
  max_steer,
  trailer_corners,
  trailer_poses,
  VEHICLES,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";

export const BAGGAGE: VehicleSpec = VEHICLES.baggage;
export const MIDDLE = 1;
export const ON_MARK = 1;
export const PARALLEL = (10 * Math.PI) / 180;

const PIECE = 0.15;
const LOOKAHEAD = 3;
const STEER_RATE = 0.12;
const LIMIT = 4_000;

export function middle_cart(car: Placement): Vec {
  return centroid(trailer_corners(car, BAGGAGE, MIDDLE));
}

export interface TrainJudged {
  /** The middle cart past the mark (+) or short of it (−), along the way the train faces on it. */
  along: number;
  across: number;
  angle: number;
}

export function judge_train(car: Placement, mark: Vec, heading: number): TrainJudged {
  const centre = middle_cart(car);
  const dx = centre.x - mark.x;
  const dy = centre.y - mark.y;
  const cart = trailer_poses(car, BAGGAGE)[MIDDLE].heading;
  return {
    along: dx * Math.cos(heading) + dy * Math.sin(heading),
    across: Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading)),
    angle: Math.min(angle_between(cart, heading), angle_between(cart, heading + Math.PI)),
  };
}

export function train_done(judged: TrainJudged): boolean {
  return Math.hypot(judged.along, judged.across) <= ON_MARK && judged.angle <= PARALLEL;
}

export interface TrainRun {
  moves: Move[];
  distance: number;
  end: Placement;
}

/**
 * A baggage driver: pure pursuit of the route with the tug, a few metres ahead, forward only, until the middle cart
 * reaches the mark once the tug is past `arrive_from` on the route. `blocked` sees every piece; null when it says so, a hinge folds past its limit or the train misses.
 */
export function run_route(
  start: Placement,
  route: readonly Vec[],
  arrive_from: number,
  mark: Vec,
  heading: number,
  blocked: (at: Placement) => boolean
): TrainRun | null {
  const lock = max_steer(BAGGAGE);
  const base = BAGGAGE.wheelbase;
  let at = start;
  let steer = 0;
  let index = 0;
  const moves: Move[] = [];
  for (let piece = 0; piece < LIMIT; piece++) {
    const judged = judge_train(at, mark, heading);
    if (index >= arrive_from && judged.along >= -PIECE / 2) {
      if (!train_done(judged)) return null;
      return { moves, distance: piece * PIECE, end: at };
    }
    let best = Infinity;
    for (let i = index; i < Math.min(route.length, index + 60); i++) {
      const d = Math.hypot(at.x - route[i].x, at.y - route[i].y);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    let target = route[route.length - 1];
    for (let i = index; i < route.length; i++) {
      if (Math.hypot(route[i].x - at.x, route[i].y - at.y) >= LOOKAHEAD) {
        target = route[i];
        break;
      }
    }
    const alpha = wrap_angle(Math.atan2(target.y - at.y, target.x - at.x) - at.heading);
    const wanted = clamp(Math.atan((2 * base * Math.sin(alpha)) / LOOKAHEAD), -lock, lock);
    steer += clamp(wanted - steer, -lock * STEER_RATE, lock * STEER_RATE);
    const next = drive(at, { steer, distance: PIECE }, BAGGAGE);
    if (jackknifed(next, BAGGAGE) || blocked(next)) return null;
    const last = moves[moves.length - 1];
    if (last && last.steer === steer) last.distance += PIECE;
    else moves.push({ steer, distance: PIECE });
    at = next;
  }
  return null;
}
